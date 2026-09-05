/**
 * On-spot self-service registration links.
 *
 * Staff generate a temporary unique link (token) for an event. Applicants open it on
 * their phone, fill the event form, and the submission lands in the admin
 * "On-spot submissions" queue, from where staff can add it to main registration
 * (creating the account + ticket via the POS flow).
 */
const crypto = require('crypto');
const ticketAttendees = require('./ticket-attendees');

const DEFAULT_HOURS = 12;
const MAX_HOURS = 24 * 7;

function ensureSchema(db, cb) {
    if (process.env.DATABASE_URL) return cb && cb(null);
    db.run(
        `CREATE TABLE IF NOT EXISTS onspot_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            seminar_id INTEGER NOT NULL,
            created_by INTEGER,
            label TEXT,
            expires_at DATETIME,
            max_uses INTEGER DEFAULT 0,
            uses INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
        (e1) => {
            if (e1) return cb && cb(e1);
            db.run(
                `CREATE TABLE IF NOT EXISTS onspot_submissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    link_id INTEGER,
                    seminar_id INTEGER NOT NULL,
                    first_name TEXT,
                    middle_name TEXT,
                    last_name TEXT,
                    email TEXT,
                    phone TEXT,
                    attendees_count INTEGER,
                    form_data TEXT,
                    status TEXT DEFAULT 'pending',
                    registration_id INTEGER,
                    promoted_by INTEGER,
                    promoted_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                [],
                (e2) => cb && cb(e2 || null)
            );
        }
    );
}

function newToken() {
    return crypto.randomBytes(18).toString('base64url');
}

function isExpired(row) {
    if (!row) return true;
    if (Number(row.active) !== 1) return true;
    if (row.expires_at) {
        const t = new Date(String(row.expires_at).replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(String(row.expires_at)) ? '' : 'Z'));
        if (!Number.isNaN(t.getTime()) && t.getTime() < Date.now()) return true;
    }
    if (Number(row.max_uses) > 0 && Number(row.uses) >= Number(row.max_uses)) return true;
    return false;
}

function pick(fd, keys) {
    for (const k of keys) {
        if (fd[k] != null && String(fd[k]).trim() !== '') return String(fd[k]).trim();
    }
    return '';
}

function registerOnspotLinkRoutes(app, deps) {
    const { db, requireAdminActor, loadRegistrationFormConfig, registrationFormFieldsForPortal, publicBaseUrl, registerOnSpot, seminarIsFree, seminarCapacity } = deps;

    ensureSchema(db, (e) => {
        if (e) console.warn('[onspot-links] schema:', e.message);
    });

    function linkUrl(token) {
        return publicBaseUrl() + '/onspot/' + encodeURIComponent(token);
    }

    function shapeLink(row) {
        return Object.assign({}, row, {
            url: linkUrl(row.token),
            qrPath: '/api/admin/onspot-links/' + row.id + '/qr.png',
            expired: isExpired(row)
        });
    }

    // ---- admin: links ----
    app.post('/api/admin/onspot-links', (req, res) => {
        requireAdminActor(req, res, (actor) => {
            const sid = parseInt((req.body || {}).seminarId, 10);
            if (!Number.isInteger(sid) || sid < 1) return res.status(400).json({ error: 'seminarId required' });
            let hours = parseInt((req.body || {}).hours, 10);
            if (!Number.isInteger(hours) || hours < 1) hours = DEFAULT_HOURS;
            if (hours > MAX_HOURS) hours = MAX_HOURS;
            const maxUses = Math.max(0, parseInt((req.body || {}).maxUses, 10) || 0);
            const label = String((req.body || {}).label || '').trim().slice(0, 120);
            const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
            db.get(`SELECT id, title FROM seminars WHERE id = ?`, [sid], (e, sem) => {
                if (e) return res.status(500).json({ error: e.message });
                if (!sem) return res.status(404).json({ error: 'Event not found.' });
                const token = newToken();
                db.run(
                    `INSERT INTO onspot_links (token, seminar_id, created_by, label, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?)`,
                    [token, sid, actor.id, label || null, expires, maxUses],
                    function (insErr) {
                        if (insErr) return res.status(500).json({ error: insErr.message });
                        res.json({
                            success: true,
                            link: {
                                id: this.lastID,
                                token,
                                seminar_id: sid,
                                seminar_title: sem.title,
                                label,
                                expires_at: expires,
                                max_uses: maxUses,
                                uses: 0,
                                active: 1,
                                url: linkUrl(token),
                                qrPath: '/api/admin/onspot-links/' + this.lastID + '/qr.png',
                                expired: false
                            }
                        });
                    }
                );
            });
        });
    });

    app.get('/api/admin/onspot-links', (req, res) => {
        requireAdminActor(req, res, () => {
            const sid = parseInt(req.query.seminarId, 10);
            const where = Number.isInteger(sid) && sid > 0 ? 'WHERE l.seminar_id = ?' : '';
            const params = where ? [sid] : [];
            db.all(
                `SELECT l.*, s.title AS seminar_title,
                        (SELECT COUNT(*) FROM onspot_submissions os WHERE os.link_id = l.id) AS submissions
                 FROM onspot_links l LEFT JOIN seminars s ON s.id = l.seminar_id
                 ${where} ORDER BY l.id DESC LIMIT 100`,
                params,
                (e, rows) => {
                    if (e) return res.status(500).json({ error: e.message });
                    res.json({ links: (rows || []).map(shapeLink) });
                }
            );
        });
    });

    app.get('/api/admin/onspot-links/:id/qr.png', (req, res) => {
        requireAdminActor(req, res, () => {
            const id = parseInt(req.params.id, 10);
            db.get(`SELECT token FROM onspot_links WHERE id = ?`, [id], (e, row) => {
                if (e) return res.status(500).json({ error: e.message });
                if (!row) return res.status(404).json({ error: 'Link not found.' });
                require('qrcode').toBuffer(linkUrl(row.token), { width: 360, margin: 1 }, (qErr, buf) => {
                    if (qErr) return res.status(500).json({ error: qErr.message });
                    res.setHeader('Content-Type', 'image/png');
                    res.setHeader('Cache-Control', 'no-store');
                    res.end(buf);
                });
            });
        });
    });

    app.post('/api/admin/onspot-links/:id/deactivate', (req, res) => {
        requireAdminActor(req, res, () => {
            const id = parseInt(req.params.id, 10);
            db.run(`UPDATE onspot_links SET active = 0 WHERE id = ?`, [id], (e) => {
                if (e) return res.status(500).json({ error: e.message });
                res.json({ success: true });
            });
        });
    });

    // ---- public: form ----
    function loadLink(token, cb) {
        db.get(
            `SELECT l.*, s.title AS seminar_title, s.event_date AS seminar_date, s.price AS seminar_price
             FROM onspot_links l JOIN seminars s ON s.id = l.seminar_id WHERE l.token = ?`,
            [String(token || '')],
            cb
        );
    }

    app.get('/onspot/:token', (req, res) => {
        res.sendFile(require('path').join(__dirname, '..', 'public', 'onspot.html'));
    });

    app.get('/api/public/onspot/:token', (req, res) => {
        loadLink(req.params.token, (e, link) => {
            if (e) return res.status(500).json({ error: e.message });
            if (!link) return res.status(404).json({ error: 'This on-spot link is not valid.' });
            if (isExpired(link)) return res.status(410).json({ error: 'This on-spot link has expired. Please ask the registration desk for a new one.' });
            loadRegistrationFormConfig(link.seminar_id, (cfgErr, cfg) => {
                if (cfgErr) return res.status(500).json({ error: cfgErr.message });
                const fields = registrationFormFieldsForPortal((cfg && cfg.fields) || []).map((f) =>
                    Object.assign({}, f, { verifyOtp: false })
                );
                seminarCapacity.getSeminarCapacity(db, link.seminar_id, (capErr, cap) => {
                    res.json({
                        seminar: {
                            id: link.seminar_id,
                            title: link.seminar_title,
                            date: link.seminar_date,
                            isFree: seminarIsFree(cap || { price: link.seminar_price })
                        },
                        label: link.label,
                        expiresAt: link.expires_at,
                        fields
                    });
                });
            });
        });
    });

    app.post('/api/public/onspot/:token/submit', (req, res) => {
        loadLink(req.params.token, (e, link) => {
            if (e) return res.status(500).json({ error: e.message });
            if (!link) return res.status(404).json({ error: 'This on-spot link is not valid.' });
            if (isExpired(link)) return res.status(410).json({ error: 'This on-spot link has expired.' });
            const body = req.body || {};
            const fd = body.formData && typeof body.formData === 'object' ? body.formData : {};
            const firstName = String(body.firstName || pick(fd, ['fname', 'first_name', 'firstName'])).trim();
            const middleName = String(body.middleName || pick(fd, ['mname', 'middle_name', 'middleName'])).trim();
            const lastName = String(body.lastName || pick(fd, ['lname', 'last_name', 'lastName'])).trim();
            const email = String(body.email || pick(fd, ['email'])).trim().toLowerCase();
            const phone = String(body.phone || pick(fd, ['phone', 'mobile', 'whatsapp'])).trim();
            const pax = ticketAttendees.parseAttendeesCount(body.attendeesCount != null ? body.attendeesCount : fd, null);
            if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });
            if (!phone && !email) return res.status(400).json({ error: 'Phone or email is required.' });
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
            const stored = Object.assign({}, fd, {
                fname: firstName,
                mname: middleName,
                lname: lastName,
                email,
                phone,
                source: 'onspot_link'
            });
            if (pax != null) stored.attendees_count = pax;
            db.run(
                `INSERT INTO onspot_submissions (link_id, seminar_id, first_name, middle_name, last_name, email, phone, attendees_count, form_data, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [link.id, link.seminar_id, firstName, middleName || null, lastName, email || null, phone || null, pax, JSON.stringify(stored)],
                function (insErr) {
                    if (insErr) return res.status(500).json({ error: insErr.message });
                    db.run(`UPDATE onspot_links SET uses = COALESCE(uses,0) + 1 WHERE id = ?`, [link.id], () => {
                        res.json({
                            success: true,
                            submissionId: this.lastID,
                            reference: 'OS-' + String(this.lastID).padStart(5, '0'),
                            message: 'Thank you! Your details are with the registration desk. Please collect your entry pass there.'
                        });
                    });
                }
            );
        });
    });

    // ---- admin: submissions ----
    app.get('/api/admin/onspot-submissions', (req, res) => {
        requireAdminActor(req, res, () => {
            const sid = parseInt(req.query.seminarId, 10);
            const status = String(req.query.status || '').trim().toLowerCase();
            const conds = [];
            const params = [];
            if (Number.isInteger(sid) && sid > 0) {
                conds.push('os.seminar_id = ?');
                params.push(sid);
            }
            if (status && status !== 'all') {
                conds.push('LOWER(os.status) = ?');
                params.push(status);
            }
            const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
            db.all(
                `SELECT os.*, s.title AS seminar_title, r.application_no
                 FROM onspot_submissions os
                 LEFT JOIN seminars s ON s.id = os.seminar_id
                 LEFT JOIN registrations r ON r.id = os.registration_id
                 ${where} ORDER BY os.id DESC LIMIT 500`,
                params,
                (e, rows) => {
                    if (e) return res.status(500).json({ error: e.message });
                    const out = (rows || []).map((r) => Object.assign({}, r, { form_data: ticketAttendees.parseFormData(r.form_data) }));
                    const pending = out.filter((r) => String(r.status).toLowerCase() === 'pending').length;
                    res.json({ submissions: out, pending, total: out.length });
                }
            );
        });
    });

    app.post('/api/admin/onspot-submissions/:id/promote', (req, res) => {
        requireAdminActor(req, res, (actor) => {
            const id = parseInt(req.params.id, 10);
            db.get(`SELECT * FROM onspot_submissions WHERE id = ?`, [id], (e, sub) => {
                if (e) return res.status(500).json({ error: e.message });
                if (!sub) return res.status(404).json({ error: 'Submission not found.' });
                if (String(sub.status).toLowerCase() === 'promoted' && sub.registration_id) {
                    return res.status(409).json({ error: 'Already added to main registration.', registrationId: sub.registration_id });
                }
                const b = req.body || {};
                const fd = ticketAttendees.parseFormData(sub.form_data);
                const extra = Object.assign({}, fd);
                delete extra.fname;
                delete extra.mname;
                delete extra.lname;
                delete extra.email;
                delete extra.phone;
                registerOnSpot(
                    {
                        actorId: actor.id,
                        seminarId: sub.seminar_id,
                        firstName: sub.first_name,
                        middleName: sub.middle_name,
                        lastName: sub.last_name,
                        email: sub.email,
                        phone: sub.phone,
                        amount: b.amount,
                        paymentMethod: b.paymentMethod,
                        sendTicketEmail: b.sendTicketEmail !== false,
                        attendeesCount: sub.attendees_count,
                        extraFormData: extra,
                        source: 'onspot_link'
                    },
                    (err, out) => {
                        if (err) return res.status(500).json({ error: err.message });
                        if (out.status !== 200) return res.status(out.status).json(out.body);
                        db.run(
                            `UPDATE onspot_submissions SET status = 'promoted', registration_id = ?, promoted_by = ?, promoted_at = CURRENT_TIMESTAMP WHERE id = ?`,
                            [out.body.registrationId, actor.id, id],
                            () => res.json(out.body)
                        );
                    }
                );
            });
        });
    });

    app.post('/api/admin/onspot-submissions/:id/reject', (req, res) => {
        requireAdminActor(req, res, (actor) => {
            const id = parseInt(req.params.id, 10);
            db.run(`UPDATE onspot_submissions SET status = 'rejected', promoted_by = ?, promoted_at = CURRENT_TIMESTAMP WHERE id = ? AND LOWER(status) = 'pending'`, [actor.id, id], (e) => {
                if (e) return res.status(500).json({ error: e.message });
                res.json({ success: true });
            });
        });
    });
}

module.exports = { registerOnspotLinkRoutes, ensureSchema, isExpired };
