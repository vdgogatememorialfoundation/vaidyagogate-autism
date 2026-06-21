(function () {
    'use strict';

    const DEFAULT_STEP_SECTIONS = {
        1: 'Parent',
        2: 'Child',
        3: 'Address',
        4: 'Questions'
    };
    let stepSections = [];
    let preregFields = [];
    let seminarId = null;
    let seminarTitle = '';
    let wizardStep = 0;
    let showEventPicker = false;
    let __pinTimer = null;
    let __countdownTimer = null;
    let __closesTimer = null;
    let __countdownOpensAt = null;
    let __countdownSeminarId = null;

    function clearCountdownTimers() {
        if (__countdownTimer) {
            clearInterval(__countdownTimer);
            __countdownTimer = null;
        }
        if (__closesTimer) {
            clearInterval(__closesTimer);
            __closesTimer = null;
        }
    }

    function formatOpensAtLabel(opensAtMs) {
        if (!opensAtMs) return '';
        try {
            return (
                'Opens ' +
                new Date(opensAtMs).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }) +
                ' IST'
            );
        } catch (_) {
            return '';
        }
    }

    function formatCountdownParts(targetMs) {
        const diff = Math.max(0, targetMs - Date.now());
        const sec = Math.floor(diff / 1000) % 60;
        const min = Math.floor(diff / 60000) % 60;
        const hr = Math.floor(diff / 3600000) % 24;
        const day = Math.floor(diff / 86400000);
        return { diff, day, hr, min, sec };
    }

    function formatCountdownShort(targetMs) {
        const p = formatCountdownParts(targetMs);
        if (p.diff <= 0) return 'now';
        const parts = [];
        if (p.day) parts.push(p.day + 'd');
        if (p.day || p.hr) parts.push(p.hr + 'h');
        parts.push(p.min + 'm');
        parts.push(p.sec + 's');
        return parts.join(' ');
    }

    function updateCountdownGrid(opensAt) {
        const p = formatCountdownParts(opensAt);
        const set = (id, val) => {
            const el = qs(id);
            if (el) el.textContent = String(val);
        };
        set('pub-cd-days', p.day);
        set('pub-cd-hours', p.hr);
        set('pub-cd-mins', p.min);
        set('pub-cd-secs', p.sec);
        return p.diff <= 0;
    }

    function showCountdownView(opts) {
        clearCountdownTimers();
        qs('pub-prereg-loading')?.classList.add('hidden');
        qs('pub-prereg-form-wrap')?.classList.add('hidden');
        qs('pub-prereg-unavailable')?.classList.add('hidden');
        qs('pub-prereg-success')?.classList.add('hidden');
        qs('pub-prereg-closes-wrap')?.classList.add('hidden');
        const card = qs('pub-prereg-countdown');
        if (!card) return;
        __countdownOpensAt = Number(opts.opensAt);
        __countdownSeminarId = opts.seminarId || seminarId;
        const titleEl = qs('pub-countdown-event-title');
        if (titleEl) titleEl.textContent = opts.title || seminarTitle || 'Event';
        const labelEl = qs('pub-countdown-label');
        if (labelEl) labelEl.textContent = opts.label || 'Pre-registration opens in';
        const opensEl = qs('pub-countdown-opens-at');
        if (opensEl) opensEl.textContent = formatOpensAtLabel(__countdownOpensAt);
        card.classList.remove('hidden');
        const tick = () => {
            const done = updateCountdownGrid(__countdownOpensAt);
            if (done) {
                clearCountdownTimers();
                card.classList.add('hidden');
                const sid = __countdownSeminarId;
                if (sid) {
                    seminarId = sid;
                    loadFormConfig(sid)
                        .then((mode) => {
                            if (mode === 'form') {
                                qs('pub-prereg-form-wrap')?.classList.remove('hidden');
                                wizardStep = showEventPicker ? 1 : 0;
                                showPanels();
                            }
                        })
                        .catch((e) => showUnavailable(e.message || 'Form not available yet.'));
                }
            }
        };
        tick();
        __countdownTimer = setInterval(tick, 1000);
    }

    function startClosesCountdown(closesAt) {
        const wrap = qs('pub-prereg-closes-wrap');
        const el = qs('pub-prereg-closes-in');
        if (!wrap || !el || !closesAt) return;
        const target = Number(closesAt);
        if (!Number.isFinite(target) || target <= Date.now()) return;
        wrap.classList.remove('hidden');
        const tick = () => {
            if (Date.now() >= target) {
                el.textContent = 'closed';
                if (__closesTimer) clearInterval(__closesTimer);
                __closesTimer = null;
                return;
            }
            el.textContent = formatCountdownShort(target);
        };
        tick();
        if (__closesTimer) clearInterval(__closesTimer);
        __closesTimer = setInterval(tick, 1000);
    }

    function stepTitle(step) {
        const n = parseInt(step, 10);
        const hit = (stepSections || []).find((s) => s && parseInt(s.step, 10) === n);
        return (hit && hit.title) || DEFAULT_STEP_SECTIONS[n] || 'Step ' + n;
    }

    function stepSubtitle(step) {
        const n = parseInt(step, 10);
        const hit = (stepSections || []).find((s) => s && parseInt(s.step, 10) === n);
        return hit && hit.subtitle ? hit.subtitle : '';
    }

    function appendStepPanelHeading(panel, step) {
        const title = stepTitle(step);
        const subtitle = stepSubtitle(step);
        const h = document.createElement('h3');
        h.className = 'pub-step-heading';
        h.style.cssText = 'margin:0 0 12px;color:#0f766e;font-size:1.05rem;';
        h.textContent = title;
        panel.appendChild(h);
        if (subtitle) {
            const p = document.createElement('p');
            p.className = 'pub-step-subheading';
            p.style.cssText = 'margin:-4px 0 12px;color:#64748b;font-size:0.88rem;';
            p.textContent = subtitle;
            panel.appendChild(p);
        }
    }

    function qs(id) {
        return document.getElementById(id);
    }

    function parseEventFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('event') || params.get('seminarId');
        const id = parseInt(raw, 10);
        return Number.isInteger(id) && id > 0 ? id : null;
    }

    async function fetchJson(url, opts) {
        const r = await fetch(url, opts);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText || 'Request failed');
        return data;
    }

    function showError(msg) {
        const el = qs('pub-prereg-error');
        if (!el) return;
        if (!msg) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    function showUnavailable(msg) {
        qs('pub-prereg-loading')?.classList.add('hidden');
        qs('pub-prereg-form-wrap')?.classList.add('hidden');
        const box = qs('pub-prereg-unavailable');
        const p = qs('pub-prereg-unavailable-msg');
        if (p) p.textContent = msg;
        box?.classList.remove('hidden');
    }

    function fieldsForStep(step) {
        return (preregFields || []).filter((f) => {
            if (!f || f.enabled === false) return false;
            const s = Number(f.step) || 1;
            return s === step;
        });
    }

    function maxWizardStep() {
        const steps = (preregFields || []).map((f) => Number(f.step) || 1).filter((n) => n > 0);
        return steps.length ? Math.max(...steps) : 4;
    }

    function totalSteps() {
        const base = showEventPicker ? 1 : 0;
        return base + 1 + maxWizardStep();
    }

    function logicalStepIndex() {
        if (showEventPicker && wizardStep === 0) return 'event';
        if (wizardStep === (showEventPicker ? 1 : 0)) return 'contact';
        const formStep = wizardStep - (showEventPicker ? 2 : 1);
        return formStep;
    }

    function createFieldInput(f) {
        let input;
        if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else if (f.type === 'select') {
            input = document.createElement('select');
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = 'Select';
            input.appendChild(opt0);
            (f.options || []).forEach((o) => {
                const opt = document.createElement('option');
                opt.value = typeof o === 'object' ? o.value : o;
                opt.textContent = typeof o === 'object' ? o.label || o.value : o;
                input.appendChild(opt);
            });
        } else if (f.type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
        } else {
            input = document.createElement('input');
            if (f.type === 'email') input.type = 'email';
            else if (f.type === 'tel') input.type = 'tel';
            else if (f.type === 'date') input.type = 'date';
            else if (f.type === 'number') input.type = 'number';
            else input.type = 'text';
        }
        input.id = 'pub-field-' + f.key;
        input.dataset.fieldKey = f.key;
        if (f.required && f.type !== 'boolean') input.required = true;
        if (f.defaultValue != null && f.type !== 'boolean') input.value = String(f.defaultValue);
        return input;
    }

    function renderFormFields() {
        const container = qs('pub-form-fields');
        if (!container) return;
        container.innerHTML = '';
        const maxStep = maxWizardStep();
        for (let step = 1; step <= maxStep; step++) {
            const fields = fieldsForStep(step);
            if (!fields.length) continue;
            const panel = document.createElement('div');
            panel.className = 'pub-step-panel hidden';
            panel.dataset.formStep = String(step);
            appendStepPanelHeading(panel, step);
            fields.forEach((f) => {
                const fg = document.createElement('div');
                fg.className = 'form-group';
                const label = document.createElement('label');
                label.setAttribute('for', 'pub-field-' + f.key);
                label.textContent = f.label + (f.required ? ' *' : '');
                fg.appendChild(label);
                const input = createFieldInput(f);
                fg.appendChild(input);
                if (f.key === 'pin' || f.key === 'pincode') {
                    input.addEventListener('blur', autofillFromPin);
                    input.addEventListener('input', () => {
                        clearTimeout(__pinTimer);
                        __pinTimer = setTimeout(autofillFromPin, 400);
                    });
                }
                panel.appendChild(fg);
            });
            container.appendChild(panel);
        }
        renderWizardNav();
    }

    function renderWizardNav() {
        const nav = qs('pub-wizard-nav');
        if (!nav) return;
        nav.innerHTML = '';
        const maxStep = maxWizardStep();
        let idx = 0;
        if (showEventPicker) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.step = String(idx);
            btn.textContent = 'Event';
            btn.addEventListener('click', () => goToStep(idx));
            nav.appendChild(btn);
            idx++;
        }
        {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.step = String(idx);
            btn.textContent = 'Contact';
            btn.addEventListener('click', () => goToStep(idx));
            nav.appendChild(btn);
            idx++;
        }
        for (let s = 1; s <= maxStep; s++) {
            if (!fieldsForStep(s).length) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.step = String(idx);
            btn.textContent = (s + '. ' + stepTitle(s));
            btn.addEventListener('click', () => goToStep(idx));
            nav.appendChild(btn);
            idx++;
        }
        nav.classList.remove('hidden');
    }

    function updateWizardNav() {
        const nav = qs('pub-wizard-nav');
        if (!nav) return;
        nav.querySelectorAll('button[data-step]').forEach((btn) => {
            const n = parseInt(btn.dataset.step, 10);
            btn.classList.toggle('is-active', n === wizardStep);
            btn.classList.toggle('is-done', n < wizardStep);
        });
    }

    function updateActions() {
        const back = qs('pub-wizard-back');
        const next = qs('pub-wizard-next');
        const submit = qs('pub-submit-btn');
        const last = totalSteps() - 1;
        if (back) back.classList.toggle('hidden', wizardStep <= 0);
        if (next) next.classList.toggle('hidden', wizardStep >= last);
        if (submit) submit.classList.toggle('hidden', wizardStep < last);
    }

    function showPanels() {
        const eventPanel = qs('pub-step-event');
        const contactPanel = qs('pub-step-contact');
        const contactIdx = showEventPicker ? 1 : 0;
        if (eventPanel) eventPanel.classList.toggle('hidden', !showEventPicker || wizardStep !== 0);
        if (contactPanel) contactPanel.classList.toggle('hidden', wizardStep !== contactIdx);
        document.querySelectorAll('#pub-form-fields .pub-step-panel').forEach((panel) => {
            const formStep = parseInt(panel.dataset.formStep, 10);
            const panelIdx = (showEventPicker ? 2 : 1) + formStep - 1;
            panel.classList.toggle('hidden', wizardStep !== panelIdx);
        });
        updateWizardNav();
        updateActions();
    }

    function goToStep(step) {
        if (step < wizardStep) {
            wizardStep = step;
            showPanels();
            return;
        }
        for (let i = wizardStep; i < step; i++) {
            if (!validateStep(i)) return;
        }
        wizardStep = step;
        showPanels();
    }

    function validateStep(step) {
        showError('');
        if (showEventPicker && step === 0) {
            const sel = qs('pub-event-select');
            if (!sel || !sel.value) {
                showError('Please choose an event.');
                return false;
            }
            return true;
        }
        const contactIdx = showEventPicker ? 1 : 0;
        if (step === contactIdx) {
            const emailEl = qs('pub-contact-email');
            const phoneEl = qs('pub-contact-phone');
            const emailV = validateEmailClient(emailEl?.value, 'Email');
            if (!emailV.valid) {
                showError(emailV.message);
                return false;
            }
            const phoneV = validatePhoneClient(phoneEl?.value, 'Mobile');
            if (!phoneV.valid) {
                showError(phoneV.message);
                return false;
            }
            return true;
        }
        const formStep = step - (showEventPicker ? 2 : 1);
        const fields = fieldsForStep(formStep);
        for (const f of fields) {
            const el = qs('pub-field-' + f.key);
            if (!el) continue;
            if (f.type === 'boolean') {
                if (f.required && !el.checked) {
                    showError((f.label || f.key) + ' is required.');
                    return false;
                }
                continue;
            }
            const val = String(el.value || '').trim();
            if (f.required && !val) {
                showError((f.label || f.key) + ' is required.');
                return false;
            }
        }
        return true;
    }

    function collectFormData() {
        const data = {};
        (preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const el = qs('pub-field-' + f.key);
            if (!el) return;
            if (f.type === 'boolean') data[f.key] = !!el.checked;
            else data[f.key] = String(el.value || '').trim();
        });
        return data;
    }

    async function autofillFromPin() {
        const pinEl =
            qs('pub-field-pin') || qs('pub-field-pincode') || document.querySelector('[data-field-key="pin"]');
        if (!pinEl) return;
        const pin = String(pinEl.value || '').replace(/\D/g, '');
        if (pin.length !== 6) return;
        try {
            const r = await fetch('/api/public/pincode-lookup?pin=' + encodeURIComponent(pin));
            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data.ok) return;
            const set = (key, val) => {
                const el = qs('pub-field-' + key);
                if (el && val && !String(el.value || '').trim()) el.value = val;
            };
            set('city', data.city || data.district);
            set('district', data.district);
            set('state', data.state);
        } catch (_) {}
    }

    async function loadFormConfig(id) {
        const data = await fetchJson('/api/public/preregistration/form-config?seminarId=' + encodeURIComponent(id));
        if (data.upcoming && data.opensAt) {
            seminarId = data.seminarId || id;
            seminarTitle = data.seminarTitle || '';
            showCountdownView({
                seminarId: seminarId,
                title: seminarTitle,
                opensAt: data.opensAt,
                label: 'Pre-registration opens in'
            });
            return 'countdown';
        }
        if (data.available === false) {
            throw new Error('This pre-registration form is not available.');
        }
        seminarId = data.seminarId || id;
        seminarTitle = data.seminarTitle || '';
        preregFields = data.fields || [];
        stepSections = Array.isArray(data.stepSections) ? data.stepSections : [];
        const titleEl = qs('pub-prereg-event-title');
        if (titleEl && seminarTitle) {
            titleEl.textContent = seminarTitle;
            titleEl.classList.remove('hidden');
        }
        if (data.closesAt) startClosesCountdown(data.closesAt);
        renderFormFields();
        return 'form';
    }

    async function loadEventsList() {
        const data = await fetchJson('/api/public/preregistration/events');
        const events = data.events || [];
        const sel = qs('pub-event-select');
        if (!sel) return events;
        sel.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = 'Select event';
        sel.appendChild(opt0);
        events.forEach((ev) => {
            const o = document.createElement('option');
            o.value = String(ev.id);
            let label = ev.title || 'Event ' + ev.id;
            if (ev.preregOpen) label += ' (open now)';
            else if (ev.upcoming && ev.opensAt) label += ' (opens soon)';
            else if (!ev.preregOpen) label += ' (not open yet)';
            o.textContent = label;
            o.disabled = !ev.preregOpen && !(ev.upcoming && ev.opensAt);
            o.dataset.opensAt = ev.opensAt ? String(ev.opensAt) : '';
            o.dataset.upcoming = ev.upcoming ? '1' : '0';
            sel.appendChild(o);
        });
        return events;
    }

    async function onEventSelected() {
        const sel = qs('pub-event-select');
        const id = parseInt(sel?.value, 10);
        if (!Number.isInteger(id) || id < 1) return;
        showError('');
        clearCountdownTimers();
        qs('pub-prereg-countdown')?.classList.add('hidden');
        try {
            const mode = await loadFormConfig(id);
            if (mode === 'countdown') {
                qs('pub-prereg-form-wrap')?.classList.add('hidden');
                return;
            }
            qs('pub-prereg-form-wrap')?.classList.remove('hidden');
        } catch (e) {
            showError(e.message || 'Could not load form for this event.');
        }
    }

    async function init() {
        seminarId = parseEventFromUrl();
        clearCountdownTimers();
        try {
            if (seminarId) {
                showEventPicker = false;
                const mode = await loadFormConfig(seminarId);
                if (mode === 'countdown') return;
            } else {
                const events = await loadEventsList();
                const actionable = events.filter((e) => e.preregOpen || (e.upcoming && e.opensAt));
                if (!actionable.length) {
                    return showUnavailable('No public pre-registration forms are open right now.');
                }
                const hasOpen = actionable.some((e) => e.preregOpen);
                const hasUpcoming = actionable.some((e) => e.upcoming && e.opensAt);
                if (!hasOpen && hasUpcoming && actionable.length === 1) {
                    seminarId = actionable[0].id;
                    showEventPicker = false;
                    const mode = await loadFormConfig(seminarId);
                    if (mode === 'countdown') return;
                } else {
                    showEventPicker = true;
                    qs('pub-step-event')?.classList.remove('hidden');
                }
            }
            qs('pub-prereg-loading')?.classList.add('hidden');
            if (!qs('pub-prereg-countdown') || qs('pub-prereg-countdown').classList.contains('hidden')) {
                qs('pub-prereg-form-wrap')?.classList.remove('hidden');
                wizardStep = 0;
                showPanels();
            }
        } catch (e) {
            showUnavailable(e.message || 'This pre-registration form is not available.');
        }
    }

    async function submitForm(ev) {
        ev.preventDefault();
        const last = totalSteps() - 1;
        if (!validateStep(last)) return;
        for (let i = 0; i < last; i++) {
            if (!validateStep(i)) {
                wizardStep = i;
                showPanels();
                return;
            }
        }
        if (showEventPicker && !seminarId) {
            const sel = qs('pub-event-select');
            seminarId = parseInt(sel?.value, 10);
        }
        if (!seminarId) {
            showError('Please choose an event.');
            return;
        }
        const emailEl = qs('pub-contact-email');
        const phoneEl = qs('pub-contact-phone');
        const submitBtn = qs('pub-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        showError('');
        try {
            const body = {
                seminarId,
                contactEmail: emailEl?.value,
                contactPhone: phoneEl?.value,
                formData: collectFormData(),
                website: qs('pub-honeypot-website')?.value || ''
            };
            const data = await fetchJson('/api/public/preregistrations/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            qs('pub-prereg-form-wrap')?.classList.add('hidden');
            const success = qs('pub-prereg-success');
            success?.classList.remove('hidden');
            const msg = qs('pub-success-message');
            if (msg) msg.textContent = data.message || 'Your pre-registration was submitted successfully.';
            const tid = qs('pub-success-tracking-id');
            if (tid) tid.textContent = data.applicationNo || '';
            const trackLink = qs('pub-success-track-link');
            const emailVal = (emailEl?.value || '').trim();
            if (trackLink && data.applicationNo) {
                const u = new URL('/preregister/track', window.location.origin);
                u.searchParams.set('id', data.applicationNo);
                if (emailVal) u.searchParams.set('email', emailVal);
                trackLink.href = u.pathname + '?' + u.searchParams.toString();
            }
        } catch (e) {
            showError(e.message || 'Submission failed. Please try again.');
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        qs('pub-wizard-back')?.addEventListener('click', () => {
            if (wizardStep > 0) {
                wizardStep--;
                showPanels();
            }
        });
        qs('pub-wizard-next')?.addEventListener('click', () => {
            if (!validateStep(wizardStep)) return;
            if (showEventPicker && wizardStep === 0) {
                onEventSelected().then(() => {
                    if (qs('pub-prereg-countdown') && !qs('pub-prereg-countdown').classList.contains('hidden')) {
                        return;
                    }
                    wizardStep++;
                    showPanels();
                });
                return;
            }
            if (wizardStep < totalSteps() - 1) {
                wizardStep++;
                showPanels();
            }
        });
        qs('pub-event-select')?.addEventListener('change', () => {
            seminarId = null;
            onEventSelected();
        });
        qs('pub-prereg-form')?.addEventListener('submit', submitForm);
        init();
    });
})();
