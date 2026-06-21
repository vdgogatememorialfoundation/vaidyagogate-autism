/**
 * Local verification of signup vs sign-in OTP behaviour (SQLite in-memory style via temp db).
 * Run: node scripts/verify-auth-otp-flow.js
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const otpLib = require('../lib/otp');

function openDb() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(':memory:', (err) => (err ? reject(err) : resolve(db)));
    });
}

function run(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params || [], function (e) {
            if (e) return reject(e);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function get(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params || [], (e, row) => (e ? reject(e) : resolve(row)));
    });
}

function prepareOtp(db, opts) {
    return new Promise((resolve, reject) => {
        otpLib.prepareOtpSend(db, opts, (err, code, id) => {
            if (err) return reject(err);
            resolve({ code, id });
        });
    });
}

function verifyOtp(db, opts) {
    return new Promise((resolve, reject) => {
        otpLib.verifyOtp(db, opts, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

function claim(db, id, force) {
    return new Promise((resolve, reject) => {
        otpLib.claimOtpWhatsAppDelivery(db, id, force, (err, ok) => {
            if (err) return reject(err);
            resolve(ok);
        });
    });
}

async function schema(db) {
    await run(
        db,
        `CREATE TABLE otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel TEXT NOT NULL,
            destination TEXT NOT NULL,
            purpose TEXT NOT NULL,
            meta TEXT,
            code_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
    );
    await run(
        db,
        `CREATE TABLE otp_verification_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL,
            purpose TEXT NOT NULL,
            channel TEXT NOT NULL,
            user_id INTEGER,
            seminar_id INTEGER,
            expires_at TEXT NOT NULL,
            consumed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
    );
    await new Promise((resolve, reject) => {
        otpLib.ensureOtpWhatsAppDeliverySchema(db, (e) => (e ? reject(e) : resolve()));
    });
    await run(
        db,
        `CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT, is_demo INTEGER DEFAULT 0)`
    );
    await run(db, `INSERT INTO users (id, phone, is_demo) VALUES (42, ?, 0)`, ['9422239914']);
}

async function activeCount(db, phone) {
    const row = await get(
        db,
        `SELECT COUNT(*) AS c FROM otp_codes WHERE destination = ? AND consumed = 0 AND expires_at > datetime('now')`,
        [phone]
    );
    return row.c;
}

async function main() {
    const phone = '9422239914';
    const userId = 42;
    const failures = [];

    function ok(name) {
        console.log('PASS:', name);
    }
    function fail(name, detail) {
        console.log('FAIL:', name, detail || '');
        failures.push(name);
    }

    const db = await openDb();
    await schema(db);

    // 1) Sign-in and signup codes differ on fresh sends
    const login1 = await prepareOtp(db, {
        channel: 'phone',
        destination: phone,
        purpose: 'login',
        meta: { userId }
    });
    const signup1 = await prepareOtp(db, {
        channel: 'phone',
        destination: phone,
        purpose: 'signup',
        meta: {}
    });
    if (login1.code !== signup1.code) ok('login and signup codes differ');
    else fail('login and signup codes differ', { login: login1.code, signup: signup1.code });

    // 2) Resend reuses same login code within window
    const login2 = await prepareOtp(db, {
        channel: 'phone',
        destination: phone,
        purpose: 'login',
        meta: { userId }
    });
    if (login2.code === login1.code) ok('login resend reuses active code');
    else fail('login resend reuses active code', { first: login1.code, second: login2.code });

    // 3) Sign-in verify consumes all auth OTP rows for phone
    const before = await activeCount(db, phone);
    const loginVerify = await verifyOtp(db, {
        channel: 'phone',
        destination: phone,
        purpose: 'login',
        code: login1.code,
        meta: { userId },
        userId
    });
    const after = await activeCount(db, phone);
    if (loginVerify.ok && before > 0 && after === 0) ok('login verify consumes all active auth OTP rows');
    else fail('login verify consumes all active auth OTP rows', { before, after, loginVerify });

    // 4) Old sign-in code rejected on signup after consume
    const signupAfterLogin = await verifyOtp(db, {
        channel: 'phone',
        destination: phone,
        purpose: 'signup',
        code: login1.code,
        meta: {}
    });
    if (!signupAfterLogin.ok) ok('consumed sign-in code rejected on signup verify');
    else fail('consumed sign-in code rejected on signup verify');

    // 5) New signup code after login is different from old sign-in code
    const signupFresh = await prepareOtp(db, {
        channel: 'phone',
        destination: phone,
        purpose: 'signup',
        meta: {}
    });
    if (signupFresh.code !== login1.code) ok('fresh signup code differs from prior sign-in code');
    else fail('fresh signup code differs from prior sign-in code', { code: signupFresh.code });

    // 6) WhatsApp delivery claim prevents duplicate send for same otp row
    const claim1 = await claim(db, signupFresh.id, false);
    const claim2 = await claim(db, signupFresh.id, false);
    if (claim1 && !claim2) ok('whatsapp delivery claim is single-use per otp row');
    else fail('whatsapp delivery claim is single-use per otp row', { claim1, claim2 });

    // 7) Legacy applicant purpose rows invalidated on new phone auth send
    await run(
        db,
        `INSERT INTO otp_codes (channel, destination, purpose, meta, code_hash, expires_at, consumed)
         VALUES ('phone', ?, 'applicant:9422239914', '{}', 'legacy', datetime('now', '+10 minutes'), 0)`,
        [phone]
    );
    await prepareOtp(db, { channel: 'phone', destination: phone, purpose: 'signup', meta: {} });
    const legacy = await get(
        db,
        `SELECT consumed FROM otp_codes WHERE purpose LIKE 'applicant:%' AND destination = ?`,
        [phone]
    );
    if (legacy && Number(legacy.consumed) === 1) ok('legacy applicant OTP rows invalidated on signup send');
    else fail('legacy applicant OTP rows invalidated on signup send', legacy);

    db.close();
    console.log('');
    if (failures.length) {
        console.error('Verification failed:', failures.length, 'check(s)');
        process.exit(1);
    }
    console.log('All', 7, 'OTP flow checks passed.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
