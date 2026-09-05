/**
 * Admin live scanner dashboard — near real-time scan feed (poll ~1s).
 */
const ticketScanEvents = require('./ticket-scan-events');
const ticketAttendees = require('./ticket-attendees');

function registerLiveScannerRoutes(app, { db, requireAdminActor }) {
    app.get('/api/admin/live-scanner/seminars', (req, res) => {
        requireAdminActor(req, res, () => {
        db.all(
            `SELECT id, title, event_date, checkin_date, checkin_enabled
             FROM seminars
             WHERE IFNULL(checkin_enabled, 0) = 1
             ORDER BY event_date DESC, id DESC`,
            [],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows || []);
            }
        );
        });
    });

    app.get('/api/admin/live-scanner/events', (req, res) => {
        requireAdminActor(req, res, () => {
        const seminarId = req.query.seminarId;
        const sinceId = req.query.sinceId;
        ticketScanEvents.listTicketScanEvents(
            db,
            seminarId,
            { sinceId, limit: req.query.limit },
            (err, events) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ events: events || [], serverTime: new Date().toISOString() });
            }
        );
        });
    });

    app.get('/api/admin/live-scanner/stats', (req, res) => {
        requireAdminActor(req, res, () => {
        const seminarId = parseInt(req.query.seminarId, 10);
        if (!Number.isInteger(seminarId) || seminarId < 1) {
            return res.status(400).json({ error: 'seminarId required' });
        }
        db.get(
            `SELECT
                SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS success_count,
                SUM(CASE WHEN outcome = 'duplicate' THEN 1 ELSE 0 END) AS duplicate_count,
                SUM(CASE WHEN outcome NOT IN ('success','duplicate') THEN 1 ELSE 0 END) AS failed_count,
                COUNT(*) AS total_events,
                MAX(id) AS last_event_id
             FROM ticket_scan_events WHERE seminar_id = ?`,
            [seminarId],
            (err, agg) => {
                if (err) return res.status(500).json({ error: err.message });
                db.get(
                    `SELECT COUNT(*) AS scanned FROM tickets t
                     JOIN orders o ON o.id = t.order_id
                     JOIN registrations r ON r.id = o.registration_id
                     WHERE r.seminar_id = ? AND IFNULL(t.is_scanned, 0) = 1`,
                    [seminarId],
                    (e2, scannedRow) => {
                        if (e2) return res.status(500).json({ error: e2.message });
                        res.json({
                            successCount: Number(agg && agg.success_count) || 0,
                            duplicateCount: Number(agg && agg.duplicate_count) || 0,
                            failedCount: Number(agg && agg.failed_count) || 0,
                            totalEvents: Number(agg && agg.total_events) || 0,
                            lastEventId: agg && agg.last_event_id ? Number(agg.last_event_id) : 0,
                            ticketsScanned: Number(scannedRow && scannedRow.scanned) || 0
                        });
                    }
                );
            }
        );
        });
    });

    app.get('/api/admin/live-scanner/attendance', (req, res) => {
        requireAdminActor(req, res, () => {
            const seminarId = parseInt(req.query.seminarId, 10);
            if (!Number.isInteger(seminarId) || seminarId < 1) {
                return res.status(400).json({ error: 'seminarId required' });
            }
            // All attendees for the event: main registrations (approved / e-ticket issued /
            // completed / checked in) plus anyone holding an e-ticket. Checked-in flag per row.
            db.all(
                `SELECT DISTINCT r.id AS registration_id, u.first_name, u.middle_name, u.last_name, u.user_id_string,
                        r.application_no, r.status AS registration_status, r.form_data,
                        t.ticket_id_string, t.scan_time,
                        CASE WHEN COALESCE(t.is_scanned, 0) = 1 OR LOWER(r.status) = 'checked_in' THEN 1 ELSE 0 END AS checked_in
                 FROM registrations r
                 JOIN users u ON u.id = r.user_id
                 LEFT JOIN orders o ON o.registration_id = r.id AND LOWER(o.status) = 'success'
                 LEFT JOIN tickets t ON t.order_id = o.id
                 WHERE r.seminar_id = ?
                   AND LOWER(r.status) NOT IN ('rejected', 'cancelled', 'draft')
                   AND (t.id IS NOT NULL OR LOWER(r.status) IN ('approved', 'approved_pending_payment', 'e_ticket_issued', 'completed', 'checked_in'))
                 ORDER BY checked_in DESC, t.scan_time DESC, r.id DESC`,
                [seminarId],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const attendees = (rows || []).map((row) => {
                        const out = Object.assign({}, row, {
                            checked_in: Number(row.checked_in) === 1,
                            attendees_count: ticketAttendees.resolveAttendeesCount(row)
                        });
                        delete out.form_data;
                        return out;
                    });
                    const checkedIn = attendees.filter((a) => a.checked_in).length;
                    res.json({
                        attendees,
                        total: attendees.length,
                        checkedIn,
                        pending: attendees.length - checkedIn
                    });
                }
            );
        });
    });
}

module.exports = { registerLiveScannerRoutes };
