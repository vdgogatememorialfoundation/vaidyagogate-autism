/**
 * Quick local smoke test for certificate APIs.
 * Usage: node scripts/test-cert-api.js [userId]
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const uid = parseInt(process.argv[2] || '2', 10);
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const trackingSql = `SELECT r.id AS registration_id, r.application_no, r.status AS reg_status, r.seminar_id,
                s.title AS seminar_title, COALESCE(s.cert_scans_required, 1) AS cert_scans_required,
                o.status AS order_status,
                t.id AS ticket_id, COALESCE(t.scan_count, 0) AS scan_count, COALESCE(t.is_scanned, 0) AS is_scanned,
                t.scan_time, t.ticket_id_string,
                uc.id AS cert_id, COALESCE(uc.scan_verified, 0) AS scan_verified, COALESCE(uc.enabled, 0) AS cert_enabled,
                ct.file_path AS template_path
         FROM registrations r
         JOIN seminars s ON s.id = r.seminar_id
         LEFT JOIN orders o ON o.registration_id = r.id AND lower(trim(o.status)) = 'success'
         LEFT JOIN tickets t ON t.order_id = o.id
         LEFT JOIN user_certificates uc ON uc.user_id = r.user_id AND uc.seminar_id = r.seminar_id
         LEFT JOIN certificate_templates ct ON ct.id = uc.template_id AND COALESCE(ct.is_active, 1) = 1
         WHERE r.user_id = ? AND COALESCE(r.status, '') NOT IN ('rejected', 'cancelled')
         ORDER BY r.id DESC`;

const badTimelineSql = `SELECT enabled, scan_verified, template_path FROM user_certificates WHERE registration_id = ? LIMIT 1`;

function run(label, sql, params) {
    return new Promise((resolve) => {
        db.all(sql, params, (err, rows) => {
            console.log(`\n[${label}]`, err ? `ERR: ${err.message}` : `OK (${(rows || []).length} rows)`);
            if (rows && rows.length) console.log(JSON.stringify(rows[0], null, 2));
            resolve();
        });
    });
}

(async () => {
    await run('certificate-tracking', trackingSql, [uid]);
    await run('timeline-bug-query', badTimelineSql, [1]);
    db.close();
})();
