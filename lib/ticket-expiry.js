/**
 * E-ticket expiry: an unscanned ticket (registration still "e-ticket issued") stops being
 * valid once the seminar's ticket_expiry_at passes. When no explicit expiry is set, the
 * ticket expires at the end of the event day (23:59:59 IST).
 */
const seminarDt = require('./seminar-datetime');
const localDate = require('./local-date');

const SCANNED_STATUSES = new Set(['checked_in', 'completed', 'certificate_issued']);

function isTruthy(v) {
    return v === 1 || v === true || v === '1' || String(v).toLowerCase() === 'true';
}

/** Effective expiry instant (ms) for a seminar row; null when the event has no date at all. */
function ticketExpiryMs(seminarRow) {
    if (!seminarRow) return null;
    const explicit = seminarDt.parseSeminarMs(seminarRow.ticket_expiry_at);
    if (explicit != null) return explicit;
    const eventYmd = localDate.normalizeCheckinDateYmd(seminarRow.event_date);
    if (!eventYmd) return null;
    return seminarDt.parseSeminarMs(eventYmd + 'T23:59:59');
}

function ticketExpiryLabel(seminarRow) {
    const ms = ticketExpiryMs(seminarRow);
    if (ms == null) return '';
    return seminarDt.formatSeminarDateTime(new Date(ms).toISOString());
}

/** True when the ticket was never scanned and its expiry instant has passed. */
function isTicketExpired(row, nowMs) {
    if (!row) return false;
    const scanned = isTruthy(row.is_scanned) || Number(row.scan_count) > 0;
    if (scanned) return false;
    if (SCANNED_STATUSES.has(String(row.registration_status || '').toLowerCase())) return false;
    const ms = ticketExpiryMs(row);
    if (ms == null) return false;
    return (nowMs != null ? nowMs : Date.now()) > ms;
}

const EXPIRED_MSG = 'Ticket expired — the event is over and this e-ticket was never used for check-in.';

module.exports = { ticketExpiryMs, ticketExpiryLabel, isTicketExpired, EXPIRED_MSG };
