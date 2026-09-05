/**
 * On-spot POS registration — quick applicant account + registration + entry ticket.
 *
 * - Free events (portal has no fees, or seminar price is 0) never ask for payment.
 * - Paid events record the cash / UPI amount collected at the desk.
 * - Staff / admin / co-admin / superadmin may register even when the event is full.
 * - Email goes out immediately with account login details + QR e-ticket link.
 */
const portalProduct = require('./portal-product');
const ticketAttendees = require('./ticket-attendees');
const { wrapHtml, emailCtaButton } = require('./notification-defaults');

function seminarIsFree(capacityInfo) {
    if (portalProduct.FEATURES && portalProduct.FEATURES.noFees) return true;
    const price = capacityInfo && Number(capacityInfo.price);
    return !Number.isFinite(price) || price <= 0;
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function registerPosRoutes(app, deps) {
    const {
        db,
        generateId,
        requireAdminActor,
        getOrCreatePendingOrder,
        fulfillRegistrationPayment,
        seminarCapacity,
        activityLog
    } = deps;

    const notifEngine = require('./notification-engine');

    function ticketLinks(ticketId, userId) {
        const base = notifEngine.publicBaseUrl();
        return {
            pdfUrl: base + ticketAttendees.ticketDocumentApiPath(String(ticketId), userId),
            portalUrl: base + '/dashboard',
            base
        };
    }

    /**
     * One combined email, sent right away: login details (new accounts) + QR e-ticket link.
     * Ignores the "skip POS participant email" throttle because the desk explicitly asked to send.
     */
    function sendPosWelcomeEmail(ctx, cb) {
        const { userId, email, firstName, tempPass, isNewUser, ticketId, seminarTitle, attendeesCount, isFree, amount } = ctx;
        if (!email || /@onspot\.local$/i.test(String(email))) return cb && cb(null, { skipped: true, reason: 'no email' });
        const links = ticketLinks(ticketId, userId);
        const portalTitle = (portalProduct.FEATURES && portalProduct.FEATURES.portalTitle) || 'Autism Awareness Portal';
        const paxLabel = attendeesCount != null ? ticketAttendees.attendeesValidityLabel(attendeesCount) : '';

        let loginBlock = '';
        if (isNewUser && tempPass) {
            loginBlock =
                '<h3 style="margin:18px 0 6px;">Your portal login</h3>' +
                '<table style="border-collapse:collapse;font-size:14px;">' +
                '<tr><td style="padding:4px 12px 4px 0;color:#475569;">Login email</td><td style="padding:4px 0;"><strong>' +
                escapeHtml(email) +
                '</strong></td></tr>' +
                '<tr><td style="padding:4px 12px 4px 0;color:#475569;">Temporary password</td><td style="padding:4px 0;"><strong style="letter-spacing:1px;">' +
                escapeHtml(tempPass) +
                '</strong></td></tr>' +
                '</table>' +
                '<p style="font-size:13px;color:#475569;">You can also sign in with a one-time code (OTP) sent to this email. Please change your password after first login.</p>';
        } else {
            loginBlock =
                '<h3 style="margin:18px 0 6px;">Your portal login</h3>' +
                '<p style="font-size:14px;">Sign in with <strong>' +
                escapeHtml(email) +
                '</strong> using your existing password or an email OTP.</p>';
        }

        const feeLine = isFree
            ? '<p><strong>Entry:</strong> FREE — no payment required.</p>'
            : '<p><strong>Amount received at desk:</strong> ₹' + escapeHtml(String(amount || 0)) + '</p>';
        const paxLine =
            attendeesCount != null
                ? '<p><strong>Attendees:</strong> ' + escapeHtml(String(attendeesCount)) + (paxLabel ? ' (' + escapeHtml(paxLabel) + ')' : '') + '</p>'
                : '';

        const html = wrapHtml(
            'On-spot registration confirmed',
            '<p>Dear ' +
                escapeHtml(firstName || 'Participant') +
                ',</p>' +
                '<p>You have been registered on the spot for <strong>' +
                escapeHtml(seminarTitle || 'the event') +
                '</strong>.</p>' +
                (ticketId ? '<p><strong>Ticket ID:</strong> ' + escapeHtml(ticketId) + '</p>' : '') +
                paxLine +
                feeLine +
                (ticketId ? emailCtaButton(links.pdfUrl, 'Open your QR e-ticket') : '') +
                (ticketId
                    ? '<p style="font-size:12px;color:#64748b;word-break:break-all;">Ticket link: <a href="' +
                      escapeHtml(links.pdfUrl) +
                      '">' +
                      escapeHtml(links.pdfUrl) +
                      '</a></p>'
                    : '') +
                loginBlock +
                emailCtaButton(links.portalUrl, 'Open applicant portal') +
                '<p style="font-size:12px;color:#64748b;">Show the QR code at the venue entrance. Keep this email for your records.</p>'
        );
        const text =
            'On-spot registration confirmed for ' +
            (seminarTitle || 'the event') +
            (ticketId ? '\nTicket ID: ' + ticketId + '\nQR e-ticket: ' + links.pdfUrl : '') +
            (attendeesCount != null ? '\nAttendees: ' + attendeesCount : '') +
            (isFree ? '\nEntry: FREE' : '\nAmount received: ₹' + (amount || 0)) +
            '\nLogin email: ' +
            email +
            (isNewUser && tempPass ? '\nTemporary password: ' + tempPass : '') +
            '\nPortal: ' +
            links.portalUrl;

        notifEngine.enqueueDirectMessage(
            db,
            {
                channel: 'email',
                destination: email,
                subject: 'Your entry ticket & login — ' + (seminarTitle || portalTitle),
                html,
                text,
                event_key: 'POS_ONSPOT_TICKET',
                immediate: true,
                userId
            },
            () => cb && cb(null, { ok: true })
        );
    }

    /**
     * Core on-spot registration used by the POS desk and by "promote on-spot submission".
     * input: { actorId, seminarId, firstName, middleName, lastName, email, phone, amount,
     *          paymentMethod, sendTicketEmail, attendeesCount, extraFormData, source }
     * cb(err, { status, body })
     */
    function registerOnSpot(input, cb) {
        const fail = (status, error) => cb(null, { status, body: { error } });
        const sid = parseInt(input.seminarId, 10);
        const fn = String(input.firstName || '').trim();
        const mn = String(input.middleName || '').trim();
        const ln = String(input.lastName || '').trim();
        const em = String(input.email || '').trim().toLowerCase();
        const ph = String(input.phone || '').trim();
        const pax = ticketAttendees.parseAttendeesCount(input.attendeesCount, null);
        const source = input.source || 'pos';
        if (!Number.isInteger(sid) || sid < 1) return fail(400, 'seminarId required');
        if (!fn || !ln) return fail(400, 'First and last name required');
        if (!ph && !em) return fail(400, 'Phone or email required');

        // Desk staff are authenticated admin-portal actors (staff / admin / co-admin / superadmin),
        // so a full event is a warning, never a block.
        seminarCapacity.getSeminarCapacity(db, sid, (capErr, capInfo) => {
            if (capErr) return cb(capErr);
            if (!capInfo) return fail(404, 'Event not found.');
            const isFree = seminarIsFree(capInfo);
            const capacityOverride = !!capInfo.full;

            const findUser = (next) => {
                const byPhone = () =>
                    ph
                        ? db.get(`SELECT id, email FROM users WHERE phone = ?`, [ph], (e, row) => (e ? cb(e) : next(row || null)))
                        : next(null);
                if (!em) return byPhone();
                db.get(`SELECT id, email FROM users WHERE LOWER(email) = ?`, [em], (e, row) => {
                    if (e) return cb(e);
                    if (row) return next(row);
                    byPhone();
                });
            };

            findUser((existingUser) => {
                const createUser = (next) => {
                    if (existingUser) {
                        return next(null, { userId: existingUser.id, tempPass: '', isNew: false, email: existingUser.email });
                    }
                    const posTempPass = 'POS_' + generateId().slice(0, 10);
                    const uidStr = 'USR_' + generateId().slice(0, 9).toUpperCase();
                    const loginEmail = em || `pos_${uidStr.toLowerCase()}@onspot.local`;
                    const params = [uidStr, fn, mn || null, ln, loginEmail, ph || '', posTempPass];
                    db.run(
                        `INSERT INTO users (user_id_string, first_name, middle_name, last_name, email, phone, password, role, user_role, email_verified, profile_complete)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 'doctor', 'doctor', 1, 0)`,
                        params,
                        function (insErr) {
                            if (insErr && /no such column|profile_complete/i.test(String(insErr.message))) {
                                return db.run(
                                    `INSERT INTO users (user_id_string, first_name, middle_name, last_name, email, phone, password, role, user_role, email_verified)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, 'doctor', 'doctor', 1)`,
                                    params,
                                    function (e2) {
                                        if (e2) return next(e2);
                                        next(null, { userId: this.lastID, tempPass: posTempPass, isNew: true, email: loginEmail });
                                    }
                                );
                            }
                            if (insErr) return next(insErr);
                            next(null, { userId: this.lastID, tempPass: posTempPass, isNew: true, email: loginEmail });
                        }
                    );
                };

                createUser((uErr, created) => {
                    if (uErr) return cb(uErr);
                    const userId = created.userId;

                    const finish = (registrationId, applicationNo) => {
                        const requestedAmt = input.amount != null && input.amount !== '' ? Number(input.amount) : NaN;
                        const amt = isFree
                            ? 0
                            : Number.isFinite(requestedAmt) && requestedAmt >= 0
                              ? requestedAmt
                              : Number(capInfo.price) || 0;
                        const method = isFree ? 'free' : String(input.paymentMethod || 'cash').toLowerCase();
                        const txnRef = (isFree ? 'FREE_' : 'POS_') + Date.now();

                        getOrCreatePendingOrder(registrationId, amt, (oErr) => {
                            if (oErr) return cb(oErr);
                            fulfillRegistrationPayment(registrationId, userId, amt, method, txnRef, (fErr, meta) => {
                                if (fErr) return cb(fErr);
                                const ticketId = meta && meta.ticketId;
                                activityLog.logActivity(db, {
                                    user_id: input.actorId,
                                    action: source === 'pos' ? 'pos.registration' : 'onspot.promote',
                                    resource_type: 'registration',
                                    resource_id: String(registrationId),
                                    meta: { seminarId: sid, userId, ticketId, isFree, amount: amt, attendeesCount: pax, capacityOverride }
                                });

                                const links = ticketId ? ticketLinks(ticketId, userId) : null;
                                const respond = (emailResult) => {
                                    cb(null, {
                                        status: 200,
                                        body: {
                                            success: true,
                                            userId,
                                            registrationId,
                                            applicationNo,
                                            ticketId,
                                            ticketUrl: links ? links.pdfUrl : null,
                                            isFree,
                                            amount: amt,
                                            attendeesCount: pax,
                                            capacityOverride,
                                            capacity: capInfo,
                                            newAccount: !!created.isNew,
                                            loginEmail: created.email,
                                            temporaryPassword: created.isNew ? created.tempPass : null,
                                            message:
                                                'On-spot registration recorded.' +
                                                (isFree ? ' Free event — no payment required.' : '') +
                                                (capacityOverride ? ' Event was full; seat added by staff override.' : ''),
                                            emailSent: !!(emailResult && emailResult.ok),
                                            emailNote:
                                                emailResult && emailResult.ok
                                                    ? 'Login details and QR ticket link emailed immediately.'
                                                    : emailResult && emailResult.reason === 'no email'
                                                      ? 'No email address — share the ticket link / print QR at the desk.'
                                                      : 'Email not sent. Print QR at venue or send later from E-tickets.'
                                        }
                                    });
                                };

                                if (!input.sendTicketEmail) return respond(null);
                                sendPosWelcomeEmail(
                                    {
                                        userId,
                                        email: created.email,
                                        firstName: fn,
                                        tempPass: created.tempPass,
                                        isNewUser: !!created.isNew,
                                        ticketId,
                                        seminarTitle: capInfo.title,
                                        attendeesCount: pax,
                                        isFree,
                                        amount: amt
                                    },
                                    (eMail, r) => respond(eMail ? { ok: false } : r)
                                );
                            });
                        });
                    };

                    db.get(
                        `SELECT id, status, application_no FROM registrations WHERE user_id = ? AND seminar_id = ? ORDER BY id DESC LIMIT 1`,
                        [userId, sid],
                        (rErr, existingReg) => {
                            if (rErr) return cb(rErr);
                            if (existingReg) {
                                return db.get(`SELECT form_data FROM registrations WHERE id = ?`, [existingReg.id], (eF, fRow) => {
                                    const fd = ticketAttendees.parseFormData(fRow && fRow.form_data);
                                    Object.assign(fd, input.extraFormData || {});
                                    if (pax != null) fd.attendees_count = pax;
                                    db.run(`UPDATE registrations SET form_data = ? WHERE id = ?`, [JSON.stringify(fd), existingReg.id], () =>
                                        finish(existingReg.id, existingReg.application_no)
                                    );
                                });
                            }
                            const appNo = generateId();
                            const formData = Object.assign({}, input.extraFormData || {}, {
                                source,
                                onSpot: true,
                                registeredBy: input.actorId,
                                capacityOverride,
                                fname: fn,
                                mname: mn,
                                lname: ln,
                                phone: ph,
                                email: em || ''
                            });
                            if (pax != null) formData.attendees_count = pax;
                            db.run(
                                `INSERT INTO registrations (user_id, seminar_id, application_no, status, form_data)
                                 VALUES (?, ?, ?, 'approved_pending_payment', ?)`,
                                [userId, sid, appNo, JSON.stringify(formData)],
                                function (insRegErr) {
                                    if (insRegErr) return cb(insRegErr);
                                    finish(this.lastID, appNo);
                                }
                            );
                        }
                    );
                });
            });
        });
    }

    app.post('/api/admin/pos/register', (req, res) => {
        requireAdminActor(req, res, (actor) => {
            const b = req.body || {};
            registerOnSpot(
                {
                    actorId: actor.id,
                    seminarId: b.seminarId,
                    firstName: b.firstName,
                    middleName: b.middleName,
                    lastName: b.lastName,
                    email: b.email,
                    phone: b.phone,
                    amount: b.amount,
                    paymentMethod: b.paymentMethod,
                    sendTicketEmail: !!b.sendTicketEmail,
                    attendeesCount: b.attendeesCount,
                    source: 'pos'
                },
                (err, out) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.status(out.status).json(out.body);
                }
            );
        });
    });

    /** Desk helper: is this event free / full? (used by the POS form before submit) */
    app.get('/api/admin/pos/seminar-info', (req, res) => {
        requireAdminActor(req, res, () => {
            const sid = parseInt(req.query.seminarId, 10);
            if (!Number.isInteger(sid) || sid < 1) return res.status(400).json({ error: 'seminarId required' });
            seminarCapacity.getSeminarCapacity(db, sid, (err, info) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!info) return res.status(404).json({ error: 'Event not found.' });
                res.json(Object.assign({}, info, { isFree: seminarIsFree(info), canOverrideCapacity: true }));
            });
        });
    });

    return { registerOnSpot };
}

module.exports = { registerPosRoutes, seminarIsFree };
