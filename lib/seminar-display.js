/**
 * Applicant-facing seminar lists — hide demo placeholders when real events exist.
 */
function isDemoSeminarTitle(title) {
    return /^demo\b/i.test(String(title || '').trim());
}

function isDemoSeminar(row) {
    if (!row) return false;
    if (row.is_demo != null && Number(row.is_demo) === 1) return true;
    return isDemoSeminarTitle(row.title);
}

/** Stable sort: event date, then title, then id. */
function sortSeminarsForDisplay(rows) {
    return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
        const ad = a && a.event_date ? String(a.event_date) : '';
        const bd = b && b.event_date ? String(b.event_date) : '';
        if (ad !== bd) return ad.localeCompare(bd);
        const at = String((a && a.title) || '').toLowerCase();
        const bt = String((b && b.title) || '').toLowerCase();
        if (at !== bt) return at.localeCompare(bt);
        return Number(a && a.id) - Number(b && b.id);
    });
}

/**
 * On autism portal, hide demo-titled placeholder seminars from applicant/public lists.
 * Set KEEP_DEMO_SEMINARS=1 to show them (e.g. staging).
 */
function filterSeminarsForApplicantPortal(rows, opts) {
    const list = sortSeminarsForDisplay(rows);
    const productId = (opts && opts.productId) || '';
    if (productId !== 'autism') return list;
    if (process.env.KEEP_DEMO_SEMINARS === '1') return list;
    return list.filter((s) => !isDemoSeminar(s));
}

module.exports = {
    isDemoSeminarTitle,
    isDemoSeminar,
    sortSeminarsForDisplay,
    filterSeminarsForApplicantPortal
};
