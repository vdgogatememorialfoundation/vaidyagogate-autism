/**
 * Map pre-registration form_data → main registration field keys.
 */
const authUsers = require('./auth-users');

const DIRECT_KEY_MAP = {
    address: 'address',
    pin: 'pin',
    pincode: 'pin',
    city: 'city',
    state: 'state',
    country: 'country',
    parent_dob: 'dob',
    child_name: 'child_name',
    child_dob: 'child_dob',
    child_gender: 'child_gender',
    parent_gender: 'parent_gender',
    attendees_count: 'attendees_count',
    child_health: 'child_health',
    diet: 'diet',
    financial_planning: 'financial_planning',
    contact_email: 'email',
    contact_phone: 'phone'
};

function splitParentName(name) {
    const raw = String(name || '').trim();
    if (!raw) return { fname: '', lname: '' };
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { fname: parts[0], lname: '' };
    return { fname: parts[0], lname: parts.slice(1).join(' ') };
}

function preregSubmissionSource(formData) {
    const src = formData && formData._submitted_via;
    if (src === 'public_prereg_form') return 'public';
    return 'portal';
}

function isPublicPreregFormData(formData) {
    return preregSubmissionSource(formData) === 'public';
}

function mapPreregFormDataToMainReg(rawFormData) {
    const src = rawFormData && typeof rawFormData === 'object' ? rawFormData : {};
    const out = {};
    Object.keys(DIRECT_KEY_MAP).forEach((fromKey) => {
        const toKey = DIRECT_KEY_MAP[fromKey];
        if (src[fromKey] != null && String(src[fromKey]).trim() !== '') {
            out[toKey] = String(src[fromKey]).trim();
        }
    });
    if (src.parent_name) {
        const { fname, lname } = splitParentName(src.parent_name);
        if (fname) out.fname = fname;
        if (lname) out.lname = lname;
    }
    Object.keys(src).forEach((k) => {
        if (k.startsWith('_')) return;
        if (DIRECT_KEY_MAP[k] || k === 'parent_name') return;
        if (src[k] != null && String(src[k]).trim() !== '' && out[k] == null) {
            out[k] = src[k];
        }
    });
    return out;
}

function contactEmailsMatch(a, b) {
    const ea = authUsers.normalizeEmail(a);
    const eb = authUsers.normalizeEmail(b);
    return !!(ea && eb && ea === eb);
}

function contactPhonesMatch(a, b) {
    const da = String(a || '').replace(/\D/g, '').slice(-10);
    const db = String(b || '').replace(/\D/g, '').slice(-10);
    return da.length === 10 && db.length === 10 && da === db;
}

function userCanAccessPrereg(userRow, preregUserRow, formData) {
    if (!userRow) return false;
    const fd = formData || {};
    const userEmail = userRow.email;
    const userPhone = userRow.phone;
    if (preregUserRow) {
        if (Number(userRow.id) === Number(preregUserRow.id)) return true;
        if (contactEmailsMatch(userEmail, preregUserRow.email)) return true;
        if (contactPhonesMatch(userPhone, preregUserRow.phone)) return true;
    }
    if (contactEmailsMatch(userEmail, fd.contact_email)) return true;
    if (contactPhonesMatch(userPhone, fd.contact_phone)) return true;
    return false;
}

module.exports = {
    mapPreregFormDataToMainReg,
    preregSubmissionSource,
    isPublicPreregFormData,
    userCanAccessPrereg,
    splitParentName
};
