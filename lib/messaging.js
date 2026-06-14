/**
 * Messaging facade — email via ZeptoMail, SMS via MSG91, WhatsApp via Meta Cloud API.
 */
const { sendEmail, isEmailConfigured } = require('./email-service');
const { sendWhatsAppText, isWhatsAppConfigured } = require('./whatsapp-service');
const { sendSms: sendMsg91Sms, isMsg91Configured } = require('./msg91-service');

async function sendMail(opts) {
    return sendEmail(opts.to, opts.subject, opts.html || opts.text || '', { text: opts.text });
}

async function sendSms(to, body, opts) {
    if (isMsg91Configured()) {
        return sendMsg91Sms(to, body, opts);
    }
    return sendWhatsAppText(to, body);
}

function isSmsConfigured() {
    return isMsg91Configured() || isWhatsAppConfigured();
}

function isMailConfigured() {
    return isEmailConfigured();
}

module.exports = {
    sendSms,
    sendMail,
    isSmsConfigured,
    isMailConfigured,
    sendEmail,
    sendWhatsAppText,
    isMsg91Configured
};
