/** Client-side person names — autism portal (simple names, no title rules). */

function validatePersonNameClient(name, fieldLabel) {
    const label = fieldLabel || 'Name';
    if (name == null || String(name).trim() === '') {
        return { valid: false, message: `${label} is required` };
    }
    const trimmed = String(name).trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) {
        return { valid: false, message: `${label} must be at least 2 characters` };
    }
    if (/\d/.test(trimmed)) {
        return { valid: false, message: `${label} cannot contain numbers` };
    }
    return { valid: true, cleanedName: trimmed };
}

/** Optional display cleanup — removes common honorifics only for showing names. */
function stripPersonNameTitles(name) {
    let s = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
    if (!s) return '';
    const prefixes = [
        'dr',
        'dr.',
        'doctor',
        'vd',
        'vd.',
        'vaidya',
        'prof',
        'prof.',
        'mr',
        'mr.',
        'mrs',
        'mrs.',
        'ms',
        'ms.'
    ];
    let lower = s.toLowerCase();
    for (let i = 0; i < 20; i++) {
        let changed = false;
        for (const p of prefixes) {
            const re = new RegExp('^' + p.replace('.', '\\.') + '\\.?\\s+', 'i');
            if (lower === p || lower === p + '.') {
                s = '';
                lower = '';
                changed = true;
                break;
            }
            if (re.test(s)) {
                s = s.replace(re, '').trim();
                lower = s.toLowerCase();
                changed = true;
            }
        }
        if (!changed) break;
    }
    return s.trim();
}

function formatPersonDisplayName(parts) {
    return (parts || [])
        .map((p) => stripPersonNameTitles(p))
        .filter(Boolean)
        .join(' ')
        .trim();
}

function validateRegistrationNamesClient(formData) {
    const fd = formData || {};
    const checks = [
        ['fname', 'First name'],
        ['mname', 'Middle name'],
        ['lname', 'Last name']
    ];
    for (const [key, label] of checks) {
        const raw = fd[key];
        if (raw == null || String(raw).trim() === '') {
            if (key === 'mname') continue;
            return `Missing required field: ${label}`;
        }
        const v = validatePersonNameClient(raw, label);
        if (!v.valid) return v.message;
    }
    return null;
}
