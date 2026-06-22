/**
 * Send login OTP codes to a user's registered email and phone.
 */
const otpLib = require('./otp');
const authUsers = require('./auth-users');
const notifEngine = require('./notification-engine');

const OTP_REUSE_MSG =
    'Your sign-in code is still valid. Check your latest sign-in WhatsApp message — not the registration code.';

function deliverLoginOtp(channel, dest, code, db) {
    if (channel === 'phone') {
        return notifEngine
            .sendOtpMessages({ phone: dest, code, db, eventKey: 'OTP_VERIFICATION' })
            .then((r) => {
                if (r.whatsapp && r.whatsapp.ok) return r.whatsapp;
                if (r.sms && r.sms.ok) return r.sms;
                return r.whatsapp || r.sms || { ok: false };
            });
    }
    return notifEngine
        .sendOtpMessages({ email: dest, code, db, eventKey: 'OTP_VERIFICATION' })
        .then((r) => r.email || { ok: false });
}

function sendLoginOtpsForUser(db, row, cb) {
    const meta = { userId: row.id };
    const channels = [];
    if (row.email) {
        channels.push({ channel: 'email', dest: authUsers.loginOtpDestination('email', row) });
    }
    const phoneDest = authUsers.loginOtpDestination('phone', row);
    if (phoneDest) channels.push({ channel: 'phone', dest: phoneDest });
    if (!channels.length) {
        return cb(null, { ok: false, status: 400, error: 'No email or phone on file for this account.' });
    }

    let left = channels.length;
    const results = {};
    let lastErr = null;

    channels.forEach(({ channel, dest }) => {
        otpLib.prepareOtpSend(db, { channel, destination: dest, purpose: 'login', meta }, (serr, code, id, codeReused) => {
            if (serr) {
                results[channel] = {
                    ok: false,
                    error: serr.message,
                    status: serr.status || 500
                };
                lastErr = serr;
                if (--left === 0) finish();
                return;
            }
            const afterClaim = (shouldSend) => {
                if (channel === 'phone' && !shouldSend) {
                    results[channel] = { ok: true, skipped: true, reused: true };
                    if (--left === 0) finish();
                    return;
                }
                deliverLoginOtp(channel, dest, code, db).then((sent) => {
                    if (channel === 'phone' && !sent.ok && !sent.skipped) {
                        otpLib.releaseOtpWhatsAppDelivery(db, id, () => {});
                    }
                    if (channel === 'phone' && sent.ok) {
                        otpLib.markOtpWhatsAppSent(channel, dest, 'login', meta, code);
                    }
                    results[channel] = sent;
                    if (--left === 0) finish();
                });
            };
            if (channel === 'phone') {
                return otpLib.claimOtpWhatsAppDelivery(db, id, false, (claimErr, shouldSend) => {
                    if (claimErr) {
                        results[channel] = { ok: false, error: claimErr.message };
                        lastErr = claimErr;
                        if (--left === 0) finish();
                        return;
                    }
                    afterClaim(shouldSend);
                });
            }
            afterClaim(true);
        });
    });

    function finish() {
        const anyFail = Object.values(results).some((r) => r && !r.ok && !r.skipped);
        cb(lastErr, {
            ok: !anyFail,
            status: anyFail ? 503 : 200,
            results,
            ttlMinutes: otpLib.OTP_TTL_MIN
        });
    }
}

function sendLoginOtpChannel(db, row, channel, cb, opts) {
    const forceResend = !!(opts && opts.forceResend);
    const dest = authUsers.loginOtpDestination(channel, row);
    if (!dest) {
        return cb(null, {
            ok: false,
            status: 400,
            error: channel === 'email' ? 'No email on file.' : 'No phone on file.'
        });
    }
    const meta = { userId: row.id };
    otpLib.prepareOtpSend(db, { channel, destination: dest, purpose: 'login', meta }, (serr, code, id, codeReused) => {
        if (serr) {
            return cb(null, {
                ok: false,
                status: serr.status || 500,
                error: serr.message || 'Could not send OTP.'
            });
        }
        const finishPayload = (sent, reused) => {
            const debug = process.env.OTP_RETURN_CODE === '1' || process.env.NODE_ENV === 'development';
            const payload = { ok: true, status: 200, ttlMinutes: otpLib.OTP_TTL_MIN };
            if (reused) {
                payload.reused = true;
                payload.message = OTP_REUSE_MSG;
            }
            if (debug) payload.debugCode = code;
            if (!sent.ok && !sent.skipped) {
                payload.ok = false;
                payload.status = 503;
                payload.error = sent.error || 'Could not deliver OTP.';
                if (debug) payload.debugCode = code;
            }
            if (sent.skipped) {
                payload.warning = 'Messaging not fully configured; use debugCode in development.';
            }
            cb(null, payload);
        };
        const sendWa = () => {
            deliverLoginOtp(channel, dest, code, db).then((sent) => {
                if (channel === 'phone' && !sent.ok && !sent.skipped) {
                    otpLib.releaseOtpWhatsAppDelivery(db, id, () => {});
                }
                if (channel === 'phone' && sent.ok) {
                    otpLib.markOtpWhatsAppSent(channel, dest, 'login', meta, code);
                }
                finishPayload(sent, false);
            });
        };
        if (channel === 'phone') {
            return otpLib.claimOtpWhatsAppDelivery(db, id, forceResend, (claimErr, shouldSend) => {
                if (claimErr) {
                    return cb(null, { ok: false, status: 500, error: claimErr.message });
                }
                if (!shouldSend) {
                    return finishPayload({ ok: true, skipped: true }, true);
                }
                sendWa();
            });
        }
        sendWa();
    });
}

module.exports = { sendLoginOtpsForUser, sendLoginOtpChannel, OTP_REUSE_MSG };
