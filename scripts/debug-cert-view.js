/**
 * Debug certificate view render against DATABASE_URL.
 * Usage: node scripts/debug-cert-view.js [uc] [uid]
 */
const { Pool } = require('pg');
const { buildPgPoolOptions, resolveDatabaseUrl } = require('../lib/env-db');
const certRender = require('../lib/certificate-render');

const uc = parseInt(process.argv[2] || '1', 10);
const uid = parseInt(process.argv[3] || '2', 10);

const url = resolveDatabaseUrl();
if (!url) {
    console.error('DATABASE_URL required');
    process.exit(1);
}

const pool = new Pool(buildPgPoolOptions(url));

const sql = `SELECT uc.*, s.title AS seminar_title, s.description AS seminar_description, s.event_date, s.location_url,
                ct.file_path AS template_path, ct.cert_type, ct.config_json,
                r.form_data, r.application_no, u.user_id_string, u.email, u.phone
         FROM user_certificates uc
         JOIN seminars s ON s.id = uc.seminar_id
         JOIN users u ON u.id = uc.user_id
         LEFT JOIN certificate_templates ct ON ct.id = uc.template_id
         LEFT JOIN registrations r ON r.id = uc.registration_id
         WHERE uc.id = $1 AND uc.user_id = $2 AND uc.enabled = 1`;

pool
    .query(sql, [uc, uid])
    .then((r) => {
        const row = r.rows[0];
        if (!row) {
            console.log('NO_ROW');
            return;
        }
        console.log('row', {
            template_path: row.template_path,
            verify_token: row.verify_token ? 'yes' : 'no',
            config_json_type: typeof row.config_json
        });
        try {
            const ctx = certRender.buildRenderContext(row, 'participant', '', '');
            console.log('ctx ok', ctx.title, ctx.bodyLine ? 'body ok' : 'no body');
            const html = certRender.renderCertificateHtml(ctx);
            console.log('html len', html.length);
        } catch (e) {
            console.error('RENDER_ERR', e.message);
            console.error(e.stack);
            process.exitCode = 1;
        }
    })
    .catch((e) => {
        console.error('SQL_ERR', e.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
