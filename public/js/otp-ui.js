/**
 * Consistent success popup when OTP is sent + resend cooldown UI.
 */
(function (global) {
    const _cooldownTimers = {};

    function channelLabel(channel) {
        if (channel === 'email') return 'email';
        if (channel === 'phone') return 'WhatsApp';
        return String(channel || '').trim();
    }

    /**
     * @param {string} channel - 'email' | 'phone'
     * @param {object} [data] - API response (optional warning)
     * @param {{ both?: boolean, customMessage?: string }} [options]
     */
    function notifyOtpSent(channel, data, options) {
        const opts = options || {};
        if (opts.inlineEl) {
            let msg = opts.customMessage;
            if (!msg) {
                msg = 'Code sent to your ' + channelLabel(channel) + '.';
            }
            if (data && data.warning) msg = data.warning + ' ' + msg;
            opts.inlineEl.textContent = msg;
            opts.inlineEl.style.color = opts.inlineColor || '#059669';
            return;
        }
        if (opts.silent) return;
        let msg = opts.customMessage;
        if (!msg) {
            if (opts.both) {
                msg = 'OTP sent successfully to your email and WhatsApp.';
            } else {
                msg = 'OTP sent successfully to your ' + channelLabel(channel) + '.';
            }
        }
        if (data && data.warning) {
            alert(data.warning + '\n\n' + msg);
        } else {
            alert(msg);
        }
    }

    function collectButtons(options) {
        const opts = options || {};
        const out = [];
        [opts.sendIds, opts.resendIds, opts.buttonIds].forEach((arr) => {
            (arr || []).forEach((id) => {
                const el = document.getElementById(id);
                if (el) out.push(el);
            });
        });
        if (opts.sendBtn) out.push(opts.sendBtn);
        if (opts.resendBtn) out.push(opts.resendBtn);
        return out;
    }

    /** Disable send/resend buttons for N seconds after OTP is sent. */
    function startResendCooldown(options) {
        const opts = options || {};
        const seconds = opts.seconds != null ? Number(opts.seconds) : 60;
        const buttons = collectButtons(opts);
        if (!buttons.length || !Number.isFinite(seconds) || seconds < 1) return;

        const key =
            opts.key ||
            buttons
                .map((b) => b.id || b.textContent)
                .filter(Boolean)
                .join('|');
        if (_cooldownTimers[key]) {
            clearInterval(_cooldownTimers[key]);
            delete _cooldownTimers[key];
        }

        const snapshots = buttons.map((el) => ({
            el,
            text: el.textContent,
            disabled: el.disabled
        }));

        let remaining = Math.floor(seconds);
        const tick = () => {
            if (remaining <= 0) {
                clearInterval(_cooldownTimers[key]);
                delete _cooldownTimers[key];
                snapshots.forEach(({ el, text, disabled }) => {
                    el.disabled = disabled;
                    el.textContent = text;
                    el.style.opacity = '';
                    el.style.cursor = '';
                });
                return;
            }
            snapshots.forEach(({ el }) => {
                el.disabled = true;
                el.style.opacity = '0.55';
                el.style.cursor = 'not-allowed';
                const id = String(el.id || '');
                if (id.indexOf('resend') >= 0) {
                    el.textContent = 'Resend (' + remaining + 's)';
                } else if (id.indexOf('send') >= 0) {
                    el.textContent = 'Sent (' + remaining + 's)';
                } else {
                    el.textContent = remaining + 's';
                }
            });
            remaining--;
        };
        tick();
        _cooldownTimers[key] = setInterval(tick, 1000);
    }

    function signupOtpButtonIds(prefix, channel) {
        const p = prefix || 'doctor-signup';
        const ch = channel === 'phone' ? 'phone' : 'email';
        return {
            sendIds: [p + '-send-otp-' + ch],
            resendIds: [p + '-resend-otp-' + ch]
        };
    }

    function cooldownSignupChannel(channel, prefix, seconds) {
        const ids = signupOtpButtonIds(prefix, channel);
        startResendCooldown({
            sendIds: ids.sendIds,
            resendIds: ids.resendIds,
            seconds: seconds != null ? seconds : 60,
            key: 'signup-' + (prefix || 'doctor-signup') + '-' + channel
        });
    }

    function loginOtpButtonIds(prefix, channel, resendId) {
        const p = prefix || 'doctor';
        const ch = channel === 'phone' ? 'phone' : 'email';
        return {
            sendIds: [p + '-send-otp-' + ch],
            resendIds: [resendId || p + '-resend-otp-' + ch]
        };
    }

    function cooldownLoginChannel(channel, prefix, resendId, seconds) {
        const ids = loginOtpButtonIds(prefix, channel, resendId);
        startResendCooldown({
            sendIds: ids.sendIds,
            resendIds: ids.resendIds,
            seconds: seconds != null ? seconds : 60,
            key: 'login-' + (prefix || 'doctor') + '-' + channel
        });
    }

    function regOtpSendKey(sid, fieldKey, purpose) {
        return String(sid) + ':' + fieldKey + ':' + purpose;
    }

    function takeRegOtpForceResend(sid, fieldKey, purpose) {
        window.__regOtpSendKeys = window.__regOtpSendKeys || {};
        const key = regOtpSendKey(sid, fieldKey, purpose);
        const forceResend = !!window.__regOtpSendKeys[key];
        window.__regOtpSendKeys[key] = true;
        return forceResend;
    }

    function applyRegOtpSendStatus(statusEl, data, channel) {
        if (!statusEl) return;
        if (data.reused) {
            statusEl.textContent =
                'Code still valid — check WhatsApp. Tap Send again to resend a new message.';
            statusEl.style.color = '#b45309';
            return;
        }
        statusEl.style.color = '#059669';
        statusEl.textContent =
            data.debugCode && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
                ? 'Code sent (dev: ' + data.debugCode + ')'
                : 'Sent ✓';
    }

    global.OtpUi = {
        channelLabel,
        notifyOtpSent,
        startResendCooldown,
        signupOtpButtonIds,
        cooldownSignupChannel,
        loginOtpButtonIds,
        cooldownLoginChannel,
        takeRegOtpForceResend,
        applyRegOtpSendStatus
    };
})(typeof window !== 'undefined' ? window : global);
