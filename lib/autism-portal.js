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

const COMPETITION_FILE_TYPES = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm|ppt|pptx|pdf)$/i;

function generateApplicationNo() {
    let id = '';
    for (let i = 0; i < 12; i++) id += Math.floor(Math.random() * 10).toString();
    return id;
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

function parseFormConfig(raw, fallback) {
    if (!raw) return { fields: fallback.fields.slice(), birthYearMin: null, birthYearMax: null };
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return { fields: parsed, birthYearMin: null, birthYearMax: null };
        return {
            fields: Array.isArray(parsed.fields) ? parsed.fields : fallback.fields.slice(),
            birthYearMin: parsed.birthYearMin != null ? parsed.birthYearMin : null,
            birthYearMax: parsed.birthYearMax != null ? parsed.birthYearMax : null
        };
    } catch (_) {
        return { fields: fallback.fields.slice(), birthYearMin: null, birthYearMax: null };
    }
}

function ensureAutismSchema(db, ignoreErr, next) {
    db.serialize(() => {
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

function preregWindowState(seminar) {
    const now = Date.now();
    const ps = seminarDt.parseSeminarMs(seminar.preregistration_start);
    const pe = seminarDt.parseSeminarMs(seminar.preregistration_end);
    if (ps != null && now < ps) return { open: false, reason: 'not_started' };
    if (pe != null && now > pe) return { open: false, reason: 'closed' };
    return { open: true };
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

function registerAutismPortalRoutes(app, deps) {
    const { db, uploadsDir, generateId, parsePositiveUserId, assertAdminPortalActor } = deps;
    const adminGuard = createAdminGuard(assertAdminPortalActor);
    const competitionUpload = createCompetitionUpload(uploadsDir);
    const multiUpload = competitionUpload.array('files', 10);

    app.get('/api/portal-config', (req, res) => {
        res.json(portalProduct.publicConfig());
    });

    app.get('/api/preregistration-form-config', (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        loadPreregFormConfig(db, Number.isInteger(seminarId) && seminarId > 0 ? seminarId : null, (err, cfg) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                fields: sanitizeRegistrationFormFields(cfg.fields || []),
                birthYearMin: cfg.birthYearMin,
                birthYearMax: cfg.birthYearMax
            });
        });
    });

    app.post('/api/admin/preregistration-form-config', adminGuard, (req, res) => {
        const payload = JSON.stringify(req.body || {});
        db.run(`UPDATE global_settings SET value = ? WHERE key = 'preregistration_form_config'`, [payload], function (uerr) {
            if (uerr) return res.status(500).json({ error: uerr.message });
            if (this.changes) return res.json({ success: true });
            db.run(
                `INSERT INTO global_settings (key, value) VALUES ('preregistration_form_config', ?)`,
                [payload],
                (ierr) => {
                    if (ierr) return res.status(500).json({ error: ierr.message });
                    res.json({ success: true });
                }
            );
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
                res.json(rows || []);
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
                `SELECT id, title, preregistration_start, preregistration_end, is_active FROM seminars WHERE id = ?`,
                [seminarId],
                (e1, sem) => {
                    if (e1) return res.status(500).json({ error: e1.message });
                    if (!sem || !sem.is_active) return res.status(400).json({ error: 'Event not found or inactive.' });
                    const win = preregWindowState(sem);
                    if (!win.open) {
                        return res.status(400).json({
                            error:
                                win.reason === 'not_started'
                                    ? 'Pre-registration has not opened yet.'
                                    : 'Pre-registration has closed.'
                        });
                    }
                    loadPreregFormConfig(db, seminarId, (cfgErr, cfg) => {
                        if (cfgErr) return res.status(500).json({ error: cfgErr.message });
                        const validationError = validateDynamicForm(formData || {}, false, cfg.fields || [], null);
                        if (validationError) return res.status(400).json({ error: validationError });

                        const applicationNo = generateApplicationNo();
                        db.run(
                            `INSERT INTO preregistrations (user_id, seminar_id, application_no, status, form_data)
                             VALUES (?, ?, ?, 'submitted', ?)`,
                            [userId, seminarId, applicationNo, JSON.stringify(formData || {})],
                            function (insErr) {
                                if (insErr) return res.status(500).json({ error: insErr.message });
                                res.json({
                                    success: true,
                                    preregistrationId: this.lastID,
                                    applicationNo,
                                    message: 'Pre-registration submitted successfully.'
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
            `SELECT id, user_id, seminar_id, status FROM preregistrations WHERE id = ? AND user_id = ?`,
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
                loadPreregFormConfig(db, row.seminar_id, (cfgErr, cfg) => {
                    if (cfgErr) return res.status(500).json({ error: cfgErr.message });
                    const validationError = validateDynamicForm(formData || {}, false, cfg.fields || [], null);
                    if (validationError) return res.status(400).json({ error: validationError });
                    db.run(
                        `UPDATE preregistrations SET form_data = ?, status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                        [JSON.stringify(formData || {}), pid],
                        function (uErr) {
                            if (uErr && /updated_at|column .* does not exist/i.test(String(uErr.message || ''))) {
                                return db.run(
                                    `UPDATE preregistrations SET form_data = ?, status = 'submitted' WHERE id = ?`,
                                    [JSON.stringify(formData || {}), pid],
                                    function (uErr2) {
                                        if (uErr2) return res.status(500).json({ error: uErr2.message });
                                        res.json({
                                            success: true,
                                            message: 'Pre-registration updated and sent for review again.'
                                        });
                                    }
                                );
                            }
                            if (uErr) return res.status(500).json({ error: uErr.message });
                            res.json({
                                success: true,
                                message: 'Pre-registration updated and sent for review again.'
                            });
                        }
                    );
                });
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
                const stats = { total: 0, submitted: 0, approved: 0, rejected: 0, revision_required: 0 };
                (rows || []).forEach((r) => {
                    const st = String(r.status || 'submitted').toLowerCase();
                    const c = Number(r.c) || 0;
                    stats.total += c;
                    if (stats[st] != null) stats[st] = c;
                });
                res.json(stats);
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
        const { preregistrationId, status } = req.body;
        const allowed = new Set(['submitted', 'approved', 'rejected', 'revision_required']);
        const st = String(status || '').toLowerCase();
        if (!allowed.has(st)) return res.status(400).json({ error: 'Invalid status.' });
        const pid = parseInt(preregistrationId, 10);
        if (!Number.isInteger(pid) || pid < 1) return res.status(400).json({ error: 'Invalid pre-registration id.' });
        const applyUpdate = (withUpdatedAt) => {
            const sql = withUpdatedAt
                ? `UPDATE preregistrations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                : `UPDATE preregistrations SET status = ? WHERE id = ?`;
            db.run(sql, [st, pid], function (err) {
                if (err && isMissingRelationError(err)) {
                    return ensurePreregistrationsTable(db, (ddlErr) => {
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
        const finish = (rows, seminarNotices) => {
            const targeted = (rows || []).map((r) => ({
                id: r.id,
                scope: r.user_id ? 'you' : 'all',
                title: r.title,
                body: r.body || '',
                at: r.created_at,
                created_at: r.created_at
            }));
            const fromNotices = (seminarNotices || []).map((n) => ({
                id: 'notice-' + n.id,
                scope: 'all',
                title: n.seminar_title ? n.seminar_title + ' — Notice' : 'Programme notice',
                body: n.message || '',
                at: n.created_at,
                created_at: n.created_at,
                pdf_path: n.pdf_path || null
            }));
            const mergedGlobal = [...fromNotices, ...globalItems];
            res.json({
                global: mergedGlobal,
                targeted,
                items: [...targeted, ...mergedGlobal]
            });
        };
        const loadAnnRows = () => {
            db.all(
                `SELECT * FROM applicant_announcements
                 WHERE is_active = 1 AND (user_id IS NULL OR user_id = ?)
                 ORDER BY created_at DESC LIMIT 100`,
                [userId],
                (err, rows) => {
                    if (err && isMissingRelationError(err)) {
                        return ensureApplicantAnnouncementsTable(db, (ddlErr) => {
                            if (ddlErr) return loadNotices([]);
                            db.all(
                                `SELECT * FROM applicant_announcements
                                 WHERE is_active = 1 AND (user_id IS NULL OR user_id = ?)
                                 ORDER BY created_at DESC LIMIT 100`,
                                [userId],
                                (err2, rows2) => {
                                    if (err2) return loadNotices([]);
                                    loadNotices(rows2 || []);
                                }
                            );
                        });
                    }
                    if (err) return res.status(500).json({ error: err.message });
                    loadNotices(rows || []);
                }
            );
        };
        const loadNotices = (annRows) => {
            db.all(
                `SELECT n.id, n.message, n.pdf_path, n.created_at, n.seminar_id, s.title AS seminar_title
                 FROM notices n
                 LEFT JOIN seminars s ON s.id = n.seminar_id
                 WHERE n.seminar_id IS NULL
                    OR n.seminar_id IN (SELECT seminar_id FROM preregistrations WHERE user_id = ?)
                    OR n.seminar_id IN (SELECT seminar_id FROM registrations WHERE user_id = ?)
                 ORDER BY n.created_at DESC LIMIT 30`,
                [userId, userId],
                (nErr, noticeRows) => {
                    if (nErr && isMissingRelationError(nErr)) {
                        return ensureNoticesTable(db, (ddlErr) => {
                            if (ddlErr) return finish(annRows, []);
                            db.all(
                                `SELECT n.id, n.message, n.pdf_path, n.created_at, n.seminar_id, s.title AS seminar_title
                                 FROM notices n
                                 LEFT JOIN seminars s ON s.id = n.seminar_id
                                 WHERE n.seminar_id IS NULL
                                    OR n.seminar_id IN (SELECT seminar_id FROM preregistrations WHERE user_id = ?)
                                    OR n.seminar_id IN (SELECT seminar_id FROM registrations WHERE user_id = ?)
                                 ORDER BY n.created_at DESC LIMIT 30`,
                                [userId, userId],
                                (nErr2, rows2) => {
                                    if (nErr2) return finish(annRows, []);
                                    finish(annRows, rows2 || []);
                                }
                            );
                        });
                    }
                    if (nErr) return finish(annRows, []);
                    finish(annRows, noticeRows || []);
                }
            );
        };
        loadAnnRows();
    }

    app.get('/api/applicant/announcements', (req, res) => {
        const userId = parsePositiveUserId(req.query.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user.' });
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
            res.json({ success: true });
        });
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
    generateApplicationNo
};
