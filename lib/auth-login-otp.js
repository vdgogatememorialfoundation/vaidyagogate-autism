/**
 * Send sign-in OTP codes. Sign-in OTPs are delivered by email only (never WhatsApp/SMS).
 */
const otpLib = require('./otp');
const authUsers = require('./auth-users');
const notifEngine = require('./notification-engine');

const OTP_REUSE_MSG =
    'Your sign-in code is still valid. Check the latest sign-in email in your inbox — not the registration code.';

const NO_EMAIL_MSG = 'No email on file for this account. Contact the organiser to add your email.';

const PORTAL_NAMES = {
    admin: 'Admin Console',
    staff: 'Staff Portal',
    judge: 'Judge Portal',
    scanner: 'Scanner Portal',
    public: 'Applicant Portal'
};

const PORTAL_PATHS = {
    admin: '/admin',
    staff: '/staff',
    judge: '/judge',
    scanner: '/scanner',
    public: '/dashboard'
};

/** Template variables for the LOGIN_OTP email (who, which portal, where to sign in). */
function loginOtpVars(row, portal) {
    const p = String(portal || 'public').toLowerCase();
    const key = PORTAL_NAMES[p] ? p : 'public';
    const first = (row && row.first_name) || '';
    const full = [first, row && row.middle_name, row && row.last_name].filter(Boolean).join(' ').trim();
    const base = notifEngine.publicBaseUrl() || '';
    return {
        first_name: first || 'Participant',
        full_name: full || 'Participant',
        portal_name: PORTAL_NAMES[key],
        login_url: base + PORTAL_PATHS[key],
        login_email: (row && row.email) || ''
    };
}

function maskEmail(email) {
    const s = String(email || '');
    const at = s.indexOf('@');
    if (at < 1) return s;
    const local = s.slice(0, at);
    return local[0] + '***' + s.slice(at);
}

function deliverLoginOtp(dest, code, db, row, portal) {
    const vars = loginOtpVars(row, portal);
    return notifEngine
        .sendOtpMessages({ email: dest, code, db, eventKey: 'LOGIN_OTP', vars })
        .then((r) => r.email || { ok: false });
}

function sendLoginOtpChannel(db, row, channel, cb, opts) {
    const portal = (opts && opts.portal) || 'public';
    if (channel !== 'email') {
        return cb(null, {
            ok: false,
            status: 400,
            error: 'Sign-in OTP is sent by email only.'
        });
    }
    const dest = authUsers.loginOtpDestination('email', row);
    if (!dest) {
        return cb(null, { ok: false, status: 400, error: NO_EMAIL_MSG });
    }
    const meta = { userId: row.id };
    otpLib.prepareOtpSend(db, { channel: 'email', destination: dest, purpose: 'login', meta }, (serr, code) => {
        if (serr) {
            return cb(null, {
                ok: false,
                status: serr.status || 500,
                error: serr.message || 'Could not send OTP.'
            });
        }
        deliverLoginOtp(dest, code, db, row, portal).then((sent) => {
            const debug = process.env.OTP_RETURN_CODE === '1' || process.env.NODE_ENV === 'development';
            const payload = { ok: true, status: 200, ttlMinutes: otpLib.OTP_TTL_MIN, sentTo: maskEmail(dest) };
            if (debug) payload.debugCode = code;
            if (!sent.ok && !sent.skipped) {
                payload.ok = false;
                payload.status = 503;
                payload.error = sent.error || 'Could not deliver the sign-in email.';
            }
            if (sent.skipped) {
                payload.warning = 'Email not fully configured; use debugCode in development.';
            }
            cb(null, payload);
        });
    });
}

/** Legacy "send on all channels" entry point — now sends the email OTP only. */
function sendLoginOtpsForUser(db, row, cb) {
    sendLoginOtpChannel(
        db,
        row,
        'email',
        (err, result) => {
            if (err) return cb(err);
            cb(null, Object.assign({}, result, { results: { email: result } }));
        },
        { portal: 'public' }
    );
}

module.exports = { sendLoginOtpsForUser, sendLoginOtpChannel, OTP_REUSE_MSG };
