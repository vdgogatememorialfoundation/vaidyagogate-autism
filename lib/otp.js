const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OTP_LEN = parseInt(process.env.OTP_DIGITS || '4', 10) === 6 ? 6 : 4;
const OTP_TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const MAX_SENDS_PER_HOUR = parseInt(process.env.OTP_MAX_SENDS_PER_HOUR || '24', 10);

function hashCode(code) {
    return crypto.createHash('sha256').update(sanitizeOtpCode(code), 'utf8').digest('hex');
}

/** Strip spaces/hidden chars; numeric OTPs become digits-only. */
function sanitizeOtpCode(code) {
    const s = String(code || '').trim();
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 8) return digits;
    return s;
}

function generateOtpDigits() {
    let s = '';
    for (let i = 0; i < OTP_LEN; i++) s += Math.floor(Math.random() * 10).toString();
    return s;
}

/**
 * Deterministic OTP for destination + purpose within the current TTL window.
 * Resend/WhatsApp duplicate messages show the same code the server expects.
 */
function generateOtpForDestination(channel, destination, purpose, meta) {
    const dest = normalizeOtpDestination(channel, destination);
    const pk = otpRowPurpose(purpose, meta);
    const secret =
        process.env.OTP_HMAC_SECRET ||
        process.env.SESSION_SECRET ||
        process.env.DATABASE_URL ||
        'autism-portal-otp-v1';
    const windowMs = OTP_TTL_MIN * 60 * 1000;
    const slot = Math.floor(Date.now() / windowMs);
    const msg = `${pk}|${dest}|${slot}|${OTP_LEN}`;
    const h = crypto.createHmac('sha256', String(secret)).update(msg).digest('hex');
    const mod = Math.pow(10, OTP_LEN);
    const n = parseInt(h.slice(0, 10), 16) % mod;
    return String(n).padStart(OTP_LEN, '0');
}

function isoExpire(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

/** Normalize destination so send and verify use the same stored key. */
function normalizeOtpDestination(channel, destination) {
    const raw = String(destination || '').trim();
    if (!raw) return '';
    if (channel === 'email') return raw.toLowerCase();
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
}

/** Never expose OTP codes in production API responses. */
function otpDebugResponsesEnabled() {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return false;
    return process.env.OTP_RETURN_CODE === '1' || process.env.NODE_ENV === 'development';
}

/** Stored on otp_codes rows for lookup */
function otpRowPurpose(purpose, meta) {
    if (purpose === 'registration' && meta && meta.seminarId != null) {
        return `registration:${meta.seminarId}`;
    }
    if (purpose === 'registration_submit' && meta && meta.seminarId != null) {
        return `registration_submit:${meta.seminarId}`;
    }
    if (purpose === 'admin_confirm' && meta && meta.adminUserId != null && !Number.isNaN(parseInt(meta.adminUserId, 10))) {
        return `admin_confirm:${parseInt(meta.adminUserId, 10)}`;
    }
    if (purpose === 'signup') return 'signup';
    if (purpose === 'registration_field' && meta && meta.seminarId != null && meta.fieldKey) {
        return `registration_field:${meta.seminarId}:${meta.fieldKey}`;
    }
    if (purpose === 'login' && meta && meta.userId != null && !Number.isNaN(parseInt(meta.userId, 10))) {
        return `login:${parseInt(meta.userId, 10)}`;
    }
    if (purpose === 'proxy_applicant' && meta && meta.seminarId != null) {
        return `proxy_applicant:${meta.seminarId}`;
    }
    if (purpose === 'certificate_verify' && meta && meta.certId != null) {
        const kind = meta.certKind === 'volunteer' ? 'volunteer' : 'participant';
        return `certificate_verify:${kind}:${parseInt(meta.certId, 10)}`;
    }
    return String(purpose || 'generic');
}

const otpWhatsAppSent = new Map();

function otpWhatsAppSentKey(channel, destination, purpose, meta) {
    return otpRowPurpose(purpose, meta || {}) + '|' + normalizeOtpDestination(channel, destination);
}

function markOtpWhatsAppSent(channel, destination, purpose, meta, code) {
    otpWhatsAppSent.set(otpWhatsAppSentKey(channel, destination, purpose, meta), {
        code: String(code),
        at: Date.now()
    });
}

function clearOtpWhatsAppSent(channel, destination, purpose, meta) {
    otpWhatsAppSent.delete(otpWhatsAppSentKey(channel, destination, purpose, meta));
}

/** Clear signup + login delivery cache for a phone after any auth OTP is consumed. */
function clearPhoneAuthWhatsAppSent(channel, destination) {
    const dest = normalizeOtpDestination(channel, destination);
    const suffix = '|' + dest;
    for (const key of [...otpWhatsAppSent.keys()]) {
        if (!key.endsWith(suffix)) continue;
        if (key.startsWith('signup|') || key.startsWith('login:') || key.startsWith('applicant:')) {
            otpWhatsAppSent.delete(key);
        }
    }
}

/** After sign-in or signup verify, invalidate all active auth OTP rows for this phone. */
function consumeAllPhoneAuthOtps(db, channel, destination, cb) {
    const dest = normalizeOtpDestination(channel, destination);
    db.run(
        `UPDATE otp_codes SET consumed = 1 WHERE channel = ? AND destination = ? AND consumed = 0 AND (purpose = 'signup' OR purpose LIKE 'login:%' OR purpose LIKE 'applicant:%')`,
        [channel, dest],
        cb
    );
}

/** Skip duplicate WhatsApp only when this exact code was already delivered for this purpose. */
function shouldSkipOtpWhatsApp(channel, destination, purpose, meta, code, opts) {
    if (opts && opts.forceResend) return false;
    const key = otpWhatsAppSentKey(channel, destination, purpose, meta);
    const hit = otpWhatsAppSent.get(key);
    if (!hit) return false;
    const ttlMs = OTP_TTL_MIN * 60 * 1000;
    if (Date.now() - hit.at > ttlMs) {
        otpWhatsAppSent.delete(key);
        return false;
    }
    return hit.code === String(code);
}

/** Stored on otp_verification_tokens after successful verify */
function tokenPurpose(purpose, channel, meta) {
    if (purpose === 'registration' && meta && meta.seminarId != null) {
        return `registration:${meta.seminarId}:${channel}`;
    }
    if (purpose === 'registration_submit' && meta && meta.seminarId != null) {
        return `registration_submit:${meta.seminarId}:${channel}`;
    }
    if (purpose === 'admin_confirm' && meta && meta.adminUserId != null && !Number.isNaN(parseInt(meta.adminUserId, 10))) {
        return `admin_confirm:${parseInt(meta.adminUserId, 10)}:${channel}`;
    }
    if (purpose === 'signup') return `signup:${channel}`;
    if (purpose === 'registration_field' && meta && meta.seminarId != null && meta.fieldKey) {
        return `registration_field:${meta.seminarId}:${meta.fieldKey}:${channel}`;
    }
    if (purpose === 'login' && meta && meta.userId != null && !Number.isNaN(parseInt(meta.userId, 10))) {
        return `login:${parseInt(meta.userId, 10)}:${channel}`;
    }
    if (purpose === 'proxy_applicant' && meta && meta.seminarId != null) {
        return `proxy_applicant:${meta.seminarId}:${channel}`;
    }
    if (purpose === 'certificate_verify' && meta && meta.certId != null) {
        const kind = meta.certKind === 'volunteer' ? 'volunteer' : 'participant';
        return `certificate_verify:${kind}:${parseInt(meta.certId, 10)}:${channel}`;
    }
    return `${purpose}:${channel}`;
}

function countRecentSends(db, channel, destination, purpose, meta, cb) {
    if (typeof purpose === 'function') {
        cb = purpose;
        purpose = null;
        meta = null;
    } else if (typeof meta === 'function') {
        cb = meta;
        meta = null;
    }
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const dest = normalizeOtpDestination(channel, destination);
    const pk = purpose != null ? otpRowPurpose(purpose, meta || {}) : null;
    const sql = pk
        ? `SELECT COUNT(*) AS c FROM otp_codes WHERE channel = ? AND destination = ? AND purpose = ? AND created_at > ?`
        : `SELECT COUNT(*) AS c FROM otp_codes WHERE channel = ? AND destination = ? AND created_at > ?`;
    const params = pk ? [channel, dest, pk, since] : [channel, dest, since];
    db.get(sql, params, (err, row) => {
        if (err) return cb(err, 999);
        cb(null, row && row.c != null ? row.c : 0);
    });
}

function hasActiveOtp(db, { channel, destination, purpose, meta }, cb) {
    const dest = normalizeOtpDestination(channel, destination);
    const pk = otpRowPurpose(purpose, meta);
    const now = new Date().toISOString();
    db.get(
        `SELECT id FROM otp_codes WHERE channel = ? AND destination = ? AND purpose = ? AND consumed = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1`,
        [channel, dest, pk, now],
        (err, row) => cb(err, !!row)
    );
}

/** Allow resend while a code is still valid; rate-limit per purpose (signup vs login). */
function checkOtpSendRateLimit(db, { channel, destination, purpose, meta }, cb) {
    hasActiveOtp(db, { channel, destination, purpose, meta }, (err, active) => {
        if (err) return cb(err);
        if (active) return cb(null, { ok: true, activeReuse: true });
        countRecentSends(db, channel, destination, purpose, meta, (cerr, cnt) => {
            if (cerr) return cb(cerr);
            if (cnt >= MAX_SENDS_PER_HOUR) {
                return cb(null, {
                    ok: false,
                    error: 'Too many OTP requests. Try again later.',
                    retryAfterMinutes: 60
                });
            }
            cb(null, { ok: true, activeReuse: false });
        });
    });
}

function saveOtp(db, { channel, destination, purpose, meta }, code, cb) {
    const dest = normalizeOtpDestination(channel, destination);
    const pk = otpRowPurpose(purpose, meta);
    const metaStr = meta && typeof meta === 'object' ? JSON.stringify(meta) : null;
    const exp = isoExpire(OTP_TTL_MIN);
    const h = hashCode(code);
    const now = new Date().toISOString();

    db.get(
        `SELECT id FROM otp_codes WHERE channel = ? AND destination = ? AND purpose = ? AND consumed = 0 AND code_hash = ? AND expires_at > ? ORDER BY id DESC LIMIT 1`,
        [channel, dest, pk, h, now],
        (findErr, existing) => {
            if (findErr) return cb(findErr);
            if (existing) {
                return db.run(`UPDATE otp_codes SET expires_at = ? WHERE id = ?`, [exp, existing.id], (extErr) =>
                    cb(extErr, existing.id, { extended: true })
                );
            }
            db.run(
                `UPDATE otp_codes SET consumed = 1 WHERE channel = ? AND destination = ? AND purpose = ? AND consumed = 0`,
                [channel, dest, pk],
                () => {
                    db.run(
                        `INSERT INTO otp_codes (channel, destination, purpose, meta, code_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
                        [channel, dest, pk, metaStr, h, exp],
                        function (err) {
                            cb(err, this.lastID, { extended: false });
                        }
                    );
                }
            );
        }
    );
}

/** Generate a stable OTP and persist it (safe to call on Send and Resend). */
function prepareOtpSend(db, { channel, destination, purpose, meta }, cb) {
    checkOtpSendRateLimit(db, { channel, destination, purpose, meta }, (rateErr, rate) => {
        if (rateErr) return cb(rateErr);
        if (!rate || !rate.ok) {
            const e = new Error((rate && rate.error) || 'Too many OTP requests. Try again later.');
            e.status = 429;
            return cb(e);
        }
        const code = generateOtpForDestination(channel, destination, purpose, meta);
        saveOtp(db, { channel, destination, purpose, meta }, code, (err, id, info) => {
            if (err) return cb(err);
            const codeReused = !!(info && info.extended);
            // #region agent log
            try {
                fs.appendFileSync(
                    path.join(__dirname, '..', 'debug-7880d4.log'),
                    JSON.stringify({
                        sessionId: '7880d4',
                        timestamp: Date.now(),
                        location: 'otp.js:prepareOtpSend',
                        message: 'otp prepare send',
                        data: {
                            channel,
                            purpose,
                            rowPurpose: otpRowPurpose(purpose, meta),
                            activeReuse: !!rate.activeReuse,
                            extended: !!(info && info.extended),
                            codeReused,
                            destTail: String(destination || '').slice(-4),
                            codeFingerprint: hashCode(code).slice(0, 8)
                        },
                        hypothesisId: 'J',
                        runId: 'post-fix'
                    }) + '\n'
                );
            } catch (_) {}
            // #endregion
            cb(null, code, id, codeReused);
        });
    });
}

/** Demo/dummy accounts: any non-empty OTP code is accepted (4–8 digits typical). */
function isDemoOtpCode(code) {
    const s = String(code || '').trim();
    if (!s) return false;
    if (/^\d+$/.test(s)) return s.length >= 1 && s.length <= 12;
    return s.length >= 1 && s.length <= 32;
}

function issueVerificationToken(db, { purpose, channel, meta, userId, seminarId, demoBypass }, cb) {
    const tp = tokenPurpose(purpose, channel, meta);
    const token = crypto.randomBytes(32).toString('hex');
    const th = hashCode(token);
    const exp = isoExpire(45);
    db.run(
        `INSERT INTO otp_verification_tokens (token_hash, purpose, channel, user_id, seminar_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [th, tp, channel, userId || null, seminarId != null ? seminarId : null, exp],
        function (ierr) {
            if (ierr) return cb(ierr);
            cb(null, { ok: true, token, tokenId: this.lastID, demoBypass: !!demoBypass });
        }
    );
}

function userIdIsDemo(db, userId, cb) {
    const uid = parseInt(userId, 10);
    if (!Number.isInteger(uid) || uid <= 0) return cb(null, false);
    db.get(`SELECT IFNULL(is_demo, 0) AS is_demo FROM users WHERE id = ?`, [uid], (err, row) => {
        if (err) return cb(err);
        cb(null, !!(row && Number(row.is_demo) === 1));
    });
}

function resolveDemoUserByDestination(db, { channel, destination }, cb) {
    const dest = normalizeOtpDestination(channel, destination);
    if (!dest) return cb(null, false, null);
    if (channel === 'email') {
        db.get(
            `SELECT id FROM users WHERE lower(trim(email)) = ? AND IFNULL(is_demo, 0) = 1`,
            [dest],
            (err, row) => {
                if (err) return cb(err);
                cb(null, !!row, row ? row.id : null);
            }
        );
        return;
    }
    db.all(`SELECT id, phone FROM users WHERE IFNULL(is_demo, 0) = 1`, [], (err, rows) => {
        if (err) return cb(err);
        const match = (rows || []).find((u) => normalizeOtpDestination('phone', u.phone) === dest);
        cb(null, !!match, match ? match.id : null);
    });
}

/**
 * Demo users may enter any 4-digit code instead of the SMS/email OTP.
 */
function verifyOtp(db, { channel, destination, purpose, code, meta, userId, seminarId }, cb) {
    const tryDemo = (resolvedUserId, done) => {
        if (!isDemoOtpCode(code)) return done(false);
        const uid = resolvedUserId != null ? resolvedUserId : userId;
        userIdIsDemo(db, uid, (eDemo, isDemoById) => {
            if (eDemo) return cb(eDemo);
            if (isDemoById) {
                return issueVerificationToken(
                    db,
                    { purpose, channel, meta, userId: uid, seminarId, demoBypass: true },
                    (eTok, result) => {
                        if (eTok) return cb(eTok);
                        cb(null, result);
                    }
                );
            }
            resolveDemoUserByDestination(db, { channel, destination }, (eDest, isDemoDest, destUid) => {
                if (eDest) return cb(eDest);
                if (!isDemoDest) return done(false);
                return issueVerificationToken(
                    db,
                    { purpose, channel, meta, userId: destUid, seminarId, demoBypass: true },
                    (eTok2, result2) => {
                        if (eTok2) return cb(eTok2);
                        cb(null, result2);
                    }
                );
            });
        });
    };

    tryDemo(userId, (handled) => {
        if (handled) return;
        verifyOtpStrict(db, { channel, destination, purpose, code, meta, userId, seminarId }, cb);
    });
}

function verifyOtpStrict(db, { channel, destination, purpose, code, meta, userId, seminarId }, cb) {
    const dest = normalizeOtpDestination(channel, destination);
    const pk = otpRowPurpose(purpose, meta);
    const codeNorm = sanitizeOtpCode(code);
    if (!codeNorm) return cb(null, { ok: false, error: 'Invalid or expired code' });
    const h = hashCode(codeNorm);
    const now = new Date().toISOString();

    function finishVerify(rowId) {
        clearOtpWhatsAppSent(channel, dest, purpose, meta);
        issueVerificationToken(
            db,
            { purpose, channel, meta, userId, seminarId },
            (tokErr, result) => {
                if (tokErr) return cb(tokErr);
                if (!result || !result.ok) {
                    return cb(null, { ok: false, error: 'Could not complete verification. Try again.' });
                }
                const isPhoneAuth = purpose === 'signup' || purpose === 'login';
                if (isPhoneAuth) {
                    clearPhoneAuthWhatsAppSent(channel, dest);
                    return consumeAllPhoneAuthOtps(db, channel, dest, (consumeErr) => {
                        if (consumeErr) return cb(consumeErr);
                        // #region agent log
                        try {
                            fs.appendFileSync(
                                path.join(__dirname, '..', 'debug-7880d4.log'),
                                JSON.stringify({
                                    sessionId: '7880d4',
                                    timestamp: Date.now(),
                                    location: 'otp.js:finishVerify',
                                    message: 'consumed all phone auth otps',
                                    data: { purpose: pk, destTail: String(dest).slice(-4), rowId: rowId || null },
                                    hypothesisId: 'J',
                                    runId: 'post-fix'
                                }) + '\n'
                            );
                        } catch (_) {}
                        // #endregion
                        cb(null, result);
                    });
                }
                if (rowId) {
                    db.run(`UPDATE otp_codes SET consumed = 1 WHERE id = ?`, [rowId], (uerr) => {
                        if (uerr) return cb(uerr);
                        cb(null, result);
                    });
                } else {
                    cb(null, result);
                }
            }
        );
    }

    const pks = [pk];
    if (purpose === 'signup' || purpose === 'login') {
        const legacyApplicant = `applicant:${dest}`;
        if (!pks.includes(legacyApplicant)) pks.push(legacyApplicant);
    }

    function tryHashMatch(idx, onMiss) {
        if (idx >= pks.length) return onMiss();
        db.get(
            `SELECT id FROM otp_codes WHERE channel = ? AND destination = ? AND purpose = ? AND consumed = 0 AND code_hash = ? AND expires_at > ? ORDER BY id DESC LIMIT 1`,
            [channel, dest, pks[idx], h, now],
            (err, row) => {
                if (err) return cb(err);
                if (row) return finishVerify(row.id);
                tryHashMatch(idx + 1, onMiss);
            }
        );
    }

    tryHashMatch(0, () => {
            const expected = generateOtpForDestination(channel, dest, purpose, meta);
            if (codeNorm === expected) {
                // #region agent log
                try {
                    fs.appendFileSync(
                        path.join(__dirname, '..', 'debug-7880d4.log'),
                        JSON.stringify({
                            sessionId: '7880d4',
                            timestamp: Date.now(),
                            location: 'otp.js:verifyOtpStrict',
                            message: 'deterministic otp fallback accepted',
                            data: { channel, purpose: pk, destTail: String(dest).slice(-4) },
                            hypothesisId: 'F'
                        }) + '\n'
                    );
                } catch (_) {}
                // #endregion
                db.get(
                    `SELECT id FROM otp_codes WHERE channel = ? AND destination = ? AND purpose = ? AND consumed = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1`,
                    [channel, dest, pk, now],
                    (err2, activeRow) => {
                        if (err2) return cb(err2);
                        return finishVerify(activeRow ? activeRow.id : null);
                    }
                );
                return;
            }

            // #region agent log
            try {
                fs.appendFileSync(
                    path.join(__dirname, '..', 'debug-7880d4.log'),
                    JSON.stringify({
                        sessionId: '7880d4',
                        timestamp: Date.now(),
                        location: 'otp.js:verifyOtpStrict',
                        message: 'otp verify failed',
                        data: {
                            channel,
                            purpose: pk,
                            destTail: String(dest).slice(-4),
                            codeLen: codeNorm.length
                        },
                        hypothesisId: 'F'
                    }) + '\n'
                );
            } catch (_) {}
            // #endregion
            return cb(null, { ok: false, error: 'Invalid or expired code' });
    });
}

function consumeVerificationToken(db, token, cb, peekOnly) {
    const th = hashCode(token);
    const now = new Date().toISOString();
    db.get(
        `SELECT id, purpose, channel FROM otp_verification_tokens WHERE token_hash = ? AND consumed = 0 AND expires_at > ?`,
        [th, now],
        (err, row) => {
            if (err) return cb(err);
            if (!row) return cb(null, { ok: false });
            if (peekOnly) {
                return cb(null, { ok: true, purpose: row.purpose, channel: row.channel, tokenId: row.id });
            }
            db.run(`UPDATE otp_verification_tokens SET consumed = 1 WHERE id = ?`, [row.id], (e2) => {
                if (e2) return cb(e2);
                cb(null, { ok: true, purpose: row.purpose, channel: row.channel, tokenId: row.id });
            });
        }
    );
}

function consumeVerificationTokens(db, tokens, cb) {
    const list = (tokens || []).filter(Boolean);
    if (!list.length) return cb(null);
    let i = 0;
    const next = () => {
        if (i >= list.length) return cb(null);
        consumeVerificationToken(db, list[i], (e) => {
            if (e) return cb(e);
            i += 1;
            next();
        });
    };
    next();
}

function validateProxyApplicantOtpTokens(db, seminarId, { phoneToken, emailToken }, cb) {
    const sid = parseInt(seminarId, 10);
    const pPhone = `proxy_applicant:${sid}:phone`;
    const pEmail = `proxy_applicant:${sid}:email`;
    if (!phoneToken || !emailToken) {
        return cb(null, { ok: false, error: 'Applicant phone and email OTP verification required.' });
    }
    consumeVerificationToken(db, phoneToken, (e1, r1) => {
        if (e1) return cb(e1);
        if (!r1 || !r1.ok || r1.purpose !== pPhone || r1.channel !== 'phone') {
            return cb(null, { ok: false, error: 'Invalid applicant phone OTP session' });
        }
        consumeVerificationToken(db, emailToken, (e2, r2) => {
            if (e2) return cb(e2);
            if (!r2 || !r2.ok || r2.purpose !== pEmail || r2.channel !== 'email') {
                return cb(null, { ok: false, error: 'Invalid applicant email OTP session' });
            }
            cb(null, { ok: true });
        });
    });
}

function validateSignupOtpTokens(db, { phoneToken, emailToken }, cb) {
    return validateSignupOtpTokensFlexible(
        db,
        { phoneToken, emailToken, needPhone: true, needEmail: true },
        cb
    );
}

function validateSignupOtpTokensFlexible(db, { phoneToken, emailToken, needPhone, needEmail, peekOnly }, cb) {
    const needP = needPhone !== false;
    const needE = needEmail === true;
    const peek = peekOnly === true;
    if (needP && !phoneToken) return cb(null, { ok: false, error: 'Missing phone OTP verification' });
    if (needE && !emailToken) return cb(null, { ok: false, error: 'Missing email OTP verification' });
    if (!needP && !needE) return cb(null, { ok: true });

    function checkPhone(next) {
        if (!needP) return next(null, true);
        consumeVerificationToken(
            db,
            phoneToken,
            (e1, r1) => {
                if (e1) return next(e1);
                if (!r1 || !r1.ok || r1.purpose !== 'signup:phone' || r1.channel !== 'phone') {
                    return next(null, false, 'Invalid phone OTP session');
                }
                next(null, true);
            },
            peek
        );
    }

    function checkEmail(next) {
        if (!needE) return next(null, true);
        consumeVerificationToken(
            db,
            emailToken,
            (e2, r2) => {
                if (e2) return next(e2);
                if (!r2 || !r2.ok || r2.purpose !== 'signup:email' || r2.channel !== 'email') {
                    return next(null, false, 'Invalid email OTP session');
                }
                next(null, true);
            },
            peek
        );
    }

    checkPhone((eP, okP, errP) => {
        if (eP) return cb(eP);
        if (!okP) return cb(null, { ok: false, error: errP || 'Invalid phone OTP session' });
        checkEmail((eE, okE, errE) => {
            if (eE) return cb(eE);
            if (!okE) return cb(null, { ok: false, error: errE || 'Invalid email OTP session' });
            cb(null, { ok: true });
        });
    });
}

function consumeSignupOtpTokens(db, { phoneToken, emailToken, needPhone, needEmail }, cb) {
    validateSignupOtpTokensFlexible(
        db,
        { phoneToken, emailToken, needPhone, needEmail, peekOnly: false },
        cb
    );
}

function validateAdminConfirmOtpTokens(db, adminUserId, { phoneToken, emailToken }, cb) {
    const uid = parseInt(adminUserId, 10);
    const pPhone = `admin_confirm:${uid}:phone`;
    const pEmail = `admin_confirm:${uid}:email`;
    if (!phoneToken || !emailToken) return cb(null, { ok: false, error: 'Missing admin confirmation OTP tokens' });
    consumeVerificationToken(db, phoneToken, (e1, r1) => {
        if (e1) return cb(e1);
        if (!r1 || !r1.ok || r1.purpose !== pPhone || r1.channel !== 'phone') {
            return cb(null, { ok: false, error: 'Invalid admin phone OTP session' });
        }
        consumeVerificationToken(db, emailToken, (e2, r2) => {
            if (e2) return cb(e2);
            if (!r2 || !r2.ok || r2.purpose !== pEmail || r2.channel !== 'email') {
                return cb(null, { ok: false, error: 'Invalid admin email OTP session' });
            }
            cb(null, { ok: true });
        });
    });
}

function validateLoginOtpTokens(db, userId, { phoneToken, emailToken }, cb) {
    return validateLoginOtpTokensFlexible(
        db,
        userId,
        { phoneToken, emailToken, needPhone: true, needEmail: true },
        cb
    );
}

function validateLoginOtpTokensFlexible(db, userId, { phoneToken, emailToken, needPhone, needEmail }, cb) {
    const uid = parseInt(userId, 10);
    const pPhone = `login:${uid}:phone`;
    const pEmail = `login:${uid}:email`;
    const needP = needPhone !== false;
    const needE = needEmail === true;
    if (needP && !phoneToken) return cb(null, { ok: false, error: 'Missing phone verification for login' });
    if (needE && !emailToken) return cb(null, { ok: false, error: 'Missing email verification for login' });
    if (!needP && !needE) return cb(null, { ok: true });

    function checkPhone(next) {
        if (!needP) return next(null, true);
        consumeVerificationToken(db, phoneToken, (e1, r1) => {
            if (e1) return next(e1);
            if (!r1 || !r1.ok || r1.purpose !== pPhone || r1.channel !== 'phone') {
                return next(null, false, 'Invalid phone verification for login');
            }
            next(null, true);
        });
    }

    function checkEmail(next) {
        if (!needE) return next(null, true);
        consumeVerificationToken(db, emailToken, (e2, r2) => {
            if (e2) return next(e2);
            if (!r2 || !r2.ok || r2.purpose !== pEmail || r2.channel !== 'email') {
                return next(null, false, 'Invalid email verification for login');
            }
            next(null, true);
        });
    }

    checkPhone((eP, okP, errP) => {
        if (eP) return cb(eP);
        if (!okP) return cb(null, { ok: false, error: errP || 'Invalid phone verification for login' });
        checkEmail((eE, okE, errE) => {
            if (eE) return cb(eE);
            if (!okE) return cb(null, { ok: false, error: errE || 'Invalid email verification for login' });
            cb(null, { ok: true });
        });
    });
}

function validateRegistrationSubmitOtpTokens(db, seminarId, { phoneToken, emailToken }, cb, opts) {
    const peekOnly = !!(opts && opts.peekOnly);
    const sid = parseInt(seminarId, 10);
    const pPhone = `registration_submit:${sid}:phone`;
    const pEmail = `registration_submit:${sid}:email`;
    const needPhone = !!phoneToken;
    const needEmail = !!emailToken;
    if (!needPhone && !needEmail) {
        return cb(null, { ok: false, error: 'Missing submit OTP verification' });
    }
    function checkPhone(next) {
        if (!needPhone) return next(null, true);
        consumeVerificationToken(db, phoneToken, (e1, r1) => {
            if (e1) return next(e1);
            if (!r1 || !r1.ok || r1.purpose !== pPhone || r1.channel !== 'phone') {
                return next(null, false, 'Invalid phone verification for submit');
            }
            next(null, true);
        }, peekOnly);
    }
    function checkEmail(next) {
        if (!needEmail) return next(null, true);
        consumeVerificationToken(db, emailToken, (e2, r2) => {
            if (e2) return next(e2);
            if (!r2 || !r2.ok || r2.purpose !== pEmail || r2.channel !== 'email') {
                return next(null, false, 'Invalid email verification for submit');
            }
            next(null, true);
        }, peekOnly);
    }
    checkPhone((eP, okP, errP) => {
        if (eP) return cb(eP);
        if (!okP) return cb(null, { ok: false, error: errP || 'Invalid phone verification for submit' });
        checkEmail((eE, okE, errE) => {
            if (eE) return cb(eE);
            if (!okE) return cb(null, { ok: false, error: errE || 'Invalid email verification for submit' });
            cb(null, { ok: true });
        });
    });
}

function validateRegistrationOtpTokens(db, seminarId, { phoneToken, emailToken }, cb, opts) {
    const peekOnly = !!(opts && opts.peekOnly);
    const sid = parseInt(seminarId, 10);
    const pPhone = `registration:${sid}:phone`;
    const pEmail = `registration:${sid}:email`;
    const needPhone = !!phoneToken;
    const needEmail = !!emailToken;
    if (!needPhone && !needEmail) {
        return cb(null, { ok: false, error: 'Missing OTP verification for this seminar' });
    }
    function checkPhone(next) {
        if (!needPhone) return next(null, true);
        consumeVerificationToken(db, phoneToken, (e1, r1) => {
            if (e1) return next(e1);
            if (!r1 || !r1.ok || r1.purpose !== pPhone || r1.channel !== 'phone') {
                return next(null, false, 'Invalid phone verification for this registration');
            }
            next(null, true);
        }, peekOnly);
    }
    function checkEmail(next) {
        if (!needEmail) return next(null, true);
        consumeVerificationToken(db, emailToken, (e2, r2) => {
            if (e2) return next(e2);
            if (!r2 || !r2.ok || r2.purpose !== pEmail || r2.channel !== 'email') {
                return next(null, false, 'Invalid email verification for this registration');
            }
            next(null, true);
        }, peekOnly);
    }
    checkPhone((eP, okP, errP) => {
        if (eP) return cb(eP);
        if (!okP) return cb(null, { ok: false, error: errP || 'Invalid phone verification for this registration' });
        checkEmail((eE, okE, errE) => {
            if (eE) return cb(eE);
            if (!okE) return cb(null, { ok: false, error: errE || 'Invalid email verification for this registration' });
            cb(null, { ok: true });
        });
    });
}

/**
 * Verify OTP for a custom field (e.g. alternate phone). Consumes otp row; returns token for optional re-check on submit.
 */
function verifyFieldOtp(db, { channel, destination, purpose, code, meta, userId }, cb) {
    verifyOtp(db, { channel, destination, purpose, code, meta, userId, seminarId: meta && meta.seminarId }, cb);
}

const { normalizeFields } = require('./dynamic-fields');

function validateAllFieldOtpTokens(db, seminarId, fieldOtpTokens, fields, cb, opts) {
    const map = fieldOtpTokens && typeof fieldOtpTokens === 'object' ? fieldOtpTokens : {};
    const sid = parseInt(seminarId, 10);
    const skip = new Set(
        opts && Array.isArray(opts.skipFieldKeys) ? opts.skipFieldKeys.map((k) => String(k)) : []
    );
    const need = normalizeFields(fields || []).filter((f) => {
        if (!f.verifyOtp || !f.enabled) return false;
        if (f.type !== 'email' && f.type !== 'tel') return false;
        if (skip.has(String(f.key))) return false;
        if (f.type === 'email' && opts && opts.emailConfigured === false) return false;
        if (f.type === 'tel' && opts && opts.whatsappConfigured === false) return false;
        return true;
    });
    let idx = 0;
    function next() {
        if (idx >= need.length) return cb(null, { ok: true });
        const f = need[idx++];
        const tok = map[f.key];
        if (!tok) return cb(null, { ok: false, error: `Missing OTP verification for: ${f.label || f.key}` });
        const ch = f.type === 'email' ? 'email' : 'phone';
        const expectedPurpose = `registration_field:${sid}:${f.key}:${ch}`;
        consumeVerificationToken(db, tok, (err, r) => {
            if (err) return cb(err);
            if (!r || !r.ok || r.purpose !== expectedPurpose) {
                return cb(null, { ok: false, error: `Invalid OTP session for: ${f.label || f.key}` });
            }
            next();
        });
    }
    next();
}

module.exports = {
    generateOtpDigits,
    generateOtpForDestination,
    prepareOtpSend,
    sanitizeOtpCode,
    hashCode,
    normalizeOtpDestination,
    isDemoOtpCode,
    otpRowPurpose,
    tokenPurpose,
    countRecentSends,
    hasActiveOtp,
    checkOtpSendRateLimit,
    saveOtp,
    verifyOtp,
    consumeVerificationToken,
    consumeVerificationTokens,
    validateSignupOtpTokens,
    validateSignupOtpTokensFlexible,
    consumeSignupOtpTokens,
    validateProxyApplicantOtpTokens,
    validateAdminConfirmOtpTokens,
    validateLoginOtpTokens,
    validateLoginOtpTokensFlexible,
    validateRegistrationOtpTokens,
    validateRegistrationSubmitOtpTokens,
    verifyFieldOtp,
    validateAllFieldOtpTokens,
    OTP_TTL_MIN,
    MAX_SENDS_PER_HOUR,
    otpDebugResponsesEnabled,
    markOtpWhatsAppSent,
    shouldSkipOtpWhatsApp,
    clearOtpWhatsAppSent,
    clearPhoneAuthWhatsAppSent,
    consumeAllPhoneAuthOtps
};
