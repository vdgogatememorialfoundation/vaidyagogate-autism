/**
 * Public (no-login) pre-registration — same preregistrations table + applicant accounts.
 */
const crypto = require('crypto');
const authUsers = require('./auth-users');
const contactValidation = require('./contact-validation');
const userRoles = require('./user-roles');
const seminarRegFlow = require('./seminar-registration-flow');
const { validateDynamicForm } = require('./dynamic-fields');

function randomPassword() {
    return crypto.randomBytes(12).toString('base64url').slice(0, 14);
}

function splitParentName(formData) {
    const raw = String((formData && formData.parent_name) || '').trim();
    if (!raw) return { firstName: 'Applicant', lastName: '' };
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function publicPreregUrl(baseUrl, seminarId) {
    const base = String(baseUrl || '').replace(/\/$/, '');
    const sid = parseInt(seminarId, 10);
    if (!Number.isInteger(sid) || sid < 1) return base + '/preregister';
    return base + '/preregister?event=' + encodeURIComponent(String(sid));
}

function getPublicPreregEventStatus(seminar) {
    const seminarDt = require('./seminar-datetime');
    if (!seminar || !seminar.is_active) {
        return { enabled: false, error: 'Event not found or inactive.' };
    }
    const flags = seminarRegFlow.seminarFlowFlagsFromRegistrationFormJson(seminar.registration_form_json);
    if (!flags.preregistrationRequired) {
        return { enabled: false, error: 'Pre-registration is not used for this event.' };
    }
    if (!flags.publicPreregEnabled) {
        return { enabled: false, error: 'Public pre-registration link is not enabled for this event.' };
    }
    const win = seminarRegFlow.preregistrationWindowState(seminar, seminarDt);
    const closesAt =
        win.closesAt != null
            ? win.closesAt
            : seminarDt.parseRegistrationEndMs(seminar.preregistration_end);
    return {
        enabled: true,
        open: !!win.open,
        flags,
        window: Object.assign({}, win, { closesAt: closesAt != null ? closesAt : undefined })
    };
}

function windowClosedMessage(win) {
    const reason = win && win.reason;
    if (reason === 'schedule_not_set') return 'Pre-registration schedule is not set yet.';
    if (reason === 'not_started') return 'Pre-registration has not opened yet.';
    return 'Pre-registration has closed.';
}

function seminarAllowsPublicPrereg(seminar, flow) {
    const st = getPublicPreregEventStatus(seminar);
    if (!st.enabled) return { ok: false, error: st.error };
    const flags = flow || st.flags;
    if (!st.open) {
        return { ok: false, error: windowClosedMessage(st.window), window: st.window };
    }
    return { ok: true, flags, window: st.window };
}

function findOrCreateApplicantForPublicPrereg(db, { email, phone, formData, generateId }, cb) {
    const emailV = contactValidation.validateEmail(email);
    if (!emailV.valid) return cb(null, { ok: false, error: emailV.message });
    const phoneV = contactValidation.validatePhone(phone);
    if (!phoneV.valid) return cb(null, { ok: false, error: phoneV.message });
    const emailNorm = emailV.cleanedEmail;
    const phoneNorm = phoneV.cleanedPhone;

    authUsers.findUserByEmail(db, emailNorm, (e1, byEmail) => {
        if (e1) return cb(e1);
        if (byEmail) {
            if (userRoles.isStaffPortalAccount(byEmail) || userRoles.isSuperAdminAccount(byEmail)) {
                return cb(null, {
                    ok: false,
                    error: 'This email is registered for staff access. Please sign in at /admin or use a personal email.'
                });
            }
            if (!userRoles.isDoctorPortalAccount(byEmail)) {
                return cb(null, { ok: false, error: 'This email is already registered with a different account type.' });
            }
            return cb(null, { ok: true, userId: byEmail.id, created: false, user: byEmail });
        }
        authUsers.findUserByPhone(db, phoneNorm, (e2, byPhone) => {
            if (e2) return cb(e2);
            if (byPhone) {
                const phoneEmail = authUsers.normalizeEmail(byPhone.email);
                if (phoneEmail && phoneEmail !== emailNorm) {
                    return cb(null, {
                        ok: false,
                        error:
                            'This mobile number is already linked to another account. Sign in at the applicant portal or use a different number.'
                    });
                }
                return cb(null, { ok: true, userId: byPhone.id, created: false, user: byPhone });
            }
            const { firstName, lastName } = splitParentName(formData || {});
            const userIdStr = generateId();
            const password = randomPassword();
            db.run(
                `INSERT INTO users (user_id_string, first_name, last_name, email, phone, password, role, user_role, email_verified)
                 VALUES (?, ?, ?, ?, ?, ?, 'doctor', 'doctor', 1)`,
                [userIdStr, firstName, lastName, emailNorm, phoneNorm, password],
                function (insErr) {
                    if (insErr) return cb(insErr);
                    cb(null, {
                        ok: true,
                        userId: this.lastID,
                        created: true,
                        temporaryPassword: password,
                        user: {
                            id: this.lastID,
                            email: emailNorm,
                            phone: phoneNorm,
                            first_name: firstName,
                            last_name: lastName,
                            user_id_string: userIdStr
                        }
                    });
                }
            );
        });
    });
}

function enrichPublicFormData(formData, contact) {
    const out = Object.assign({}, formData || {});
    if (contact && contact.email) out.contact_email = contact.email;
    if (contact && contact.phone) out.contact_phone = contact.phone;
    out._submitted_via = 'public_prereg_form';
    return out;
}

function validatePublicPreregPayload(formData, fields) {
    return validateDynamicForm(formData || {}, false, fields || [], null);
}

module.exports = {
    randomPassword,
    publicPreregUrl,
    getPublicPreregEventStatus,
    windowClosedMessage,
    seminarAllowsPublicPrereg,
    findOrCreateApplicantForPublicPrereg,
    enrichPublicFormData,
    validatePublicPreregPayload,
    splitParentName
};
