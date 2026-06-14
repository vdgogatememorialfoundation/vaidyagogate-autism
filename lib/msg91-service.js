/**
 * MSG91 SMS (transactional / OTP) — India DLT flow templates.
 * Configure via Admin → Integrations or env: MSG91_AUTH_KEY, MSG91_SENDER_ID, etc.
 */
const axios = require('axios');
const integrationSettings = require('./integration-settings');

function msg91Cfg() {
    const rt = integrationSettings.getRuntimeIntegrations();
    return {
        authKey: String(rt.msg91_auth_key || process.env.MSG91_AUTH_KEY || '').trim(),
        senderId: String(rt.msg91_sender_id || process.env.MSG91_SENDER_ID || '').trim(),
        route: String(rt.msg91_route || process.env.MSG91_ROUTE || '4').trim() || '4',
        otpTemplateId: String(rt.msg91_otp_template_id || process.env.MSG91_OTP_TEMPLATE_ID || '').trim(),
        defaultFlowId: String(rt.msg91_default_flow_id || process.env.MSG91_DEFAULT_FLOW_ID || '').trim(),
        countryCode: String(rt.msg91_country_code || process.env.MSG91_COUNTRY_CODE || '91').replace(/\D/g, '') || '91'
    };
}

function isMsg91Configured() {
    return integrationSettings.isMsg91ConfiguredFromSettings();
}

/** MSG91 expects country code + mobile without + (e.g. 9198XXXXXXXX). */
function normalizeMobileForMsg91(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    const cc = msg91Cfg().countryCode || '91';
    if (digits.startsWith(cc) && digits.length >= cc.length + 10) return digits.slice(0, cc.length + 10);
    if (digits.length === 10) return cc + digits;
    if (digits.startsWith('91') && digits.length === 12) return digits;
    return digits;
}

function parseMsg91Response(data, status) {
    const body = data && typeof data === 'object' ? data : {};
    const type = String(body.type || body.Type || '').toLowerCase();
    const message = String(body.message || body.Message || body.msg || '').trim();
    if (status >= 200 && status < 300) {
        if (type === 'success' || body.request_id || body.message_id) {
            return { ok: true, requestId: body.request_id || body.message_id || '', message };
        }
        if (/invalid|error|fail/i.test(message) && !body.request_id) {
            return { ok: false, error: message || 'MSG91 rejected the request' };
        }
        return { ok: true, requestId: body.request_id || '', message };
    }
    return { ok: false, error: message || `MSG91 HTTP ${status}` };
}

async function postMsg91(url, payload) {
    const cfg = msg91Cfg();
    if (!cfg.authKey) {
        return { ok: false, skipped: true, error: 'MSG91 not configured — save Auth Key in Admin → Integrations.' };
    }
    try {
        const res = await axios.post(url, payload, {
            headers: {
                authkey: cfg.authKey,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            timeout: 20000,
            validateStatus: () => true
        });
        const parsed = parseMsg91Response(res.data, res.status);
        if (!parsed.ok && res.data) {
            parsed.raw = res.data;
        }
        return parsed;
    } catch (e) {
        const errMsg =
            (e.response && e.response.data && (e.response.data.message || e.response.data.Message)) ||
            e.message ||
            'MSG91 request failed';
        return { ok: false, error: String(errMsg) };
    }
}

/**
 * Send OTP via MSG91 OTP API (DLT template_id from MSG91 panel).
 */
async function sendMsg91Otp(phone, otp, templateId) {
    const cfg = msg91Cfg();
    const tpl = String(templateId || cfg.otpTemplateId || '').trim();
    const mobile = normalizeMobileForMsg91(phone);
    const code = String(otp || '').trim();
    if (!mobile) return { ok: false, error: 'Invalid mobile number' };
    if (!code) return { ok: false, error: 'OTP code required' };
    if (!tpl) {
        return {
            ok: false,
            error: 'MSG91 OTP template ID not set — add it in Admin → Integrations (MSG91 OTP flow / template ID).'
        };
    }
    return postMsg91('https://control.msg91.com/api/v5/otp', {
        template_id: tpl,
        mobile,
        otp: code
    });
}

/**
 * Send transactional SMS via MSG91 Flow API (DLT-approved template with variables).
 */
async function sendMsg91Flow(phone, variables, flowId) {
    const cfg = msg91Cfg();
    const fid = String(flowId || cfg.defaultFlowId || '').trim();
    const mobile = normalizeMobileForMsg91(phone);
    if (!mobile) return { ok: false, error: 'Invalid mobile number' };
    if (!fid) {
        return {
            ok: false,
            error:
                'MSG91 default flow ID not set — add your DLT flow template ID in Admin → Integrations.'
        };
    }
    const recipient = { mobiles: mobile, ...(variables && typeof variables === 'object' ? variables : {}) };
    const payload = {
        flow_id: fid,
        recipients: [recipient]
    };
    if (cfg.senderId) payload.sender = cfg.senderId;
    return postMsg91('http://api.msg91.com/api/v5/flow/', payload);
}

/**
 * Send plain-text SMS — uses default flow with VAR1/message/var, or legacy sendhttp if no flow.
 */
async function sendSms(phone, message, opts) {
    opts = opts || {};
    const text = String(message || '').trim();
    const mobile = normalizeMobileForMsg91(phone);
    if (!mobile) return { ok: false, error: 'Invalid mobile number' };
    if (!text) return { ok: false, error: 'SMS message is empty' };

    if (opts.isOtp && opts.otp) {
        return sendMsg91Otp(phone, opts.otp, opts.templateId);
    }

    const flowId = opts.flowId || msg91Cfg().defaultFlowId;
    if (flowId) {
        const vars = {
            VAR1: text,
            message: text,
            var: text,
            ...(opts.variables && typeof opts.variables === 'object' ? opts.variables : {})
        };
        return sendMsg91Flow(phone, vars, flowId);
    }

    const cfg = msg91Cfg();
    if (!cfg.authKey) {
        return { ok: false, skipped: true, error: 'MSG91 not configured' };
    }
    if (!cfg.senderId) {
        return {
            ok: false,
            error: 'MSG91 Sender ID required for SMS — set it in Admin → Integrations.'
        };
    }

    try {
        const params = new URLSearchParams({
            authkey: cfg.authKey,
            mobiles: mobile,
            message: text,
            sender: cfg.senderId,
            route: cfg.route,
            country: cfg.countryCode
        });
        const res = await axios.get(`http://api.msg91.com/api/sendhttp.php?${params.toString()}`, {
            timeout: 20000,
            validateStatus: () => true
        });
        const raw = String(res.data || '').trim();
        if (/^[\d,\s]+$/.test(raw) || /success/i.test(raw)) {
            return { ok: true, requestId: raw.split(',')[0] || '' };
        }
        return { ok: false, error: raw || 'MSG91 send failed' };
    } catch (e) {
        return { ok: false, error: e.message || 'MSG91 send failed' };
    }
}

module.exports = {
    msg91Cfg,
    isMsg91Configured,
    normalizeMobileForMsg91,
    sendSms,
    sendMsg91Otp,
    sendMsg91Flow
};
