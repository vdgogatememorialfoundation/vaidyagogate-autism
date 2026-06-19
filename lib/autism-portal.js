/**
 * Autism portal: preregistration, competition uploads, schema helpers.
 */
const path = require('path');
const multer = require('multer');
const fileStore = require('./file-store');
const { validateDynamicForm, sanitizeRegistrationFormFields } = require('./dynamic-fields');
const seminarDt = require('./seminar-datetime');
const portalProduct = require('./portal-product');
const portalTracking = require('./portal-tracking');
const notifEngine = require('./notification-engine');
const seminarRegFlow = require('./seminar-registration-flow');
const publicPrereg = require('./public-prereg');
const preregMainPrefill = require('./prereg-main-prefill');
const authUsers = require('./auth-users');

const COMPETITION_FILE_TYPES = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm|ppt|pptx|pdf)$/i;
const APPLICANT_ANNOUNCEMENTS_CACHE = new Map();

function generateApplicationNo() {
    return portalTracking.generatePreregTrackingId();
}

function getApplicantAnnouncementsDdl() {
    try {
        const ext = require('./extended-schema-pg');
        const def = (ext.AUX_TABLE_DDL || []).find((t) => t.name === 'applicant_announcements');
        if (def && def.sql) return def.sql;
    } catch (_) {
        /* ignore */
    }
    return `CREATE TABLE IF NOT EXISTS applicant_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        body TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;
}

function ensureApplicantAnnouncementsTable(db, cb) {
    db.run(getApplicantAnnouncementsDdl(), [], (err) => {
        if (cb) cb(err);
    });
}

function getNoticesDdl() {
    try {
        const ext = require('./extended-schema-pg');
        const def = (ext.AUX_TABLE_DDL || []).find((t) => t.name === 'notices');
        if (def && def.sql) return def.sql;
    } catch (_) {
        /* ignore */
    }
    return `CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seminar_id INTEGER,
        message TEXT,
        pdf_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;
}

function ensureNoticesTable(db, cb) {
    db.run(getNoticesDdl(), [], (err) => {
        if (cb) cb(err);
    });
}

function getPreregistrationsDdl() {
    try {
        const ext = require('./extended-schema-pg');
        const def = (ext.AUX_TABLE_DDL || []).find((t) => t.name === 'preregistrations');
        if (def && def.sql) return def.sql;
    } catch (_) {
        /* ignore */
    }
    return `CREATE TABLE IF NOT EXISTS preregistrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        seminar_id INTEGER NOT NULL,
        application_no TEXT NOT NULL,
        status TEXT DEFAULT 'submitted',
        form_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, seminar_id)
    )`;
}

function ensurePreregistrationsTable(db, cb) {
    db.run(getPreregistrationsDdl(), [], (err) => {
        if (err) return cb && cb(err);
        db.run(`ALTER TABLE preregistrations ADD COLUMN updated_at DATETIME`, (alterErr) => {
            if (alterErr && !/duplicate column|already exists/i.test(String(alterErr.message || ''))) {
                /* ignore missing alter support */
            }
            cb && cb(null);
        });
    });
}

function ensureCompetitionTables(db, cb) {
    db.serialize(() => {
        db.run(
            `CREATE TABLE IF NOT EXISTS competition_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                seminar_id INTEGER,
                title TEXT NOT NULL,
                category TEXT,
                description TEXT,
                status TEXT DEFAULT 'draft',
                admin_notes TEXT,
                application_no TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            (e1) => {
                if (e1) return cb && cb(e1);
                db.run(
                    `CREATE TABLE IF NOT EXISTS competition_files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        submission_id INTEGER NOT NULL,
                        file_path TEXT NOT NULL,
                        original_name TEXT,
                        file_type TEXT,
                        status TEXT DEFAULT 'pending',
                        rejection_reason TEXT,
                        sort_order INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`,
                    (e2) => {
                        if (e2) return cb && cb(e2);
                        db.run(`ALTER TABLE competition_submissions ADD COLUMN application_no TEXT`, () => {
                            cb && cb(null);
                        });
                    }
                );
            }
        );
    });
}

function isMissingRelationError(err) {
    const msg = err && err.message ? String(err.message) : '';
    return /relation .* does not exist/i.test(msg) || /no such table/i.test(msg);
}

/** Express middleware — assertAdminPortalActor is (adminId, cb), not (req,res,next). */
function createAdminGuard(assertAdminPortalActor) {
    return function autismAdminGuard(req, res, next) {
        const raw =
            (req.query && req.query.actingAdminId) != null
                ? req.query.actingAdminId
                : req.body && req.body.actingAdminId != null
                  ? req.body.actingAdminId
                  : '';
        const aid = parseInt(raw, 10);
        if (!Number.isInteger(aid) || aid < 1) {
            return res.status(400).json({ error: 'actingAdminId is required. Sign in to admin again.' });
        }
        assertAdminPortalActor(aid, (err, adm) => {
            if (err) {
                const msg = err.message === 'FORBIDDEN' ? 'Admin access required' : err.message || 'Forbidden';
                return res.status(err.message === 'BAD_ACTOR' || err.message === 'FORBIDDEN' ? 403 : 500).json({
                    error: msg
                });
            }
            if (!adm) return res.status(403).json({ error: 'Admin access required' });
            req.autismAdmin = adm;
            next();
        });
    };
}

function autismApplicantFormFields(fields) {
    return sanitizeRegistrationFormFields(fields || []).filter(
        (f) =>
            f &&
            f.key !== 'qual' &&
            !f.onlyWhenAdvancedQual &&
            !f.onlyWhenPgCollege &&
            !['ncism', 'certificate', 'cpin', 'college', 'ccity', 'cstate', 'photo'].includes(String(f.key || ''))
    );
}

function parseFormConfig(raw, fallback) {
    if (!raw) {
        return {
            fields: fallback.fields.slice(),
            birthYearMin: null,
            birthYearMax: null,
            otp: { onApplication: false, onStep1: false, onSubmit: false }
        };
    }
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
            return { fields: parsed, birthYearMin: null, birthYearMax: null, otp: { onApplication: false, onStep1: false, onSubmit: false } };
        }
        const otpRaw = parsed && typeof parsed.otp === 'object' ? parsed.otp : {};
        const onApp = otpRaw.onApplication === true;
        return {
            fields: Array.isArray(parsed.fields) ? parsed.fields : fallback.fields.slice(),
            birthYearMin: parsed.birthYearMin != null ? parsed.birthYearMin : null,
            birthYearMax: parsed.birthYearMax != null ? parsed.birthYearMax : null,
            otp: {
                onApplication: onApp,
                onStep1: onApp && otpRaw.onStep1 !== false,
                onSubmit: onApp && otpRaw.onSubmit === true
            }
        };
    } catch (_) {
        return {
            fields: fallback.fields.slice(),
            birthYearMin: null,
            birthYearMax: null,
            otp: { onApplication: false, onStep1: false, onSubmit: false }
        };
    }
}

function preregOtpFlagsFromConfig(cfg) {
    const otp = (cfg && cfg.otp) || {};
    const onApp = otp.onApplication === true;
    return {
        otpOnApplication: onApp,
        otpOnStep1: onApp && otp.onStep1 !== false,
        otpOnSubmit: onApp && otp.onSubmit === true
    };
}

function ensureApplicationEditsTable(db, cb) {
    db.run(
        `CREATE TABLE IF NOT EXISTS application_edits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER,
            edited_by_user_id INTEGER,
            changes TEXT,
            edited_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
            if (cb) cb(err);
        }
    );
}

function getApplicantAnnouncementsCache(userId) {
    const key = String(userId || '');
    const hit = APPLICANT_ANNOUNCEMENTS_CACHE.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        APPLICANT_ANNOUNCEMENTS_CACHE.delete(key);
        return null;
    }
    return hit.payload;
}

function setApplicantAnnouncementsCache(userId, payload, ttlMs) {
    const key = String(userId || '');
    APPLICANT_ANNOUNCEMENTS_CACHE.set(key, {
        payload,
        expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || 45000)
    });
}

function clearApplicantAnnouncementsCache(userId) {
    if (userId == null) {
        APPLICANT_ANNOUNCEMENTS_CACHE.clear();
        return;
    }
    APPLICANT_ANNOUNCEMENTS_CACHE.delete(String(userId));
}

function ensureAutismSchema(db, ignoreErr, next) {
    db.serialize(() => {
        ensureApplicationEditsTable(db, (e0) => {
            ignoreErr(e0);
        });
        db.run(
            `CREATE TABLE IF NOT EXISTS preregistrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                seminar_id INTEGER NOT NULL,
                application_no TEXT NOT NULL,
                status TEXT DEFAULT 'submitted',
                form_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, seminar_id)
            )`,
            (e1) => {
                ignoreErr(e1);
                db.run(
                    `CREATE TABLE IF NOT EXISTS competition_submissions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        seminar_id INTEGER,
                        title TEXT NOT NULL,
                        category TEXT,
                        description TEXT,
                        status TEXT DEFAULT 'draft',
                        admin_notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`,
                    (e2) => {
                        ignoreErr(e2);
                        db.run(
                            `CREATE TABLE IF NOT EXISTS competition_files (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                submission_id INTEGER NOT NULL,
                                file_path TEXT NOT NULL,
                                original_name TEXT,
                                file_type TEXT,
                                status TEXT DEFAULT 'pending',
                                rejection_reason TEXT,
                                sort_order INTEGER DEFAULT 0,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (submission_id) REFERENCES competition_submissions(id)
                            )`,
                            (e3) => {
                                ignoreErr(e3);
                                db.run(
                                    `CREATE TABLE IF NOT EXISTS applicant_announcements (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        user_id INTEGER,
                                        title TEXT NOT NULL,
                                        body TEXT,
                                        is_active INTEGER DEFAULT 1,
                                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                    )`,
                                    (e4) => {
                                        ignoreErr(e4);
                                        db.run(getNoticesDdl(), (e5) => {
                                            ignoreErr(e5);
                                        db.run(`ALTER TABLE competition_submissions ADD COLUMN application_no TEXT`, (c1) => {
                                            ignoreErr(c1);
                                            db.run(`ALTER TABLE seminars ADD COLUMN preregistration_start TEXT`, (a1) => {
                                                ignoreErr(a1);
                                                db.run(`ALTER TABLE seminars ADD COLUMN preregistration_end TEXT`, (a2) => {
                                                    ignoreErr(a2);
                                                    db.run(
                                                        `ALTER TABLE seminars ADD COLUMN preregistration_form_json TEXT`,
                                                        (a3) => {
                                                            ignoreErr(a3);
                                                            if (next) next();
                                                        }
                                                    );
                                                });
                                            });
                                        });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
}

function loadPreregFormConfig(db, seminarId, cb) {
    const fallback = portalProduct.DEFAULT_PREREG_FORM_CONFIG;
    if (!seminarId) {
        db.get(`SELECT value FROM global_settings WHERE key = 'preregistration_form_config'`, [], (e, row) => {
            if (e) return cb(e);
            cb(null, parseFormConfig(row && row.value, fallback));
        });
        return;
    }
    db.get(`SELECT preregistration_form_json FROM seminars WHERE id = ?`, [seminarId], (e, row) => {
        if (e) return cb(e);
        if (row && row.preregistration_form_json) {
            return cb(null, parseFormConfig(row.preregistration_form_json, fallback));
        }
        db.get(`SELECT value FROM global_settings WHERE key = 'preregistration_form_config'`, [], (e2, gRow) => {
            if (e2) return cb(e2);
            cb(null, parseFormConfig(gRow && gRow.value, fallback));
        });
    });
}

function seminarFlowFlagsFromRegistrationFormJson(raw) {
    return seminarRegFlow.seminarFlowFlagsFromRegistrationFormJson(raw);
}

function preregWindowState(seminar) {
    const win = seminarRegFlow.preregistrationWindowState(seminar, seminarDt);
    const closesAt =
        win.closesAt != null ? win.closesAt : seminarDt.parseRegistrationEndMs(seminar.preregistration_end);
    return {
        open: !!win.open,
        reason: win.open ? null : win.reason || 'closed',
        state: win.state,
        opensAt: win.opensAt,
        closesAt: closesAt != null ? closesAt : undefined
    };
}

function competitionFileFilter(req, file, cb) {
    if (COMPETITION_FILE_TYPES.test(file.originalname || '')) cb(null, true);
    else cb(new Error('Allowed: images, video, PPT, PDF'));
}

function createCompetitionUpload(uploadsDir) {
    const vercelMax = 4 * 1024 * 1024;
    const localMax = 200 * 1024 * 1024;
    const maxSize = fileStore.useBlobStore() ? vercelMax : localMax;

    const diskMulter = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadsDir),
            filename: (req, file, cb) => cb(null, fileStore.makeStorageKey(file.originalname))
        }),
        limits: { fileSize: maxSize },
        fileFilter: competitionFileFilter
    });
    const memoryMulter = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: maxSize },
        fileFilter: competitionFileFilter
    });
    return fileStore.createUploadHandler(diskMulter, memoryMulter);
}

function notifyPreregistrationStatus(db, meta) {
    const { userId, seminarId, applicationNo, status, rejectionReason } = meta || {};
    const ev = notifEngine.preregistrationStatusToEventKey(status);
    if (!ev || !userId) return;
    notifEngine.notifyUserEvent(
        db,
        ev,
        {
            userId,
            seminarId,
            vars: {
                application_no: applicationNo || '',
                approval_status: status,
                rejection_reason: rejectionReason || '',
                status_message: String(status || '')
            },
            immediate: true
        },
        (err, result) => {
            if (err) console.warn('[prereg-notify]', ev, err.message);
            else if (result && result.skipped) console.warn('[prereg-notify]', ev, 'skipped', result.reason || result);
        }
    );
}

function registerAutismPortalRoutes(app, deps) {
    const { db, uploadsDir, generateId, parsePositiveUserId, assertAdminPortalActor } = deps;
    const adminGuard = createAdminGuard(assertAdminPortalActor);
    const competitionUpload = createCompetitionUpload(uploadsDir);
    const multiUpload = competitionUpload.array('files', 10);

    ensureNoticesTable(db, (err) => {
        if (err) console.warn('[autism] notices table:', err.message || err);
    });

    app.get('/api/portal-config', (req, res) => {
        res.json(portalProduct.publicConfig());
    });

    app.get('/api/preregistration-form-config', (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        loadPreregFormConfig(db, Number.isInteger(seminarId) && seminarId > 0 ? seminarId : null, (err, cfg) => {
            if (err) return res.status(500).json({ error: err.message });
            const otpFlags = preregOtpFlagsFromConfig(cfg);
            let integrationSettings;
            try {
                integrationSettings = require('./integration-settings');
            } catch (_) {
                integrationSettings = null;
            }
            const finish = (channelFlags) => {
                res.json({
                    fields: autismApplicantFormFields(cfg.fields || []),
                    birthYearMin: cfg.birthYearMin,
                    birthYearMax: cfg.birthYearMax,
                    ...otpFlags,
                    emailConfigured: !!(channelFlags && channelFlags.emailConfigured),
                    whatsappConfigured: !!(channelFlags && channelFlags.whatsappConfigured)
                });
            };
            if (integrationSettings && typeof integrationSettings.ensureIntegrationSettingsLoaded === 'function') {
                return integrationSettings.ensureIntegrationSettingsLoaded(db, () => {
                    finish({
                        emailConfigured: integrationSettings.isEmailConfiguredFromSettings(),
                        whatsappConfigured: integrationSettings.isWhatsAppConfiguredFromSettings()
                    });
                });
            }
            finish({});
        });
    });

    app.post('/api/admin/preregistration-form-config', adminGuard, (req, res) => {
        const incoming = req.body && typeof req.body === 'object' ? req.body : {};
        const seminarId = parseInt(incoming.seminarId, 10);
        const normalized = parseFormConfig(incoming, portalProduct.DEFAULT_PREREG_FORM_CONFIG);
        const otpIn = incoming.otp && typeof incoming.otp === 'object' ? incoming.otp : normalized.otp || {};
        const onApp = otpIn.onApplication === true;
        const payload = JSON.stringify({
            version: normalized.version || 3,
            fields: normalized.fields || [],
            birthYearMin: normalized.birthYearMin == null ? null : normalized.birthYearMin,
            birthYearMax: normalized.birthYearMax == null ? null : normalized.birthYearMax,
            otp: {
                onApplication: onApp,
                onStep1: onApp && otpIn.onStep1 !== false,
                onSubmit: onApp && otpIn.onSubmit === true
            }
        });
        if (Number.isInteger(seminarId) && seminarId > 0) {
            return db.run(
                `UPDATE seminars SET preregistration_form_json = ? WHERE id = ?`,
                [payload, seminarId],
                function (uerr) {
                    if (uerr) return res.status(500).json({ error: uerr.message });
                    if (!this.changes) return res.status(404).json({ error: 'Seminar not found' });
                    res.json({ success: true, scope: 'seminar', seminarId });
                }
            );
        }
        db.run(`UPDATE global_settings SET value = ? WHERE key = 'preregistration_form_config'`, [payload], function (uerr) {
            if (uerr) return res.status(500).json({ error: uerr.message });
            if (this.changes) return res.json({ success: true, scope: 'global' });
            db.run(
                `INSERT INTO global_settings (key, value) VALUES ('preregistration_form_config', ?)`,
                [payload],
                (ierr) => {
                    if (ierr) return res.status(500).json({ error: ierr.message });
                    res.json({ success: true, scope: 'global' });
                }
            );
        });
    });

    app.get('/api/admin/preregistration-form-config', adminGuard, (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        loadPreregFormConfig(db, Number.isInteger(seminarId) && seminarId > 0 ? seminarId : null, (err, cfg) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                fields: autismApplicantFormFields(cfg.fields || []),
                birthYearMin: cfg.birthYearMin,
                birthYearMax: cfg.birthYearMax,
                ...preregOtpFlagsFromConfig(cfg)
            });
        });
    });

    app.get('/api/preregistrations/:userId', (req, res) => {
        const userId = parsePositiveUserId(req.params.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user.' });
        db.all(
            `SELECT p.*, s.title AS seminar_title, s.event_date,
                    s.preregistration_start, s.registration_start, s.registration_end,
                    r.id AS registration_id, r.status AS registration_status,
                    r.application_no AS registration_application_no
             FROM preregistrations p
             LEFT JOIN seminars s ON s.id = p.seminar_id
             LEFT JOIN registrations r ON r.user_id = p.user_id AND r.seminar_id = p.seminar_id
             WHERE p.user_id = ?
             ORDER BY p.created_at DESC`,
            [userId],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                portalTracking.attachPreregistrationTimelines(db, rows || [], (tlErr, enriched) => {
                    if (tlErr) return res.status(500).json({ error: tlErr.message });
                    res.json(enriched || []);
                });
            }
        );
    });

    app.get('/api/public/preregistration/events', (req, res) => {
        db.all(
            `SELECT id, title, preregistration_start, preregistration_end, registration_form_json, is_active
             FROM seminars WHERE is_active = 1 ORDER BY id DESC`,
            [],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                const seminarDisplay = require('./seminar-display');
                const events = seminarDisplay
                    .filterSeminarsForApplicantPortal(rows || [], {
                        productId: portalProduct.FEATURES.productId
                    })
                    .map((sem) => {
                        const st = publicPrereg.getPublicPreregEventStatus(sem);
                        if (!st.enabled) return null;
                        const win = st.window || {};
                        return {
                            id: sem.id,
                            title: sem.title,
                            preregOpen: !!st.open,
                            upcoming: !st.open && win.reason === 'not_started' && win.opensAt != null,
                            opensAt: win.opensAt || null,
                            closesAt: win.closesAt || null,
                            windowReason: st.open ? null : win.reason || 'closed'
                        };
                    })
                    .filter(Boolean);
                res.json({ events });
            }
        );
    });

    app.get('/api/public/preregistration/form-config', (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        if (!Number.isInteger(seminarId) || seminarId < 1) {
            return res.status(400).json({ error: 'Invalid event.' });
        }
        db.get(
            `SELECT id, title, preregistration_start, preregistration_end, registration_form_json, is_active
             FROM seminars WHERE id = ?`,
            [seminarId],
            (e0, sem) => {
                if (e0) return res.status(500).json({ error: e0.message });
                const st = publicPrereg.getPublicPreregEventStatus(sem);
                if (!st.enabled) return res.status(403).json({ error: st.error });
                if (!st.open) {
                    const win = st.window || {};
                    if (win.reason === 'not_started' && win.opensAt != null) {
                        return res.json({
                            available: false,
                            upcoming: true,
                            seminarId,
                            seminarTitle: sem.title,
                            opensAt: win.opensAt,
                            closesAt: win.closesAt || null,
                            windowReason: win.reason
                        });
                    }
                    return res.status(403).json({ error: publicPrereg.windowClosedMessage(win) });
                }
                loadPreregFormConfig(db, seminarId, (cfgErr, cfg) => {
                    if (cfgErr) return res.status(500).json({ error: cfgErr.message });
                    const win = st.window || {};
                    res.json({
                        available: true,
                        seminarId,
                        seminarTitle: sem.title,
                        fields: autismApplicantFormFields(cfg.fields || []),
                        birthYearMin: cfg.birthYearMin,
                        birthYearMax: cfg.birthYearMax,
                        opensAt: win.opensAt || null,
                        closesAt: win.closesAt || null,
                        publicForm: true
                    });
                });
            }
        );
    });

    app.get('/api/public/preregistrations/track', (req, res) => {
        const applicationNo = String(req.query.applicationNo || req.query.id || '').trim();
        const emailRaw = String(req.query.email || '').trim();
        if (!applicationNo) return res.status(400).json({ error: 'Enter your tracking ID.' });
        if (!emailRaw) return res.status(400).json({ error: 'Enter the email you used on the form.' });
        const emailNorm = authUsers.normalizeEmail(emailRaw);
        if (!emailNorm) return res.status(400).json({ error: 'Enter a valid email address.' });

        db.get(
            `SELECT p.*, u.email AS user_email, s.title AS seminar_title, s.event_date,
                    r.id AS registration_id, r.status AS registration_status,
                    r.application_no AS registration_application_no
             FROM preregistrations p
             JOIN users u ON u.id = p.user_id
             LEFT JOIN seminars s ON s.id = p.seminar_id
             LEFT JOIN registrations r ON r.user_id = p.user_id AND r.seminar_id = p.seminar_id
             WHERE p.application_no = ?`,
            [applicationNo],
            (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!row) return res.status(404).json({ error: 'No application found with this tracking ID.' });
                const rowEmail = authUsers.normalizeEmail(row.user_email);
                if (!rowEmail || rowEmail !== emailNorm) {
                    return res.status(403).json({ error: 'Email does not match this application.' });
                }
                portalTracking.attachPreregistrationTimelines(db, [row], (tlErr, enriched) => {
                    if (tlErr) return res.status(500).json({ error: tlErr.message });
                    const r = enriched && enriched[0];
                    if (!r) return res.status(404).json({ error: 'Application not found.' });
                    res.json({
                        applicationNo: r.application_no,
                        status: r.status,
                        seminarTitle: r.seminar_title,
                        eventDate: r.event_date,
                        updatedAt: r.updated_at || r.created_at,
                        createdAt: r.created_at,
                        timeline: r.timeline,
                        registrationStatus: r.registration_status || null,
                        registrationApplicationNo: r.registration_application_no || null
                    });
                });
            }
        );
    });

    app.post('/api/public/preregistrations/submit', (req, res) => {
        let { seminarId, contactEmail, contactPhone, formData, website } = req.body || {};
        if (website) return res.status(400).json({ error: 'Submission rejected.' });
        seminarId = parseInt(seminarId, 10);
        if (!Number.isInteger(seminarId) || seminarId < 1) {
            return res.status(400).json({ error: 'Invalid event.' });
        }
        if (typeof formData === 'string') {
            try {
                formData = JSON.parse(formData);
            } catch (_) {}
        }

        db.get(
            `SELECT id, title, preregistration_start, preregistration_end, registration_form_json, is_active
             FROM seminars WHERE id = ?`,
            [seminarId],
            (e0, sem) => {
                if (e0) return res.status(500).json({ error: e0.message });
                const gate = publicPrereg.seminarAllowsPublicPrereg(sem);
                if (!gate.ok) return res.status(403).json({ error: gate.error });
                const flow = gate.flags;

                loadPreregFormConfig(db, seminarId, (cfgErr, cfg) => {
                    if (cfgErr) return res.status(500).json({ error: cfgErr.message });
                    const applicantFields = autismApplicantFormFields(cfg.fields || []);
                    const validationError = publicPrereg.validatePublicPreregPayload(formData, applicantFields);
                    if (validationError) return res.status(400).json({ error: validationError });

                    publicPrereg.findOrCreateApplicantForPublicPrereg(
                        db,
                        { email: contactEmail, phone: contactPhone, formData, generateId },
                        (userErr, userResult) => {
                            if (userErr) return res.status(500).json({ error: userErr.message });
                            if (!userResult || !userResult.ok) {
                                return res.status(400).json({ error: (userResult && userResult.error) || 'Account error.' });
                            }
                            const userId = userResult.userId;

                            db.get(
                                `SELECT id FROM preregistrations WHERE user_id = ? AND seminar_id = ?`,
                                [userId, seminarId],
                                (e1, existing) => {
                                    if (e1) return res.status(500).json({ error: e1.message });
                                    if (existing) {
                                        return res.status(400).json({
                                            error:
                                                'Pre-registration already submitted for this event. Check your email for updates or sign in at the applicant portal.'
                                        });
                                    }

                                    const enrichedForm = publicPrereg.enrichPublicFormData(formData, {
                                        email: userResult.user && userResult.user.email,
                                        phone: userResult.user && userResult.user.phone
                                    });
                                    const applicationNo = generateApplicationNo();
                                    const initialStatus = flow.autoAcceptPreregistration ? 'approved' : 'submitted';
                                    db.run(
                                        `INSERT INTO preregistrations (user_id, seminar_id, application_no, status, form_data)
                                         VALUES (?, ?, ?, ?, ?)`,
                                        [userId, seminarId, applicationNo, initialStatus, JSON.stringify(enrichedForm)],
                                        function (insErr) {
                                            if (insErr) return res.status(500).json({ error: insErr.message });
                                            const preregId = this.lastID;
                                            portalTracking.logPreregistrationEvent(
                                                db,
                                                preregId,
                                                'submitted',
                                                'Application submitted',
                                                'Pre-registration received via public form.',
                                                () => {}
                                            );
                                            if (initialStatus === 'approved') {
                                                portalTracking.logPreregistrationEvent(
                                                    db,
                                                    preregId,
                                                    'approved',
                                                    'Pre-registration approved',
                                                    'You can proceed to main registration when it opens.',
                                                    () => {}
                                                );
                                            }
                                            notifyPreregistrationStatus(db, {
                                                userId,
                                                seminarId,
                                                applicationNo,
                                                status: initialStatus
                                            });
                                            if (userResult.created && userResult.temporaryPassword) {
                                                notifEngine.notifyAccountCreatedWithCredentials(
                                                    db,
                                                    userId,
                                                    userResult.temporaryPassword,
                                                    () => {}
                                                );
                                            }
                                            const portalNote = userResult.created
                                                ? ' We also created an applicant account — login details are in your email if you want to track status online.'
                                                : ' You can sign in at the applicant portal anytime to track your application.';
                                            res.json({
                                                success: true,
                                                preregistrationId: preregId,
                                                applicationNo,
                                                status: initialStatus,
                                                accountCreated: !!userResult.created,
                                                message:
                                                    (flow.autoAcceptPreregistration
                                                        ? 'Pre-registration accepted. Your tracking ID is ' + applicationNo + '.'
                                                        : 'Pre-registration submitted. Your tracking ID is ' +
                                                          applicationNo +
                                                          '. We will email you when there is an update.') + portalNote
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                });
            }
        );
    });

    app.get('/api/preregistrations/lookup-for-main-reg', (req, res) => {
        const userId = parsePositiveUserId(req.query.userId);
        const seminarId = parseInt(req.query.seminarId, 10);
        const applicationNo = String(req.query.applicationNo || req.query.preregId || '').trim();
        if (!userId) return res.status(400).json({ error: 'Invalid user session.' });
        if (!Number.isInteger(seminarId) || seminarId < 1) {
            return res.status(400).json({ error: 'Invalid event.' });
        }
        if (!applicationNo) {
            return res.status(400).json({ error: 'Enter your pre-registration ID.' });
        }

        db.get(
            `SELECT p.*, s.title AS seminar_title, s.is_active
             FROM preregistrations p
             LEFT JOIN seminars s ON s.id = p.seminar_id
             WHERE p.seminar_id = ? AND UPPER(TRIM(p.application_no)) = UPPER(TRIM(?))`,
            [seminarId, applicationNo],
            (e0, prereg) => {
                if (e0) return res.status(500).json({ error: e0.message });
                if (!prereg) {
                    return res.status(404).json({
                        error: 'Pre-registration ID not found for this event. Check the ID from your confirmation email.'
                    });
                }
                let formData = {};
                try {
                    formData = prereg.form_data ? JSON.parse(prereg.form_data) : {};
                } catch (_) {
                    formData = {};
                }
                db.get(`SELECT id, email, phone, first_name, last_name FROM users WHERE id = ?`, [userId], (e1, userRow) => {
                    if (e1) return res.status(500).json({ error: e1.message });
                    if (!userRow) return res.status(400).json({ error: 'User not found.' });
                    db.get(
                        `SELECT id, email, phone FROM users WHERE id = ?`,
                        [prereg.user_id],
                        (e2, preregUserRow) => {
                            if (e2) return res.status(500).json({ error: e2.message });
                            if (!preregMainPrefill.userCanAccessPrereg(userRow, preregUserRow, formData)) {
                                return res.status(403).json({
                                    error:
                                        'This pre-registration ID does not match your signed-in email or mobile. Sign in with the same contact details you used on the public form.'
                                });
                            }
                            const linkUser = () => {
                                if (Number(prereg.user_id) !== Number(userId)) {
                                    db.run(
                                        `UPDATE preregistrations SET user_id = ? WHERE id = ?`,
                                        [userId, prereg.id],
                                        () => {}
                                    );
                                }
                            };
                            linkUser();
                            const pst = String(prereg.status || '').toLowerCase();
                            const prefill = preregMainPrefill.mapPreregFormDataToMainReg(formData);
                            res.json({
                                success: true,
                                preregistrationId: prereg.id,
                                applicationNo: prereg.application_no,
                                status: pst,
                                approved: pst === 'approved',
                                source: preregMainPrefill.preregSubmissionSource(formData),
                                seminarTitle: prereg.seminar_title || '',
                                prefill,
                                message:
                                    pst === 'approved'
                                        ? 'Details loaded. Review and complete main registration.'
                                        : pst === 'submitted'
                                          ? 'Pre-registration found but still awaiting approval.'
                                          : pst === 'rejected'
                                            ? 'This pre-registration was not approved.'
                                            : 'Pre-registration found.'
                            });
                        }
                    );
                });
            }
        );
    });

    app.post('/api/preregistrations/submit', (req, res) => {
        let { userId, seminarId, formData } = req.body;
        userId = parsePositiveUserId(userId);
        seminarId = parseInt(seminarId, 10);
        if (!userId) return res.status(400).json({ error: 'Invalid user session.' });
        if (!Number.isInteger(seminarId) || seminarId < 1) return res.status(400).json({ error: 'Invalid event.' });
        if (typeof formData === 'string') {
            try {
                formData = JSON.parse(formData);
            } catch (_) {}
        }

        db.get(`SELECT id FROM preregistrations WHERE user_id = ? AND seminar_id = ?`, [userId, seminarId], (e0, existing) => {
            if (e0) return res.status(500).json({ error: e0.message });
            if (existing) return res.status(400).json({ error: 'Pre-registration already submitted for this event.' });

            db.get(
                `SELECT id, title, preregistration_start, preregistration_end, registration_form_json, is_active FROM seminars WHERE id = ?`,
                [seminarId],
                (e1, sem) => {
                    if (e1) return res.status(500).json({ error: e1.message });
                    if (!sem || !sem.is_active) return res.status(400).json({ error: 'Event not found or inactive.' });
                    const flow = seminarFlowFlagsFromRegistrationFormJson(sem.registration_form_json);
                    if (!flow.preregistrationRequired) {
                        return res.status(400).json({
                            error: 'Pre-registration is not required for this event. Proceed with main registration directly.'
                        });
                    }
                    const win = preregWindowState(sem);
                    if (!win.open) {
                        return res.status(400).json({
                            error:
                                win.reason === 'schedule_not_set'
                                    ? 'Pre-registration schedule is not set for this event yet.'
                                    : win.reason === 'not_started'
                                    ? 'Pre-registration has not opened yet.'
                                    : 'Pre-registration has closed.'
                        });
                    }
                    loadPreregFormConfig(db, seminarId, (cfgErr, cfg) => {
                        if (cfgErr) return res.status(500).json({ error: cfgErr.message });
                        const validationError = validateDynamicForm(formData || {}, false, cfg.fields || [], null);
                        if (validationError) return res.status(400).json({ error: validationError });

                        const applicationNo = generateApplicationNo();
                        const initialStatus = flow.autoAcceptPreregistration ? 'approved' : 'submitted';
                        db.run(
                            `INSERT INTO preregistrations (user_id, seminar_id, application_no, status, form_data)
                             VALUES (?, ?, ?, ?, ?)`,
                            [userId, seminarId, applicationNo, initialStatus, JSON.stringify(formData || {})],
                            function (insErr) {
                                if (insErr) return res.status(500).json({ error: insErr.message });
                                const preregId = this.lastID;
                                portalTracking.logPreregistrationEvent(
                                    db,
                                    preregId,
                                    'submitted',
                                    'Application submitted',
                                    'Pre-registration received.',
                                    () => {}
                                );
                                if (initialStatus === 'approved') {
                                    portalTracking.logPreregistrationEvent(
                                        db,
                                        preregId,
                                        'approved',
                                        'Pre-registration approved',
                                        'You can proceed to main registration when it opens.',
                                        () => {}
                                    );
                                }
                                notifyPreregistrationStatus(db, {
                                    userId,
                                    seminarId,
                                    applicationNo,
                                    status: initialStatus
                                });
                                res.json({
                                    success: true,
                                    preregistrationId: this.lastID,
                                    applicationNo,
                                    status: initialStatus,
                                    autoAccepted: flow.autoAcceptPreregistration,
                                    mainRegistrationOpen: flow.mainRegistrationOpen,
                                    message: flow.autoAcceptPreregistration
                                        ? flow.mainRegistrationOpen
                                            ? 'Pre-registration accepted (ID ' +
                                              applicationNo +
                                              '). You may proceed with main registration when it opens.'
                                            : 'Pre-registration accepted (ID ' +
                                              applicationNo +
                                              '). Final registration will open later — we will notify you by email.'
                                        : 'Pre-registration submitted successfully. We will email you when there is an update.'
                                });
                            }
                        );
                    });
                }
            );
        });
    });

    app.post('/api/preregistrations/resubmit', (req, res) => {
        let { userId, preregistrationId, formData } = req.body;
        userId = parsePositiveUserId(userId);
        const pid = parseInt(preregistrationId, 10);
        if (!userId) return res.status(400).json({ error: 'Invalid user session.' });
        if (!Number.isInteger(pid) || pid < 1) return res.status(400).json({ error: 'Invalid pre-registration.' });
        if (typeof formData === 'string') {
            try {
                formData = JSON.parse(formData);
            } catch (_) {}
        }
        db.get(
            `SELECT id, user_id, seminar_id, status, application_no FROM preregistrations WHERE id = ? AND user_id = ?`,
            [pid, userId],
            (e0, row) => {
                if (e0) return res.status(500).json({ error: e0.message });
                if (!row) return res.status(404).json({ error: 'Pre-registration not found.' });
                const st = String(row.status || '').toLowerCase();
                if (st !== 'revision_required') {
                    return res.status(400).json({
                        error: 'Only pre-registrations marked for revision can be edited and resubmitted.'
                    });
                }
                db.get(
                    `SELECT registration_form_json FROM seminars WHERE id = ?`,
                    [row.seminar_id],
                    (semErr, semRow) => {
                        if (semErr) return res.status(500).json({ error: semErr.message });
                        const flow = seminarFlowFlagsFromRegistrationFormJson(
                            semRow && semRow.registration_form_json
                        );
                        const nextStatus = flow.autoAcceptPreregistration ? 'approved' : 'submitted';
                        const resubmitMessage = flow.autoAcceptPreregistration
                            ? 'Pre-registration updated and accepted.'
                            : 'Pre-registration updated and sent for review again. Tracking ID: ' +
                              (row.application_no || pid) +
                              '.';
                        loadPreregFormConfig(db, row.seminar_id, (cfgErr, cfg) => {
                            if (cfgErr) return res.status(500).json({ error: cfgErr.message });
                            const validationError = validateDynamicForm(formData || {}, false, cfg.fields || [], null);
                            if (validationError) return res.status(400).json({ error: validationError });
                            db.run(
                                `UPDATE preregistrations SET form_data = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                                [JSON.stringify(formData || {}), nextStatus, pid],
                                function (uErr) {
                                    if (uErr && /updated_at|column .* does not exist/i.test(String(uErr.message || ''))) {
                                        return db.run(
                                            `UPDATE preregistrations SET form_data = ?, status = ? WHERE id = ?`,
                                            [JSON.stringify(formData || {}), nextStatus, pid],
                                            function (uErr2) {
                                                if (uErr2) return res.status(500).json({ error: uErr2.message });
                                                portalTracking.logPreregistrationEvent(
                                                    db,
                                                    pid,
                                                    'submitted',
                                                    'Application submitted',
                                                    'Pre-registration updated and sent for review.',
                                                    () => {}
                                                );
                                                notifyPreregistrationStatus(db, {
                                                    userId: row.user_id,
                                                    seminarId: row.seminar_id,
                                                    applicationNo: row.application_no,
                                                    status: nextStatus
                                                });
                                                res.json({
                                                    success: true,
                                                    status: nextStatus,
                                                    autoAccepted: flow.autoAcceptPreregistration,
                                                    message: resubmitMessage
                                                });
                                            }
                                        );
                                    }
                                    if (uErr) return res.status(500).json({ error: uErr.message });
                                    portalTracking.logPreregistrationEvent(
                                        db,
                                        pid,
                                        'submitted',
                                        'Application submitted',
                                        'Pre-registration updated and sent for review.',
                                        () => {}
                                    );
                                    notifyPreregistrationStatus(db, {
                                        userId: row.user_id,
                                        seminarId: row.seminar_id,
                                        applicationNo: row.application_no,
                                        status: nextStatus
                                    });
                                    res.json({
                                        success: true,
                                        status: nextStatus,
                                        autoAccepted: flow.autoAcceptPreregistration,
                                        message: resubmitMessage
                                    });
                                }
                            );
                        });
                    }
                );
            }
        );
    });

    app.get('/api/admin/final-registrations/stats', adminGuard, (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        let sql = `SELECT r.status, COUNT(*) AS c FROM registrations r`;
        const params = [];
        if (Number.isInteger(seminarId) && seminarId > 0) {
            sql += ` WHERE r.seminar_id = ?`;
            params.push(seminarId);
        }
        sql += ` GROUP BY r.status`;
        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const stats = {
                total: 0,
                submitted: 0,
                pending_approval: 0,
                revision_required: 0,
                e_ticket_issued: 0,
                completed: 0,
                rejected: 0,
                cancelled: 0
            };
            (rows || []).forEach((r) => {
                const st = String(r.status || 'submitted').toLowerCase();
                const c = Number(r.c) || 0;
                stats.total += c;
                if (stats[st] != null) stats[st] = c;
                else stats[st] = c;
            });
            res.json(stats);
        });
    });

    app.get('/api/admin/preregistrations/stats', adminGuard, (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        let sql = `SELECT p.status, COUNT(*) AS c FROM preregistrations p`;
        const params = [];
        if (Number.isInteger(seminarId) && seminarId > 0) {
            sql += ` WHERE p.seminar_id = ?`;
            params.push(seminarId);
        }
        sql += ` GROUP BY p.status`;
        const runStats = () => {
            db.all(sql, params, (err, rows) => {
                if (err && isMissingRelationError(err)) {
                    return ensurePreregistrationsTable(db, (ddlErr) => {
                        if (ddlErr) return res.status(500).json({ error: ddlErr.message });
                        runStats();
                    });
                }
                if (err) return res.status(500).json({ error: err.message });
                const stats = { total: 0, submitted: 0, approved: 0, rejected: 0, revision_required: 0, public_form: 0, portal_form: 0 };
                (rows || []).forEach((r) => {
                    const st = String(r.status || 'submitted').toLowerCase();
                    const c = Number(r.c) || 0;
                    stats.total += c;
                    if (stats[st] != null) stats[st] = c;
                });
                let publicSql = `SELECT form_data FROM preregistrations p`;
                const publicParams = [];
                if (Number.isInteger(seminarId) && seminarId > 0) {
                    publicSql += ` WHERE p.seminar_id = ?`;
                    publicParams.push(seminarId);
                }
                db.all(publicSql, publicParams, (e2, allRows) => {
                    if (!e2 && Array.isArray(allRows)) {
                        allRows.forEach((row) => {
                            try {
                                const fd = row.form_data ? JSON.parse(row.form_data) : {};
                                if (preregMainPrefill.isPublicPreregFormData(fd)) stats.public_form += 1;
                                else stats.portal_form += 1;
                            } catch (_) {
                                stats.portal_form += 1;
                            }
                        });
                    }
                    res.json(stats);
                });
            });
        };
        runStats();
    });

    app.get('/api/admin/preregistrations', adminGuard, (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        const statusFilter = String(req.query.status || '').toLowerCase();
        let sql = `SELECT p.*, u.first_name, u.middle_name, u.last_name, u.email, u.phone, u.user_id_string, s.title AS seminar_title,
                          r.id AS registration_id, r.status AS registration_status,
                          r.application_no AS registration_application_no
                   FROM preregistrations p
                   LEFT JOIN users u ON u.id = p.user_id
                   LEFT JOIN seminars s ON s.id = p.seminar_id
                   LEFT JOIN registrations r ON r.user_id = p.user_id AND r.seminar_id = p.seminar_id`;
        const params = [];
        const where = [];
        if (Number.isInteger(seminarId) && seminarId > 0) {
            where.push(`p.seminar_id = ?`);
            params.push(seminarId);
        }
        if (statusFilter && statusFilter !== 'all') {
            where.push(`LOWER(p.status) = ?`);
            params.push(statusFilter);
        }
        if (where.length) sql += ` WHERE ` + where.join(' AND ');
        sql += ` ORDER BY p.created_at DESC LIMIT 500`;
        const runList = () => {
            db.all(sql, params, (err, rows) => {
                if (err && isMissingRelationError(err)) {
                    return ensurePreregistrationsTable(db, (ddlErr) => {
                        if (ddlErr) return res.status(500).json({ error: ddlErr.message });
                        runList();
                    });
                }
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows || []);
            });
        };
        runList();
    });

    app.post('/api/admin/preregistrations/status', adminGuard, (req, res) => {
        const { preregistrationId, status, rejection_reason: rejectionReason, adminNotes } = req.body;
        const allowed = new Set(['submitted', 'approved', 'rejected', 'revision_required']);
        const st = String(status || '').toLowerCase();
        if (!allowed.has(st)) return res.status(400).json({ error: 'Invalid status.' });
        const pid = parseInt(preregistrationId, 10);
        if (!Number.isInteger(pid) || pid < 1) return res.status(400).json({ error: 'Invalid pre-registration id.' });
        const note = String(rejectionReason || adminNotes || '').trim();
        const loadRow = (cb) => {
            db.get(
                `SELECT id, user_id, seminar_id, application_no, status FROM preregistrations WHERE id = ?`,
                [pid],
                (err, row) => {
                    if (err && isMissingRelationError(err)) {
                        return ensurePreregistrationsTable(db, (ddlErr) => {
                            if (ddlErr) return cb(ddlErr);
                            loadRow(cb);
                        });
                    }
                    cb(err, row);
                }
            );
        };
        loadRow((e0, row) => {
            if (e0) return res.status(500).json({ error: e0.message });
            if (!row) return res.status(404).json({ error: 'Not found.' });
            const prevSt = String(row.status || '').toLowerCase();
            const applyUpdate = (withUpdatedAt) => {
                const sql = withUpdatedAt
                    ? `UPDATE preregistrations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                    : `UPDATE preregistrations SET status = ? WHERE id = ?`;
                db.run(sql, [st, pid], function (err) {
                    if (err && withUpdatedAt && /updated_at|column .* does not exist/i.test(String(err.message || ''))) {
                        return applyUpdate(false);
                    }
                    if (err) return res.status(500).json({ error: err.message });
                    if (!this.changes) return res.status(404).json({ error: 'Not found.' });
                    if (prevSt !== st) {
                        portalTracking.preregStatusToLog(st, note).forEach((entry) => {
                            portalTracking.logPreregistrationEvent(
                                db,
                                pid,
                                entry.key,
                                entry.label,
                                entry.message,
                                () => {}
                            );
                        });
                        notifyPreregistrationStatus(db, {
                            userId: row.user_id,
                            seminarId: row.seminar_id,
                            applicationNo: row.application_no,
                            status: st,
                            rejectionReason: note
                        });
                    }
                    res.json({ success: true });
                });
            };
            applyUpdate(true);
        });
    });

    // Admin: delete a pre-registration row (pre-reg tracking only).
    // Note: this does not delete the downstream final registration unless you also delete that registration separately.
    app.delete('/api/admin/preregistrations/:id', adminGuard, (req, res) => {
        const pid = parseInt(req.params.id, 10);
        if (!Number.isInteger(pid) || pid < 1) return res.status(400).json({ error: 'Invalid pre-registration id.' });
        db.get(`SELECT id, user_id, seminar_id, application_no FROM preregistrations WHERE id = ?`, [pid], (e0, row) => {
            if (e0) return res.status(500).json({ error: e0.message });
            if (!row) return res.status(404).json({ error: 'Pre-registration not found.' });
            db.run(`DELETE FROM preregistrations WHERE id = ?`, [pid], function (e1) {
                if (e1) return res.status(500).json({ error: e1.message });
                if (!this.changes) return res.status(404).json({ error: 'Not found.' });
                res.json({ success: true, deletedPreRegId: pid, applicationNo: row.application_no });
            });
        });
    });

    app.get('/api/competition-submissions/:userId', (req, res) => {
        const userId = parsePositiveUserId(req.params.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user.' });
        const runList = () => {
            db.all(
                `SELECT cs.*, s.title AS seminar_title
             FROM competition_submissions cs
             LEFT JOIN seminars s ON s.id = cs.seminar_id
             WHERE cs.user_id = ?
             ORDER BY cs.created_at DESC`,
                [userId],
                (err, rows) => {
                    if (err && isMissingRelationError(err)) {
                        return ensureCompetitionTables(db, (ddlErr) => {
                            if (ddlErr) return res.status(500).json({ error: ddlErr.message });
                            runList();
                        });
                    }
                    if (err) return res.status(500).json({ error: err.message });
                    if (!rows || !rows.length) return res.json([]);
                    const ids = rows.map((r) => r.id);
                    db.all(
                        `SELECT * FROM competition_files WHERE submission_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`,
                        ids,
                        (fErr, files) => {
                            if (fErr) return res.status(500).json({ error: fErr.message });
                            const bySub = {};
                            (files || []).forEach((f) => {
                                if (!bySub[f.submission_id]) bySub[f.submission_id] = [];
                                bySub[f.submission_id].push(f);
                            });
                            res.json(rows.map((r) => ({ ...r, files: bySub[r.id] || [] })));
                        }
                    );
                }
            );
        };
        runList();
    });

    app.post('/api/competition-submissions/submit', (req, res, next) => {
        multiUpload(req, res, (err) => {
            if (err) return res.status(400).json({ error: err.message });
            let { userId, seminarId, title, category, description } = req.body;
            userId = parsePositiveUserId(userId);
            seminarId = seminarId ? parseInt(seminarId, 10) : null;
            title = String(title || '').trim();
            if (!userId) return res.status(400).json({ error: 'Invalid user session.' });
            if (!title) return res.status(400).json({ error: 'Title is required.' });
            if (!req.files || !req.files.length) {
                return res.status(400).json({ error: 'Upload at least one image, video, PPT, or PDF.' });
            }

            fileStore.persistMulterFiles(db, req.files, uploadsDir, (persistErr, storedPaths) => {
                if (persistErr) return res.status(500).json({ error: persistErr.message });

                const applicationNo = generateApplicationNo();
                db.run(
                    `INSERT INTO competition_submissions (user_id, seminar_id, title, category, description, status, application_no)
                     VALUES (?, ?, ?, ?, ?, 'submitted', ?)`,
                    [userId, seminarId, title, category || '', description || '', applicationNo],
                    function (insErr) {
                        if (insErr && isMissingRelationError(insErr)) {
                            return ensureCompetitionTables(db, (ddlErr) => {
                                if (ddlErr) return res.status(500).json({ error: ddlErr.message });
                                db.run(
                                    `INSERT INTO competition_submissions (user_id, seminar_id, title, category, description, status, application_no)
                                     VALUES (?, ?, ?, ?, ?, 'submitted', ?)`,
                                    [userId, seminarId, title, category || '', description || '', applicationNo],
                                    function (retryErr) {
                                        if (retryErr) return res.status(500).json({ error: retryErr.message });
                                        insertFiles(this.lastID);
                                    }
                                );
                            });
                        }
                        if (insErr) return res.status(500).json({ error: insErr.message });
                        insertFiles(this.lastID);
                    }
                );

                function insertFiles(submissionId) {
                    let pending = storedPaths.length;
                    let fileErr = null;
                    storedPaths.forEach((storedPath, idx) => {
                        const f = req.files[idx];
                        const ext = path.extname(f.originalname || '').toLowerCase();
                        db.run(
                            `INSERT INTO competition_files (submission_id, file_path, original_name, file_type, sort_order)
                                 VALUES (?, ?, ?, ?, ?)`,
                            [submissionId, storedPath, f.originalname, ext, idx],
                            (eF) => {
                                if (eF) fileErr = eF;
                                pending--;
                                if (pending === 0) {
                                    if (fileErr) return res.status(500).json({ error: fileErr.message });
                                    res.json({
                                        success: true,
                                        submissionId,
                                        applicationNo,
                                        message: 'Competition entry submitted successfully.'
                                    });
                                }
                            }
                        );
                    });
                }
            });
        });
    });

    app.get('/api/admin/competition-submissions', adminGuard, (req, res) => {
        const runList = () => {
            db.all(
                `SELECT cs.*, u.first_name, u.last_name, u.email, u.phone, u.user_id_string, s.title AS seminar_title
             FROM competition_submissions cs
             LEFT JOIN users u ON u.id = cs.user_id
             LEFT JOIN seminars s ON s.id = cs.seminar_id
             ORDER BY cs.created_at DESC LIMIT 500`,
                [],
                (err, rows) => {
                    if (err && isMissingRelationError(err)) {
                        return ensureCompetitionTables(db, (ddlErr) => {
                            if (ddlErr) return res.status(500).json({ error: ddlErr.message });
                            runList();
                        });
                    }
                    if (err) return res.status(500).json({ error: err.message });
                    if (!rows || !rows.length) return res.json([]);
                    const ids = rows.map((r) => r.id);
                    db.all(
                        `SELECT * FROM competition_files WHERE submission_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`,
                        ids,
                        (fErr, files) => {
                            if (fErr) return res.status(500).json({ error: fErr.message });
                            const bySub = {};
                            (files || []).forEach((f) => {
                                if (!bySub[f.submission_id]) bySub[f.submission_id] = [];
                                bySub[f.submission_id].push(f);
                            });
                            res.json(rows.map((r) => ({ ...r, files: bySub[r.id] || [] })));
                        }
                    );
                }
            );
        };
        runList();
    });

    app.post('/api/admin/competition-submissions/status', adminGuard, (req, res) => {
        const { submissionId, status, adminNotes } = req.body;
        const allowed = new Set(['draft', 'submitted', 'under_review', 'approved', 'rejected']);
        const st = String(status || '').toLowerCase();
        if (!allowed.has(st)) return res.status(400).json({ error: 'Invalid status.' });
        const sid = parseInt(submissionId, 10);
        if (!Number.isInteger(sid) || sid < 1) return res.status(400).json({ error: 'Invalid submission id.' });
        const applyUpdate = (withUpdatedAt) => {
            const sql = withUpdatedAt
                ? `UPDATE competition_submissions SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                : `UPDATE competition_submissions SET status = ?, admin_notes = ? WHERE id = ?`;
            db.run(sql, [st, adminNotes || '', sid], function (err) {
                if (err && isMissingRelationError(err)) {
                    return ensureCompetitionTables(db, (ddlErr) => {
                        if (ddlErr) return res.status(500).json({ error: ddlErr.message });
                        applyUpdate(withUpdatedAt);
                    });
                }
                if (err && withUpdatedAt && /updated_at|column .* does not exist/i.test(String(err.message || ''))) {
                    return applyUpdate(false);
                }
                if (err) return res.status(500).json({ error: err.message });
                if (!this.changes) return res.status(404).json({ error: 'Not found.' });
                res.json({ success: true });
            });
        };
        applyUpdate(true);
    });

    function loadPublicSiteCmsJson(cb) {
        db.get(`SELECT value FROM global_settings WHERE key = 'public_site_cms'`, [], (e, row) => {
            if (e) return cb(e);
            let cms = {};
            try {
                cms = row && row.value ? JSON.parse(row.value) : {};
            } catch (_) {
                cms = {};
            }
            cb(null, cms);
        });
    }

    const PAYMENT_CMS_RE = /\b(payment|payments|receipt|receipts|paid|pay\b|orders?\b|invoice)\b/i;

    function isPaymentRelatedCmsUpdate(u) {
        const blob = String(u && u.title ? u.title : '') + ' ' + String(u && u.body ? u.body : '');
        return PAYMENT_CMS_RE.test(blob);
    }

    function cmsDoctorUpdatesForApplicants(cms) {
        const raw = Array.isArray(cms && cms.doctorUpdates) ? cms.doctorUpdates : [];
        const items = portalProduct.FEATURES.hasPayments ? raw : raw.filter((u) => !isPaymentRelatedCmsUpdate(u));
        return items.map((u, i) => ({
            id: 'cms-' + i,
            scope: 'all',
            title: u.title || 'Update',
            body: u.body || '',
            at: u.at || null,
            created_at: u.at || null
        }));
    }

    function respondApplicantAnnouncements(userId, cms, res) {
        const globalItems = cmsDoctorUpdatesForApplicants(cms);
        const finish = (rows) => {
            const targeted = (rows || []).map((r) => ({
                id: r.id,
                scope: r.user_id ? 'you' : 'all',
                title: r.title,
                body: r.body || '',
                at: r.created_at,
                created_at: r.created_at
            }));
            const payload = {
                global: globalItems,
                targeted,
                items: [...targeted, ...globalItems]
            };
            setApplicantAnnouncementsCache(userId, payload, 45000);
            res.setHeader('Cache-Control', 'private, max-age=0, s-maxage=45, stale-while-revalidate=30');
            res.json(payload);
        };
        db.all(
            `SELECT * FROM applicant_announcements
             WHERE is_active = 1 AND (user_id IS NULL OR user_id = ?)
             ORDER BY created_at DESC LIMIT 100`,
            [userId],
            (err, rows) => {
                if (err && isMissingRelationError(err)) {
                    return ensureApplicantAnnouncementsTable(db, (ddlErr) => {
                        if (ddlErr) return finish([]);
                        db.all(
                            `SELECT * FROM applicant_announcements
                             WHERE is_active = 1 AND (user_id IS NULL OR user_id = ?)
                             ORDER BY created_at DESC LIMIT 100`,
                            [userId],
                            (err2, rows2) => {
                                if (err2) return finish([]);
                                finish(rows2 || []);
                            }
                        );
                    });
                }
                if (err) return res.status(500).json({ error: err.message });
                finish(rows || []);
            }
        );
    }

    app.get('/api/applicant/announcements', (req, res) => {
        const userId = parsePositiveUserId(req.query.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user.' });
        const cached = getApplicantAnnouncementsCache(userId);
        if (cached) {
            res.setHeader('Cache-Control', 'private, max-age=0, s-maxage=45, stale-while-revalidate=30');
            return res.json(cached);
        }
        loadPublicSiteCmsJson((cmsErr, cms) => {
            if (cmsErr) return res.status(500).json({ error: cmsErr.message });
            respondApplicantAnnouncements(userId, cms || {}, res);
        });
    });

    app.get('/api/admin/applicant-announcements', adminGuard, (req, res) => {
        const userId = parsePositiveUserId(req.query.userId);
        let sql = `SELECT a.*, u.first_name, u.last_name, u.email FROM applicant_announcements a LEFT JOIN users u ON u.id = a.user_id WHERE 1=1`;
        const params = [];
        if (userId) {
            sql += ` AND a.user_id = ?`;
            params.push(userId);
        }
        sql += ` ORDER BY a.created_at DESC LIMIT 200`;
        const runList = () => {
            db.all(sql, params, (err, rows) => {
                if (err && isMissingRelationError(err)) {
                    return ensureApplicantAnnouncementsTable(db, (ddlErr) => {
                        if (ddlErr) return res.json([]);
                        runList();
                    });
                }
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows || []);
            });
        };
        runList();
    });

    app.post('/api/admin/applicant-announcements', adminGuard, (req, res) => {
        const { userId, title, body, isActive } = req.body || {};
        const t = String(title || '').trim();
        if (!t) return res.status(400).json({ error: 'Title required.' });
        const uid = userId == null || userId === '' ? null : parsePositiveUserId(userId);
        if (userId != null && userId !== '' && !uid) return res.status(400).json({ error: 'Invalid user.' });
        const doInsert = () => {
            db.run(
                `INSERT INTO applicant_announcements (user_id, title, body, is_active) VALUES (?, ?, ?, ?)`,
                [uid, t, String(body || '').trim(), isActive === false ? 0 : 1],
                function (err) {
                    if (err && isMissingRelationError(err)) {
                        return ensureApplicantAnnouncementsTable(db, (ddlErr) => {
                            if (ddlErr) return res.status(500).json({ error: ddlErr.message });
                            doInsert();
                        });
                    }
                    if (err) return res.status(500).json({ error: err.message });
                    clearApplicantAnnouncementsCache();
                    if (uid) {
                        notifEngine.notifyUserEvent(db, 'ADMIN_ANNOUNCEMENT', {
                            userId: uid,
                            vars: {
                                ticket_subject: t,
                                announcement_body: String(body || '').trim()
                            }
                        });
                    }
                    res.json({ success: true, id: this.lastID });
                }
            );
        };
        doInsert();
    });

    app.delete('/api/admin/applicant-announcements/:id', adminGuard, (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id.' });
        db.run(`DELETE FROM applicant_announcements WHERE id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: 'Not found.' });
            clearApplicantAnnouncementsCache();
            res.json({ success: true });
        });
    });

    app.post('/api/admin/seminars/:id/main-registration-open', adminGuard, (req, res) => {
        const seminarId = parseInt(req.params.id, 10);
        if (!Number.isInteger(seminarId) || seminarId < 1) {
            return res.status(400).json({ error: 'Invalid seminar id.' });
        }
        const open = !!(req.body && req.body.open);
        db.get(
            `SELECT id, registration_form_json FROM seminars WHERE id = ?`,
            [seminarId],
            (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!row) return res.status(404).json({ error: 'Seminar not found.' });
                const flow = seminarFlowFlagsFromRegistrationFormJson(row.registration_form_json);
                if (!flow.mainRegistrationRequired) {
                    return res.status(400).json({ error: 'Main registration is not enabled for this event.' });
                }
                if (!flow.preregistrationRequired) {
                    return res.status(400).json({
                        error: 'This event uses direct main registration only — it is always open when registration dates allow.'
                    });
                }
                const nextJson = seminarRegFlow.mergeMainRegistrationOpenIntoFormJson(
                    row.registration_form_json,
                    open
                );
                db.run(
                    `UPDATE seminars SET registration_form_json = ? WHERE id = ?`,
                    [nextJson, seminarId],
                    function (uerr) {
                        if (uerr) return res.status(500).json({ error: uerr.message });
                        if (!this.changes) return res.status(404).json({ error: 'Seminar not found.' });
                        res.json({
                            success: true,
                            seminarId,
                            mainRegistrationOpen: open,
                            message: open
                                ? 'Final registration is now open for applicants.'
                                : 'Final registration is closed for applicants.'
                        });
                    }
                );
            }
        );
    });

    const autismSiteImages = require('./autism-site-images');
    autismSiteImages.registerAutismSiteImageRoutes(app, db, adminGuard);

    console.log('[autism] Preregistration & competition routes registered');
}

module.exports = {
    ensureAutismSchema,
    loadPreregFormConfig,
    preregWindowState,
    registerAutismPortalRoutes,
    generateApplicationNo,
    createAdminGuard
};
