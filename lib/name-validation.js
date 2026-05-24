/**
 * Autism portal — simple person names (no Dr./Vaidya title rules).
 */

function validatePersonName(name, fieldLabel) {
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

function validateRegistrationPersonNames(formData) {
    const fd = formData && typeof formData === 'object' ? formData : {};
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
        const v = validatePersonName(raw, label);
        if (!v.valid) return v.message;
    }
    return null;
}

/** @deprecated autism portal — kept for API compatibility */
const REJECTED_PREFIXES = [];

module.exports = { validatePersonName, validateRegistrationPersonNames, REJECTED_PREFIXES };
