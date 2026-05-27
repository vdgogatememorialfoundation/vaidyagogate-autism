const { Pool } = require('pg');
const { buildPgPoolOptions, resolveDatabaseUrl } = require('../lib/env-db');
const certRender = require('../lib/certificate-render');
const branding = require('../lib/branding');

const url = resolveDatabaseUrl();
const pool = new Pool(buildPgPoolOptions(url));

function loadCmsVenue(cb) {
    pool.query(`SELECT value FROM global_settings WHERE key = 'public_site_cms'`, []).then((r) => {
        const row = r.rows[0];
        if (!row || !row.value) return cb(null, '');
        try {
            const cms = JSON.parse(row.value);
            cb(null, (cms.hero && cms.hero.venue) || (cms.contact && cms.contact.address) || '');
        } catch (_) {
            cb(null, '');
        }
    }).catch((e) => cb(e));
}

function loadLogoUrl(cb) {
    const shim = {
        get(sql, params, callback) {
            pool.query(sql, params)
                .then((res) => callback(null, res.rows[0]))
                .catch((e) => callback(e));
        }
    };
    branding.loadSiteLogoDataUrl(shim, (e, dataUrl) => {
        if (e || !dataUrl) {
            return pool
                .query(`SELECT value FROM global_settings WHERE key = 'site_logo_path'`, [])
                .then((res) => {
                    const row = res.rows[0];
                    if (row && row.value) return cb(null, row.value);
                    cb(null, '');
                })
                .catch((e2) => cb(e2));
        }
        cb(null, dataUrl);
    });
}

const sql = `SELECT uc.*, s.title AS seminar_title, s.description AS seminar_description, s.event_date, s.location_url,
                ct.file_path AS template_path, ct.cert_type, ct.config_json,
                r.form_data, r.application_no, u.user_id_string, u.email, u.phone
         FROM user_certificates uc
         JOIN seminars s ON s.id = uc.seminar_id
         JOIN users u ON u.id = uc.user_id
         LEFT JOIN certificate_templates ct ON ct.id = uc.template_id
         LEFT JOIN registrations r ON r.id = uc.registration_id
         WHERE uc.id = 1 AND uc.user_id = 2 AND uc.enabled = 1`;

pool
    .query(sql)
    .then((r) => {
        const row = r.rows[0];
        loadCmsVenue((eVenue, cmsVenue) => {
            if (eVenue) return console.error('venue err', eVenue.message);
            loadLogoUrl((eLogo, logoUrl) => {
                if (eLogo) return console.error('logo err', eLogo.message);
                console.log('logo len', (logoUrl || '').length);
                try {
                    const ctx = certRender.buildRenderContext(row, 'participant', cmsVenue, logoUrl);
                    const html = certRender.renderCertificateHtml(ctx);
                    console.log('OK html', html.length);
                } catch (e) {
                    console.error('RENDER', e.message, e.stack);
                }
                pool.end();
            });
        });
    })
    .catch((e) => {
        console.error('SQL', e.message);
        pool.end();
    });
