/**
 * Transactional email via Zoho ZeptoMail HTTP API.
 * Env: ZEPTOMAIL_API_KEY, ZEPTO_FROM, ZEPTO_FROM_NAME, ZEPTOMAIL_REGION (in|com|eu|auto)
 */
const axios = require('axios');
const integrationSettings = require('./integration-settings');

const ZEPTO_ENDPOINTS = {
    in: 'https://api.zeptomail.in/v1.1/email',
    com: 'https://api.zeptomail.com/v1.1/email',
    eu: 'https://api.zeptomail.eu/v1.1/email'
};

integrationSettings.registerTransporterReset(() => {});

function mailConfig(overrides) {
    return integrationSettings.getMailConfig(overrides);
}

function isEmailConfigured() {
    return integrationSettings.isEmailConfiguredFromSettings();
}

function normalizeApiKey(raw) {
    let key = String(raw || '').trim();
    key = key.replace(/^zoho-enczapikey\s*:?\s*/i, '');
    key = key.replace(/^["']|["']$/g, '');
    return key.replace(/\s+/g, '').trim();
}

function buildAuthHeader(apiKey) {
    const key = normalizeApiKey(apiKey);
    if (!key) return '';
    return 'Zoho-enczapikey ' + key;
}

function apiUrlsForConfig(cfg) {
    const custom = String((cfg && cfg.apiUrl) || process.env.ZEPTOMAIL_API_URL || '').trim();
    if (custom) return [custom.replace(/\/$/, '')];
    const region = String((cfg && cfg.region) || process.env.ZEPTOMAIL_REGION || 'in')
        .trim()
        .toLowerCase();
    if (region === 'com' || region === 'us' || region === 'global') return [ZEPTO_ENDPOINTS.com];
    if (region === 'eu') return [ZEPTO_ENDPOINTS.eu];
    if (region === 'in' || region === 'india') return [ZEPTO_ENDPOINTS.in];
    return [ZEPTO_ENDPOINTS.in, ZEPTO_ENDPOINTS.com];
}

function parseZeptoErrorBody(data) {
    if (!data) return '';
    if (typeof data === 'string') return data;
    const err = data.error;
    if (err && typeof err === 'object') {
        const parts = [];
        if (err.message) parts.push(String(err.message));
        if (Array.isArray(err.details)) {
            err.details.forEach((d) => {
                if (d && d.message) parts.push(String(d.message));
            });
        }
        if (parts.length) return parts.join(' — ');
        if (err.code) return String(err.code);
    }
    if (data.message) return String(data.message);
    try {
        return JSON.stringify(data).slice(0, 400);
    } catch (_) {
        return '';
    }
}

function parseRecipients(raw) {
    return String(raw || '')
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((address) => ({ email_address: { address } }));
}

function mapAttachments(list) {
    if (!Array.isArray(list) || !list.length) return [];
    return list
        .map((att) => {
            const content = att && att.content;
            let b64 = '';
            if (Buffer.isBuffer(content)) b64 = content.toString('base64');
            else if (typeof content === 'string') {
                b64 =
                    att.encoding === 'base64'
                        ? content.replace(/\s/g, '')
                        : Buffer.from(content, 'utf8').toString('base64');
            }
            if (!b64) return null;
            return {
                name: (att && (att.filename || att.name)) || 'attachment',
                content: b64,
                mime_type: (att && (att.contentType || att.mime_type)) || 'application/octet-stream'
            };
        })
        .filter(Boolean);
}

function explainEmailError(err, endpoint) {
    const resp = err && err.response;
    const data = resp && resp.data;
    const apiMsg = parseZeptoErrorBody(data);
    const msg = String(apiMsg || (err && err.message) || err || 'Send failed');
    const lower = msg.toLowerCase();
    const endpointHint = endpoint ? ` (endpoint: ${endpoint})` : '';
    if (resp && (resp.status === 401 || resp.status === 403)) {
        return {
            error: msg + endpointHint,
            hint:
                'ZeptoMail rejected the Send Mail Token. Use the token from Mail Agents → SMTP/API → API tab ' +
                '(not the SMTP password). For India accounts set Region = India (api.zeptomail.in). ' +
                'From email must match a verified sender in that Mail Agent.'
        };
    }
    if (lower.includes('invalid') && (lower.includes('token') || lower.includes('api'))) {
        return {
            error: msg + endpointHint,
            hint:
                'Paste only the Send Mail Token value (without "Zoho-enczapikey" prefix). ' +
                'Save in Admin → Integrations, then Test email.'
        };
    }
    if (lower.includes('from') && (lower.includes('invalid') || lower.includes('verify') || lower.includes('domain'))) {
        return {
            error: msg + endpointHint,
            hint: 'The From address must be a verified sender/domain in your ZeptoMail Mail Agent.'
        };
    }
    if (
        lower.includes('550') ||
        lower.includes('rate') ||
        lower.includes('limit') ||
        lower.includes('quota') ||
        lower.includes('too many')
    ) {
        return {
            error: msg + endpointHint,
            hint: 'ZeptoMail rate or quota limit reached. Use Admin → Email delivery to queue sends, or retry later.'
        };
    }
    return { error: msg + endpointHint, hint: null };
}

async function postZeptoMail(cfg, payload) {
    const urls = apiUrlsForConfig(cfg);
    let lastErr = null;
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            const res = await axios.post(url, payload, {
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Authorization: buildAuthHeader(cfg.apiKey)
                },
                timeout: 45000
            });
            return { ok: true, id: res.data && (res.data.request_id || res.data.data), endpoint: url };
        } catch (e) {
            lastErr = e;
            const status = e.response && e.response.status;
            const authFail = status === 401 || status === 403;
            if (authFail && i < urls.length - 1) continue;
            throw e;
        }
    }
    throw lastErr || new Error('ZeptoMail send failed');
}

/**
 * Verify ZeptoMail config (used by admin test).
 * @param {object} [overrides] optional zepto_* fields from admin form
 */
async function verifyEmailConnection(overrides) {
    const cfg = mailConfig(overrides);
    if (!cfg || !cfg.apiKey) {
        return {
            ok: false,
            skipped: true,
            error: 'Email not configured',
            hint: 'Enter ZeptoMail Send Mail Token and From address, then Save API keys.'
        };
    }
    if (normalizeApiKey(cfg.apiKey).length < 16) {
        return {
            ok: false,
            error: 'API key looks too short',
            hint: 'Use the Send Mail Token from ZeptoMail API tab — not your old SMTP app password.'
        };
    }
    return { ok: true, from: cfg.from, provider: 'zeptomail', region: cfg.region || 'in' };
}

/** @deprecated alias */
const verifySmtpConnection = verifyEmailConnection;

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @param {{ text?: string, smtpOverrides?: object, zeptoOverrides?: object }} [opts]
 */
async function sendEmail(to, subject, html, opts) {
    const overrides = (opts && (opts.zeptoOverrides || opts.smtpOverrides)) || undefined;
    const cfg = mailConfig(overrides);
    if (!cfg || !cfg.apiKey) {
        console.warn('[email] ZeptoMail not configured (ZEPTOMAIL_API_KEY / ZEPTO_FROM).');
        return { ok: false, skipped: true, error: 'Email not configured' };
    }
    const fromAddr = (opts && opts.fromEmail ? String(opts.fromEmail).trim() : '') || cfg.from;
    const fromName =
        (opts && opts.fromDisplay ? String(opts.fromDisplay).trim() : '') ||
        cfg.fromName ||
        'Vaidya Gogate Memorial Foundation';
    const payload = {
        from: { address: fromAddr, name: fromName },
        to: parseRecipients(to),
        subject: String(subject || 'Notification')
    };
    if (html) payload.htmlbody = html;
    if (opts && opts.text) payload.textbody = opts.text;
    if (!payload.htmlbody && !payload.textbody) payload.textbody = String(subject || 'Notification');
    const { autismReplyToAddresses } = require('./autism-email-reply');
    const replyList = autismReplyToAddresses(opts && opts.replyTo);
    if (replyList.length) {
        payload.reply_to = replyList.map((address) => ({ address: String(address).trim() }));
    }
    if (opts && opts.cc) {
        payload.cc = parseRecipients(opts.cc);
    }
    const attachments = mapAttachments(opts && opts.attachments);
    if (attachments.length) payload.attachments = attachments;

    try {
        const res = await postZeptoMail(cfg, payload);
        return { ok: true, id: res.id, endpoint: res.endpoint };
    } catch (e) {
        const endpoint = apiUrlsForConfig(cfg)[0];
        const explained = explainEmailError(e, endpoint);
        const retryable =
            !e.response &&
            (String(explained.error || '')
                .toLowerCase()
                .includes('timeout') ||
                String(explained.error || '')
                    .toLowerCase()
                    .includes('network') ||
                String(explained.error || '')
                    .toLowerCase()
                    .includes('econn'));
        if (retryable && !(opts && opts._emailRetried)) {
            await new Promise((r) => setTimeout(r, 1200));
            return sendEmail(to, subject, html, { ...(opts || {}), _emailRetried: true });
        }
        console.error('[email]', explained.error, explained.hint || '');
        return { ok: false, error: explained.error, hint: explained.hint };
    }
}

function resetTransporter() {}

/** @deprecated alias */
const explainSmtpError = explainEmailError;

module.exports = {
    sendEmail,
    isEmailConfigured,
    mailConfig,
    verifyEmailConnection,
    verifySmtpConnection,
    resetTransporter,
    explainEmailError,
    explainSmtpError,
    normalizeApiKey,
    apiUrlsForConfig
};
