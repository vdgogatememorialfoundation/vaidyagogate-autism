/**
 * Passwordless email-OTP sign-in for staff / scanner portals.
 *
 * Converts an existing email + password login form into a two-step flow:
 *   1. Enter email → "Send code" (POST /api/auth/login-otp/send, channel=email)
 *   2. Enter the 4-digit code → submit (verify → /api/auth/login with emailOtpToken)
 *
 * Usage:
 *   EmailOtpLogin.mount({
 *       portal: 'staff' | 'scanner',
 *       formId, emailInputId, passwordInputId,
 *       onSuccess(user, data), onError(message)
 *   });
 */
(function (global) {
    'use strict';

    const PORTAL_LABEL = { staff: 'staff portal', scanner: 'scanner portal', judge: 'judge portal' };

    function el(tag, attrs, children) {
        const n = document.createElement(tag);
        Object.keys(attrs || {}).forEach((k) => {
            if (k === 'class') n.className = attrs[k];
            else if (k === 'text') n.textContent = attrs[k];
            else if (k === 'html') n.innerHTML = attrs[k];
            else n.setAttribute(k, attrs[k]);
        });
        (children || []).forEach((c) => c && n.appendChild(c));
        return n;
    }

    async function readJson(res) {
        try {
            return await res.json();
        } catch (_) {
            return {};
        }
    }

    function normalizeEmail(raw) {
        const v = String(raw || '').trim().toLowerCase();
        if (typeof global.validateEmailClient === 'function') {
            const r = global.validateEmailClient(v, 'Email');
            return r.valid ? { ok: true, email: r.cleanedEmail } : { ok: false, message: r.message };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, message: 'Enter a valid email address.' };
        return { ok: true, email: v };
    }

    function mount(opts) {
        const portal = opts.portal || 'staff';
        const form = document.getElementById(opts.formId);
        const emailInput = document.getElementById(opts.emailInputId);
        const passwordInput = document.getElementById(opts.passwordInputId);
        if (!form || !emailInput) return null;
        if (form.dataset.emailOtpLogin === '1') return null;
        form.dataset.emailOtpLogin = '1';

        const label = PORTAL_LABEL[portal] || 'portal';
        const onError = (msg) => (opts.onError ? opts.onError(msg) : alert(msg));

        // Hide the password field (OTP is the credential on this portal).
        if (passwordInput) {
            passwordInput.required = false;
            passwordInput.value = '';
            const wrap = passwordInput.closest('.ak-login-field') || passwordInput;
            wrap.classList.add('hidden');
            wrap.style.display = 'none';
            const lbl = form.querySelector('label[for="' + passwordInput.id + '"]');
            if (lbl && lbl !== wrap && !wrap.contains(lbl)) lbl.style.display = 'none';
        }
        if (opts.hideIds) {
            opts.hideIds.forEach((id) => {
                const n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
        }
        emailInput.setAttribute('placeholder', 'you@organisation.org');
        emailInput.setAttribute('type', 'email');
        emailInput.setAttribute('inputmode', 'email');

        // OTP block ------------------------------------------------------
        const sendBtn = el('button', {
            type: 'button',
            class: 'eol-send',
            id: portal + '-eol-send',
            html: '<i class="fas fa-paper-plane" aria-hidden="true"></i> Send code to email'
        });
        const codeInput = el('input', {
            type: 'text',
            id: portal + '-eol-code',
            class: 'eol-code',
            inputmode: 'numeric',
            autocomplete: 'one-time-code',
            maxlength: '8',
            placeholder: '• • • •',
            'aria-label': 'One-time sign-in code'
        });
        const resendBtn = el('button', { type: 'button', class: 'eol-resend', id: portal + '-eol-resend', text: 'Resend code' });
        const status = el('p', { class: 'eol-status', id: portal + '-eol-status', role: 'status', 'aria-live': 'polite' });
        const stepTwo = el('div', { class: 'eol-step eol-step-two hidden' }, [
            el('label', { for: codeInput.id, class: 'eol-label', text: 'Enter the 4-digit code from your email' }),
            codeInput,
            el('div', { class: 'eol-resend-row' }, [resendBtn])
        ]);
        const block = el('div', { class: 'eol-block', id: portal + '-eol-block' }, [
            el('p', {
                class: 'eol-lead',
                html:
                    '<i class="fas fa-shield-halved" aria-hidden="true"></i> No password needed — we email a one-time code to your registered ' +
                    label +
                    ' address.'
            }),
            el('div', { class: 'eol-step eol-step-one' }, [sendBtn]),
            stepTwo,
            status
        ]);

        const submitBtn = form.querySelector('button[type="submit"]');
        const anchor = opts.insertBeforeId ? document.getElementById(opts.insertBeforeId) : null;
        if (anchor && anchor.parentNode === form) form.insertBefore(block, anchor);
        else if (submitBtn && submitBtn.parentNode === form) form.insertBefore(block, submitBtn);
        else form.appendChild(block);
        if (submitBtn) {
            submitBtn.dataset.eolLabel = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-right-to-bracket" aria-hidden="true"></i> Verify code & sign in';
            submitBtn.disabled = true;
        }

        let sentTo = null;
        let cooldownTimer = null;

        function setStatus(msg, kind) {
            status.textContent = msg || '';
            status.className = 'eol-status' + (kind ? ' eol-status-' + kind : '');
        }

        function startCooldown(seconds) {
            let left = seconds;
            resendBtn.disabled = true;
            clearInterval(cooldownTimer);
            const tick = () => {
                resendBtn.textContent = left > 0 ? 'Resend code in ' + left + 's' : 'Resend code';
                if (left <= 0) {
                    resendBtn.disabled = false;
                    clearInterval(cooldownTimer);
                }
                left -= 1;
            };
            tick();
            cooldownTimer = setInterval(tick, 1000);
        }

        async function sendCode(force) {
            const ev = normalizeEmail(emailInput.value);
            if (!ev.ok) return onError(ev.message);
            sendBtn.disabled = true;
            setStatus('Sending code…');
            try {
                const res = await fetch('/api/auth/login-otp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: ev.email, channel: 'email', portal, forceResend: !!force })
                });
                const data = await readJson(res);
                if (!res.ok) {
                    setStatus('', null);
                    sendBtn.disabled = false;
                    return onError(data.error || 'Could not send the code. Try again.');
                }
                sentTo = ev.email;
                stepTwo.classList.remove('hidden');
                sendBtn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Code sent';
                if (submitBtn) submitBtn.disabled = false;
                let msg = 'Code sent to ' + ev.email + '. It is valid for ' + (data.ttlMinutes || 10) + ' minutes.';
                if (data.reused) msg = data.message || 'Your previous code is still valid — check your inbox.';
                if (data.warning) msg += ' ' + data.warning;
                if (data.debugCode) {
                    console.info('Login OTP debug:', data.debugCode);
                    msg += ' (dev code: ' + data.debugCode + ')';
                }
                setStatus(msg, 'ok');
                startCooldown(45);
                codeInput.focus();
            } catch (err) {
                console.error(err);
                sendBtn.disabled = false;
                setStatus('', null);
                onError('Could not reach the server.');
            }
        }

        sendBtn.addEventListener('click', () => sendCode(false));
        resendBtn.addEventListener('click', () => sendCode(true));
        emailInput.addEventListener('input', () => {
            if (sentTo && normalizeEmail(emailInput.value).email !== sentTo) {
                sentTo = null;
                stepTwo.classList.add('hidden');
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Send code to email';
                if (submitBtn) submitBtn.disabled = true;
                setStatus('');
            }
        });
        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        });

        // Submit: verify code → login ------------------------------------
        form.addEventListener(
            'submit',
            async (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                const ev = normalizeEmail(emailInput.value);
                if (!ev.ok) return onError(ev.message);
                if (!sentTo) return onError('Tap "Send code to email" first, then enter the code from your inbox.');
                const code = String(codeInput.value || '').trim();
                if (!code) {
                    codeInput.focus();
                    return onError('Enter the code we emailed you.');
                }
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Verifying…';
                }
                try {
                    const vres = await fetch('/api/auth/login-otp/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: ev.email, channel: 'email', code, portal })
                    });
                    const vdata = await readJson(vres);
                    if (!vres.ok || !vdata.token) {
                        return onError(vdata.error || 'That code is not valid. Check the latest email or resend.');
                    }
                    const lres = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: ev.email, portal, emailOtpToken: vdata.token })
                    });
                    const ldata = await readJson(lres);
                    if (!lres.ok || !ldata.success || !ldata.user) {
                        const parts = [ldata.error || 'Sign-in failed.'];
                        if (ldata.hint) parts.push(ldata.hint);
                        return onError(parts.join(' '));
                    }
                    codeInput.value = '';
                    if (opts.onSuccess(ldata.user, ldata) !== false) {
                        setStatus('Signed in. Opening your ' + label + '…', 'ok');
                    } else {
                        setStatus('');
                    }
                } catch (err) {
                    console.error(err);
                    onError('Could not reach the server.');
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML =
                            '<i class="fas fa-right-to-bracket" aria-hidden="true"></i> Verify code & sign in';
                    }
                }
            },
            true
        );

        return { sendCode, block };
    }

    global.EmailOtpLogin = { mount };
})(window);
