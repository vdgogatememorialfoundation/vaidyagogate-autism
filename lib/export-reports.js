const XLSX = require('xlsx');
const { parseFormData } = require('./parse-form-data');
const { CONFIRMED_EXPORT_SQL, filterConfirmedRows } = require('./confirmed-participants');

const IST_TIMEZONE = 'Asia/Kolkata';

// Date columns that need timezone conversion to IST
const DATE_COLUMNS = [
    'created_at', 'updated_at', 'scan_time', 'payment_date',
    'form__submitted_at', 'form_submitted_at', 'form_created_at'
];

/**
 * Convert a date value to IST (Asia/Kolkata) timezone string.
 * Returns the formatted date string in IST.
 */
function toISTString(value) {
    if (value == null) return '';
    
    // If already a string, try to parse and convert
    if (typeof value === 'string') {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString('en-IN', { 
            timeZone: IST_TIMEZONE,
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }) + ' IST';
    }
    
    if (value instanceof Date) {
        return value.toLocaleString('en-IN', { 
            timeZone: IST_TIMEZONE,
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }) + ' IST';
    }
    
    return String(value);
}

/**
 * Check if a column name is a date column
 */
function isDateColumn(colName) {
    if (!colName) return false;
    const lower = colName.toLowerCase();
    return DATE_COLUMNS.some(dc => lower.includes(dc.toLowerCase()));
}

function flattenRow(row) {
    const fd = parseFormData(row.form_data);
    const out = { ...row };
    delete out.form_data;
    Object.keys(fd).forEach((k) => {
        const col = `form_${k}`;
        if (out[col] === undefined) out[col] = fd[k];
    });
    
    // Convert date columns to IST
    Object.keys(out).forEach((k) => {
        if (isDateColumn(k) && out[k] != null) {
            out[k] = toISTString(out[k]);
        }
    });
    
    return out;
}

function rowsToSheet(rows) {
    const flat = rows.map((r) => flattenRow(r));
    if (!flat.length) return XLSX.utils.aoa_to_sheet([['No data']]);
    const keys = [];
    flat.forEach((r) => {
        Object.keys(r).forEach((k) => {
            if (!keys.includes(k)) keys.push(k);
        });
    });
    const data = [keys, ...flat.map((r) => keys.map((k) => r[k] != null ? r[k] : ''))];
    return XLSX.utils.aoa_to_sheet(data);
}

function toCsv(rows) {
    const flat = rows.map((r) => flattenRow(r));
    if (!flat.length) return '';
    const keys = [];
    flat.forEach((r) => {
        Object.keys(r).forEach((k) => {
            if (!keys.includes(k)) keys.push(k);
        });
    });
    const lines = [keys.join(',')];
    flat.forEach((r) => {
        lines.push(keys.map((k) => `"${String(r[k] != null ? r[k] : '').replace(/"/g, '""')}"`).join(','));
    });
    return lines.join('\n');
}

function toXlsxBuffer(rows, sheetName) {
    const wb = XLSX.utils.book_new();
    let name = String(sheetName || 'Report')
        .replace(/[\\\/\?\*\:\[\]]/g, '')
        .substring(0, 31);
    if (!name) name = 'Report';
    XLSX.utils.book_append_sheet(wb, rowsToSheet(rows), name);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function toHtmlTable(rows, title, eventName) {
    const flat = rows.map((r) => flattenRow(r));
    const evName = eventName || 'Autism Awareness Program 2026';
    const genTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';

    if (!flat.length) {
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;padding:20px;text-align:center;color:#333}h1{color:#1e3a5f;}h2{color:#475569;font-size:16px;}</style></head>
<body><h1>Vaidya Gogate Memorial Foundation</h1><h2>${escapeHtml(evName)}</h2><h3>${escapeHtml(title)}</h3><p>No data available</p></body></html>`;
    }
    const keys = [];
    flat.forEach((r) => {
        Object.keys(r).forEach((k) => {
            if (!keys.includes(k)) keys.push(k);
        });
    });
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: landscape; margin: 15mm 10mm 15mm 10mm; }
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:0;color:#333}
.no-print{background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-family:sans-serif;}
.no-print button{background:#1e3a5f;color:white;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;}
.no-print button:hover{background:#11223b;}
.header{text-align:center;margin:20px 0;border-bottom:2px solid #1e3a5f;padding-bottom:10px}
.header h1{margin:0;font-size:18px;color:#1e3a5f;text-transform:uppercase;letter-spacing:1px}
.header h2{margin:5px 0 0 0;font-size:13px;color:#475569;font-weight:600}
.header .report-title{margin-top:5px;font-size:12px;font-weight:bold;color:#0f766e}
table{border-collapse:collapse;width:100%;font-size:8px;table-layout:auto}
th,td{border:1px solid #cbd5e1;padding:4px 5px;text-align:left;word-wrap:break-word;max-width:120px}
th{background:#1e3a5f;color:#fff;font-weight:600;text-transform:uppercase;font-size:8px}
tr:nth-child(even){background:#f8fafc}
.footer{position:fixed;bottom:-5px;left:0;right:0;display:flex;justify-content:space-between;font-size:8px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:4px}
@media print{
    .no-print{display:none !important;}
    .header{margin-top:0;}
    .footer{position:fixed;bottom:-5px;}
}
</style></head><body>
<div class="no-print">
    <span><strong>Print Report:</strong> Use your browser's print dialog (Ctrl+P) and select "Save as PDF" to generate the landscape PDF.</span>
    <button onclick="window.print()">Print / Save as PDF</button>
</div>
<div class="header">
    <h1>Vaidya Gogate Memorial Foundation</h1>
    <h2>${escapeHtml(evName)}</h2>
    <div class="report-title">${escapeHtml(title)}</div>
</div>
<table><thead><tr><th>S.No.</th>`;
    keys.forEach((k) => {
        html += `<th>${escapeHtml(k)}</th>`;
    });
    html += '</tr></thead><tbody>';
    flat.forEach((r, idx) => {
        html += '<tr>';
        html += `<td>${idx + 1}</td>`;
        keys.forEach((k) => {
            html += `<td>${escapeHtml(r[k])}</td>`;
        });
        html += '</tr>';
    });
    html += `</tbody></table>
<div class="footer">
    <span>Autogenerated on ${escapeHtml(genTime)} (Computer generated document)</span>
    <span>Vaidya Gogate Memorial Foundation</span>
</div>
</body></html>`;
    return html;
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const REPORT_QUERIES = {
    pending: {
        sql: `SELECT r.application_no, r.status, r.created_at, r.form_data,
              u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone
              FROM registrations r JOIN users u ON u.id = r.user_id
              WHERE r.seminar_id = ? AND r.status NOT IN ('completed','checked_in','cancelled','rejected')`,
        title: 'Pending registrations'
    },
    paid: {
        sql: `SELECT r.application_no, r.status, r.form_data, u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone,
              o.order_id_string, o.amount, o.payment_date, o.payment_gateway, o.status AS order_status
              FROM registrations r JOIN users u ON u.id = r.user_id
              JOIN orders o ON o.registration_id = r.id AND o.status = 'success' WHERE r.seminar_id = ?`,
        title: 'Paid registrations'
    },
    unpaid: {
        sql: `SELECT r.application_no, r.status, r.form_data, u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone
              FROM registrations r JOIN users u ON u.id = r.user_id
              LEFT JOIN orders o ON o.registration_id = r.id AND o.status = 'success'
              WHERE r.seminar_id = ? AND o.id IS NULL AND r.status NOT IN ('cancelled','rejected')`,
        title: 'Unpaid registrations'
    },
    checked_in: {
        sql: `SELECT u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone,
              r.application_no, r.status, r.form_data, t.ticket_id_string, t.scan_time, t.is_scanned
              FROM tickets t JOIN orders o ON o.id = t.order_id
              JOIN registrations r ON r.id = o.registration_id JOIN users u ON u.id = r.user_id
              WHERE r.seminar_id = ? AND t.is_scanned = 1`,
        title: 'Checked in'
    },
    cert_eligible: {
        sql: `SELECT u.user_id_string, u.first_name, u.last_name, u.email, uc.display_name, uc.enabled, uc.scan_verified,
              r.application_no, r.form_data
              FROM user_certificates uc JOIN users u ON u.id = uc.user_id
              LEFT JOIN registrations r ON r.user_id = uc.user_id AND r.seminar_id = uc.seminar_id
              WHERE uc.seminar_id = ? AND uc.scan_verified = 1`,
        title: 'Certificate eligible'
    },
    all_participants: {
        sql: `SELECT r.application_no, r.status, r.created_at, r.form_data,
              u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone,
              o.order_id_string, o.amount, o.status AS order_status, o.payment_date,
              t.ticket_id_string, t.is_scanned, t.scan_time
              FROM registrations r
              JOIN users u ON u.id = r.user_id
              LEFT JOIN orders o ON o.registration_id = r.id AND o.status = 'success'
              LEFT JOIN tickets t ON t.order_id = o.id
              WHERE r.seminar_id = ? AND r.status NOT IN ('cancelled','rejected')
              ORDER BY u.last_name, u.first_name`,
        title: 'All participants'
    },
    confirmed: {
        sql: CONFIRMED_EXPORT_SQL,
        title: 'Confirmed participants (approved + paid + verified)',
        postFilter: filterConfirmedRows
    },
    pending_verification: {
        sql: `SELECT r.application_no, r.status, r.created_at, r.form_data, r.doc_review_json,
              u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone
              FROM registrations r JOIN users u ON u.id = r.user_id
              WHERE r.seminar_id = ?
                AND r.status IN ('submitted','pending_approval','revision_required')
              ORDER BY r.created_at DESC`,
        title: 'Pending verification'
    },
    attendance: {
        sql: `SELECT u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone,
              r.application_no, r.status, r.form_data, t.ticket_id_string, t.is_scanned, t.scan_time,
              o.payment_date, o.status AS order_status
              FROM registrations r
              JOIN users u ON u.id = r.user_id
              INNER JOIN orders o ON o.registration_id = r.id AND o.status = 'success'
              LEFT JOIN tickets t ON t.order_id = o.id
              WHERE r.seminar_id = ?
              ORDER BY t.is_scanned DESC, u.last_name`,
        title: 'Attendance sheet'
    },
    check_in: {
        sql: `SELECT u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone,
              r.application_no, r.form_data, t.ticket_id_string, t.scan_time
              FROM tickets t JOIN orders o ON o.id = t.order_id
              JOIN registrations r ON r.id = o.registration_id JOIN users u ON u.id = r.user_id
              WHERE r.seminar_id = ? AND t.is_scanned = 1
              ORDER BY t.scan_time DESC`,
        title: 'Check-in report'
    },
    finance: {
        sql: `SELECT o.order_id_string, o.status, o.amount, o.payment_date, o.payment_gateway, o.created_at,
              r.application_no, r.status AS registration_status, u.user_id_string,
              u.first_name, u.last_name, u.email, u.phone
              FROM orders o
              JOIN registrations r ON r.id = o.registration_id
              JOIN users u ON u.id = r.user_id
              WHERE r.seminar_id = ?
              ORDER BY o.created_at DESC`,
        title: 'Finance report'
    },
    certificate_report: {
        sql: `SELECT u.user_id_string, u.first_name, u.last_name, u.email,
              uc.display_name, uc.enabled, uc.scan_verified, uc.updated_at,
              r.application_no, r.form_data, r.status
              FROM user_certificates uc
              JOIN users u ON u.id = uc.user_id
              LEFT JOIN registrations r ON r.user_id = uc.user_id AND r.seminar_id = uc.seminar_id
              WHERE uc.seminar_id = ?
              ORDER BY u.last_name`,
        title: 'Certificate report'
    },
    preregistrations: {
        sql: `SELECT p.application_no, p.status, p.created_at, p.updated_at, p.form_data,
              u.user_id_string, u.first_name, u.middle_name, u.last_name, u.email, u.phone
              FROM preregistrations p JOIN users u ON u.id = p.user_id
              WHERE p.seminar_id = ?
              ORDER BY p.created_at DESC`,
        title: 'Pre-registrations'
    },
    competition_report: {
        sql: `SELECT cs.application_no, cs.title, cs.category, cs.description, cs.status, cs.admin_notes, cs.created_at,
              u.user_id_string, u.first_name, u.last_name, u.email, u.phone,
              cf.file_path, cf.original_name, cf.file_type, cf.status AS file_status
              FROM competition_submissions cs
              JOIN users u ON u.id = cs.user_id
              LEFT JOIN competition_files cf ON cf.submission_id = cs.id
              WHERE cs.seminar_id = ?
              ORDER BY cs.created_at DESC`,
        title: 'Competition report'
    }
};

module.exports = {
    REPORT_QUERIES,
    parseFormData,
    flattenRow,
    toCsv,
    toXlsxBuffer,
    toHtmlTable
};
