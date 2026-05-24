/**
 * Autism portal: preregistration, competition uploads, schema helpers.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
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

function createCompetitionUpload(uploadsDir) {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(uploadsDir, 'competition');
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const safe = String(file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
            cb(null, `${Date.now()}_${safe}`);
        }
    });
    return multer({
        storage,
        limits: { fileSize: 200 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (COMPETITION_FILE_TYPES.test(file.originalname || '')) cb(null, true);
            else cb(new Error('Allowed: images, video, PPT, PDF'));
        }
    });
}

function registerAutismPortalRoutes(app, deps) {
    const { db, uploadsDir, generateId, parsePositiveUserId, assertAdminPortalActor } = deps;
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

    app.post('/api/admin/preregistration-form-config', assertAdminPortalActor, (req, res) => {
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

    app.get('/api/admin/preregistrations/stats', assertAdminPortalActor, (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        let sql = `SELECT p.status, COUNT(*) AS c FROM preregistrations p`;
        const params = [];
        if (Number.isInteger(seminarId) && seminarId > 0) {
            sql += ` WHERE p.seminar_id = ?`;
            params.push(seminarId);
        }
        sql += ` GROUP BY p.status`;
        db.all(sql, params, (err, rows) => {
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
    });

    app.get('/api/admin/preregistrations', assertAdminPortalActor, (req, res) => {
        const seminarId = parseInt(req.query.seminarId, 10);
        const statusFilter = String(req.query.status || '').toLowerCase();
        let sql = `SELECT p.*, u.first_name, u.last_name, u.email, u.phone, s.title AS seminar_title,
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
        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    app.post('/api/admin/preregistrations/status', assertAdminPortalActor, (req, res) => {
        const { preregistrationId, status } = req.body;
        const allowed = new Set(['submitted', 'approved', 'rejected', 'revision_required']);
        const st = String(status || '').toLowerCase();
        if (!allowed.has(st)) return res.status(400).json({ error: 'Invalid status.' });
        db.run(`UPDATE preregistrations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [st, preregistrationId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: 'Not found.' });
            res.json({ success: true });
        });
    });

    app.get('/api/competition-submissions/:userId', (req, res) => {
        const userId = parsePositiveUserId(req.params.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user.' });
        db.all(
            `SELECT cs.*, s.title AS seminar_title
             FROM competition_submissions cs
             LEFT JOIN seminars s ON s.id = cs.seminar_id
             WHERE cs.user_id = ?
             ORDER BY cs.created_at DESC`,
            [userId],
            (err, rows) => {
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

            db.run(
                `INSERT INTO competition_submissions (user_id, seminar_id, title, category, description, status)
                 VALUES (?, ?, ?, ?, ?, 'submitted')`,
                [userId, seminarId, title, category || '', description || ''],
                function (insErr) {
                    if (insErr) return res.status(500).json({ error: insErr.message });
                    const submissionId = this.lastID;
                    let pending = req.files.length;
                    let fileErr = null;
                    req.files.forEach((f, idx) => {
                        const rel = path.relative(uploadsDir, f.path).replace(/\\/g, '/');
                        const ext = path.extname(f.originalname || '').toLowerCase();
                        db.run(
                            `INSERT INTO competition_files (submission_id, file_path, original_name, file_type, sort_order)
                             VALUES (?, ?, ?, ?, ?)`,
                            [submissionId, rel, f.originalname, ext, idx],
                            (eF) => {
                                if (eF) fileErr = eF;
                                pending--;
                                if (pending === 0) {
                                    if (fileErr) return res.status(500).json({ error: fileErr.message });
                                    res.json({
                                        success: true,
                                        submissionId,
                                        message: 'Competition entry submitted successfully.'
                                    });
                                }
                            }
                        );
                    });
                }
            );
        });
    });

    app.get('/api/admin/competition-submissions', assertAdminPortalActor, (req, res) => {
        db.all(
            `SELECT cs.*, u.first_name, u.last_name, u.email, s.title AS seminar_title
             FROM competition_submissions cs
             LEFT JOIN users u ON u.id = cs.user_id
             LEFT JOIN seminars s ON s.id = cs.seminar_id
             ORDER BY cs.created_at DESC LIMIT 500`,
            [],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows || []);
            }
        );
    });

    app.post('/api/admin/competition-submissions/status', assertAdminPortalActor, (req, res) => {
        const { submissionId, status, adminNotes } = req.body;
        const allowed = new Set(['draft', 'submitted', 'under_review', 'approved', 'rejected']);
        const st = String(status || '').toLowerCase();
        if (!allowed.has(st)) return res.status(400).json({ error: 'Invalid status.' });
        db.run(
            `UPDATE competition_submissions SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [st, adminNotes || '', submissionId],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (!this.changes) return res.status(404).json({ error: 'Not found.' });
                res.json({ success: true });
            }
        );
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

    app.get('/api/applicant/announcements', (req, res) => {
        const userId = parsePositiveUserId(req.query.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user.' });
        loadPublicSiteCmsJson((cmsErr, cms) => {
            if (cmsErr) return res.status(500).json({ error: cmsErr.message });
            const globalItems = (Array.isArray(cms.doctorUpdates) ? cms.doctorUpdates : []).map((u, i) => ({
                id: 'cms-' + i,
                scope: 'all',
                title: u.title || 'Update',
                body: u.body || '',
                at: u.at || null,
                created_at: u.at || null
            }));
            db.all(
                `SELECT * FROM applicant_announcements
                 WHERE is_active = 1 AND (user_id IS NULL OR user_id = ?)
                 ORDER BY created_at DESC LIMIT 100`,
                [userId],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const targeted = (rows || []).map((r) => ({
                        id: r.id,
                        scope: r.user_id ? 'you' : 'all',
                        title: r.title,
                        body: r.body || '',
                        at: r.created_at,
                        created_at: r.created_at
                    }));
                    res.json({
                        global: globalItems,
                        targeted,
                        items: [...targeted, ...globalItems]
                    });
                }
            );
        });
    });

    app.get('/api/admin/applicant-announcements', assertAdminPortalActor, (req, res) => {
        const userId = parsePositiveUserId(req.query.userId);
        let sql = `SELECT a.*, u.first_name, u.last_name, u.email FROM applicant_announcements a LEFT JOIN users u ON u.id = a.user_id WHERE 1=1`;
        const params = [];
        if (userId) {
            sql += ` AND a.user_id = ?`;
            params.push(userId);
        }
        sql += ` ORDER BY a.created_at DESC LIMIT 200`;
        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    app.post('/api/admin/applicant-announcements', assertAdminPortalActor, (req, res) => {
        const { userId, title, body, isActive } = req.body || {};
        const t = String(title || '').trim();
        if (!t) return res.status(400).json({ error: 'Title required.' });
        const uid = userId == null || userId === '' ? null : parsePositiveUserId(userId);
        if (userId != null && userId !== '' && !uid) return res.status(400).json({ error: 'Invalid user.' });
        db.run(
            `INSERT INTO applicant_announcements (user_id, title, body, is_active) VALUES (?, ?, ?, ?)`,
            [uid, t, String(body || '').trim(), isActive === false ? 0 : 1],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID });
            }
        );
    });

    app.delete('/api/admin/applicant-announcements/:id', assertAdminPortalActor, (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id.' });
        db.run(`DELETE FROM applicant_announcements WHERE id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: 'Not found.' });
            res.json({ success: true });
        });
    });

    const autismSiteImages = require('./autism-site-images');
    autismSiteImages.registerAutismSiteImageRoutes(app, db, assertAdminPortalActor);

    console.log('[autism] Preregistration & competition routes registered');
}

module.exports = {
    ensureAutismSchema,
    loadPreregFormConfig,
    preregWindowState,
    registerAutismPortalRoutes,
    generateApplicationNo
};
