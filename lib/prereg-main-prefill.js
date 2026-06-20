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

function normalizeDateForInput(val) {
    if (val == null || String(val).trim() === '') return '';
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
    }
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return s;
}

function hasPreregValue(src, key) {
    return src[key] != null && String(src[key]).trim() !== '';
}

function mapPreregFormDataToMainReg(rawFormData) {
    const src = rawFormData && typeof rawFormData === 'object' ? rawFormData : {};
    const out = {};
    Object.keys(DIRECT_KEY_MAP).forEach((fromKey) => {
        if (!hasPreregValue(src, fromKey)) return;
        const toKey = DIRECT_KEY_MAP[fromKey];
        let val = String(src[fromKey]).trim();
        if (fromKey.endsWith('_dob') || toKey === 'dob') val = normalizeDateForInput(val);
        out[toKey] = val;
    });
    if (hasPreregValue(src, 'parent_name')) {
        const { fname, lname } = splitParentName(src.parent_name);
        if (fname) out.fname = fname;
        if (lname) out.lname = lname;
    }
    Object.keys(src).forEach((k) => {
        if (k.startsWith('_')) return;
        if (DIRECT_KEY_MAP[k] || k === 'parent_name') return;
        if (!hasPreregValue(src, k) || out[k] != null) return;
        let val = src[k];
        if (String(k).endsWith('_dob') || k === 'dob') val = normalizeDateForInput(val);
        else val = String(val).trim();
        out[k] = val;
    });
    return out;
}

function preregFormFieldKeys(rawFormData) {
    const src = rawFormData && typeof rawFormData === 'object' ? rawFormData : {};
    return Object.keys(src).filter((k) => !k.startsWith('_') && hasPreregValue(src, k));
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
    preregFormFieldKeys,
    normalizeDateForInput,
    preregSubmissionSource,
    isPublicPreregFormData,
    userCanAccessPrereg,
    splitParentName
};
