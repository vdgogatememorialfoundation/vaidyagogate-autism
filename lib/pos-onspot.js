const portalProduct = require('./portal-product');

/**
 * On-spot POS registration — quick doctor + registration + ticket.
 * Amount comes from the event settings (free when the event has no fee);
 * capacity is not enforced for walk-ins; the ticket email is sent immediately.
 */
function posAmountForSeminar(row) {
    if (portalProduct.FEATURES.noFees) return 0;
    const p = row && row.price != null ? Number(row.price) : NaN;
    return Number.isFinite(p) && p > 0 ? p : 0;
}

function registerPosRoutes(app, deps) {
    const {
        db,
        generateId,
        requireAdminActor,
        getOrCreatePendingOrder,
        fulfillRegistrationPayment,
        activityLog,
        notifyTicketIssued
    } = deps;

    // Sent directly (not tagged as POS) so the "skip POS participant email" venue default does not apply.
    function sendPosTicketEmail(userId, registrationId, ticketId, hasEmail) {
        if (!notifyTicketIssued || !ticketId || !hasEmail) return;
        try {
            notifyTicketIssued(userId, registrationId, ticketId, {
                email: true,
                whatsapp: false,
                immediate: true
            });
        } catch (_) {}
    }

    app.get('/api/admin/pos/fee/:seminarId', (req, res) => {
        requireAdminActor(req, res, () => {
            const sid = parseInt(req.params.seminarId, 10);
            if (!Number.isInteger(sid) || sid < 1) return res.status(400).json({ error: 'seminarId required' });
            db.get(`SELECT id, price FROM seminars WHERE id = ?`, [sid], (e, row) => {
                if (e) return res.status(500).json({ error: e.message });
                if (!row) return res.status(404).json({ error: 'Seminar not found' });
                const amount = posAmountForSeminar(row);
                res.json({ seminarId: sid, amount, paymentRequired: amount > 0 });
            });
        });
    });

    app.post('/api/admin/pos/register', (req, res) => {
        requireAdminActor(req, res, (actor) => {
            const {
                seminarId,
                firstName,
                middleName,
                lastName,
                email,
                phone,
                paymentMethod
            } = req.body || {};
            const sid = parseInt(seminarId, 10);
            const fn = String(firstName || '').trim();
            const mn = String(middleName || '').trim();
            const ln = String(lastName || '').trim();
            const em = String(email || '').trim().toLowerCase();
            const ph = String(phone || '').trim();
            if (!Number.isInteger(sid) || sid < 1) return res.status(400).json({ error: 'seminarId required' });
            if (!fn || !ln) return res.status(400).json({ error: 'First and last name required' });
            if (!ph && !em) return res.status(400).json({ error: 'Phone or email required' });

            db.get(`SELECT id, price FROM seminars WHERE id = ?`, [sid], (semErr, seminarRow) => {
            if (semErr) return res.status(500).json({ error: semErr.message });
            if (!seminarRow) return res.status(404).json({ error: 'Seminar not found' });
            const amt = posAmountForSeminar(seminarRow);
            const paymentRequired = amt > 0;

            const findUser = (next) => {
                if (em) {
                    return db.get(`SELECT id FROM users WHERE LOWER(email) = ?`, [em], (e, row) => {
                        if (e) return res.status(500).json({ error: e.message });
                        if (row) return next(null, row.id);
                        if (ph) {
                            return db.get(`SELECT id FROM users WHERE phone = ?`, [ph], (e2, row2) => {
                                if (e2) return res.status(500).json({ error: e2.message });
                                next(null, row2 ? row2.id : null);
                            });
                        }
                        next(null, null);
                    });
                }
                if (ph) {
                    return db.get(`SELECT id FROM users WHERE phone = ?`, [ph], (e, row) => {
                        if (e) return res.status(500).json({ error: e.message });
                        next(null, row ? row.id : null);
                    });
                }
                next(null, null);
            };

            findUser((_, existingUserId) => {
                let posTempPass = '';
                const createUser = (cb) => {
                    if (existingUserId) return cb(null, { userId: existingUserId, tempPass: '', isNew: false });
                    posTempPass = 'POS_' + generateId().slice(0, 10);
                    const uidStr = 'DOC_' + generateId();
                    const loginEmail = em || `pos_${uidStr.toLowerCase()}@onspot.local`;
                    db.run(
                        `INSERT INTO users (user_id_string, first_name, middle_name, last_name, email, phone, password, role, user_role, email_verified, profile_complete)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 'doctor', 'doctor', 1, 0)`,
                        [uidStr, fn, mn || null, ln, loginEmail, ph || '', posTempPass],
                        function (insErr) {
                            if (insErr) {
                                if (/no such column|profile_complete/i.test(String(insErr.message))) {
                                    return db.run(
                                        `INSERT INTO users (user_id_string, first_name, middle_name, last_name, email, phone, password, role, user_role, email_verified)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, 'doctor', 'doctor', 1)`,
                                        [uidStr, fn, mn || null, ln, loginEmail, ph || '', posTempPass],
                                        function (e2) {
                                            if (e2) return cb(e2);
                                            cb(null, { userId: this.lastID, tempPass: posTempPass, isNew: true, email: loginEmail });
                                        }
                                    );
                                }
                                return cb(insErr);
                            }
                            cb(null, { userId: this.lastID, tempPass: posTempPass, isNew: true, email: loginEmail });
                        }
                    );
                };

                createUser((uErr, created) => {
                    if (uErr) return res.status(500).json({ error: uErr.message });
                    const userId = created && created.userId;
                    if (
                        created &&
                        created.isNew &&
                        created.email &&
                        !/@onspot\.local$/i.test(String(created.email)) &&
                        created.tempPass
                    ) {
                        try {
                            const notifEngine = require('./notification-engine');
                            notifEngine.notifyAccountCreatedWithCredentials(
                                db,
                                userId,
                                created.tempPass,
                                () => {}
                            );
                        } catch (_) {}
                    }

                    db.get(
                        `SELECT id, status FROM registrations WHERE user_id = ? AND seminar_id = ? ORDER BY id DESC LIMIT 1`,
                        [userId, sid],
                        (rErr, existingReg) => {
                            if (rErr) return res.status(500).json({ error: rErr.message });

                            const finishPayment = (registrationId, applicationNo) => {
                                const method = paymentRequired
                                    ? String(paymentMethod || 'cash').toLowerCase()
                                    : 'free';
                                const ensureOrder = paymentRequired
                                    ? (cb) => getOrCreatePendingOrder(registrationId, amt, cb)
                                    : (cb) => cb(null);
                                ensureOrder((oErr) => {
                                    if (oErr) return res.status(500).json({ error: oErr.message });
                                    fulfillRegistrationPayment(
                                        registrationId,
                                        userId,
                                        amt,
                                        method,
                                        'POS_' + Date.now(),
                                        (fErr, meta) => {
                                            if (fErr) return res.status(500).json({ error: fErr.message });
                                            activityLog.logActivity(db, {
                                                user_id: actor.id,
                                                action: 'pos.registration',
                                                resource_type: 'registration',
                                                resource_id: String(registrationId),
                                                meta: {
                                                    seminarId: sid,
                                                    userId,
                                                    amount: amt,
                                                    paymentMethod: method,
                                                    ticketId: meta && meta.ticketId
                                                }
                                            });
                                            const ticketId = meta && meta.ticketId;
                                            const hasEmail = !!em;
                                            res.json({
                                                success: true,
                                                userId,
                                                registrationId,
                                                applicationNo,
                                                ticketId,
                                                amount: amt,
                                                paymentRequired,
                                                paymentMethod: method,
                                                profileComplete: false,
                                                message: 'On-spot registration recorded.',
                                                emailSent: hasEmail,
                                                emailNote: hasEmail
                                                    ? 'E-ticket emailed to the applicant.'
                                                    : 'No email given — print the QR at the venue or send later from E-tickets.'
                                            });
                                            sendPosTicketEmail(userId, registrationId, ticketId, hasEmail);
                                        }
                                    );
                                });
                            };

                            if (existingReg) {
                                return finishPayment(existingReg.id, null);
                            }

                            const appNo = generateId();
                            db.run(
                                `INSERT INTO registrations (user_id, seminar_id, application_no, status, form_data)
                                 VALUES (?, ?, ?, 'approved_pending_payment', ?)`,
                                [
                                    userId,
                                    sid,
                                    appNo,
                                    JSON.stringify({
                                        source: 'pos',
                                        onSpot: true,
                                        registeredBy: actor.id,
                                        fname: fn,
                                        mname: mn,
                                        lname: ln,
                                        phone: ph,
                                        email: em || ''
                                    })
                                ],
                                function (insRegErr) {
                                    if (insRegErr) return res.status(500).json({ error: insRegErr.message });
                                    finishPayment(this.lastID, appNo);
                                }
                            );
                        }
                    );
                });
            });
            });
        });
    });
}

module.exports = { registerPosRoutes };
