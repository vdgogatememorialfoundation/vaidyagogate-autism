/**
 * Editable certificate template fields (stored as JSON on certificate_templates).
 * Placeholders: {{recipient_name}}, {{seminar_title}}, {{topic}}, {{venue}}, {{date}}, {{prn_no}}, {{application_no}}
 */
const portalProduct = require('./portal-product');

const DEFAULT_CONFIG = {
    orgName: 'Vaidya Gogate Memorial Foundation',
    title: 'CERTIFICATE',
    subtitle: 'OF PARTICIPATION',
    leadText: 'This certificate is given to',
    bodyParticipant:
        'For participation in <strong>{{seminar_title}}</strong> on &ldquo;<em>{{topic}}</em>&rdquo; hosted by the Vaidya Gogate Memorial Foundation',
    bodyVolunteer:
        'For Volunteering at <strong>{{seminar_title}}</strong> on &ldquo;<em>{{topic}}</em>&rdquo; hosted by the Vaidya Gogate Memorial Foundation',
    venueLabel: 'Venue',
    dateLabel: 'Date',
    venueOverride: '',
    dateOverride: '',
    sigLeftTitle: 'VD. Gogate Memorial Foundation',
    sigRightName: 'Dr. Chandrakumar Deshmukh',
    sigRightTitle: 'Organising Secretary',
    sigLeftImagePath: '',
    sigRightImagePath: '',
    goldColor: '#c9a227',
    nameColor: '#c45c26',
    charcoalColor: '#4a4a4a',
    bgColor: '#f3f3f3',
    showFlame: true,
    showSwooshes: true,
    autoHonorific: true
};

/** Autism Awareness Programme — participant-friendly layout (no medical / VGMF seminar styling). */
const AUTISM_DEFAULT_CONFIG = {
    orgName: 'Vaidya Gogate Memorial Foundation',
    title: 'CERTIFICATE',
    subtitle: 'OF PARTICIPATION',
    leadText: 'This certificate is proudly presented to',
    bodyParticipant:
        'For participating in the <strong>Autism Awareness Programme</strong> — <strong>{{seminar_title}}</strong> on &ldquo;<em>{{topic}}</em>&rdquo;',
    bodyVolunteer:
        'For volunteering at the <strong>Autism Awareness Programme</strong> — <strong>{{seminar_title}}</strong> on &ldquo;<em>{{topic}}</em>&rdquo;',
    venueLabel: 'Venue',
    dateLabel: 'Date',
    venueOverride: '',
    dateOverride: '',
    sigLeftTitle: 'Programme Coordinator',
    sigRightName: 'Vaidya Gogate Memorial Foundation',
    sigRightTitle: 'Organising Team',
    sigLeftImagePath: '',
    sigRightImagePath: '',
    goldColor: '#38bdf8',
    nameColor: '#0f766e',
    charcoalColor: '#1e3a8a',
    bgColor: '#f0fdfa',
    showFlame: false,
    showSwooshes: false,
    autoHonorific: false
};

function defaultConfigForProduct() {
    return portalProduct.FEATURES && portalProduct.FEATURES.productId === 'autism'
        ? { ...AUTISM_DEFAULT_CONFIG }
        : { ...DEFAULT_CONFIG };
}

function parseConfig(json) {
    const base = defaultConfigForProduct();
    if (!json) return base;
    try {
        const o = typeof json === 'string' ? JSON.parse(json) : json;
        return { ...base, ...(o && typeof o === 'object' ? o : {}) };
    } catch (_) {
        return base;
    }
}

function stringifyConfig(cfg) {
    const base = defaultConfigForProduct();
    return JSON.stringify({ ...base, ...(cfg && typeof cfg === 'object' ? cfg : {}) });
}

function applyPlaceholders(template, vars) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
        vars[key] != null ? String(vars[key]) : ''
    );
}

function ensureConfigJsonColumn(db, ignoreErr, next) {
    const pg = !!process.env.DATABASE_URL;
    const cols = pg
        ? [
              'ALTER TABLE certificate_templates ADD COLUMN IF NOT EXISTS config_json TEXT',
              'ALTER TABLE certificate_templates ADD COLUMN IF NOT EXISTS signature_left_path TEXT',
              'ALTER TABLE certificate_templates ADD COLUMN IF NOT EXISTS signature_right_path TEXT'
          ]
        : [
              'ALTER TABLE certificate_templates ADD COLUMN config_json TEXT',
              'ALTER TABLE certificate_templates ADD COLUMN signature_left_path TEXT',
              'ALTER TABLE certificate_templates ADD COLUMN signature_right_path TEXT'
          ];
    let i = 0;
    const step = () => {
        if (i >= cols.length) return next && next();
        db.run(cols[i++], (e) => {
            if (ignoreErr) ignoreErr(e);
            step();
        });
    };
    step();
}

module.exports = {
    DEFAULT_CONFIG,
    AUTISM_DEFAULT_CONFIG,
    defaultConfigForProduct,
    parseConfig,
    stringifyConfig,
    applyPlaceholders,
    ensureConfigJsonColumn
};
