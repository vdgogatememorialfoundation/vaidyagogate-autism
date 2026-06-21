/**
 * Applicant dashboard — login & signup in-app (no redirect to public homepage).
 */
(function (global) {
    function isStandaloneDoctorApp() {
        try {
            if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
                if (window.Capacitor.isNativePlatform()) return true;
            }
        } catch (_) {}
        return (
            /Capacitor|Android.*wv/i.test(navigator.userAgent || '') ||
            new URLSearchParams(window.location.search).get('app') === '1'
        );
    }

    let signupPhoneOtpToken = null;
    let signupEmailOtpToken = null;
    let signupOtpInflight = false;
    let signupAuthConfig = null;

    function signupOtpChannels(cfg) {
        cfg = cfg || signupAuthConfig || global.__portalAuth || {};
        if (cfg.channels && typeof cfg.channels === 'object') {
            return { whatsapp: cfg.channels.whatsapp !== false, email: false };
        }
        return {
            whatsapp: cfg.signupOtpWhatsapp !== false,
            email: false
        };
    }

    function signupTokensReady(channels) {
        if (channels.email && !signupEmailOtpToken) return false;
        if (channels.whatsapp && !signupPhoneOtpToken) return false;
        return true;
    }

    const LOGIN_AUTH_UI_VERSION = 'phone-v2';

    const PHONE_LOGIN_FORM_INNER =
        '<label style="display:block;font-size:0.82rem;font-weight:700;color:#0f766e;margin:0 0 6px;">Phone (WhatsApp)</label>' +
        '<input type="tel" id="doctor-login-phone" required autocomplete="tel" inputmode="tel" placeholder="10-digit mobile number" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;margin-bottom:12px;">' +
        '<label style="display:block;font-size:0.82rem;font-weight:700;color:#0f766e;margin:0 0 6px;">WhatsApp OTP</label>' +
        '<div class="ak-login-otp-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">' +
        '<input type="text" id="doctor-phone-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Enter code" style="flex:1;min-width:120px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;">' +
        '<button type="button" id="doctor-send-otp-phone" class="ak-otp-action-btn" style="padding:10px 14px;border-radius:10px;border:1px solid #99f6e4;background:#f0fdfa;cursor:pointer;font-weight:700;color:#0f766e;white-space:nowrap;">Send OTP</button>' +
        '<button type="button" id="doctor-resend-otp-phone" class="ak-otp-action-btn" style="padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#f8fafc;cursor:pointer;font-weight:700;color:#475569;white-space:nowrap;">Resend</button>' +
        '</div>' +
        '<p id="doctor-login-otp-status" style="font-size:0.82rem;color:#64748b;margin:0 0 10px;min-height:1.2em;"></p>' +
        '<p id="doctor-login-err" class="hidden" style="color:#b91c1c;font-size:0.85rem;margin-top:10px;font-weight:600;"></p>' +
        '<button type="submit" id="doctor-login-submit" class="btn-primary" style="width:100%;margin-top:8px;">Sign in</button>';

    function applyStandaloneUi() {
        if (!isStandaloneDoctorApp()) return;
        document.body.classList.add('doctor-standalone-app');
        document.querySelectorAll('.doctor-web-only').forEach((el) => {
            el.classList.add('hidden');
        });
    }

    /** Replace cached legacy sign-in (email + email/phone OTP rows) with phone-only UI. */
    function ensurePhoneLoginMarkup() {
        if (!document.body || !document.body.classList.contains('ak-portal-dash')) return false;
        const panel = document.getElementById('doctor-auth-login-panel');
        const form = document.getElementById('doctor-login-form');
        if (!panel || !form) return false;
        const legacyPanel = document.getElementById('doctor-login-otp-panel');
        const legacyEmail = document.getElementById('doctor-login-email');
        const isCurrent = form.getAttribute('data-auth-ui') === LOGIN_AUTH_UI_VERSION && !legacyPanel && !legacyEmail;
        if (isCurrent) return false;

        const intro = panel.querySelector('p');
        if (intro) {
            intro.textContent = 'Enter your WhatsApp number, tap Send OTP, enter the code, then sign in.';
        }
        if (legacyPanel) legacyPanel.remove();
        form.setAttribute('data-auth-ui', LOGIN_AUTH_UI_VERSION);
        form.innerHTML = PHONE_LOGIN_FORM_INNER;
        phoneLoginWired = false;
        return true;
    }

    /** Force one network reload if WebView still serves stale HTML after in-place repair. */
    function ensureFreshMobileAuthPage() {
        if (ensurePhoneLoginMarkup()) return false;
        const form = document.getElementById('doctor-login-form');
        if (!form || form.getAttribute('data-auth-ui') === LOGIN_AUTH_UI_VERSION) return false;
        try {
            const key = 'ak-auth-ui-reload-v2';
            if (sessionStorage.getItem(key) === '1') {
                ensurePhoneLoginMarkup();
                return false;
            }
            sessionStorage.setItem(key, '1');
            const u = new URL(window.location.href);
            u.searchParams.set('authv', String(Date.now()));
            if (isStandaloneDoctorApp()) u.searchParams.set('app', '1');
            window.location.replace(u.toString());
            return true;
        } catch (_) {
            ensurePhoneLoginMarkup();
            return false;
        }
    }

    let phoneLoginWired = false;

    function wireApplicantPhoneLogin(onSuccess, onError) {
        if (phoneLoginWired || typeof bindPhoneLogin !== 'function') return;
        if (!document.getElementById('doctor-login-form')) return;
        const existing = global.PortalAuth && typeof global.PortalAuth.getUser === 'function'
            ? global.PortalAuth.getUser('doctor')
            : null;
        if (existing) return;
        phoneLoginWired = true;
        bindPhoneLogin(onSuccess, onError);
    }

    function switchDoctorAuthTab(tab) {
        const login = document.getElementById('doctor-auth-login-panel');
        const signup = document.getElementById('doctor-auth-signup-panel');
        const btnIn = document.getElementById('doctor-auth-tab-login');
        const btnUp = document.getElementById('doctor-auth-tab-signup');
        const showLogin = tab === 'login';
        if (login) login.classList.toggle('hidden', !showLogin);
        if (signup) signup.classList.toggle('hidden', showLogin);
        if (btnIn) {
            btnIn.classList.toggle('is-active', showLogin);
            btnIn.setAttribute('aria-selected', showLogin ? 'true' : 'false');
        }
        if (btnUp) {
            btnUp.classList.toggle('is-active', !showLogin);
            btnUp.setAttribute('aria-selected', !showLogin ? 'true' : 'false');
        }
        syncApplicantAuthTitle(showLogin);
        if (!showLogin) refreshSignupOtpPanel();
    }

    function prefillLoginForm(_email, phone, password) {
        const lph = document.getElementById('doctor-login-phone');
        const lp = document.getElementById('doctor-login-password');
        if (lph && phone) lph.value = phone;
        if (lp && password) lp.value = password;
    }

    function syncApplicantAuthTitle(showLogin) {
        if (global.AutismTerminology && typeof global.AutismTerminology.syncApplicantAuthTitle === 'function') {
            global.AutismTerminology.syncApplicantAuthTitle();
            return;
        }
        const title = document.getElementById('doctor-auth-title');
        if (!title) return;
        const onSignup =
            showLogin === false ||
            (document.getElementById('doctor-auth-signup-panel') &&
                !document.getElementById('doctor-auth-signup-panel').classList.contains('hidden'));
        title.textContent = onSignup ? 'Create your applicant account' : 'Welcome! Applicant sign in';
    }

    function signupOtpDest(channel) {
        const raw =
            channel === 'email'
                ? String((document.getElementById('doctor-signup-email') || {}).value || '').trim()
                : String((document.getElementById('doctor-signup-phone') || {}).value || '').trim();
        if (typeof validateOtpDestinationClient === 'function') {
            const v = validateOtpDestinationClient(channel, raw, channel === 'email' ? 'Email' : 'Phone');
            if (!v.valid) return '';
            return channel === 'email' ? v.cleanedEmail : v.cleanedPhone;
        }
        if (channel === 'email') return raw.toLowerCase();
        const digits = raw.replace(/\D/g, '');
        return digits.length >= 10 ? digits.slice(-10) : digits;
    }

    async function sendSignupOtp(channel) {
        if (signupOtpInflight) return;
        const raw =
            channel === 'email'
                ? String((document.getElementById('doctor-signup-email') || {}).value || '').trim()
                : String((document.getElementById('doctor-signup-phone') || {}).value || '').trim();
        if (typeof validateOtpDestinationClient === 'function') {
            const v = validateOtpDestinationClient(channel, raw, channel === 'email' ? 'Email' : 'Phone');
            if (!v.valid) return alert(v.message);
        }
        const dest = signupOtpDest(channel);
        if (!dest) return alert(channel === 'email' ? 'Enter email first.' : 'Enter phone first.');
        const sendBtn = document.getElementById('doctor-signup-send-otp-' + channel);
        const statusEl = document.getElementById('doctor-signup-otp-hint');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending…';
        }
        signupOtpInflight = true;
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.style.color = '#64748b';
            statusEl.textContent = 'Sending OTP…';
        }
        try {
            const res = await fetch('/api/otp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, destination: dest, purpose: 'signup' })
            });
            const readJson = window.HttpJson ? window.HttpJson.readJsonResponse : null;
            const errMsg = window.HttpJson ? window.HttpJson.apiErrorMessage : null;
            const parsed = readJson ? await readJson(res) : { data: await res.json(), parseFailed: false };
            const data = parsed.data;
            if (parsed.parseFailed || !res.ok) {
                const msg = errMsg ? errMsg(res, data, parsed.parseFailed) : data.error || 'Could not send code.';
                if (statusEl) {
                    statusEl.style.color = '#b91c1c';
                    statusEl.textContent = msg;
                } else alert(msg);
                return;
            }
            if (window.OtpUi) {
                window.OtpUi.cooldownSignupChannel(channel, 'doctor-signup', 60);
                if (statusEl) {
                    window.OtpUi.notifyOtpSent(channel, data, {
                        silent: true,
                        inlineEl: statusEl,
                        customMessage:
                            channel === 'phone'
                                ? 'Code sent to WhatsApp. Enter it below, then create your account.'
                                : 'Code sent to your email. Enter it below.'
                    });
                } else {
                    window.OtpUi.notifyOtpSent(channel, data);
                }
            } else if (statusEl) {
                statusEl.style.color = '#059669';
                statusEl.textContent = 'OTP sent. Enter the code below.';
            }
            const codeEl = document.getElementById(
                channel === 'email' ? 'doctor-signup-email-otp' : 'doctor-signup-phone-otp'
            );
            if (codeEl) codeEl.focus();
        } catch (err) {
            console.error(err);
            if (statusEl) {
                statusEl.style.color = '#b91c1c';
                statusEl.textContent = 'Could not send OTP. Try again.';
            }
        } finally {
            signupOtpInflight = false;
            if (sendBtn && sendBtn.textContent === 'Sending…') {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send';
            }
        }
    }

    async function verifySignupOtp(channel) {
        try {
            const dest = signupOtpDest(channel);
            const codeEl = document.getElementById(
                channel === 'email' ? 'doctor-signup-email-otp' : 'doctor-signup-phone-otp'
            );
            const okEl = document.getElementById(
                channel === 'email' ? 'doctor-signup-email-otp-ok' : 'doctor-signup-phone-otp-ok'
            );
            const code = String((codeEl || {}).value || '').trim();
            if (!dest || !code) return alert('Enter contact and code.');
            const res = await fetch('/api/otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, destination: dest, code, purpose: 'signup' })
            });
            const readJson = window.HttpJson ? window.HttpJson.readJsonResponse : null;
            const errMsg = window.HttpJson ? window.HttpJson.apiErrorMessage : null;
            let parsed;
            if (readJson) {
                parsed = await readJson(res);
            } else {
                try {
                    parsed = { data: await res.json(), parseFailed: false };
                } catch (parseErr) {
                    parsed = { data: {}, parseFailed: true };
                }
            }
            const data = parsed.data;
            if (parsed.parseFailed || !res.ok) {
                return alert(
                    parsed.parseFailed && errMsg
                        ? errMsg(res, data, true)
                        : (data && data.error) || 'Invalid code.'
                );
            }
            if (!data || !data.token) {
                return alert('Verification did not return a token. Please try again.');
            }
            if (channel === 'email') signupEmailOtpToken = data.token;
            else signupPhoneOtpToken = data.token;
            if (okEl) okEl.textContent = 'Verified ✓';
            const otpHint = document.getElementById('doctor-signup-otp-hint');
            const channels = signupOtpChannels();
            if (otpHint && signupTokensReady(channels)) {
                otpHint.textContent = channels.email
                    ? 'Email and WhatsApp verified. You can create your account.'
                    : 'WhatsApp verified. You can create your account.';
                otpHint.style.color = '#059669';
                otpHint.classList.remove('hidden');
            }
        } catch (err) {
            console.error(err);
            alert('Could not verify code. Check your connection and try again.');
        }
    }

    async function refreshSignupOtpPanel() {
        const panel = document.getElementById('doctor-signup-otp-panel');
        if (!panel) return;
        var signupEmailOtp = document.getElementById('doctor-signup-email-otp-row');
        if (signupEmailOtp) signupEmailOtp.remove();
        try {
            const res = await fetch('/api/auth/signup-otp-required');
            const d = await res.json();
            signupAuthConfig = d;
            panel.style.display = d.required !== false ? 'block' : 'none';
            if (global.PortalAuth && typeof global.PortalAuth.applyApplicantAuthUi === 'function') {
                global.PortalAuth.applyApplicantAuthUi(
                    Object.assign({}, global.__portalAuth || {}, {
                        requireSignupOtp: d.required,
                        signupOtpWhatsapp: d.whatsapp !== false,
                        signupOtpEmail: false
                    })
                );
            }
        } catch (_) {
            panel.style.display = 'none';
        }
    }

    async function accountCheck(email, password, phone) {
        const res = await fetch('/api/auth/account-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: password || '', phone: phone || '' })
        });
        if (window.HttpJson) {
            const { data, parseFailed } = await window.HttpJson.readJsonResponse(res);
            if (parseFailed) throw new Error('account-check-parse');
            return { ok: res.ok, ...data };
        }
        try {
            return { ok: res.ok, ...(await res.json()) };
        } catch (_) {
            throw new Error('account-check-parse');
        }
    }

    async function handleDoctorSignup(e) {
        e.preventDefault();
        const firstName = String((document.getElementById('doctor-signup-firstname') || {}).value || '').trim();
        const lastName = String((document.getElementById('doctor-signup-lastname') || {}).value || '').trim();
        const emailRaw = String((document.getElementById('doctor-signup-email') || {}).value || '').trim();
        const phoneRaw = String((document.getElementById('doctor-signup-phone') || {}).value || '').trim();
        let email = emailRaw.toLowerCase();
        let phone = phoneRaw;
        if (typeof validateEmailClient === 'function') {
            const ev = validateEmailClient(emailRaw, 'Email');
            if (!ev.valid) return alert(ev.message);
            email = ev.cleanedEmail;
        }
        if (typeof validatePhoneClient === 'function') {
            const pv = validatePhoneClient(phoneRaw, 'Phone');
            if (!pv.valid) return alert(pv.message);
            phone = pv.cleanedPhone;
        }
        const passwordEl = document.getElementById('doctor-signup-password');
        const password = passwordEl ? passwordEl.value : '';
        const passwordless =
            (global.__portalAuth && global.__portalAuth.passwordlessLogin) ||
            (global.PortalAuth && global.__portalAuth && global.__portalAuth.passwordlessLogin);
        if (!passwordless && !String(password || '').trim()) {
            return alert('Enter a password.');
        }
        const errEl = document.getElementById('doctor-signup-err');

        if (typeof validatePersonNameClient === 'function') {
            const fn = validatePersonNameClient(firstName, 'First name');
            if (!fn.valid) return alert(fn.message);
            const ln = validatePersonNameClient(lastName, 'Last name');
            if (!ln.valid) return alert(ln.message);
        }

        try {
            const check = await accountCheck(email, password, phone);
            if (check.phoneTaken) {
                alert(
                    check.message ||
                        'This mobile number is already registered. Sign in with that account or use a different number.'
                );
                switchDoctorAuthTab('login');
                return;
            }
            if (check.staffAccount) {
                alert(
                    check.message ||
                        'This email is for staff/admin access. Sign in at /admin or use a different email.'
                );
                return;
            }
            if (check.exists) {
                if (check.passwordMatch) {
                    if (
                        confirm(
                            (check.message || 'Account exists.') + '\n\nSwitch to Sign in?'
                        )
                    ) {
                        switchDoctorAuthTab('login');
                        prefillLoginForm(email, phone, password);
                    }
                    return;
                }
                alert(check.message || 'Email already registered. Please sign in.');
                switchDoctorAuthTab('login');
                prefillLoginForm(email, phone, '');
                return;
            }
        } catch (_) {
            return alert('Could not verify email.');
        }

        const body = { firstName, lastName, email, phone, password, role: 'doctor' };
        const otpPanel = document.getElementById('doctor-signup-otp-panel');
        const otpHint = document.getElementById('doctor-signup-otp-hint');
        if (otpPanel && otpPanel.style.display !== 'none') {
            const channels = signupOtpChannels();
            const phoneCode = String(
                (document.getElementById('doctor-signup-phone-otp') || {}).value || ''
            ).trim();
            if (channels.whatsapp) {
                if (signupPhoneOtpToken) {
                    body.phoneOtpToken = signupPhoneOtpToken;
                } else if (phoneCode) {
                    body.phoneOtpCode = phoneCode;
                } else {
                    const msg = 'Enter the WhatsApp OTP code from your latest message, then create your account.';
                    if (otpHint) {
                        otpHint.textContent = msg;
                        otpHint.classList.remove('hidden');
                    }
                    return alert(msg);
                }
            }
            if (channels.email && !signupEmailOtpToken) {
                return alert('Verify email OTP before creating your account.');
            }
            if (channels.email) body.emailOtpToken = signupEmailOtpToken;
            if (otpHint) otpHint.classList.add('hidden');
        }

        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            let data = {};
            let parseFailed = false;
            if (window.HttpJson) {
                const parsed = await window.HttpJson.readJsonResponse(res);
                data = parsed.data;
                parseFailed = parsed.parseFailed;
            } else {
                data = await res.json();
            }
            if (parseFailed) {
                const msg = window.HttpJson.apiErrorMessage(res, data, true);
                if (errEl) {
                    errEl.textContent = msg;
                    errEl.classList.remove('hidden');
                } else alert(msg);
                return;
            }
            if (data.success) {
                signupPhoneOtpToken = null;
                signupEmailOtpToken = null;
                if (data.user && data.autoLogin) {
                    if (typeof PortalAuth !== 'undefined') PortalAuth.setUser('doctor', data.user);
                    window.currentUser = data.user;
                    if (typeof bootDoctorDashboard === 'function') {
                        bootDoctorDashboard(data.user);
                        return;
                    }
                }
                try {
                    const phoneCode = String(
                        (document.getElementById('doctor-signup-phone-otp') || {}).value || ''
                    ).trim();
                    if (passwordless && phoneCode) {
                        const otpRes = await fetch('/api/auth/login-phone-otp', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone, code: phoneCode })
                        });
                        let otpData = {};
                        if (window.HttpJson) {
                            const parsed = await window.HttpJson.readJsonResponse(otpRes);
                            otpData = parsed.data || {};
                        } else {
                            otpData = await otpRes.json().catch(() => ({}));
                        }
                        if (otpRes.ok && otpData.success && otpData.user) {
                            if (typeof PortalAuth !== 'undefined') PortalAuth.setUser('doctor', otpData.user);
                            window.currentUser = otpData.user;
                            if (typeof bootDoctorDashboard === 'function') {
                                bootDoctorDashboard(otpData.user);
                                return;
                            }
                        }
                    } else if (!passwordless) {
                        const loginBody = { email, password, portal: 'doctor' };
                        if (data.phoneOtpToken) loginBody.phoneOtpToken = data.phoneOtpToken;
                        const loginRes = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(loginBody)
                        });
                        let loginData = {};
                        if (window.HttpJson) {
                            const parsed = await window.HttpJson.readJsonResponse(loginRes);
                            loginData = parsed.data || {};
                        } else {
                            loginData = await loginRes.json().catch(() => ({}));
                        }
                        if (loginRes.ok && loginData.success && loginData.user) {
                            if (typeof PortalAuth !== 'undefined') PortalAuth.setUser('doctor', loginData.user);
                            window.currentUser = loginData.user;
                            if (typeof bootDoctorDashboard === 'function') {
                                bootDoctorDashboard(loginData.user);
                                return;
                            }
                        }
                    }
                } catch (loginErr) {
                    console.warn('[signup] auto-login', loginErr);
                }
                alert(data.message || 'Account created. Please sign in.');
                switchDoctorAuthTab('login');
                prefillLoginForm(email, phone, password);
                return;
            }
            if (data.needsLogin) {
                alert(data.error || 'Please sign in.');
                switchDoctorAuthTab('login');
                return;
            }
            const failMsg =
                data.error ||
                (window.HttpJson ? window.HttpJson.apiErrorMessage(res, data, false) : 'Signup failed');
            if (errEl) {
                errEl.textContent = failMsg;
                errEl.classList.remove('hidden');
            } else alert(failMsg);
        } catch (err) {
            console.error(err);
            alert('Network error.');
        }
    }

    function wireSignupOtpButtons() {
        ['phone'].forEach((ch) => {
            const send = document.getElementById('doctor-signup-send-otp-' + ch);
            const resend = document.getElementById('doctor-signup-resend-otp-' + ch);
            const verify = document.getElementById('doctor-signup-verify-otp-' + ch);
            if (send) send.addEventListener('click', () => sendSignupOtp(ch).catch(console.error));
            if (resend) resend.addEventListener('click', () => sendSignupOtp(ch).catch(console.error));
            if (verify) verify.addEventListener('click', () => verifySignupOtp(ch).catch(console.error));
        });
    }

    function validatedLoginPhoneValue() {
        const raw = String((document.getElementById('doctor-login-phone') || {}).value || '').trim();
        if (typeof validatePhoneClient === 'function') {
            return validatePhoneClient(raw, 'Phone');
        }
        const digits = raw.replace(/\D/g, '');
        return digits.length >= 10
            ? { valid: true, cleanedPhone: digits.slice(-10) }
            : { valid: false, message: 'Enter your 10-digit WhatsApp number.' };
    }

    function bindPhoneLogin(onSuccess, onError) {
        const form = document.getElementById('doctor-login-form');
        const sendBtn = document.getElementById('doctor-send-otp-phone');
        const resendBtn = document.getElementById('doctor-resend-otp-phone');
        const submitBtn = document.getElementById('doctor-login-submit');
        const statusEl = document.getElementById('doctor-login-otp-status');
        const errEl = document.getElementById('doctor-login-err');
        if (!form) return;

        function showErr(msg) {
            if (errEl) {
                errEl.textContent = msg;
                errEl.classList.remove('hidden');
            } else if (onError) onError(msg);
            else alert(msg);
        }

        function clearErr() {
            if (errEl) {
                errEl.textContent = '';
                errEl.classList.add('hidden');
            }
        }

        function setStatus(msg, color) {
            if (!statusEl) return;
            statusEl.textContent = msg || '';
            statusEl.style.color = color || '#64748b';
        }

        async function readApiJson(res) {
            if (global.HttpJson) {
                const { data, parseFailed } = await global.HttpJson.readJsonResponse(res);
                return { data, parseFailed };
            }
            try {
                return { data: await res.json(), parseFailed: false };
            } catch (_) {
                return { data: {}, parseFailed: true };
            }
        }

        async function sendLoginOtp() {
            clearErr();
            const pv = validatedLoginPhoneValue();
            if (!pv.valid) return showErr(pv.message);
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.textContent = 'Sending…';
            }
            setStatus('Sending OTP to WhatsApp…', '#64748b');
            try {
                const res = await fetch('/api/auth/login-otp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: pv.cleanedPhone, channel: 'phone' })
                });
                const { data, parseFailed } = await readApiJson(res);
                if (parseFailed || !res.ok) {
                    if (data.needsSignup) {
                        switchDoctorAuthTab('signup');
                        const sp = document.getElementById('doctor-signup-phone');
                        if (sp) sp.value = pv.cleanedPhone;
                        return showErr(
                            (data.error || 'No account with this number.') + ' Switch to Create account.'
                        );
                    }
                    const msg =
                        parseFailed && global.HttpJson
                            ? global.HttpJson.apiErrorMessage(res, data, true)
                            : data.error || 'Could not send OTP.';
                    setStatus('', '#64748b');
                    return showErr(msg);
                }
                if (global.OtpUi) {
                    global.OtpUi.cooldownLoginChannel('phone', 'doctor', 'doctor-resend-otp-phone', 60);
                    global.OtpUi.notifyOtpSent('phone', data, {
                        silent: true,
                        inlineEl: statusEl,
                        customMessage: 'Code sent to WhatsApp. Enter it above and tap Sign in.'
                    });
                } else {
                    setStatus('Code sent to WhatsApp.', '#059669');
                }
                const codeEl = document.getElementById('doctor-phone-otp');
                if (codeEl) codeEl.focus();
            } catch (err) {
                console.error(err);
                setStatus('', '#64748b');
                showErr('Could not reach the server.');
            } finally {
                if (sendBtn && sendBtn.textContent === 'Sending…') {
                    sendBtn.disabled = false;
                    sendBtn.textContent = 'Send OTP';
                }
            }
        }

        if (sendBtn) sendBtn.addEventListener('click', () => sendLoginOtp().catch(console.error));
        if (resendBtn) resendBtn.addEventListener('click', () => sendLoginOtp().catch(console.error));

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErr();
            const pv = validatedLoginPhoneValue();
            if (!pv.valid) return showErr(pv.message);
            const code = String((document.getElementById('doctor-phone-otp') || {}).value || '').trim();
            if (!code) return showErr('Enter the OTP code from WhatsApp.');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Signing in…';
            }
            setStatus('Verifying and signing you in…', '#64748b');
            try {
                const res = await fetch('/api/auth/login-phone-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: pv.cleanedPhone, code, portal: 'doctor' })
                });
                const { data, parseFailed } = await readApiJson(res);
                if (!res.ok || !data.success) {
                    if (data.needsSignup) {
                        switchDoctorAuthTab('signup');
                        const sp = document.getElementById('doctor-signup-phone');
                        if (sp) sp.value = pv.cleanedPhone;
                    }
                    const msg =
                        parseFailed && global.HttpJson
                            ? global.HttpJson.apiErrorMessage(res, data, true)
                            : data.error || 'Sign in failed.';
                    setStatus('', '#64748b');
                    return showErr(msg);
                }
                if (global.PortalAuth) global.PortalAuth.setUser('doctor', data.user);
                window.currentUser = data.user;
                setStatus('', '#64748b');
                if (typeof onSuccess === 'function') onSuccess(data.user);
            } catch (err) {
                console.error(err);
                setStatus('', '#64748b');
                showErr('Could not reach the server.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign in';
                }
            }
        });
    }

    function doctorReturnToPage() {
        const q = new URLSearchParams(window.location.search);
        return q.get('app') === '1' ? '/dashboard?app=1' : '/dashboard';
    }

    function openDoctorForgotPasswordModal() {
        const overlay = document.getElementById('doctor-forgot-password-overlay');
        const fe = document.getElementById('doctor-forgot-email');
        const st = document.getElementById('doctor-forgot-status');
        if (st) st.textContent = '';
        if (overlay) overlay.style.display = 'flex';
    }

    function closeDoctorForgotPasswordModal() {
        const overlay = document.getElementById('doctor-forgot-password-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function stripResetTokenFromUrl() {
        try {
            const u = new URL(window.location.href);
            if (!u.searchParams.has('resetToken')) return;
            u.searchParams.delete('resetToken');
            const qs = u.searchParams.toString();
            window.history.replaceState({}, '', u.pathname + (qs ? '?' + qs : '') + u.hash);
        } catch (_) {}
    }

    function openDoctorResetPasswordModal(token) {
        const overlay = document.getElementById('doctor-reset-password-overlay');
        const t = document.getElementById('doctor-reset-token');
        if (t) t.value = token || '';
        const authOverlay = document.getElementById('auth-overlay');
        const dash = document.getElementById('dashboard-main');
        if (authOverlay) authOverlay.classList.remove('hidden');
        if (dash) dash.classList.add('hidden');
        switchDoctorAuthTab('login');
        if (overlay) overlay.style.display = 'flex';
        stripResetTokenFromUrl();
    }

    function closeDoctorResetPasswordModal() {
        const overlay = document.getElementById('doctor-reset-password-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function handleDoctorForgotPassword(e) {
        e.preventDefault();
        const emailRaw = String((document.getElementById('doctor-forgot-email') || {}).value || '').trim();
        let email = emailRaw.toLowerCase();
        if (typeof validateEmailClient === 'function') {
            const ev = validateEmailClient(emailRaw, 'Email');
            if (!ev.valid) return alert(ev.message);
            email = ev.cleanedEmail;
        }
        const st = document.getElementById('doctor-forgot-status');
        if (st) {
            st.style.color = '#64748b';
            st.textContent = 'Sending…';
        }
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, returnTo: doctorReturnToPage() })
            });
            let data = {};
            if (window.HttpJson) {
                const parsed = await window.HttpJson.readJsonResponse(res);
                data = parsed.data;
            } else {
                data = await res.json();
            }
            if (!res.ok) {
                if (st) {
                    st.style.color = '#b91c1c';
                    st.textContent = data.error || 'Could not send reset link.';
                }
                return;
            }
            if (st) {
                st.style.color = '#059669';
                st.textContent = data.message || 'Check your email and WhatsApp.';
            }
        } catch (_) {
            if (st) {
                st.style.color = '#b91c1c';
                st.textContent = 'Could not send.';
            }
        }
    }

    async function handleDoctorResetPassword(e) {
        e.preventDefault();
        const token = String((document.getElementById('doctor-reset-token') || {}).value || '').trim();
        const p1 = (document.getElementById('doctor-reset-password') || {}).value;
        const p2 = (document.getElementById('doctor-reset-password2') || {}).value;
        const st = document.getElementById('doctor-reset-status');
        if (p1 !== p2) {
            if (st) {
                st.style.color = '#b91c1c';
                st.textContent = 'Passwords do not match.';
            }
            return;
        }
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: p1 })
            });
            let data = {};
            if (window.HttpJson) {
                const parsed = await window.HttpJson.readJsonResponse(res);
                data = parsed.data;
            } else {
                data = await res.json();
            }
            if (!res.ok) throw new Error(data.error || 'Failed');
            if (st) {
                st.style.color = '#059669';
                st.textContent = data.message || 'Password updated. You can sign in now.';
            }
            setTimeout(() => {
                closeDoctorResetPasswordModal();
                switchDoctorAuthTab('login');
                stripResetTokenFromUrl();
            }, 1200);
        } catch (err) {
            if (st) {
                st.style.color = '#b91c1c';
                st.textContent = err.message || 'Could not reset password.';
            }
        }
    }

    function wireForgotPasswordUi() {
        const forgotBtn = document.getElementById('doctor-forgot-password-btn');
        const forgotCancel = document.getElementById('doctor-forgot-cancel');
        const forgotForm = document.getElementById('doctor-forgot-password-form');
        const resetForm = document.getElementById('doctor-reset-password-form');
        if (forgotBtn) forgotBtn.addEventListener('click', openDoctorForgotPasswordModal);
        if (forgotCancel) forgotCancel.addEventListener('click', closeDoctorForgotPasswordModal);
        if (forgotForm) forgotForm.addEventListener('submit', handleDoctorForgotPassword);
        if (resetForm) resetForm.addEventListener('submit', handleDoctorResetPassword);
        const params = new URLSearchParams(window.location.search);
        const rt = params.get('resetToken');
        if (rt) openDoctorResetPasswordModal(rt);
    }

    function blockHomepageNavigation() {
        if (!isStandaloneDoctorApp()) return;
        document.addEventListener(
            'click',
            (e) => {
                const a = e.target.closest('a[href]');
                if (!a) return;
                const href = (a.getAttribute('href') || '').trim();
                if (
                    href === '/' ||
                    href === '/index.html' ||
                    href.startsWith('/?') ||
                    (href.startsWith('http') && !href.includes('/dashboard'))
                ) {
                    e.preventDefault();
                    if (href.includes('register')) switchDoctorAuthTab('signup');
                }
            },
            true
        );
    }

    window.DoctorAuthUi = {
        isStandaloneDoctorApp,
        switchDoctorAuthTab,
        bindPhoneLogin,
        wireApplicantPhoneLogin,
        init: function () {
            if (ensureFreshMobileAuthPage()) return;
            ensurePhoneLoginMarkup();
            applyStandaloneUi();
            blockHomepageNavigation();
            if (global.PortalAuth && typeof global.PortalAuth.loadPublicPortalAuth === 'function') {
                global.PortalAuth.loadPublicPortalAuth().then((cfg) => {
                    if (typeof global.PortalAuth.applyApplicantAuthUi === 'function') {
                        global.PortalAuth.applyApplicantAuthUi(cfg);
                    }
                });
            }
            refreshSignupOtpPanel();
            wireSignupOtpButtons();
            wireForgotPasswordUi();
            const signupForm = document.getElementById('doctor-signup-form');
            if (signupForm) signupForm.addEventListener('submit', handleDoctorSignup);
            wireApplicantPhoneLogin(
                typeof bootDoctorDashboard === 'function' ? bootDoctorDashboard : null,
                (msg) => {
                    const el = document.getElementById('doctor-login-err');
                    if (el) {
                        el.textContent = msg;
                        el.classList.remove('hidden');
                    } else alert(msg);
                }
            );
            if (isStandaloneDoctorApp()) switchDoctorAuthTab('login');
            const params = new URLSearchParams(window.location.search);
            if (params.get('register') === '1' || params.get('signup') === '1') {
                switchDoctorAuthTab('signup');
            } else if (params.get('login') === '1') {
                switchDoctorAuthTab('login');
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.DoctorAuthUi.init());
    } else {
        window.DoctorAuthUi.init();
    }
})(window);
