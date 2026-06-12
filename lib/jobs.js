const cron = require('node-cron');
const { processQueueOnce } = require('./notification-engine');
const notif = require('./notification-engine');
const { parseSeminarMs } = require('./seminar-datetime');
const pendingRegReminders = require('./pending-registration-reminders');

function todayYmdIst() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date());
}

function enqueue(db, row, cb) {
    db.run(
        `INSERT INTO notification_queue (channel, destination, template_key, payload, scheduled_at, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
        [
            row.channel,
            row.destination,
            row.template_key,
            JSON.stringify(row.payload || {}),
            row.scheduled_at || new Date().toISOString()
        ],
        cb
    );
}

function scheduleEventStartingToday(db) {
    const cronExpr = process.env.EVENT_TODAY_CRON || '0 7 * * *';
    cron.schedule(cronExpr, () => runEventStartingToday(db, () => {}));
}

function runEventStartingToday(db, cb) {
    const today = todayYmdIst();
    db.all(
        `
            SELECT r.id AS registration_id, r.user_id, r.application_no, r.status,
                   u.email, u.phone, u.first_name, u.last_name,
                   s.id AS seminar_id, s.title AS seminar_title, s.event_date, s.venue, s.location_url
            FROM registrations r
            JOIN users u ON r.user_id = u.id
            JOIN seminars s ON r.seminar_id = s.id
            WHERE r.status IN ('completed','checked_in','e_ticket_issued','approved_pending_payment')
              AND s.event_date IS NOT NULL
            `,
        [],
        (err, rows) => {
            if (err) return cb && cb(err);
            let sent = 0;
            (rows || []).forEach((r) => {
                const eventYmd = String(r.event_date || '').slice(0, 10);
                if (eventYmd !== today) return;
                db.get(
                    `SELECT 1 FROM notification_logs
                         WHERE event_key = 'EVENT_STARTING_TODAY' AND user_id = ? AND seminar_id = ?
                           AND created_at >= ? LIMIT 1`,
                    [r.user_id, r.seminar_id, today + 'T00:00:00.000Z'],
                    (e2, hit) => {
                        if (e2 || hit) return;
                        notif.notifyUserEvent(
                            db,
                            'EVENT_STARTING_TODAY',
                            {
                                userId: r.user_id,
                                seminarId: r.seminar_id,
                                registrationId: r.registration_id,
                                vars: {
                                    application_no: r.application_no,
                                    seminar_venue: r.location_url || r.venue || ''
                                }
                            },
                            () => {
                                sent++;
                            }
                        );
                    }
                );
            });
            cb && cb(null, { sent, date: today });
        }
    );
}

function scheduleDailyReminders(db) {
    const cronExpr = process.env.DAILY_REMINDER_CRON || '0 8 * * *';
    cron.schedule(cronExpr, () => {
        const today = todayYmdIst();
        const nowMs = Date.now();
        db.all(
            `
            SELECT r.id AS registration_id, r.user_id, r.application_no, r.status,
                   u.email, u.phone, u.first_name, u.last_name,
                   s.id AS seminar_id, s.title AS seminar_title, s.event_date
            FROM registrations r
            JOIN users u ON r.user_id = u.id
            JOIN seminars s ON r.seminar_id = s.id
            WHERE r.status IN ('approved_pending_payment','completed','checked_in')
              AND s.event_date IS NOT NULL
            `,
            [],
            (err, rows) => {
                if (err || !rows) return;
                rows.forEach((r) => {
                    const eventMs = parseSeminarMs(r.event_date);
                    if (eventMs == null || eventMs <= nowMs) return;
                    db.get(
                        `SELECT 1 FROM registration_reminder_log WHERE registration_id = ? AND sent_date = ?`,
                        [r.registration_id, today],
                        (e2, hit) => {
                            if (e2 || hit) return;
                            notif.notify(
                                db,
                                'SEMINAR_REMINDER',
                                {
                                    userId: r.user_id,
                                    seminarId: r.seminar_id,
                                    registrationId: r.registration_id,
                                    vars: {
                                        approval_status: r.status,
                                        application_no: r.application_no
                                    }
                                },
                                () => {}
                            );
                            db.run(`INSERT OR IGNORE INTO registration_reminder_log (registration_id, sent_date) VALUES (?, ?)`, [
                                r.registration_id,
                                today
                            ]);
                        }
                    );
                });
            }
        );
    });
}

function schedulePendingRegistrationReminders(db) {
    const cronExpr = process.env.PENDING_REMINDER_CRON || '0 10 * * *';
    cron.schedule(cronExpr, () => {
        pendingRegReminders.runPendingRegistrationReminders(db, (err, r) => {
            if (err) console.error('[pending-reminders]', err.message);
            else if (r && r.sent) console.log('[pending-reminders] sent', r.sent);
        });
    });
}

function startWorkers(db) {
    setInterval(() => processQueueOnce(db), 30000);
    scheduleDailyReminders(db);
    scheduleEventStartingToday(db);
    schedulePendingRegistrationReminders(db);
    console.log('[jobs] Notification queue + daily + event-today + pending registration reminders started.');
}

module.exports = { startWorkers, enqueue, processQueueOnce, schedulePendingRegistrationReminders, runEventStartingToday };
