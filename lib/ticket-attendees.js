/**
 * Entry pass size from registration form_data (Autism: attendees_count).
 */
const portalProduct = require('./portal-product');

function parseFormData(raw) {
    if (raw == null) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function parseAttendeesCount(formData, fallback) {
    if (
        formData != null &&
        (typeof formData === 'number' ||
            (typeof formData === 'string' && /^\d+$/.test(String(formData).trim())))
    ) {
        const n = parseInt(formData, 10);
        if (Number.isInteger(n) && n >= 1 && n <= 99) return n;
        if (fallback != null) return fallback;
        return null;
    }
    const fd = parseFormData(formData);
    const raw = fd.attendees_count != null ? fd.attendees_count : fd.attendeesCount;
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 99) return n;
    if (fallback != null) return fallback;
    return null;
}

function resolveAttendeesCount(row) {
    if (!row) return null;
    if (row.attendees_count != null) {
        const direct = parseAttendeesCount(row.attendees_count, null);
        if (direct != null) return direct;
    }
    const fromReg = attendeesCountFromFormData(row.form_data);
    if (fromReg != null) return fromReg;
    if (row.prereg_form_data != null) {
        return attendeesCountFromFormData(row.prereg_form_data);
    }
    return null;
}

function ticketDocumentApiPath(ticketIdString, userId) {
    const role =
        portalProduct.FEATURES && portalProduct.FEATURES.applicantPortal ? 'applicant' : 'doctor';
    return (
        '/api/' +
        role +
        '/ticket-document/' +
        encodeURIComponent(String(ticketIdString || '')) +
        '?userId=' +
        encodeURIComponent(String(userId || ''))
    );
}

function attendeesValidityLabel(count) {
    const n = parseInt(count, 10);
    if (!Number.isInteger(n) || n < 1) return '';
    return n === 1 ? 'Valid for 1 person' : 'Valid for ' + n + ' people';
}

function showAttendeesOnApplicantTicket() {
    return !!(portalProduct.FEATURES && portalProduct.FEATURES.productId === 'autism');
}

function attendeesCountFromFormData(formData) {
    if (!showAttendeesOnApplicantTicket()) return null;
    const fd = parseFormData(formData);
    if (fd.attendees_count == null && fd.attendeesCount == null) return null;
    return parseAttendeesCount(formData, 1);
}

function attendeesValidityHtml(row, opts) {
    if (!showAttendeesOnApplicantTicket()) return '';
    const escapeHtml =
        opts && typeof opts.escapeHtml === 'function'
            ? opts.escapeHtml
            : (s) => String(s == null ? '' : s);
    const count = resolveAttendeesCount(row);
    if (count == null) return '';
    const label = attendeesValidityLabel(count);
    if (!label) return '';
    return '<p><strong>Entry pass</strong><br>' + escapeHtml(label) + '</p>';
}

module.exports = {
    parseFormData,
    parseAttendeesCount,
    resolveAttendeesCount,
    attendeesValidityLabel,
    showAttendeesOnApplicantTicket,
    attendeesCountFromFormData,
    attendeesValidityHtml,
    ticketDocumentApiPath
};
