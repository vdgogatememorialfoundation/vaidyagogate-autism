/**
 * Send login OTP codes to a user's registered email and phone.
 */
const otpLib = require('./otp');
const authUsers = require('./auth-users');
const notifEngine = require('./notification-engine');

const OTP_REUSE_MSG =
    'Your verification code is still valid. Check your latest WhatsApp message, then enter it below.';

function deliverLoginOtp(channel, dest, code, db, codeReused, forceResend) {
    if (codeReused && !forceResend) {
        // #region agent log
        try {
            const fs = require('fs');
            const path = require('path');
            fs.appendFileSync(
                path.join(__dirname, '..', 'debug-7880d4.log'),
                JSON.stringify({
                    sessionId: '7880d4',
                    timestamp: Date.now(),
                    location: 'auth-login-otp.js:deliverLoginOtp',
                    message: 'skipped login whatsapp — code still valid',
                    data: { channel, codeReused: true, forceResend: false },
                    hypothesisId: 'A'
                }) + '\n'
            );
        } catch (_) {}
        // #endregion
        return Promise.resolve({ ok: true, skipped: true, reused: true });
    }
    if (channel === 'phone') {
        return notifEngine
            .sendOtpMessages({ phone: dest, code, db, eventKey: 'OTP_VERIFICATION' })
            .then((r) => r.whatsapp || { ok: false });
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
            deliverLoginOtp(channel, dest, code, db, codeReused, false).then((sent) => {
                results[channel] = sent;
                if (--left === 0) finish();
            });
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
        deliverLoginOtp(channel, dest, code, db, codeReused, forceResend).then((sent) => {
            const debug = process.env.OTP_RETURN_CODE === '1' || process.env.NODE_ENV === 'development';
            const payload = { ok: true, status: 200, ttlMinutes: otpLib.OTP_TTL_MIN };
            if (codeReused && !forceResend) {
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
            if (sent.skipped && sent.reused) {
                payload.reused = true;
                payload.message = OTP_REUSE_MSG;
            } else if (sent.skipped) {
                payload.warning = 'Messaging not fully configured; use debugCode in development.';
            }
            cb(null, payload);
        });
    });
}

module.exports = { sendLoginOtpsForUser, sendLoginOtpChannel, OTP_REUSE_MSG };
