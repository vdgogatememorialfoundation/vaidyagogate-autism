/**
 * Admin-stored API keys (global_settings.integration_secrets).
 * Merged with process.env — DB values override env when set.
 */
const SETTINGS_KEY = 'integration_secrets';

let runtime = {};
let transporterReset = null;
let integrationSettingsLoaded = false;

function registerTransporterReset(fn) {
    transporterReset = fn;
}

function applyToProcessEnv(data) {
    const d = data || {};
    if (d.zepto_api_key) process.env.ZEPTOMAIL_API_KEY = normalizeApiKey(d.zepto_api_key);
    if (d.zepto_from) process.env.ZEPTO_FROM = d.zepto_from;
    if (d.zepto_from_name) process.env.ZEPTO_FROM_NAME = d.zepto_from_name;
    if (d.zepto_region) process.env.ZEPTOMAIL_REGION = d.zepto_region;
    if (d.whatsapp_token) process.env.WHATSAPP_TOKEN = d.whatsapp_token;
    if (d.whatsapp_phone_number_id) process.env.WHATSAPP_PHONE_NUMBER_ID = d.whatsapp_phone_number_id;
    if (d.whatsapp_business_account_id) {
        process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = d.whatsapp_business_account_id;
    }
    if (d.whatsapp_verify_token) process.env.WHATSAPP_VERIFY_TOKEN = d.whatsapp_verify_token;
    if (d.whatsapp_template_lang) process.env.WHATSAPP_TEMPLATE_LANG = d.whatsapp_template_lang;
    if (d.whatsapp_otp_template_name) {
        process.env.WHATSAPP_OTP_TEMPLATE_NAME = d.whatsapp_otp_template_name;
    }
    if (d.msg91_auth_key) process.env.MSG91_AUTH_KEY = String(d.msg91_auth_key).trim();
    if (d.msg91_sender_id) process.env.MSG91_SENDER_ID = String(d.msg91_sender_id).trim();
    if (d.msg91_route) process.env.MSG91_ROUTE = String(d.msg91_route).trim();
    if (d.msg91_otp_template_id) process.env.MSG91_OTP_TEMPLATE_ID = String(d.msg91_otp_template_id).trim();
    if (d.msg91_default_flow_id) process.env.MSG91_DEFAULT_FLOW_ID = String(d.msg91_default_flow_id).trim();
    if (d.msg91_country_code) process.env.MSG91_COUNTRY_CODE = String(d.msg91_country_code).trim();
    if (d.otp_email_subject) process.env.OTP_EMAIL_SUBJECT = d.otp_email_subject;
    if (d.public_base_url) process.env.PUBLIC_BASE_URL = d.public_base_url;
    if (d.admin_contact_email) process.env.ADMIN_CONTACT_EMAIL = d.admin_contact_email;
    if (d.seminar_host) process.env.SEMINAR_HOST = d.seminar_host;
    if (d.admin_host) process.env.ADMIN_HOST = d.admin_host;
    if (d.judge_host) process.env.JUDGE_HOST = d.judge_host;
    if (d.wix_site_url) process.env.WIX_SITE_URL = d.wix_site_url;
}

function setRuntimeIntegrations(data) {
    runtime = { ...(data || {}) };
    applyToProcessEnv(runtime);
    if (typeof transporterReset === 'function') transporterReset();
    integrationSettingsLoaded = true;
}

function getRuntimeIntegrations() {
    return { ...runtime };
}

function normalizeEmail(v) {
    return String(v || '')
        .trim()
        .toLowerCase();
}

function normalizeApiKey(raw) {
    let key = String(raw || '').trim();
    key = key.replace(/^zoho-enczapikey\s*:?\s*/i, '');
    key = key.replace(/^["']|["']$/g, '');
    return key.replace(/\s+/g, '').trim();
}

function resolveZeptoApiKey(o) {
    let apiKey =
        o.zepto_api_key != null
            ? String(o.zepto_api_key)
            : runtime.zepto_api_key ||
              process.env.ZEPTOMAIL_API_KEY ||
              process.env.ZEPTO_API_KEY ||
              '';
    apiKey = normalizeApiKey(apiKey);
    if (isMaskedSecretValue(apiKey) || !apiKey) {
        apiKey = normalizeApiKey(
            runtime.zepto_api_key || process.env.ZEPTOMAIL_API_KEY || process.env.ZEPTO_API_KEY || ''
        );
    }
    return apiKey;
}

function getMailConfig(overrides) {
    const o = overrides || {};
    const apiKey = resolveZeptoApiKey(o);
    const from = normalizeEmail(
        o.zepto_from ||
            runtime.zepto_from ||
            process.env.ZEPTO_FROM ||
            process.env.ZEPTOMAIL_FROM ||
            o.zoho_from ||
            runtime.zoho_from ||
            process.env.ZOHO_FROM ||
            ''
    );
    const fromName = String(
        o.zepto_from_name ||
            runtime.zepto_from_name ||
            process.env.ZEPTO_FROM_NAME ||
            'Vaidya Gogate Memorial Foundation'
    ).trim();
    if (apiKey && from) {
        const region = String(
            o.zepto_region || runtime.zepto_region || process.env.ZEPTOMAIL_REGION || 'in'
        )
            .trim()
            .toLowerCase();
        return {
            provider: 'zeptomail',
            apiKey,
            from,
            fromName,
            region: region || 'in'
        };
    }
    return null;
}

function isEmailConfiguredFromSettings() {
    return !!getMailConfig();
}

function isWhatsAppConfiguredFromSettings() {
    const token = String(runtime.whatsapp_token || process.env.WHATSAPP_TOKEN || '').trim();
    const phoneId = String(
        runtime.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || ''
    ).trim();
    return !!(token && phoneId);
}

function isMsg91ConfiguredFromSettings() {
    const authKey = String(runtime.msg91_auth_key || process.env.MSG91_AUTH_KEY || '').trim();
    return !!authKey;
}

function getMsg91ConfigStatus() {
    const authKey = String(runtime.msg91_auth_key || process.env.MSG91_AUTH_KEY || '').trim();
    const senderId = String(runtime.msg91_sender_id || process.env.MSG91_SENDER_ID || '').trim();
    const otpTpl = String(
        runtime.msg91_otp_template_id || process.env.MSG91_OTP_TEMPLATE_ID || ''
    ).trim();
    const flowId = String(runtime.msg91_default_flow_id || process.env.MSG91_DEFAULT_FLOW_ID || '').trim();
    const missing = [];
    if (!authKey) missing.push('MSG91 Auth Key');
    if (!senderId) missing.push('Sender ID (DLT)');
    if (!otpTpl) missing.push('OTP template / flow ID');
    if (!flowId) missing.push('Default flow ID (for update SMS)');
    return {
        configured: !!authKey,
        ready: !!(authKey && senderId && (otpTpl || flowId)),
        missing
    };
}

function getWhatsAppConfigStatus() {
    const token = String(runtime.whatsapp_token || process.env.WHATSAPP_TOKEN || '').trim();
    const phoneId = String(
        runtime.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || ''
    ).trim();
    const missing = [];
    if (!token) missing.push('WhatsApp access token');
    if (!phoneId) missing.push('Phone number ID');
    return {
        configured: missing.length === 0,
        missing,
        hasOtpTemplateHint:
            'OTP Meta template name is separate — set it on OTP_VERIFICATION in Notifications or WHATSAPP_OTP_TEMPLATE_NAME env.'
    };
}

function getWhatsAppConfig() {
    return {
        token: runtime.whatsapp_token || process.env.WHATSAPP_TOKEN || '',
        phoneNumberId: runtime.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        businessAccountId:
            runtime.whatsapp_business_account_id || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
        verifyToken: runtime.whatsapp_verify_token || process.env.WHATSAPP_VERIFY_TOKEN || '',
        templateLang: runtime.whatsapp_template_lang || process.env.WHATSAPP_TEMPLATE_LANG || 'en'
    };
}

function getEventWhatsAppTemplateLang(eventKey) {
    const key = String(eventKey || '').trim();
    const map =
        runtime.whatsapp_event_templates && typeof runtime.whatsapp_event_templates === 'object'
            ? runtime.whatsapp_event_templates
            : {};
    const row = map[key];
    if (row && row.lang) return String(row.lang).trim();
    return getWhatsAppConfig().templateLang || 'en';
}

/** All verify strings accepted for Meta webhook GET (primary + optional env alternates). */
function getWhatsAppVerifyCandidates() {
    const cfg = getWhatsAppConfig();
    const raw = [
        cfg.verifyToken,
        process.env.WHATSAPP_VERIFY_TOKEN,
        process.env.WHATSAPP_VERIFY_TOKEN_ALT,
        process.env.WHATSAPP_VERIFY_TOKEN_EXTRA
    ];
    const out = [];
    raw.forEach((v) => {
        String(v || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((t) => {
                if (!out.includes(t)) out.push(t);
            });
    });
    return out;
}

function matchesWhatsAppVerifyToken(provided) {
    const t = String(provided || '').trim();
    if (!t) return false;
    return getWhatsAppVerifyCandidates().some((c) => c === t);
}

function portalScheme() {
    return process.env.PORTAL_SCHEME === 'http' ? 'http' : 'https';
}

function originFromHost(host) {
    const h = String(host || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0];
    if (!h) return '';
    return `${portalScheme()}://${h}`;
}

function getPublicBaseUrl() {
    const direct =
        runtime.public_base_url ||
        process.env.PUBLIC_BASE_URL ||
        process.env.SITE_URL ||
        process.env.MAIN_SITE_URL;
    if (direct) return String(direct).replace(/\/$/, '');

    const fromHost = originFromHost(
        runtime.seminar_host || process.env.APPLICANT_HOST || process.env.SEMINAR_HOST
    );
    if (fromHost) return fromHost;

    if (process.env.RENDER_EXTERNAL_URL) {
        return String(process.env.RENDER_EXTERNAL_URL).replace(/\/$/, '');
    }
    if (process.env.VERCEL_URL) {
        return `https://${String(process.env.VERCEL_URL).replace(/\/$/, '')}`;
    }

    return 'http://localhost:3000';
}

/** Meta webhook callback host — autism uses shared seminar infrastructure. */
function getWhatsAppWebhookBaseUrl() {
    const env = process.env.WHATSAPP_WEBHOOK_BASE_URL;
    if (env && String(env).trim()) return String(env).replace(/\/$/, '');
    try {
        const { FEATURES } = require('./portal-product');
        if (FEATURES && FEATURES.productId === 'autism') {
            return 'https://seminar.vaidyagogate.org';
        }
    } catch (_) {}
    const base = getPublicBaseUrl();
    return (base && String(base).replace(/\/$/, '')) || 'https://seminar.vaidyagogate.org';
}

function getWhatsAppWebhookUrl() {
    return getWhatsAppWebhookBaseUrl() + '/api/webhooks/whatsapp';
}

const SECRET_FIELDS = ['zepto_api_key', 'whatsapp_token', 'whatsapp_verify_token', 'msg91_auth_key'];

function maskSecretsForClient(data) {
    const out = { ...(data || {}) };
    SECRET_FIELDS.forEach((k) => {
        if (out[k]) out[k] = '********';
    });
    if (out.zoho_pass) delete out.zoho_pass;
    return out;
}

function isMaskedSecretValue(v) {
    if (v === undefined || v === null) return true;
    const s = String(v).trim();
    if (!s) return true;
    if (s === '********' || /^[\*•·]+$/.test(s)) return true;
    return false;
}

function stripLegacySmtpFields(out) {
    delete out.zoho_host;
    delete out.zoho_port;
    delete out.zoho_user;
    delete out.zoho_pass;
    if (out.zepto_from) delete out.zoho_from;
    return out;
}

function mergeSavePayload(existing, incoming) {
    const out = { ...(existing || {}) };
    Object.keys(incoming || {}).forEach((k) => {
        let v = incoming[k];
        if (v === undefined || v === null) return;
        if (SECRET_FIELDS.includes(k) && (isMaskedSecretValue(v) || String(v).trim() === '')) return;
        if (k === 'zepto_from' || k === 'admin_contact_email') v = normalizeEmail(v);
        if (k === 'zepto_api_key' && typeof v === 'string') v = normalizeApiKey(v);
        if (k === 'zepto_from_name' && typeof v === 'string') v = v.trim();
        if (k === 'zepto_region' && typeof v === 'string') v = v.trim().toLowerCase() || 'in';
        out[k] = v;
    });
    if (!out.zepto_from && out.zoho_from) out.zepto_from = normalizeEmail(out.zoho_from);
    return stripLegacySmtpFields(out);
}

function getMailConfigSummary() {
    const cfg = getMailConfig();
    if (!cfg) {
        const st = getEmailConfigStatus();
        return { configured: false, missing: st.missing || [] };
    }
    return {
        configured: true,
        provider: 'zeptomail',
        from: cfg.from,
        fromName: cfg.fromName,
        region: cfg.region || 'in'
    };
}

/** Reload integration_secrets from DB (needed on Vercel serverless before OTP/email). */
function ensureIntegrationSettingsLoaded(db, cb) {
    if (integrationSettingsLoaded) return cb(null);
    loadFromDb(db, cb);
}

function getEmailConfigStatus() {
    const rt = getRuntimeIntegrations();
    const apiKey =
        rt.zepto_api_key || process.env.ZEPTOMAIL_API_KEY || process.env.ZEPTO_API_KEY || '';
    const from =
        rt.zepto_from ||
        process.env.ZEPTO_FROM ||
        process.env.ZEPTOMAIL_FROM ||
        rt.zoho_from ||
        process.env.ZOHO_FROM ||
        '';
    const missing = [];
    if (!String(apiKey).trim()) missing.push('ZeptoMail API key');
    if (!String(from).trim()) missing.push('From address');
    return {
        configured: missing.length === 0,
        missing,
        provider: 'zeptomail'
    };
}

function loadFromDb(db, cb) {
    db.get(`SELECT value FROM global_settings WHERE key = ?`, [SETTINGS_KEY], (err, row) => {
        if (err) return cb && cb(err);
        let data = {};
        if (row && row.value) {
            try {
                data = JSON.parse(row.value);
            } catch (_) {
                data = {};
            }
        }
        if (!data.zepto_from && data.zoho_from) data.zepto_from = normalizeEmail(data.zoho_from);
        setRuntimeIntegrations(data);
        cb && cb(null, data);
    });
}

function saveToDb(db, payload, cb) {
    db.get(`SELECT value FROM global_settings WHERE key = ?`, [SETTINGS_KEY], (err, row) => {
        if (err) return cb && cb(err);
        let existing = {};
        if (row && row.value) {
            try {
                existing = JSON.parse(row.value);
            } catch (_) {
                existing = {};
            }
        }
        const merged = mergeSavePayload(existing, payload);
        const json = JSON.stringify(merged);
        db.run(`UPDATE global_settings SET value = ? WHERE key = ?`, [json, SETTINGS_KEY], function (uerr) {
            if (uerr) return cb && cb(uerr);
            if (this.changes > 0) {
                setRuntimeIntegrations(merged);
                return cb && cb(null, merged);
            }
            db.run(`INSERT INTO global_settings (key, value) VALUES (?, ?)`, [SETTINGS_KEY, json], (ierr) => {
                if (ierr) return cb && cb(ierr);
                setRuntimeIntegrations(merged);
                cb && cb(null, merged);
            });
        });
    });
}

function seedSettingKeyIfMissing(db, next) {
    db.get(`SELECT 1 AS ok FROM global_settings WHERE key = ?`, [SETTINGS_KEY], (e, row) => {
        if (e) return next && next(e);
        if (row && row.ok) return next && next();
        db.run(`INSERT INTO global_settings (key, value) VALUES (?, ?)`, [SETTINGS_KEY, '{}'], () => next && next());
    });
}

/** Ensure autism.vaidyagogate.org URLs are set when integration settings are empty. */
function ensureAutismPortalIntegrationDefaults(db, cb) {
    loadFromDb(db, (err, data) => {
        if (err) return cb && cb(err);
        const d = data || {};
        const patch = {};
        const { DEFAULTS } = require('./portal-urls');
        if (!String(d.public_base_url || '').trim()) patch.public_base_url = DEFAULTS.mainSiteUrl;
        if (!String(d.seminar_host || '').trim()) patch.seminar_host = DEFAULTS.siteHost;
        if (!String(d.zepto_from_name || '').trim()) {
            patch.zepto_from_name = 'Vaidya Gogate Memorial Foundation';
        }
        if (!Object.keys(patch).length) return cb && cb(null, d);
        saveToDb(db, patch, cb);
    });
}

module.exports = {
    SETTINGS_KEY,
    registerTransporterReset,
    setRuntimeIntegrations,
    getRuntimeIntegrations,
    getMailConfig,
    isEmailConfiguredFromSettings,
    isWhatsAppConfiguredFromSettings,
    isMsg91ConfiguredFromSettings,
    getMsg91ConfigStatus,
    getWhatsAppConfigStatus,
    getWhatsAppConfig,
    getEventWhatsAppTemplateLang,
    getPublicBaseUrl,
    getWhatsAppWebhookBaseUrl,
    getWhatsAppWebhookUrl,
    getEmailConfigStatus,
    maskSecretsForClient,
    isMaskedSecretValue,
    mergeSavePayload,
    normalizeEmail,
    getMailConfigSummary,
    loadFromDb,
    ensureIntegrationSettingsLoaded,
    saveToDb,
    seedSettingKeyIfMissing,
    ensureAutismPortalIntegrationDefaults,
    getWhatsAppVerifyCandidates,
    matchesWhatsAppVerifyToken
};
