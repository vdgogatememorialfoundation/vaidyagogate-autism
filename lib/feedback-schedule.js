/**
 * Scheduled feedback forms: per-seminar open/close window for the applicant feedback form,
 * with an email notification to every eligible attendee when the window opens.
 */
const IST_OFFSET_MIN = 330;

function ensureSchema(db, cb) {
    if (process.env.DATABASE_URL) return cb && cb(null);
    db.run(
        `CREATE TABLE IF NOT EXISTS feedback_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seminar_id INTEGER NOT NULL UNIQUE,
            opens_at DATETIME NOT NULL,
            closes_at DATETIME,
            notify_email INTEGER DEFAULT 1,
            notified_at DATETIME,
            notified_count INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        [],
        (e) => cb && cb(e || null)
    );
}

/** "YYYY-MM-DD" (IST calendar date) -> ISO instant at IST start (or end) of that day. */
function istDateToIso(dateStr, endOfDay) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
    if (!m) return null;
    const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0) - IST_OFFSET_MIN * 60 * 1000;
    const ms = endOfDay ? utcMs + 24 * 60 * 60 * 1000 - 1000 : utcMs;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoToIstDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
}

function windowState(row, now) {
    if (!row || Number(row.active) !== 1) return 'none';
    const t = (now || new Date()).getTime();
    const o = new Date(row.opens_at).getTime();
    const c = row.closes_at ? new Date(row.closes_at).getTime() : NaN;
    if (Number.isFinite(o) && t < o) return 'scheduled';
    if (Number.isFinite(c) && t > c) return 'closed';
    return 'open';
}

function registerFeedbackScheduleRoutes(app, deps) {
    const { db, requireAdminActor, publicBaseUrl, sendEmail, isEmailConfigured, logNotification } = deps;

    let schemaReady = false;
    let sweeping = false;
    ensureSchema(db, (e) => {
        if (e) return console.warn('[feedback-schedule] schema:', e.message);
        schemaReady = true;
        setImmediate(sweepOpened);
        const t = setInterval(sweepOpened, 60 * 1000);
        if (t.unref) t.unref();
    });

    function serialize(row) {
        if (!row) return null;
        return {
            id: row.id,
            seminar_id: row.seminar_id,
            seminar_title: row.seminar_title || null,
            opens_at: row.opens_at,
            closes_at: row.closes_at || null,
            opens_on: isoToIstDate(row.opens_at),
            closes_on: isoToIstDate(row.closes_at),
            notify_email: Number(row.notify_email) === 1,
            notified_at: row.notified_at || null,
            notified_count: Number(row.notified_count) || 0,
            active: Number(row.active) === 1,
            state: windowState(row)
        };
    }

    function feedbackLink() {
        return publicBaseUrl() + '/applicant.html#tab-feedback';
    }

    function sendOpenNotification(row, cb) {
        db.all(
            `SELECT DISTINCT u.id AS user_id, u.first_name, u.last_name, u.email, s.title AS seminar_title
             FROM registrations r
             JOIN users u ON u.id = r.user_id
             JOIN seminars s ON s.id = r.seminar_id
             WHERE r.seminar_id = ?
               AND LOWER(IFNULL(r.status, '')) NOT IN ('rejected', 'cancelled', 'draft')
               AND u.email IS NOT NULL AND TRIM(u.email) <> ''
               AND NOT EXISTS (SELECT 1 FROM seminar_feedback sf WHERE sf.user_id = u.id AND sf.seminar_id = r.seminar_id)`,
            [row.seminar_id],
            async (e, users) => {
                if (e) return cb && cb(e, 0);
                let sent = 0;
                const list = users || [];
                for (const u of list) {
                    const title = u.seminar_title || 'the event';
                    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Participant';
                    const url = feedbackLink();
                    const subject = 'Your feedback is open — ' + title;
                    const html =
                        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#111">' +
                        '<h2 style="color:#0f766e;margin:0 0 12px">We would love your feedback</h2>' +
                        '<p>Dear ' + name + ',</p>' +
                        '<p>Thank you for being part of <strong>' + title + '</strong>. The feedback form is now open' +
                        (row.closes_at ? ' until <strong>' + isoToIstDate(row.closes_at) + '</strong>' : '') +
                        '.</p>' +
                        '<p style="margin:20px 0"><a href="' + url + '" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">Share feedback</a></p>' +
                        '<p style="font-size:13px;color:#555">Sign in to the applicant portal and open <strong>Feedback</strong>. Link: <a href="' + url + '">' + url + '</a></p>' +
                        '<p style="margin-top:24px">Warm regards,<br>Vaidya Gogate Memorial Foundation</p></div>';
                    let r = { ok: false, skipped: true, error: 'Email not configured' };
                    try {
                        r = await sendEmail(u.email, subject, html, { text: 'Feedback for ' + title + ' is open: ' + url });
                    } catch (err) {
                        r = { ok: false, error: err && err.message };
                    }
                    if (r && r.ok) sent++;
                    if (logNotification) {
                        logNotification(db, {
                            event_key: 'FEEDBACK_OPEN',
                            channel: 'email',
                            destination: u.email,
                            user_id: u.user_id,
                            seminar_id: row.seminar_id,
                            status: r && r.ok ? 'sent' : r && r.skipped ? 'skipped' : 'failed',
                            subject,
                            body_preview: 'Feedback form opened for ' + title,
                            error: r && r.ok ? null : (r && (r.error || r.hint)) || null
                        });
                    }
                }
                cb && cb(null, sent, list.length);
            }
        );
    }

    function sweepOpened() {
        if (!schemaReady || sweeping) return;
        const nowIso = new Date().toISOString();
        db.all(
            `SELECT * FROM feedback_schedules
             WHERE active = 1 AND notify_email = 1 AND notified_at IS NULL AND opens_at <= ?`,
            [nowIso],
            (e, rows) => {
                if (e) return console.warn('[feedback-schedule] sweep:', e.message);
                if (!rows || !rows.length) return;
                sweeping = true;
                let i = 0;
                const next = () => {
                    if (i >= rows.length) {
                        sweeping = false;
                        return;
                    }
                    const row = rows[i++];
                    // Claim first so concurrent sweeps never double-send.
                    db.run(
                        `UPDATE feedback_schedules SET notified_at = ?, updated_at = ? WHERE id = ? AND notified_at IS NULL`,
                        [nowIso, nowIso, row.id],
                        function (eU) {
                            if (eU || !this.changes) return next();
                            if (!isEmailConfigured()) {
                                console.warn('[feedback-schedule] email not configured; feedback open notice skipped for seminar', row.seminar_id);
                                return next();
                            }
                            sendOpenNotification(row, (eS, sent) => {
                                if (eS) console.warn('[feedback-schedule] notify:', eS.message);
                                db.run(`UPDATE feedback_schedules SET notified_count = ? WHERE id = ?`, [sent || 0, row.id], () => next());
                            });
                        }
                    );
                };
                next();
            }
        );
    }

    /** Used by feedback eligibility: undefined => no schedule (legacy behaviour applies). */
    function loadScheduleMap(cb) {
        if (!schemaReady) return cb(null, new Map());
        db.all(`SELECT * FROM feedback_schedules WHERE active = 1`, [], (e, rows) => {
            if (e) return cb(null, new Map());
            const m = new Map();
            (rows || []).forEach((r) => m.set(Number(r.seminar_id), r));
            cb(null, m);
        });
    }

    app.get('/api/admin/feedback-schedules', (req, res) => {
        requireAdminActor(req, res, () => {
            db.all(
                `SELECT fs.*, s.title AS seminar_title FROM feedback_schedules fs
                 LEFT JOIN seminars s ON s.id = fs.seminar_id
                 ORDER BY fs.opens_at DESC, fs.id DESC`,
                [],
                (e, rows) => {
                    if (e) return res.status(500).json({ error: e.message });
                    res.json({ schedules: (rows || []).map(serialize), emailConfigured: isEmailConfigured() });
                }
            );
        });
    });

    app.post('/api/admin/feedback-schedules', (req, res) => {
        requireAdminActor(req, res, (actor) => {
            const b = req.body || {};
            const sid = parseInt(b.seminarId, 10);
            if (!Number.isInteger(sid) || sid < 1) return res.status(400).json({ error: 'Select an event.' });
            const opensAt = istDateToIso(b.opensOn, false);
            if (!opensAt) return res.status(400).json({ error: 'Open date is required (YYYY-MM-DD).' });
            const closesAt = b.closesOn ? istDateToIso(b.closesOn, true) : null;
            if (b.closesOn && !closesAt) return res.status(400).json({ error: 'Close date is invalid.' });
            if (closesAt && new Date(closesAt) < new Date(opensAt)) {
                return res.status(400).json({ error: 'Close date must be on or after the open date.' });
            }
            const notify = b.notifyEmail === false || b.notifyEmail === 0 || b.notifyEmail === '0' ? 0 : 1;
            const nowIso = new Date().toISOString();
            const actorId = actor && actor.id ? actor.id : parseInt(b.actingAdminId, 10) || null;
            db.get(`SELECT id FROM seminars WHERE id = ?`, [sid], (eS, sem) => {
                if (eS) return res.status(500).json({ error: eS.message });
                if (!sem) return res.status(404).json({ error: 'Event not found.' });
                db.get(`SELECT * FROM feedback_schedules WHERE seminar_id = ?`, [sid], (e0, existing) => {
                    if (e0) return res.status(500).json({ error: e0.message });
                    const done = (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        sweepOpened();
                        db.get(
                            `SELECT fs.*, s.title AS seminar_title FROM feedback_schedules fs LEFT JOIN seminars s ON s.id = fs.seminar_id WHERE fs.seminar_id = ?`,
                            [sid],
                            (e2, row) => {
                                if (e2) return res.status(500).json({ error: e2.message });
                                res.json({ success: true, schedule: serialize(row) });
                            }
                        );
                    };
                    if (existing) {
                        // Re-arm the open notification when the open date moves into the future again.
                        const resetNotify = existing.opens_at !== opensAt && new Date(opensAt) > new Date();
                        db.run(
                            `UPDATE feedback_schedules SET opens_at = ?, closes_at = ?, notify_email = ?, active = 1, updated_at = ?` +
                                (resetNotify ? `, notified_at = NULL, notified_count = 0` : '') +
                                ` WHERE id = ?`,
                            [opensAt, closesAt, notify, nowIso, existing.id],
                            done
                        );
                    } else {
                        db.run(
                            `INSERT INTO feedback_schedules (seminar_id, opens_at, closes_at, notify_email, active, created_by, created_at, updated_at)
                             VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
                            [sid, opensAt, closesAt, notify, actorId, nowIso, nowIso],
                            done
                        );
                    }
                });
            });
        });
    });

    app.post('/api/admin/feedback-schedules/:id/delete', (req, res) => {
        requireAdminActor(req, res, () => {
            const id = parseInt(req.params.id, 10);
            if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
            db.run(`DELETE FROM feedback_schedules WHERE id = ?`, [id], function (e) {
                if (e) return res.status(500).json({ error: e.message });
                res.json({ success: true, deleted: this.changes });
            });
        });
    });

    app.post('/api/admin/feedback-schedules/:id/resend', (req, res) => {
        requireAdminActor(req, res, () => {
            const id = parseInt(req.params.id, 10);
            if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
            db.get(`SELECT * FROM feedback_schedules WHERE id = ?`, [id], (e, row) => {
                if (e) return res.status(500).json({ error: e.message });
                if (!row) return res.status(404).json({ error: 'Schedule not found' });
                if (windowState(row) !== 'open') return res.status(400).json({ error: 'Feedback window is not open right now.' });
                if (!isEmailConfigured()) return res.status(503).json({ error: 'Email is not configured.' });
                sendOpenNotification(row, (eS, sent, total) => {
                    if (eS) return res.status(500).json({ error: eS.message });
                    const nowIso = new Date().toISOString();
                    db.run(
                        `UPDATE feedback_schedules SET notified_at = ?, notified_count = ? WHERE id = ?`,
                        [nowIso, sent || 0, id],
                        () => res.json({ success: true, sent: sent || 0, recipients: total || 0 })
                    );
                });
            });
        });
    });

    return { loadScheduleMap, windowState, sweepOpened };
}

module.exports = { registerFeedbackScheduleRoutes, ensureSchema, istDateToIso, isoToIstDate, windowState };
