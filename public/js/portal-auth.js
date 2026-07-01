/**
 * Per-portal login sessions (separate localStorage keys per app).
 * Accounts are created in Admin → Users & CRM.
 */
(function (global) {
    const KEYS = {
        doctor: 'seminar_doctor_user',
        judge: 'seminar_judge_user',
        scanner: 'seminar_scanner_user'
    };

    function normRole(user) {
        const ur = String((user && user.user_role) || '').trim().toLowerCase();
        const r = String((user && user.role) || '').trim().toLowerCase();
        return { ur, r };
    }

    function isDoctorUser(user) {
        if (!user) return false;
        if (isAdminPortalUser(user) || isJudgeUser(user) || isScannerUser(user)) return false;
        const { ur, r } = normRole(user);
        return ur === 'doctor' || r === 'doctor' || ur === 'event_attendee';
    }

    function isJudgeUser(user) {
        const { ur } = normRole(user);
        return ur === 'judge_user' || ur === 'reviewer';
    }

    function isScannerUser(user) {
        const { ur } = normRole(user);
        return ur === 'scanner_portal_user' || ur === 'scanner_dashboard_user';
    }

    function isAdminPortalUser(user) {
        const { ur, r } = normRole(user);
        return r === 'admin' || ur === 'co_admin';
    }

    function allowedForPortal(user, portal) {
        if (!user) return false;
        if (portal === 'doctor') return isDoctorUser(user);
        if (portal === 'judge') return isJudgeUser(user);
        if (portal === 'scanner') return isScannerUser(user);
        return false;
    }

    function getUser(portal) {
        const key = KEYS[portal];
        if (!key) return null;
        try {
            let raw = localStorage.getItem(key);
            if (!raw) {
                const legacy = localStorage.getItem('seminar_user');
                if (legacy) {
                    const u = JSON.parse(legacy);
                    if (allowedForPortal(u, portal)) {
                        setUser(portal, u);
                        return u;
                    }
                }
                return null;
            }
            const u = JSON.parse(raw);
            return allowedForPortal(u, portal) ? u : null;
        } catch (_) {
            return null;
        }
    }

    function formatLoginTime(iso) {
        if (!iso) return '';
        if (global.PortalDateTime && typeof global.PortalDateTime.format === 'function') {
            return global.PortalDateTime.format(iso);
        }
        try {
            return new Date(iso).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (_) {
            return String(iso);
        }
    }

    function loginTimeLabel(user) {
        if (!user) return '';
        const signedIn = formatLoginTime(user.login_at || user.last_login_at);
        if (!signedIn) return '';
        const prev = formatLoginTime(user.previous_login_at);
        if (prev) return 'Signed in ' + signedIn + ' · Previous login ' + prev;
        return 'Signed in ' + signedIn;
    }

    function renderLoginTime(target, user) {
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return;
        const text = loginTimeLabel(user);
        el.textContent = text;
        if (text) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }

    function setUser(portal, user) {
        if (user && user.id != null) user.id = Number(user.id);
        if (user && !user.login_at) user.login_at = user.last_login_at || new Date().toISOString();
        localStorage.setItem(KEYS[portal], JSON.stringify(user));
    }

    function clearUser(portal) {
        localStorage.removeItem(KEYS[portal]);
    }

    async function loadPublicPortalAuth() {
        if (global.__portalAuth && global.__portalAuthLoaded) return global.__portalAuth;
        try {
            const res = await fetch('/api/public/portal-auth', { cache: 'no-store' });
            const data = await res.json();
            global.__portalAuth = data || {};
            global.__portalAuthLoaded = true;
            return global.__portalAuth;
        } catch (_) {
            return global.__portalAuth || {};
        }
    }

    function applyApplicantAuthUi(cfg) {
        cfg = cfg || global.__portalAuth || {};
        const passwordless = !!cfg.passwordlessLogin;
        const loginOtpOn = cfg.applicantLoginOtpRequired === true || cfg.requireLoginOtp === true;
        const signupOtpOn = cfg.requireSignupOtp !== false;
        const isAutismDash = document.body && document.body.classList.contains('ak-portal-dash');
        const signupChannels = {
            whatsapp: cfg.signupOtpWhatsapp !== false,
            email: isAutismDash ? false : cfg.signupOtpEmail === true
        };
        const loginChannels = {
            whatsapp: cfg.loginOtpWhatsapp === true,
            email: cfg.loginOtpEmail !== false
        };
        const phoneOnlyLoginUi =
            !!document.getElementById('doctor-login-submit') ||
            (document.getElementById('doctor-login-form') &&
                document.getElementById('doctor-login-form').getAttribute('data-auth-ui') === 'phone-v2');

        ['doctor-login-password-wrap', 'doctor-signup-password-wrap'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const isLogin = id === 'doctor-login-password-wrap';
            const showPwd = isLogin ? !loginOtpOn : !signupOtpOn || !passwordless;
            el.style.display = showPwd ? '' : 'none';
            el.classList.toggle('hidden', !showPwd);
            const input = el.querySelector('input[type="password"]');
            if (input) input.required = showPwd;
        });
        const forgotBtn = document.getElementById('doctor-forgot-password-btn');
        if (forgotBtn) {
            forgotBtn.style.display = loginOtpOn ? 'none' : '';
            forgotBtn.classList.toggle('hidden', loginOtpOn);
        }

        const signupEmailRow = document.getElementById('doctor-signup-email-otp-row');
        if (signupEmailRow) {
            if (document.body.classList.contains('ak-portal-dash') || !signupChannels.email) {
                signupEmailRow.remove();
            } else {
                signupEmailRow.style.display = '';
            }
        }
        const signupPhoneRow = document.getElementById('doctor-signup-phone-otp-row');
        if (signupPhoneRow) signupPhoneRow.style.display = signupChannels.whatsapp ? '' : 'none';
        const signupLead = document.getElementById('doctor-signup-otp-lead');
        if (signupLead) {
            signupLead.textContent = signupChannels.email
                ? 'Verify email and WhatsApp before signup.'
                : 'Tap Send OTP once, enter the code from WhatsApp, then tap Create account.';
        }

        if (phoneOnlyLoginUi) {
            const legacyPanel = document.getElementById('doctor-login-otp-panel');
            if (legacyPanel) legacyPanel.remove();
            const legacyEmail = document.getElementById('doctor-login-email');
            if (legacyEmail) {
                const emailLabel = legacyEmail.previousElementSibling;
                if (emailLabel && emailLabel.tagName === 'LABEL') emailLabel.remove();
                legacyEmail.remove();
            }
            ['doctor-login-email-otp-row', 'doctor-login-phone-otp-row', 'doctor-verify-otp-phone', 'doctor-verify-otp-email'].forEach(
                (id) => {
                    const el = document.getElementById(id);
                    if (el && el.closest('#doctor-login-otp-panel')) return;
                    if (el && el.closest('#doctor-auth-login-panel')) el.remove();
                }
            );
        } else {
            const loginEmailRow = document.getElementById('doctor-login-email-otp-row');
            if (loginEmailRow) loginEmailRow.style.display = loginChannels.email ? '' : 'none';
            const loginPhoneRow = document.getElementById('doctor-login-phone-otp-row');
            if (loginPhoneRow) loginPhoneRow.style.display = loginChannels.whatsapp ? '' : 'none';
            const loginLead = document.getElementById('doctor-login-otp-lead');
            const loginPanel = document.getElementById('doctor-login-otp-panel');
            if (loginPanel) {
                loginPanel.style.display = loginOtpOn ? 'block' : 'none';
            }
            if (loginLead) {
                if (passwordless) {
                    loginLead.textContent = loginChannels.email
                        ? 'Sign in with WhatsApp OTP (no password).'
                        : 'Enter your WhatsApp number, send OTP, verify, then sign in.';
                } else if (loginChannels.email && loginChannels.whatsapp) {
                    loginLead.textContent = 'Verify email and WhatsApp (both required).';
                } else if (loginChannels.whatsapp) {
                    loginLead.textContent = 'Verify WhatsApp OTP to sign in.';
                } else {
                    loginLead.textContent = 'Verify email OTP to sign in.';
                }
            }
        }
        const signupPanel = document.getElementById('doctor-signup-otp-panel');
        if (signupPanel) {
            signupPanel.style.display = signupOtpOn ? 'block' : 'none';
        }

        const loginOtpWrap = document.getElementById('doctor-login-otp-wrap');
        if (loginOtpWrap) {
            loginOtpWrap.style.display = loginOtpOn ? '' : 'none';
            loginOtpWrap.classList.toggle('hidden', !loginOtpOn);
        }

        if (phoneOnlyLoginUi) {
            const loginIntro = document.querySelector('#doctor-auth-login-panel > p');
            if (loginIntro) {
                loginIntro.textContent = loginOtpOn
                    ? 'Enter your WhatsApp number, tap Send OTP, enter the code, then sign in.'
                    : 'Sign in with your email and password.';
            }
        }
    }

    async function refreshLoginOtpPanel(panelEl, portal) {
        if (!panelEl) return;
        if (portal === 'judge' || portal === 'scanner' || portal === 'admin') {
            panelEl.style.display = 'none';
            return;
        }
        try {
            const cfg = await loadPublicPortalAuth();
            applyApplicantAuthUi(cfg);
            const q = portal ? '?portal=' + encodeURIComponent(portal) : '';
            const res = await fetch('/api/auth/login-otp-required' + q);
            const d = await res.json();
            panelEl.style.display = d.required ? 'block' : 'none';
        } catch (_) {
            panelEl.style.display = 'none';
        }
    }

    function wrongPortalHint(user) {
        const { ur, r } = normRole(user);
        if (isAdminPortalUser(user)) return 'Use the admin portal: /admin.html';
        if (isJudgeUser(user)) return 'Use the judge portal: /judge.html';
        if (isScannerUser(user)) return 'Use the scanner portal: /scanner.html';
        if (isDoctorUser(user)) return 'Use the applicant dashboard: /dashboard';
        if (r === 'admin') return 'Use the admin portal: /admin.html';
        return 'This account cannot access this portal. Please sign in with the correct account.';
    }

    /**
     * Wire a portal login form.
     * @param {object} opts
     * @param {'doctor'|'judge'|'scanner'} opts.portal
     * @param {string} opts.formId
     * @param {string} opts.otpPanelId
     * @param {function(object): void} opts.onSuccess
     * @param {function(string): void} [opts.onError]
     */
    function bindLoginForm(opts) {
        const portal = opts.portal;
        const form = document.getElementById(opts.formId);
        const otpPanel = document.getElementById(opts.otpPanelId);
        if (!form) return;

        let phoneOtpToken = null;
        let emailOtpToken = null;

        const otpPortal = portal === 'doctor' ? 'public' : portal;
        refreshLoginOtpPanel(otpPanel, otpPortal);

        const prefix = opts.otpPrefix || portal;
        const phoneOnlyLogin = !!opts.phoneOnlyLogin;
        const sendBtnEmail = document.getElementById(prefix + '-send-otp-email');
        const sendBtnPhone = document.getElementById(prefix + '-send-otp-phone');
        const resendBtnEmail = opts.resendEmailBtnId ? document.getElementById(opts.resendEmailBtnId) : null;
        const resendBtnPhone = opts.resendPhoneBtnId ? document.getElementById(opts.resendPhoneBtnId) : null;
        const verifyBtnEmail = document.getElementById(prefix + '-verify-otp-email');
        const verifyBtnPhone = document.getElementById(prefix + '-verify-otp-phone');

        function validatedLoginEmail() {
            if (phoneOnlyLogin) {
                return { valid: true, cleanedEmail: '' };
            }
            const raw = String((document.getElementById(opts.emailInputId) || {}).value || '').trim();
            if (typeof validateEmailClient === 'function') {
                return validateEmailClient(raw, 'Email');
            }
            return raw
                ? { valid: true, cleanedEmail: raw.toLowerCase() }
                : { valid: false, message: 'Enter your email first.' };
        }

        function validatedLoginPhone() {
            const phoneInputId = opts.phoneInputId || prefix + '-login-phone';
            const id =
                document.getElementById(phoneInputId) ||
                document.getElementById('doctor-login-phone') ||
                document.getElementById(prefix + '-phone');
            const raw = String((id || {}).value || '').trim();
            if (typeof validatePhoneClient === 'function') {
                return validatePhoneClient(raw, 'Phone');
            }
            const digits = raw.replace(/\D/g, '');
            return digits.length >= 10
                ? { valid: true, cleanedPhone: digits.slice(-10) }
                : { valid: false, message: 'Enter your WhatsApp phone number.' };
        }

        function loginOtpPayload(email) {
            const pv = validatedLoginPhone();
            if (phoneOnlyLogin) {
                return pv.valid
                    ? { payload: { phone: pv.cleanedPhone }, phoneValid: pv }
                    : { payload: {}, phoneValid: pv };
            }
            const payload = { email };
            if (pv.valid) payload.phone = pv.cleanedPhone;
            return { payload, phoneValid: pv };
        }

        function startLoginOtpCooldown(channel) {
            if (!global.OtpUi || typeof global.OtpUi.cooldownLoginChannel !== 'function') return;
            global.OtpUi.cooldownLoginChannel(
                channel,
                prefix,
                channel === 'phone' ? opts.resendPhoneBtnId : opts.resendEmailBtnId,
                60
            );
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

        async function precheckLogin(payload) {
            const res = await fetch('/api/auth/login-otp/precheck', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const { data } = await readApiJson(res);
            return data;
        }

        async function sendOtp(channel) {
            const pv = validatedLoginPhone();
            if (!pv.valid) return alert(pv.message);
            const ev = validatedLoginEmail();
            if (!phoneOnlyLogin && !ev.valid) return alert(ev.message);
            const phonePack = loginOtpPayload(ev.cleanedEmail);
            if (!phonePack.phoneValid.valid) return alert(phonePack.phoneValid.message);
            const pc = await precheckLogin(phonePack.payload);
            if (pc.needsSignup) {
                return alert(
                    pc.message ||
                        (phoneOnlyLogin
                            ? 'No account with this phone number. Please create an account first.'
                            : 'No account with this email. Please create an account first.')
                );
            }
            const res = await fetch('/api/auth/login-otp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ channel }, phonePack.payload))
            });
            const { data, parseFailed } = await readApiJson(res);
            if (parseFailed || !res.ok) {
                if (data.needsSignup) {
                    return alert(data.error || 'No account found. Please create an account first.');
                }
                const msg = parseFailed && global.HttpJson
                    ? global.HttpJson.apiErrorMessage(res, data, true)
                    : data.error || 'Could not send code.';
                return alert(msg);
            }
            if (data.debugCode) console.info('Login OTP debug:', data.debugCode);
            startLoginOtpCooldown(channel);
            if (global.OtpUi) global.OtpUi.notifyOtpSent(channel, data);
            else alert('OTP sent successfully to your ' + (channel === 'email' ? 'email' : 'WhatsApp') + '.');
        }

        async function sendBothOtps() {
            const pv = validatedLoginPhone();
            if (!pv.valid) return alert(pv.message);
            const ev = validatedLoginEmail();
            if (!ev.valid) return alert(ev.message);
            const phonePack = loginOtpPayload(ev.cleanedEmail);
            if (!phonePack.phoneValid.valid) return alert(phonePack.phoneValid.message);
            const pc = await precheckLogin(phonePack.payload);
            if (pc.needsSignup) {
                return alert(pc.message || 'No account with this email. Please create an account first.');
            }
            const res = await fetch('/api/auth/login-otp/send-both', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(phonePack.payload)
            });
            const { data, parseFailed } = await readApiJson(res);
            if (parseFailed || !res.ok) {
                const msg = parseFailed && global.HttpJson
                    ? global.HttpJson.apiErrorMessage(res, data, true)
                    : data.error || 'Could not send codes.';
                return alert(msg);
            }
            startLoginOtpCooldown('email');
            startLoginOtpCooldown('phone');
            if (global.OtpUi) global.OtpUi.notifyOtpSent(null, data, { both: true });
            else alert('OTP sent successfully to your email and WhatsApp.');
        }

        async function verifyOtp(channel) {
            const pv = validatedLoginPhone();
            if (!pv.valid) return alert(pv.message);
            const ev = validatedLoginEmail();
            if (!phoneOnlyLogin && !ev.valid) return alert(ev.message);
            const phonePack = loginOtpPayload(ev.cleanedEmail);
            if (!phonePack.phoneValid.valid) return alert(phonePack.phoneValid.message);
            const codeEl = document.getElementById(
                channel === 'email' ? prefix + '-email-otp' : prefix + '-phone-otp'
            );
            const okEl = document.getElementById(
                channel === 'email' ? prefix + '-email-otp-ok' : prefix + '-phone-otp-ok'
            );
            const code = String((codeEl || {}).value || '').trim();
            if (!code) return alert('Enter the OTP code.');
            const res = await fetch('/api/auth/login-otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ channel, code }, phonePack.payload))
            });
            const { data, parseFailed } = await readApiJson(res);
            if (parseFailed || !res.ok) {
                const msg = parseFailed && global.HttpJson
                    ? global.HttpJson.apiErrorMessage(res, data, true)
                    : data.error || 'Invalid code.';
                return alert(msg);
            }
            if (!data.token) return alert('Verification failed. Please try again.');
            if (channel === 'email') emailOtpToken = data.token;
            else phoneOtpToken = data.token;
            if (okEl) okEl.textContent = 'Verified';
        }

        if (sendBtnEmail) sendBtnEmail.addEventListener('click', () => sendOtp('email').catch(console.error));
        if (sendBtnPhone) sendBtnPhone.addEventListener('click', () => sendOtp('phone').catch(console.error));
        const sendBothBtn = document.getElementById(prefix + '-send-otp-both');
        if (sendBothBtn) sendBothBtn.addEventListener('click', () => sendBothOtps().catch(console.error));
        if (resendBtnEmail) resendBtnEmail.addEventListener('click', () => sendOtp('email').catch(console.error));
        if (resendBtnPhone) resendBtnPhone.addEventListener('click', () => sendOtp('phone').catch(console.error));
        if (verifyBtnEmail) verifyBtnEmail.addEventListener('click', () => verifyOtp('email').catch(console.error));
        if (verifyBtnPhone) verifyBtnPhone.addEventListener('click', () => verifyOtp('phone').catch(console.error));

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pv = validatedLoginPhone();
            if (!pv.valid) return alert(pv.message);
            const ev = validatedLoginEmail();
            if (!phoneOnlyLogin && !ev.valid) return alert(ev.message);
            const phonePack = loginOtpPayload(ev.cleanedEmail);
            if (!phonePack.phoneValid.valid) return alert(phonePack.phoneValid.message);
            const password = (document.getElementById(opts.passwordInputId) || {}).value;
            const cfg = global.__portalAuth || {};
            const passwordless = !!cfg.passwordlessLogin;
            const loginChannels = {
                whatsapp: cfg.loginOtpWhatsapp === true,
                email: cfg.loginOtpEmail !== false
            };
            const body = Object.assign({ portal: portal === 'doctor' ? 'doctor' : portal }, phonePack.payload);
            if (!passwordless) body.password = password;
            const otpActive =
                otpPanel &&
                otpPanel.style.display !== 'none' &&
                !otpPanel.classList.contains('hidden') &&
                (cfg.applicantLoginOtpRequired === true || cfg.requireLoginOtp === true);
            if (otpActive) {
                if (loginChannels.whatsapp && !phoneOtpToken) {
                    const msg = passwordless
                        ? 'Verify WhatsApp OTP before signing in.'
                        : 'Verify WhatsApp OTP before signing in (Send → code → Verify).';
                    if (opts.onError) opts.onError(msg);
                    else alert(msg);
                    return;
                }
                if (loginChannels.email && !emailOtpToken) {
                    const msg = 'Verify email OTP before signing in.';
                    if (opts.onError) opts.onError(msg);
                    else alert(msg);
                    return;
                }
                if (loginChannels.whatsapp) body.phoneOtpToken = phoneOtpToken;
                if (loginChannels.email) body.emailOtpToken = emailOtpToken;
            }
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const { data, parseFailed } = await readApiJson(res);
                if (res.status === 403 && data.needsEmailVerification) {
                    const msg =
                        data.error ||
                        (data.useLoginOtp || (otpPanel && otpPanel.style.display !== 'none')
                            ? 'Verify your email with the Email OTP above (Send → enter code → Verify), then sign in again.'
                            : 'Please verify your email before signing in.');
                    if (opts.onError) opts.onError(msg);
                    else alert(msg);
                    return;
                }
                if (!res.ok || !data.success) {
                    if (data.needsSignup) {
                        const msg =
                            data.error ||
                            (phoneOnlyLogin
                                ? 'No account found with this phone number.'
                                : 'No account found with this email.');
                        if (
                            portal === 'doctor' &&
                            global.DoctorAuthUi &&
                            typeof global.DoctorAuthUi.switchDoctorAuthTab === 'function'
                        ) {
                            global.DoctorAuthUi.switchDoctorAuthTab('signup');
                            if (phoneOnlyLogin && phonePack.payload.phone) {
                                const sp = document.getElementById('doctor-signup-phone');
                                if (sp) sp.value = phonePack.payload.phone;
                            }
                            if (opts.onError) opts.onError(msg + ' Use Create account to register.');
                            else alert(msg + ' Switch to Create account and register.');
                            return;
                        }
                        const go = confirm(msg + '\n\nCreate an account now?');
                        if (go) {
                            if (/\/doctor\.html/i.test(String(global.location.pathname || ''))) {
                                global.location.href = '/dashboard?register=1';
                            } else {
                                global.location.href = '/?register=1';
                            }
                        }
                        return;
                    }
                    const msg =
                        parseFailed && global.HttpJson
                            ? global.HttpJson.apiErrorMessage(res, data, true)
                            : data.error || 'Login failed.';
                    if (opts.onError) opts.onError(msg);
                    else alert(msg);
                    return;
                }
                if (!allowedForPortal(data.user, portal)) {
                    const hint = wrongPortalHint(data.user);
                    if (opts.onError) opts.onError(hint);
                    else alert(hint);
                    return;
                }
                setUser(portal, data.user);
                phoneOtpToken = null;
                emailOtpToken = null;
                opts.onSuccess(data.user, data);
            } catch (err) {
                console.error(err);
                const msg = 'Could not reach the server.';
                if (opts.onError) opts.onError(msg);
                else alert(msg);
            }
        });
    }

    global.PortalAuth = {
        KEYS,
        getUser,
        setUser,
        clearUser,
        allowedForPortal,
        isDoctorUser,
        isJudgeUser,
        isScannerUser,
        isAdminPortalUser,
        wrongPortalHint,
        refreshLoginOtpPanel,
        loadPublicPortalAuth,
        applyApplicantAuthUi,
        bindLoginForm,
        formatLoginTime,
        loginTimeLabel,
        renderLoginTime
    };
})(typeof window !== 'undefined' ? window : global);
