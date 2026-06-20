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

function parsePreregFormData(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            let parsed = JSON.parse(raw);
            if (typeof parsed === 'string') {
                try {
                    parsed = JSON.parse(parsed);
                } catch (_) {}
            }
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
}

function normalizeDateForInput(val) {
    if (val == null || String(val).trim() === '') return '';
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoPrefix) return isoPrefix[1];
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
    }
    return s;
}

function hasPreregValue(src, key) {
    if (!src || src[key] == null) return false;
    if (typeof src[key] === 'boolean') return true;
    if (typeof src[key] === 'number') return !Number.isNaN(src[key]);
    return String(src[key]).trim() !== '';
}

function normalizeFieldValue(key, val) {
    if (val == null) return null;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val;
    if (String(key).endsWith('_dob') || key === 'dob') return normalizeDateForInput(val);
    return String(val).trim();
}

/** Keys collected in pre-registration that map elsewhere on the main form (do not duplicate as extra fields). */
const PREREG_KEYS_MERGED_INTO_MAIN = new Set(['parent_name', 'contact_email', 'contact_phone', 'pincode']);

function mapPreregFormDataToMainReg(rawFormData) {
    const src = parsePreregFormData(rawFormData);
    const out = {};
    Object.keys(src).forEach((k) => {
        if (k.startsWith('_')) return;
        if (!hasPreregValue(src, k)) return;
        const norm = normalizeFieldValue(k, src[k]);
        if (norm == null || (typeof norm === 'string' && norm === '')) return;
        out[k] = norm;
    });
    Object.keys(DIRECT_KEY_MAP).forEach((fromKey) => {
        if (!hasPreregValue(src, fromKey)) return;
        const toKey = DIRECT_KEY_MAP[fromKey];
        const val = normalizeFieldValue(toKey, src[fromKey]);
        if (val == null || (typeof val === 'string' && val === '')) return;
        out[toKey] = val;
        if (fromKey !== toKey) out[fromKey] = val;
    });
    if (hasPreregValue(src, 'parent_name')) {
        const { fname, lname } = splitParentName(src.parent_name);
        if (fname) out.fname = fname;
        if (lname) out.lname = lname;
        out.parent_name = String(src.parent_name).trim();
    }
    if (hasPreregValue(src, 'email') && !out.email) out.email = normalizeFieldValue('email', src.email);
    if (hasPreregValue(src, 'phone') && !out.phone) out.phone = normalizeFieldValue('phone', src.phone);
    return out;
}

function mergePreregFieldsIntoMainRegForm(mainFields, preregFields) {
    const main = Array.isArray(mainFields) ? mainFields : [];
    const prereg = Array.isArray(preregFields) ? preregFields : [];
    const mainKeys = new Set(main.map((f) => f && f.key).filter(Boolean));
    const extras = [];
    prereg.forEach((pf) => {
        if (!pf || !pf.key || pf.enabled === false) return;
        if (PREREG_KEYS_MERGED_INTO_MAIN.has(pf.key)) return;
        if (pf.key === 'parent_dob' && mainKeys.has('dob')) return;
        if (mainKeys.has(pf.key)) return;
        extras.push({
            ...pf,
            step: Math.max(3, pf.step != null ? parseInt(pf.step, 10) || 3 : 3),
            required: pf.required !== false,
            fromPrereg: true
        });
    });
    return main.concat(extras);
}

function isEmptyMainRegValue(v) {
    if (v == null) return true;
    if (typeof v === 'boolean') return false;
    if (typeof v === 'number') return false;
    return String(v).trim() === '';
}

function mergeMainRegSubmitWithPreregPrefill(submittedFormData, preregPrefill) {
    const out = Object.assign({}, submittedFormData || {});
    const prefill = preregPrefill && typeof preregPrefill === 'object' ? preregPrefill : {};
    Object.keys(prefill).forEach((k) => {
        if (k.startsWith('_')) return;
        if (!isEmptyMainRegValue(out[k])) return;
        out[k] = prefill[k];
    });
    return out;
}

function preregFormFieldKeys(rawFormData) {
    const src = parsePreregFormData(rawFormData);
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
    mergePreregFieldsIntoMainRegForm,
    mergeMainRegSubmitWithPreregPrefill,
    preregFormFieldKeys,
    parsePreregFormData,
    normalizeDateForInput,
    normalizeFieldValue,
    preregSubmissionSource,
    isPublicPreregFormData,
    userCanAccessPrereg,
    splitParentName,
    PREREG_KEYS_MERGED_INTO_MAIN
};
