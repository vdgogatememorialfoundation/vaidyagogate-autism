/**
 * Autism admin portal: hide judge/case/payment UI; participant-focused labels.
 */
(function () {
    'use strict';

    window.PORTAL_IS_AUTISM = true;

    const HIDE_MODULES = ['tab-case-mgmt', 'tab-admin-payments', 'tab-pos'];

    const HIDE_TEXT = [
        'judge',
        'case presentation',
        'case program',
        'payment gateway',
        'pos on-spot',
        'on-spot pos'
    ];

    function hideMenuItems() {
        HIDE_MODULES.forEach((mod) => {
            document.querySelectorAll(`[data-admin-module="${mod}"]`).forEach((el) => {
                el.classList.add('hidden');
                el.style.display = 'none';
            });
        });
        document.querySelectorAll('a, button, .menu-item').forEach((el) => {
            const t = (el.textContent || '').toLowerCase();
            if (HIDE_TEXT.some((k) => t.includes(k))) {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        });
        const priceRow = document.getElementById('seminar-price')?.closest('div');
        if (priceRow) {
            priceRow.style.display = 'none';
            const priceInput = document.getElementById('seminar-price');
            if (priceInput) priceInput.value = '0';
        }
    }

    function injectPreregFields() {
        const regStart = document.getElementById('seminar-reg-start');
        if (!regStart || document.getElementById('seminar-prereg-start')) return;
        const grid = regStart.closest('div[style*="grid"]');
        if (!grid || !grid.parentNode) return;
        const block = document.createElement('div');
        block.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:4px;';
        block.innerHTML =
            '<div><label>Pre-registration Start <span style="font-weight:normal;color:#64748b;">(IST)</span></label>' +
            '<input type="datetime-local" id="seminar-prereg-start"></div>' +
            '<div><label>Pre-registration End <span style="font-weight:normal;color:#64748b;">(IST)</span></label>' +
            '<input type="datetime-local" id="seminar-prereg-end"></div>';
        grid.parentNode.insertBefore(block, grid.nextSibling);
        const flow = document.createElement('div');
        flow.style.cssText =
            'display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;padding:10px 12px;border:1px solid #d1fae5;border-radius:8px;background:#f0fdfa;';
        flow.innerHTML =
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;"><input type="checkbox" id="seminar-flow-prereg-required" checked> Pre-registration required</label>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;"><input type="checkbox" id="seminar-flow-main-required" checked> Main registration required</label>';
        block.insertAdjacentElement('afterend', flow);
    }

    function ensureSeminarPreregOverrideEditor() {
        const host = document.getElementById('seminar-reg-form-json');
        const mainTbody = document.getElementById('seminar-reg-override-tbody');
        const mainPreview = document.getElementById('seminar-form-preview');
        if (!host || !mainTbody) return;
        const mainCard = mainTbody.closest('div[style*="border:1px solid #e2e8f0"]');
        if (mainCard) {
            mainCard.id = 'seminar-main-form-card';
            const heading = mainCard.querySelector('label[style*="font-weight:600"]');
            if (heading) heading.textContent = 'Main registration form (this seminar)';
            if (!document.getElementById('seminar-main-custom-only')) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'seminar-main-custom-only';
                btn.className = 'btn-primary';
                btn.style.cssText = 'margin-top:8px;padding:4px 12px;font-size:0.82rem;background:#475569;';
                btn.textContent = 'Use custom-only main form';
                btn.addEventListener('click', () => makeMainFormCustomOnly());
                mainCard.appendChild(btn);
            }
        }
        if (mainPreview) mainPreview.id = 'seminar-main-form-preview';
        if (document.getElementById('seminar-prereg-override-tbody')) return;
        const card = document.createElement('div');
        card.id = 'seminar-prereg-form-card';
        card.style.cssText = 'margin-top:14px;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;';
        card.innerHTML =
            '<label style="font-weight:600;">Pre-registration form (this seminar)</label>' +
            '<p style="font-size:0.82rem;color:#64748b;margin:6px 0 10px;">Configure pre-registration fields for this event only.</p>' +
            '<table class="data-table" style="font-size:0.88rem;">' +
            '<thead><tr><th>Field</th><th>Label</th><th>On</th><th>Required</th><th>Options</th></tr></thead>' +
            '<tbody id="seminar-prereg-override-tbody"></tbody>' +
            '</table>' +
            '<div style="margin-top:12px;">' +
            '<label style="font-weight:600;">Pre-registration custom fields (this seminar)</label>' +
            '<table class="data-table" style="font-size:0.88rem;margin-top:8px;">' +
            '<thead><tr><th>Key</th><th>Label</th><th>Type</th><th>Step</th><th>On</th><th>Req</th><th>Options</th><th></th></tr></thead>' +
            '<tbody id="seminar-prereg-extra-fields-tbody"></tbody>' +
            '</table>' +
            '<button type="button" class="btn-primary" id="seminar-prereg-add-extra" style="margin-top:8px;padding:4px 12px;font-size:0.82rem;background:#0d9488;">+ Add pre-registration field</button>' +
            '<button type="button" class="btn-primary" id="seminar-prereg-custom-only" style="margin-top:8px;margin-left:8px;padding:4px 12px;font-size:0.82rem;background:#475569;">Use custom-only pre-registration form</button>' +
            '</div>' +
            '<div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:480px;">' +
            '<div><label style="font-size:0.8rem;">Earliest birth year (override)</label><input type="number" id="seminar-prereg-birth-year-min" min="1900" max="2100" placeholder="Global default" style="width:100%;padding:6px;"></div>' +
            '<div><label style="font-size:0.8rem;">Latest birth year (override)</label><input type="number" id="seminar-prereg-birth-year-max" min="1900" max="2100" placeholder="Global default" style="width:100%;padding:6px;"></div>' +
            '</div>' +
            '<p id="seminar-prereg-form-preview" style="margin-top:10px;font-size:0.88rem;color:#334155;background:#f8fafc;padding:10px;border-radius:6px;"></p>' +
            '<div id="seminar-prereg-otp-wrap" style="margin-top:12px;padding:10px 12px;border:1px solid #dbeafe;border-radius:8px;background:#eff6ff;">' +
            '<label style="font-weight:600;font-size:0.88rem;">Pre-registration OTP</label>' +
            '<p style="font-size:0.8rem;color:#64748b;margin:6px 0 8px;">Independent from main registration OTP below.</p>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;"><input type="checkbox" id="seminar-prereg-otp-app" onchange="syncSeminarPreregOtpUi()"> Enable OTP on pre-registration</label>' +
            '<div id="seminar-prereg-otp-subopts" style="margin-top:8px;padding-left:12px;display:none;">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;margin-bottom:6px;"><input type="checkbox" id="seminar-prereg-otp-step1" checked> Verify email / WhatsApp on form (step 1)</label>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;"><input type="checkbox" id="seminar-prereg-otp-submit"> Require OTP again before submit</label>' +
            '</div></div>';
        host.insertAdjacentElement('beforebegin', card);
        const addBtn = document.getElementById('seminar-prereg-add-extra');
        if (addBtn) addBtn.addEventListener('click', () => addSeminarPreregExtraFieldRow());
        const customOnly = document.getElementById('seminar-prereg-custom-only');
        if (customOnly) customOnly.addEventListener('click', () => makePreregFormCustomOnly());
    }

    function makePreregFormCustomOnly() {
        document.querySelectorAll('#seminar-prereg-override-tbody .sem-pr-ov-en').forEach((el) => {
            el.checked = false;
        });
        updatePreregFormPreview();
        alert('Pre-registration base fields turned off. Add your own fields below.');
    }

    function makeMainFormCustomOnly() {
        document.querySelectorAll('#seminar-reg-override-tbody .sem-ov-en').forEach((el) => {
            el.checked = false;
        });
        if (typeof window.updateSeminarPolicyPreviews === 'function') window.updateSeminarPolicyPreviews();
        alert('Main registration base fields turned off. Add your own fields in Additional fields.');
    }

    function addSeminarPreregExtraFieldRow(field) {
        const tbody = document.getElementById('seminar-prereg-extra-fields-tbody');
        if (!tbody) return;
        const idx = tbody.querySelectorAll('tr').length;
        const types = ['text', 'textarea', 'select', 'number', 'date', 'email', 'tel', 'boolean', 'file']
            .map((t) => `<option value="${t}"${(field && field.type === t) || (!field && t === 'text') ? ' selected' : ''}>${t}</option>`)
            .join('');
        const opts =
            field && Array.isArray(field.options)
                ? field.options.map((o) => (o && o.value != null ? o.value : o)).filter(Boolean).join(', ')
                : '';
        const tr = document.createElement('tr');
        tr.innerHTML =
            `<td><input type="text" class="sem-pr-ex-key" value="${escapeHtml((field && field.key) || '')}" placeholder="field_key"></td>` +
            `<td><input type="text" class="sem-pr-ex-label" value="${escapeHtml((field && field.label) || '')}" placeholder="Field label"></td>` +
            `<td><select class="sem-pr-ex-type">${types}</select></td>` +
            `<td><input type="number" class="sem-pr-ex-step" min="1" max="10" value="${(field && Number(field.step)) || 1}"></td>` +
            `<td><input type="checkbox" class="sem-pr-ex-en" ${(field ? field.enabled !== false : true) ? 'checked' : ''}></td>` +
            `<td><input type="checkbox" class="sem-pr-ex-req" ${(field && field.required) ? 'checked' : ''}></td>` +
            `<td><input type="text" class="sem-pr-ex-options" value="${escapeHtml(opts)}" placeholder="a,b,c for select"></td>` +
            `<td><button type="button" class="btn-primary sem-pr-ex-del" style="padding:3px 8px;background:#b91c1c;">X</button></td>`;
        tbody.appendChild(tr);
        tr.querySelectorAll('input,select').forEach((el) => {
            el.addEventListener('input', updatePreregFormPreview);
            el.addEventListener('change', updatePreregFormPreview);
        });
        tr.querySelector('.sem-pr-ex-del')?.addEventListener('click', () => {
            tr.remove();
            updatePreregFormPreview();
        });
    }

    function syncSeminarFlowFormSections() {
        const preOn = (document.getElementById('seminar-flow-prereg-required') || {}).checked !== false;
        const mainOn = (document.getElementById('seminar-flow-main-required') || {}).checked !== false;
        const preCard = document.getElementById('seminar-prereg-form-card');
        const mainCard = document.getElementById('seminar-main-form-card');
        if (preCard) preCard.style.display = preOn ? '' : 'none';
        if (mainCard) mainCard.style.display = mainOn ? '' : 'none';
    }

    function escapeHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function withAdminQuery(url) {
        try {
            if (typeof window.withActingAdminUrl === 'function') return window.withActingAdminUrl(url);
        } catch (_) {}
        return url;
    }

    async function loadSeminarPreregFormOverrideUi(overrideJson) {
        const tbody = document.getElementById('seminar-prereg-override-tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';
        let globalFields = [];
        let globalBirthMin = null;
        let globalBirthMax = null;
        try {
            const res = await fetch(withAdminQuery('/api/admin/preregistration-form-config'), {
                credentials: 'same-origin',
                cache: 'no-store'
            });
            const data = await res.json().catch(() => ({}));
            globalFields = Array.isArray(data.fields) ? data.fields : [];
            globalBirthMin = data.birthYearMin == null ? null : Number(data.birthYearMin);
            globalBirthMax = data.birthYearMax == null ? null : Number(data.birthYearMax);
        } catch (_) {}
        let overrideFields = [];
        let seminarBirthMin = null;
        let seminarBirthMax = null;
        try {
            const parsed = overrideJson && String(overrideJson).trim() ? JSON.parse(overrideJson) : {};
            overrideFields = Array.isArray(parsed.fields) ? parsed.fields : [];
            seminarBirthMin = parsed.birthYearMin == null ? null : Number(parsed.birthYearMin);
            seminarBirthMax = parsed.birthYearMax == null ? null : Number(parsed.birthYearMax);
        } catch (_) {}
        const byKey = {};
        overrideFields.forEach((f) => {
            if (f && f.key) byKey[f.key] = f;
        });
        const globalKeys = new Set(globalFields.map((f) => String(f.key || '')));
        const extras = overrideFields.filter((f) => f && f.key && !globalKeys.has(String(f.key)));
        window.__seminarPreregGlobalFields = globalFields;
        window.__seminarPreregGlobalBirthMin = globalBirthMin;
        window.__seminarPreregGlobalBirthMax = globalBirthMax;
        window.__seminarPreregOverrideFieldKeys = [];
        tbody.innerHTML = '';
        globalFields.forEach((f, idx) => {
            const ov = byKey[f.key] || {};
            const enabled = ov.enabled != null ? ov.enabled !== false : f.enabled !== false;
            const required = ov.required != null ? !!ov.required : !!f.required;
            const label = ov.label != null && String(ov.label).trim() ? ov.label : f.label || f.key;
            window.__seminarPreregOverrideFieldKeys.push(f.key);
            tbody.innerHTML += `<tr>
                <td><code>${escapeHtml(f.key)}</code></td>
                <td><input type="text" class="sem-pr-ov-label" data-idx="${idx}" value="${escapeHtml(label)}"></td>
                <td><input type="checkbox" class="sem-pr-ov-en" data-idx="${idx}" ${enabled ? 'checked' : ''}></td>
                <td><input type="checkbox" class="sem-pr-ov-req" data-idx="${idx}" ${required ? 'checked' : ''}></td>
                <td>—</td>
            </tr>`;
        });
        const minEl = document.getElementById('seminar-prereg-birth-year-min');
        const maxEl = document.getElementById('seminar-prereg-birth-year-max');
        const exTbody = document.getElementById('seminar-prereg-extra-fields-tbody');
        if (exTbody) exTbody.innerHTML = '';
        extras.forEach((f) => addSeminarPreregExtraFieldRow(f));
        if (minEl) minEl.value = seminarBirthMin != null ? String(seminarBirthMin) : '';
        if (maxEl) maxEl.value = seminarBirthMax != null ? String(seminarBirthMax) : '';
        ['.sem-pr-ov-label', '.sem-pr-ov-en', '.sem-pr-ov-req'].forEach((sel) => {
            tbody.querySelectorAll(sel).forEach((el) => {
                el.addEventListener('input', updatePreregFormPreview);
                el.addEventListener('change', updatePreregFormPreview);
            });
        });
        if (minEl) minEl.oninput = updatePreregFormPreview;
        if (maxEl) maxEl.oninput = updatePreregFormPreview;
        updatePreregFormPreview();
    }

    function readPreregOtpFromUi() {
        const master = document.getElementById('seminar-prereg-otp-app');
        const onApp = !!(master && master.checked);
        return {
            onApplication: onApp,
            onStep1: onApp && (document.getElementById('seminar-prereg-otp-step1') || {}).checked !== false,
            onSubmit: onApp && !!(document.getElementById('seminar-prereg-otp-submit') || {}).checked
        };
    }

    window.syncSeminarPreregOtpUi = function syncSeminarPreregOtpUi() {
        const master = document.getElementById('seminar-prereg-otp-app');
        const wrap = document.getElementById('seminar-prereg-otp-subopts');
        const on = !!(master && master.checked);
        if (wrap) wrap.style.display = on ? 'block' : 'none';
    };

    function applyPreregOtpToUi(otp) {
        const o = otp && typeof otp === 'object' ? otp : {};
        const app = document.getElementById('seminar-prereg-otp-app');
        const s1 = document.getElementById('seminar-prereg-otp-step1');
        const sub = document.getElementById('seminar-prereg-otp-submit');
        if (app) app.checked = o.onApplication === true;
        if (s1) s1.checked = o.onApplication === true && o.onStep1 !== false;
        if (sub) sub.checked = o.onApplication === true && o.onSubmit === true;
        syncSeminarPreregOtpUi();
    }

    function labelMainRegistrationOtpSection() {
        const otp = document.getElementById('seminar-otp-app');
        if (!otp || otp.dataset.akMainOtpLabeled === '1') return;
        const wrap = otp.closest('div');
        if (wrap) {
            const title = document.createElement('p');
            title.style.cssText = 'font-weight:600;font-size:0.88rem;margin:0 0 6px;color:#1e3a8a;';
            title.textContent = 'Main registration OTP';
            wrap.insertBefore(title, wrap.firstChild);
            const hint = document.createElement('p');
            hint.style.cssText = 'font-size:0.8rem;color:#64748b;margin:0 0 8px;';
            hint.textContent = 'Applies only to the main registration form (not pre-registration).';
            wrap.insertBefore(hint, title.nextSibling);
        }
        otp.dataset.akMainOtpLabeled = '1';
    }

    function buildSeminarPreregFormOverrideJsonFromUi() {
        const tbody = document.getElementById('seminar-prereg-override-tbody');
        const keys = window.__seminarPreregOverrideFieldKeys || [];
        const globals = window.__seminarPreregGlobalFields || [];
        if (!tbody || !keys.length) return null;
        const fields = keys.map((key, idx) => ({
            key,
            label: (tbody.querySelector(`.sem-pr-ov-label[data-idx="${idx}"]`) || {}).value || key,
            enabled: !!(tbody.querySelector(`.sem-pr-ov-en[data-idx="${idx}"]`) || {}).checked,
            required: !!(tbody.querySelector(`.sem-pr-ov-req[data-idx="${idx}"]`) || {}).checked
        }));
        const extras = [];
        document.querySelectorAll('#seminar-prereg-extra-fields-tbody tr').forEach((tr) => {
            const key = String((tr.querySelector('.sem-pr-ex-key') || {}).value || '').trim();
            if (!key) return;
            const type = String((tr.querySelector('.sem-pr-ex-type') || {}).value || 'text').trim();
            const row = {
                key,
                label: String((tr.querySelector('.sem-pr-ex-label') || {}).value || key).trim(),
                type,
                step: parseInt((tr.querySelector('.sem-pr-ex-step') || {}).value, 10) || 1,
                enabled: !!(tr.querySelector('.sem-pr-ex-en') || {}).checked,
                required: !!(tr.querySelector('.sem-pr-ex-req') || {}).checked
            };
            if (type === 'select') {
                const optsCsv = String((tr.querySelector('.sem-pr-ex-options') || {}).value || '').trim();
                row.options = optsCsv
                    ? optsCsv.split(',').map((x) => String(x || '').trim()).filter(Boolean).map((v) => ({ value: v, label: v }))
                    : [];
            }
            extras.push(row);
        });
        const anyChanged = fields.some((f) => {
            const g = globals.find((x) => x.key === f.key) || {};
            return (
                String(f.label || '') !== String(g.label || f.key) ||
                !!f.enabled !== (g.enabled !== false) ||
                !!f.required !== !!g.required
            );
        });
        const minEl = document.getElementById('seminar-prereg-birth-year-min');
        const maxEl = document.getElementById('seminar-prereg-birth-year-max');
        const birthYearMin =
            minEl && minEl.value !== '' && !Number.isNaN(parseInt(minEl.value, 10))
                ? parseInt(minEl.value, 10)
                : null;
        const birthYearMax =
            maxEl && maxEl.value !== '' && !Number.isNaN(parseInt(maxEl.value, 10))
                ? parseInt(maxEl.value, 10)
                : null;
        const birthChanged =
            birthYearMin !== window.__seminarPreregGlobalBirthMin ||
            birthYearMax !== window.__seminarPreregGlobalBirthMax;
        if (!anyChanged && !birthChanged && !extras.length && birthYearMin == null && birthYearMax == null) return null;
        const payload = { version: 3, fields: fields.concat(extras), otp: readPreregOtpFromUi() };
        if (birthYearMin != null) payload.birthYearMin = birthYearMin;
        if (birthYearMax != null) payload.birthYearMax = birthYearMax;
        return JSON.stringify(payload);
    }

    function mergePreregFormJsonForSave(existingJson) {
        let cfg = {};
        try {
            cfg = existingJson ? JSON.parse(existingJson) : {};
        } catch (_) {
            cfg = {};
        }
        cfg.otp = readPreregOtpFromUi();
        const built = buildSeminarPreregFormOverrideJsonFromUi();
        if (built) {
            try {
                const p = JSON.parse(built);
                cfg = { ...cfg, ...p, otp: cfg.otp };
            } catch (_) {}
        }
        return JSON.stringify(cfg);
    }

    function updatePreregFormPreview() {
        const prev = document.getElementById('seminar-prereg-form-preview');
        if (!prev) return;
        const built = buildSeminarPreregFormOverrideJsonFromUi();
        if (!built) {
            prev.textContent = 'Pre-registration will use global form fields.';
            return;
        }
        try {
            const parsed = JSON.parse(built);
            const enabled = (parsed.fields || []).filter((f) => f.enabled !== false);
            prev.textContent =
                'Pre-registration fields: ' +
                (enabled.length ? enabled.map((f) => f.label || f.key).join(', ') : 'none enabled');
        } catch (_) {
            prev.textContent = 'Invalid pre-registration form override.';
        }
    }

    function parseSeminarFlowFlags(registrationFormJson) {
        try {
            const parsed = registrationFormJson ? JSON.parse(registrationFormJson) : {};
            const flow = parsed && typeof parsed.flow === 'object' ? parsed.flow : {};
            return {
                preregistrationRequired: flow.preregistrationRequired !== false,
                mainRegistrationRequired: flow.mainRegistrationRequired !== false
            };
        } catch (_) {
            return { preregistrationRequired: true, mainRegistrationRequired: true };
        }
    }

    function patchSaveSeminar() {
        if (typeof window.saveSeminar !== 'function' || window.__autismSavePatched) return;
        const orig = window.saveSeminar;
        window.saveSeminar = function (ev) {
            const ps = document.getElementById('seminar-prereg-start');
            const pe = document.getElementById('seminar-prereg-end');
            if (ps && pe) {
                window.__autismPreregStart = ps.value;
                window.__autismPreregEnd = pe.value;
            }
            const price = document.getElementById('seminar-price');
            if (price) price.value = '0';
            return orig.call(this, ev);
        };
        window.__autismSavePatched = true;
    }

    function patchSeminarPayload() {
        if (window.__autismFetchPatched) return;
        const origFetch = window.fetch;
        window.fetch = function (url, opts) {
            if (
                typeof url === 'string' &&
                (url.includes('/api/admin/seminars') || url.match(/\/api\/admin\/seminars\/\d+/)) &&
                opts &&
                opts.method &&
                opts.method.toUpperCase() !== 'GET' &&
                opts.body
            ) {
                try {
                    const data = JSON.parse(opts.body);
                    data.price = 0;
                    if (window.__autismPreregStart != null) {
                        data.preregistration_start = window.PortalDateTime
                            ? window.PortalDateTime.fromDatetimeLocal(window.__autismPreregStart)
                            : window.__autismPreregStart;
                    }
                    if (window.__autismPreregEnd != null) {
                        data.preregistration_end = window.PortalDateTime
                            ? window.PortalDateTime.fromRegistrationEndLocal(window.__autismPreregEnd)
                            : window.__autismPreregEnd;
                    }
                    const flowFlags = {
                        preregistrationRequired:
                            (document.getElementById('seminar-flow-prereg-required') || {}).checked !== false,
                        mainRegistrationRequired:
                            (document.getElementById('seminar-flow-main-required') || {}).checked !== false
                    };
                    let regCfg = {};
                    try {
                        regCfg = data.registration_form_json ? JSON.parse(data.registration_form_json) : {};
                    } catch (_) {
                        regCfg = {};
                    }
                    regCfg.flow = { ...(regCfg.flow || {}), ...flowFlags };
                    data.registration_form_json = JSON.stringify(regCfg);
                    data.preregistration_form_json = mergePreregFormJsonForSave(data.preregistration_form_json);
                    opts = { ...opts, body: JSON.stringify(data) };
                } catch (_) {}
            }
            return origFetch.call(this, url, opts);
        };
        window.__autismFetchPatched = true;
    }

    function patchEditSeminarFlowFlags() {
        if (typeof window.editSeminar !== 'function' || window.editSeminar.__akFlowHook) return;
        const orig = window.editSeminar;
        window.editSeminar = function (index) {
            orig.call(this, index);
            const s = Array.isArray(window.globalSeminars) ? window.globalSeminars[index] : null;
            const flags = parseSeminarFlowFlags(s && s.registration_form_json);
            const pre = document.getElementById('seminar-flow-prereg-required');
            const main = document.getElementById('seminar-flow-main-required');
            if (pre) pre.checked = flags.preregistrationRequired;
            if (main) main.checked = flags.mainRegistrationRequired;
            syncSeminarFlowFormSections();
            loadSeminarPreregFormOverrideUi((s && s.preregistration_form_json) || '');
            try {
                const p = s && s.preregistration_form_json ? JSON.parse(s.preregistration_form_json) : {};
                applyPreregOtpToUi(p.otp);
            } catch (_) {
                applyPreregOtpToUi({});
            }
        };
        window.editSeminar.__akFlowHook = true;
    }

    function patchOpenCreateSeminarModal() {
        if (typeof window.openCreateSeminarModal !== 'function' || window.openCreateSeminarModal.__akPreregHook)
            return;
        const orig = window.openCreateSeminarModal;
        window.openCreateSeminarModal = function () {
            orig.apply(this, arguments);
            const pre = document.getElementById('seminar-flow-prereg-required');
            const main = document.getElementById('seminar-flow-main-required');
            if (pre) pre.checked = true;
            if (main) main.checked = true;
            syncSeminarFlowFormSections();
            loadSeminarPreregFormOverrideUi('');
            applyPreregOtpToUi({});
        };
        window.openCreateSeminarModal.__akPreregHook = true;
    }

    function patchApplicationsMenu() {
        document.querySelectorAll('[data-admin-module="tab-applications"]').forEach((el) => {
            if (el.querySelector('i')) el.innerHTML = '<i class="fas fa-folder-open"></i> Registration queue';
        });
        document.querySelectorAll('[data-admin-module="tab-final-tracking"]').forEach((el) => {
            if (el.querySelector('i')) el.innerHTML = '<i class="fas fa-file-signature"></i> Final registration tracking';
        });
        document.querySelectorAll('[data-admin-module="tab-competition-tracking"]').forEach((el) => {
            if (el.querySelector('i')) el.innerHTML = '<i class="fas fa-palette"></i> Competition management';
        });
        document.querySelectorAll('[data-admin-module="tab-prereg-tracking"]').forEach((el) => {
            if (el.querySelector('i')) el.innerHTML = '<i class="fas fa-clipboard-check"></i> Pre-registration tracking';
        });
    }

    function reorderAutismHomepageCms() {
        const tab = document.getElementById('tab-site-cms');
        const main = document.getElementById('ak-main-cms-card');
        const guide = document.getElementById('ak-homepage-cms-guide');
        const aboutCard = document.getElementById('ak-cms-about-card');
        const previewWrap = document.getElementById('ak-homepage-live-preview-wrap');
        const headerCard = document.getElementById('cms-header-footer-card');
        const contactCard = document.getElementById('cms-contact-card');
        const photos = document.getElementById('ak-admin-site-images');
        if (!tab || !main) return;

        tab.insertBefore(main, tab.firstElementChild);
        if (guide) tab.insertBefore(guide, main);

        const afterGuide = guide || main;
        if (previewWrap) tab.insertBefore(previewWrap, afterGuide.nextSibling);
        if (aboutCard && previewWrap) tab.insertBefore(aboutCard, previewWrap.nextSibling);
        else if (aboutCard) tab.insertBefore(aboutCard, afterGuide.nextSibling);

        if (headerCard) tab.insertBefore(headerCard, main.nextSibling);
        if (contactCard) {
            const afterHeader = headerCard || main;
            tab.insertBefore(contactCard, afterHeader.nextSibling);
        }
        if (photos) tab.appendChild(photos);

        tightenAutismCmsTab();
    }

    function ensureAkHomepageDefaults() {
        if (typeof cmsApplyAkSimpleHomeFields !== 'function') return;
        const empty =
            !(document.getElementById('ak-pillar-1-title') || {}).value &&
            !(document.getElementById('ak-pillar-2-title') || {}).value;
        if (empty) {
            cmsApplyAkSimpleHomeFields({
                homePillars: typeof cmsDefaultHomePillars === 'function' ? cmsDefaultHomePillars() : [],
                featureCards: typeof cmsDefaultFeatureCards === 'function' ? cmsDefaultFeatureCards() : [],
                featuresSection: { title: 'Why join us', subtitle: '' }
            });
        }
    }

    function tightenAutismCmsTab() {
        const tab = document.getElementById('tab-site-cms');
        if (!tab) return;
        tab.querySelectorAll('.ak-cms-advanced').forEach((el) => {
            el.style.display = 'none';
        });
        tab.querySelectorAll('.ak-cms-homepage, #ak-main-cms-card, #ak-homepage-cms-guide, #ak-cms-about-card').forEach((el) => {
            el.style.display = '';
        });
        const intro = tab.querySelector(':scope > p');
        if (intro) intro.style.display = 'none';
        const h2 = tab.querySelector(':scope > h2');
        if (h2) h2.style.display = 'none';
    }

    function injectHomepageCmsGuide() {
        /* Guide is in admin.html; only ensure it stays at top after reorder. */
    }

    function fixLegacyAdminLoginPage() {
        const overlay = document.getElementById('auth-overlay');
        if (!overlay) return;
        const text = overlay.textContent || '';
        if (!/Welcome,\s*team|ADMIN_EMAIL|Applicant ID|Portal User ID/i.test(text)) return;
        overlay.innerHTML =
            '<div class="ak-login-card">' +
            '<div class="ak-login-brand">' +
            '<div data-site-logo data-logo-height="52px"></div>' +
            '<span class="ak-login-badge"><i class="fas fa-lock" aria-hidden="true"></i> Staff sign-in</span>' +
            '</div>' +
            '<header class="ak-login-header">' +
            '<h1>Admin console</h1>' +
            '<p>Manage registrations, events, and e-tickets for the Autism Awareness Programme.</p>' +
            '</header>' +
            '<div id="admin-login-error" class="ak-login-error" role="alert"></div>' +
            '<form id="admin-login-form" class="ak-login-form" autocomplete="off">' +
            '<div class="ak-login-field"><label for="admin-email">Email or staff ID</label>' +
            '<input type="text" id="admin-email" name="admin-portal-email" placeholder="you@organisation.org" required autocomplete="username"></div>' +
            '<div class="ak-login-field"><label for="admin-password">Password</label>' +
            '<input type="password" id="admin-password" name="admin-portal-password" placeholder="Enter your password" required autocomplete="current-password"></div>' +
            '<div id="admin_login_otp_panel" class="ak-login-otp" style="display:none"></div>' +
            '<button type="submit" class="btn-primary ak-login-submit"><i class="fas fa-right-to-bracket"></i> Sign in</button>' +
            '</form>' +
            '<footer class="ak-login-footer"><a href="/"><i class="fas fa-house"></i> Return to public website</a></footer>' +
            '</div>';
        if (typeof window.bindAdminLoginForm === 'function') window.bindAdminLoginForm();
        if (typeof wireAdminLoginOtpButtons === 'function') wireAdminLoginOtpButtons();
    }

    function hideGalleryCmsBlocks() {
        document.querySelectorAll('#cms-gallery-years').forEach((el) => {
            const card = el.closest('.card') || el.parentElement;
            if (card) card.style.display = 'none';
        });
        const semGal = document.getElementById('seminar-gallery');
        if (semGal) {
            const wrap = semGal.closest('div')?.parentElement;
            if (wrap) wrap.style.display = 'none';
        }
    }

    function applyAdminBranding() {
        document.title = (document.title || '').replace(/Seminar|Doctor/gi, 'Autism');
        const side = document.querySelector('.sidebar-header h2');
        if (side) side.textContent = 'Autism Admin';
        const sub = document.querySelector('.sidebar-header p');
        if (sub) sub.textContent = 'Programme management';
        patchApplicationsMenu();
        document.querySelectorAll('[data-admin-module="tab-behalf-reg"]').forEach((el) => {
            if (el.querySelector('i')) {
                el.innerHTML = '<i class="fas fa-file-medical"></i> Doctor applications';
            }
        });
        const staffNote = document.querySelector('#tab-staff-users p');
        if (staffNote) {
            staffNote.innerHTML =
                'Co-admin and scanner accounts appear here. Your <strong>Super Admin</strong> login is separate and is not listed. Public sign-ups appear under <strong>Participants</strong>.';
        }
        injectSuperAdminStaffNote();
    }

    function injectSuperAdminStaffNote() {
        if (document.getElementById('autism-super-admin-staff-note')) return;
        const tab = document.getElementById('tab-staff-users');
        if (!tab) return;
        const h2 = tab.querySelector('h2');
        if (!h2) return;
        const box = document.createElement('div');
        box.id = 'autism-super-admin-staff-note';
        box.style.cssText =
            'margin:-8px 0 16px;padding:12px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;font-size:0.88rem;color:#065f46;';
        box.innerHTML =
            '<strong>Super Admin</strong> — you keep full admin access. Create <strong>Co Admin</strong> or <strong>Scanner</strong> accounts below for your team.';
        h2.insertAdjacentElement('afterend', box);
    }

    function hideMedicalQualOptions() {
        const qualHost = document.getElementById('admin-global-qual-options');
        if (qualHost) {
            const block = qualHost.closest('div[style*="f0fdf4"]') || qualHost.parentElement;
            if (block) block.style.display = 'none';
        }
        document.querySelectorAll('#admin-reg-fields-tbody tr').forEach((tr) => {
            const keyCell = tr.querySelector('td');
            if (keyCell && String(keyCell.textContent || '').trim().toLowerCase() === 'qual') {
                tr.style.display = 'none';
            }
        });
    }

    const PREREG_STATUSES = ['submitted', 'approved', 'rejected', 'revision_required'];

    function preregStatusOptionsHtml(current) {
        const cur = String(current || 'submitted').toLowerCase();
        return PREREG_STATUSES.map(
            (s) =>
                `<option value="${s}"${cur === s ? ' selected' : ''}>${s.replace(/_/g, ' ')}</option>`
        ).join('');
    }

    const AK_ADMIN_REG_STATUSES = [
        { value: 'submitted', label: 'Submitted' },
        { value: 'pending_approval', label: 'Approved (awaiting e-ticket)' },
        { value: 'revision_required', label: 'Revision required' },
        { value: 'documents_requested', label: 'Documents requested' },
        { value: 'e_ticket_issued', label: 'E-ticket issued' },
        { value: 'checked_in', label: 'Checked in' },
        { value: 'completed', label: 'Completed' },
        { value: 'certificate_issued', label: 'Certificate issued' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'cancelled', label: 'Cancelled' }
    ];

    function autismAdminRegistrationStatusOptionsHtml(current) {
        const cur = String(current || '').toLowerCase();
        const legacy = cur === 'approved_pending_payment' ? 'pending_approval' : cur;
        return AK_ADMIN_REG_STATUSES.map((s) => {
            const sel = legacy === s.value ? ' selected' : '';
            return '<option value="' + s.value + '"' + sel + '>' + s.label + '</option>';
        }).join('');
    }

    function autismLooksLikeStoredFile(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return false;
        if (/^https?:\/\//i.test(s)) return true;
        if (s.startsWith('/uploads/') || s.startsWith('/api/assets/')) return true;
        if (/\.(pdf|jpe?g|png|gif|webp|bmp|pptx?|docx?)$/i.test(s)) return true;
        return false;
    }

    function autismAdminExtraFormFieldsHtml(formData) {
        const fd = formData || {};
        const known = new Set([
            'fname',
            'mname',
            'lname',
            'email',
            'phone',
            'dob',
            'address',
            'pin',
            'city',
            'state',
            'country',
            'qual',
            'ncism',
            'cpin',
            'college',
            'ccity',
            'cstate',
            'certificate_path',
            'ncism_certificate_check',
            'additional_documents',
            'agree_terms',
            'password'
        ]);
        let html = '';
        Object.keys(fd).forEach((k) => {
            if (known.has(k)) return;
            const v = fd[k];
            if (v == null || String(v).trim() === '') return;
            const label = k.replace(/_/g, ' ');
            if (autismLooksLikeStoredFile(v)) {
                const href =
                    typeof window.publicFileHref === 'function'
                        ? window.publicFileHref(v)
                        : String(v).startsWith('/')
                          ? v
                          : '/uploads/' + v;
                html +=
                    '<p><strong>' +
                    escapeHtml(label) +
                    ':</strong> <a href="' +
                    escapeHtml(href) +
                    '" target="_blank" rel="noopener">View file</a></p>';
            } else {
                html += '<p><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(String(v)) + '</p>';
            }
        });
        return html;
    }

    function patchAutismAdminRegistrationUi() {
        window.adminRegistrationStatusOptionsHtml = autismAdminRegistrationStatusOptionsHtml;
        if (typeof formatAdminApplicationDetailsHtml === 'function' && !formatAdminApplicationDetailsHtml.__akHook) {
            const orig = formatAdminApplicationDetailsHtml;
            window.formatAdminApplicationDetailsHtml = function (formData, certLink) {
                return orig(formData, certLink) + autismAdminExtraFormFieldsHtml(formData);
            };
            window.formatAdminApplicationDetailsHtml.__akHook = true;
        }
        if (typeof updateAppStatus === 'function' && !updateAppStatus.__akHook) {
            const origUpdate = updateAppStatus;
            window.updateAppStatus = async function (appId, status) {
                const st = String(status || '').toLowerCase();
                if (st === 'approved_pending_payment' || st === 'completed') {
                    return alert(
                        'Payment is not used on the autism portal. Approve the application, then issue the e-ticket from Final registration tracking.'
                    );
                }
                return origUpdate(appId, status);
            };
            window.updateAppStatus.__akHook = true;
        }
    }

    function injectApplicationsStatusFilter() {
        const search = document.getElementById('applications-search');
        if (!search || document.getElementById('applications-queue-filter')) return;
        const wrap = search.closest('div');
        if (!wrap) return;
        const row = document.createElement('div');
        row.style.cssText = 'margin-top:10px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;';
        row.innerHTML =
            '<label style="font-weight:600;font-size:0.9rem;">Show</label>' +
            '<select id="applications-queue-filter" onchange="adminFilterApplicationsList()" style="padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;">' +
            '<option value="all">All (pre-reg + final)</option>' +
            '<option value="pending">Pending pre-reg only</option>' +
            '<option value="prereg">All pre-registrations</option>' +
            '<option value="final">Final registration only</option>' +
            '</select>';
        wrap.appendChild(row);
    }

    function patchAdminApplicationsQueue() {
        if (window.__autismAppsPatched || typeof window.loadApplications !== 'function') return;
        const origLoad = window.loadApplications;
        window.loadApplications = async function () {
            try {
                const preregUrl =
                    typeof withActingAdminUrl === 'function'
                        ? withActingAdminUrl('/api/admin/preregistrations')
                        : '/api/admin/preregistrations';
                const appsUrl =
                    typeof withActingAdminUrl === 'function'
                        ? withActingAdminUrl('/api/admin/applications')
                        : '/api/admin/applications';
                const fetchJson = async (url) => {
                    if (typeof window.autismAdminFetch === 'function') {
                        return window.autismAdminFetch(url);
                    }
                    const r = await fetch(url, { credentials: 'same-origin' });
                    const data = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(data.error || r.statusText);
                    return data;
                };
                const [regs, pregs] = await Promise.all([fetchJson(appsUrl), fetchJson(preregUrl)]);
                const preRows = (Array.isArray(pregs) ? pregs : []).map((p) => {
                    let formData = {};
                    try {
                        formData = JSON.parse(p.form_data || '{}');
                    } catch (_) {}
                    const candidateName = formData.fname
                        ? [formData.fname, formData.mname, formData.lname].filter(Boolean).join(' ')
                        : [p.first_name, p.last_name].filter(Boolean).join(' ');
                    return {
                        id: 'prereg-' + p.id,
                        prereg_id: p.id,
                        application_no: p.application_no,
                        status: p.status || 'submitted',
                        form_data: p.form_data,
                        first_name: p.first_name,
                        last_name: p.last_name,
                        user_id_string: p.user_id_string || '',
                        created_at: p.created_at,
                        seminar_title: p.seminar_title,
                        _kind: 'prereg',
                        _candidateName: candidateName,
                        _hasFinalReg: !!p.registration_id
                    };
                });
                const merged = [
                    ...preRows,
                    ...(Array.isArray(regs) ? regs.map((r) => ({ ...r, _kind: 'registration' })) : [])
                ];
                if (typeof window.__setGlobalAdminApps === 'function') {
                    window.__setGlobalAdminApps(merged);
                }
                if (typeof window.renderApplicationsTable === 'function') window.renderApplicationsTable();
            } catch (e) {
                console.error(e);
                return origLoad();
            }
        };

        const origRender = window.renderApplicationsTable;
        window.renderApplicationsTable = function () {
            const tbody = document.getElementById('applications-list');
            if (!tbody) return origRender ? origRender() : undefined;
            const filterEl = document.getElementById('applications-queue-filter');
            const filter = filterEl ? String(filterEl.value || 'all') : 'all';
            const q = String((document.getElementById('applications-search') || {}).value || '')
                .trim()
                .toLowerCase();
            let apps =
                typeof window.__getGlobalAdminApps === 'function' ? window.__getGlobalAdminApps() : [];
            if (filter === 'pending') {
                apps = apps.filter(
                    (a) =>
                        a._kind === 'prereg' &&
                        !a._hasFinalReg &&
                        ['submitted', 'revision_required'].includes(String(a.status || '').toLowerCase())
                );
            } else if (filter === 'prereg') {
                apps = apps.filter((a) => a._kind === 'prereg');
            } else if (filter === 'final') {
                apps = apps.filter((a) => a._kind !== 'prereg');
            }
            const filtered = q
                ? apps.filter((a) =>
                      typeof adminApplicationSearchBlob === 'function'
                          ? adminApplicationSearchBlob(a).includes(q)
                          : true
                  )
                : apps;
            const countEl = document.getElementById('applications-search-count');
            if (countEl) {
                const total =
                    typeof window.__getGlobalAdminApps === 'function'
                        ? window.__getGlobalAdminApps().length
                        : apps.length;
                countEl.textContent = q
                    ? `${filtered.length} of ${apps.length} shown (${total} total)`
                    : `${filtered.length} item${filtered.length === 1 ? '' : 's'} (${filter})`;
            }
            tbody.innerHTML = '';
            if (!filtered.length) {
                tbody.innerHTML =
                    '<tr><td colspan="5" style="text-align:center;">No applications match this view.</td></tr>';
                return;
            }
            const esc =
                typeof escAdmin === 'function'
                    ? escAdmin
                    : (s) =>
                          String(s == null ? '' : s)
                              .replace(/&/g, '&amp;')
                              .replace(/</g, '&lt;');
            filtered.forEach((a) => {
                const allApps =
                    typeof window.__getGlobalAdminApps === 'function' ? window.__getGlobalAdminApps() : [];
                const index = allApps.indexOf(a);
                let formData = {};
                try {
                    formData = JSON.parse(a.form_data || '{}');
                } catch (_) {}
                const candidateName =
                    a._candidateName ||
                    (formData.fname
                        ? [formData.fname, formData.mname, formData.lname].filter(Boolean).join(' ')
                        : [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(' '));
                const kindBadge =
                    a._kind === 'prereg'
                        ? '<span style="font-size:0.72rem;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;margin-left:6px;">Pre-reg</span>'
                        : '';
                const seminarNote = a.seminar_title
                    ? `<div style="font-size:0.78rem;color:#64748b;">${esc(a.seminar_title)}</div>`
                    : '';
                let statusCell;
                if (a._kind === 'prereg') {
                    statusCell = `<select onchange="updateAutismPreregStatus(${a.prereg_id}, this.value)" style="width:auto;min-width:200px;">${preregStatusOptionsHtml(a.status)}</select>`;
                } else {
                    statusCell = `<select onchange="updateAppStatus(${a.id}, this.value)" style="width:auto;min-width:200px;">${
                        typeof adminRegistrationStatusOptionsHtml === 'function'
                            ? adminRegistrationStatusOptionsHtml(a.status)
                            : esc(a.status)
                    }</select>`;
                }
                const actions =
                    a._kind === 'prereg'
                        ? `<button type="button" class="btn-primary" onclick="switchTab('tab-prereg-tracking')">Open pre-reg tab</button>`
                        : `<button class="btn-primary" onclick="viewFullApplication(${index})">View</button>
                        <button type="button" class="btn-primary" style="margin-left:6px;background:#b91c1c;padding:4px 8px;font-size:0.8rem;" onclick="deleteAdminRegistration(${a.id}, '${String(a.application_no || '').replace(/'/g, "\\'")}')">Delete</button>`;
                tbody.innerHTML += `
                <tr>
                    <td><strong>${esc(a.application_no)}</strong>${kindBadge}${seminarNote}</td>
                    <td>${esc(a.user_id_string || '—')}</td>
                    <td>${esc(candidateName)}</td>
                    <td>${statusCell}</td>
                    <td>${actions}</td>
                </tr>`;
            });
        };

        window.updateAutismPreregStatus = async function (preregistrationId, status) {
            try {
                const call =
                    typeof window.autismAdminFetch === 'function'
                        ? window.autismAdminFetch('/api/admin/preregistrations/status', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ preregistrationId, status })
                          })
                        : fetch('/api/admin/preregistrations/status', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'same-origin',
                              body: JSON.stringify(
                                  typeof withActingAdminBody === 'function'
                                      ? withActingAdminBody({ preregistrationId, status })
                                      : { preregistrationId, status }
                              )
                          }).then(async (r) => {
                              const data = await r.json().catch(() => ({}));
                              if (!r.ok) throw new Error(data.error || r.statusText);
                              return data;
                          });
                await call;
                if (typeof window.loadApplications === 'function') window.loadApplications();
                if (typeof window.initAdminPreregTracking === 'function') window.initAdminPreregTracking();
            } catch (e) {
                alert(e.message || 'Could not update pre-registration status.');
            }
        };

        window.__autismAppsPatched = true;
    }

    function injectMainSeminarMessaging() {
        const tab = document.getElementById('tab-announcements');
        if (!tab) return;
        if (document.getElementById('ak-main-seminar-messaging')) {
            loadMainSeminarMessaging();
            return;
        }
        const card = document.createElement('div');
        card.id = 'ak-main-seminar-messaging';
        card.className = 'card';
        card.style.cssText = 'margin-bottom:20px;border-left:4px solid #7c3aed;';
        card.innerHTML =
            '<h3 style="margin:0 0 8px;">Main programme — email &amp; WhatsApp</h3>' +
            '<p style="color:#64748b;font-size:0.88rem;margin:0 0 14px;">Configure Zoho ZeptoMail and Meta WhatsApp API keys for OTP and participant messages. Set the WhatsApp group link for your main event.</p>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:720px;margin-bottom:12px;">' +
            '<div><label style="font-size:0.82rem;font-weight:700;">Main event</label><select id="ak-main-seminar-select" style="width:100%;padding:8px;"></select></div>' +
            '<div><label style="font-size:0.82rem;font-weight:700;">WhatsApp group / invite URL</label><input type="url" id="ak-main-seminar-wa" placeholder="https://chat.whatsapp.com/…" style="width:100%;padding:8px;"></div>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
            '<button type="button" class="btn-primary" id="ak-save-main-seminar-wa">Save event WhatsApp link</button>' +
            '<button type="button" class="btn-primary" style="background:#0d9488;" onclick="switchTab(\'tab-settings\'); if(typeof loadIntegrationSettings===\'function\') loadIntegrationSettings();">Email &amp; WhatsApp API keys</button>' +
            '<button type="button" class="btn-primary" style="background:#2563eb;" onclick="switchTab(\'tab-notifications\'); if(typeof initAdminNotificationsTab===\'function\') initAdminNotificationsTab();">Notification templates</button>' +
            '</div>' +
            '<p id="ak-main-seminar-msg" style="margin:10px 0 0;font-size:0.85rem;"></p>';
        tab.appendChild(card);
        loadMainSeminarMessaging();
        document.getElementById('ak-save-main-seminar-wa')?.addEventListener('click', saveMainSeminarWhatsapp);
        document.getElementById('ak-main-seminar-select')?.addEventListener('change', loadMainSeminarWhatsappField);
    }

    let cachedSeminars = [];

    async function loadMainSeminarMessaging() {
        const sel = document.getElementById('ak-main-seminar-select');
        if (!sel) return;
        try {
            const list = await fetch('/api/admin/seminars', { credentials: 'same-origin' }).then((r) => r.json());
            cachedSeminars = Array.isArray(list) ? list : list.seminars || [];
            sel.innerHTML = '';
            cachedSeminars.forEach((s) => {
                const o = document.createElement('option');
                o.value = s.id;
                o.textContent = s.title || 'Event ' + s.id;
                sel.appendChild(o);
            });
            if (cachedSeminars.length) loadMainSeminarWhatsappField();
        } catch (_) {}
    }

    function loadMainSeminarWhatsappField() {
        const sel = document.getElementById('ak-main-seminar-select');
        const wa = document.getElementById('ak-main-seminar-wa');
        if (!sel || !wa || !sel.value) return;
        const s = cachedSeminars.find((x) => String(x.id) === String(sel.value));
        wa.value = (s && (s.whatsapp_group_url || s.whatsapp)) || '';
    }

    async function saveMainSeminarWhatsapp() {
        const sel = document.getElementById('ak-main-seminar-select');
        const wa = document.getElementById('ak-main-seminar-wa');
        const msg = document.getElementById('ak-main-seminar-msg');
        if (!sel || !sel.value) return;
        const seminar = cachedSeminars.find((x) => String(x.id) === String(sel.value));
        if (!seminar) return;
        try {
            const payload = Object.assign({}, seminar, {
                whatsapp_group_url: wa ? wa.value.trim() : ''
            });
            const r = await fetch('/api/admin/seminars/' + encodeURIComponent(sel.value), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || r.statusText);
            seminar.whatsapp_group_url = payload.whatsapp_group_url;
            if (msg) {
                msg.textContent = 'WhatsApp group link saved for this event.';
                msg.style.color = '#047857';
            }
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Save failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    function wireSiteImageUpload() {
        const btn = document.getElementById('ak-site-images-upload-btn');
        const input = document.getElementById('ak-site-images-files');
        const status = document.getElementById('ak-site-images-status');
        if (!btn || !input) return;
        btn.addEventListener('click', async () => {
            const files = input.files;
            if (!files || !files.length) {
                if (status) {
                    status.textContent = 'Choose one or more images first.';
                    status.style.color = '#b91c1c';
                }
                return;
            }
            const fd = new FormData();
            for (let i = 0; i < files.length; i++) fd.append('images', files[i]);
            if (status) {
                status.textContent = 'Uploading…';
                status.style.color = '#64748b';
            }
            try {
                const data =
                    typeof window.autismAdminFetch === 'function'
                        ? await window.autismAdminFetch('/api/admin/autism-site-images/upload', {
                              method: 'POST',
                              body: fd
                          })
                        : await (async () => {
                              const r = await fetch(
                                  typeof withActingAdminUrl === 'function'
                                      ? withActingAdminUrl('/api/admin/autism-site-images/upload')
                                      : '/api/admin/autism-site-images/upload',
                                  { method: 'POST', body: fd, credentials: 'same-origin' }
                              );
                              const d = await r.json().catch(() => ({}));
                              if (!r.ok) throw new Error(d.error || r.statusText);
                              return d;
                          })();
                if (status) {
                    status.textContent =
                        'Uploaded ' + (data.added || files.length) + ' image(s). Live on homepage now (IST ' +
                        new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) +
                        ').';
                    status.style.color = '#047857';
                }
                input.value = '';
            } catch (e) {
                if (status) {
                    status.textContent = e.message || 'Upload failed';
                    status.style.color = '#b91c1c';
                }
            }
        });
    }

    function patchCreateStaffUserRoles() {
        if (typeof openAdminCreateUserModal !== 'function' || openAdminCreateUserModal.__autismHook) return;
        const orig = openAdminCreateUserModal;
        window.openAdminCreateUserModal = function (kind) {
            orig.call(this, kind);
            const roleSel = document.getElementById('newuser-role');
            if (!roleSel || kind !== 'staff') return;
            Array.from(roleSel.options).forEach((opt) => {
                opt.hidden = ['judge_user', 'reviewer', 'doctor', ''].includes(opt.value);
            });
            roleSel.value = 'co_admin';
        };
        window.openAdminCreateUserModal.__autismHook = true;
    }

    const PREREG_FORM_DEFAULT_V2 = {
        version: 3,
        fields: [
            { key: 'parent_name', label: 'Full Name (Parents)', type: 'text', step: 1, enabled: true, required: true },
            {
                key: 'parent_gender',
                label: 'Gender',
                type: 'select',
                step: 1,
                enabled: true,
                required: true,
                options: [
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' }
                ]
            },
            { key: 'parent_dob', label: 'Date of Birth', type: 'date', step: 1, enabled: true, required: true },
            { key: 'child_name', label: "Child's Name", type: 'text', step: 2, enabled: true, required: true },
            {
                key: 'child_gender',
                label: 'Gender',
                type: 'select',
                step: 2,
                enabled: true,
                required: true,
                options: [
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' }
                ]
            },
            { key: 'child_dob', label: 'Date of Birth', type: 'date', step: 2, enabled: true, required: true },
            { key: 'address', label: 'Full Address', type: 'textarea', step: 3, enabled: true, required: true },
            { key: 'pin', label: 'Pincode', type: 'text', step: 3, enabled: true, required: true },
            { key: 'city', label: 'City', type: 'text', step: 3, enabled: true, required: true },
            { key: 'state', label: 'State', type: 'text', step: 3, enabled: true, required: true },
            {
                key: 'country',
                label: 'Country',
                type: 'text',
                step: 3,
                enabled: true,
                required: true,
                defaultValue: 'India'
            },
            {
                key: 'attendees_count',
                label: 'Number of People Attending',
                type: 'number',
                step: 4,
                enabled: true,
                required: true
            },
            { key: 'child_health', label: "Child's Health", type: 'textarea', step: 4, enabled: true, required: false },
            { key: 'diet', label: 'Diet', type: 'textarea', step: 4, enabled: true, required: false },
            {
                key: 'financial_planning',
                label: 'Financial Planning',
                type: 'textarea',
                step: 4,
                enabled: true,
                required: false
            }
        ]
    };

    function injectPreregFormResetCard() {
        const regTab = document.getElementById('tab-reg-form');
        if (!regTab || document.getElementById('ak-prereg-form-reset-card')) return;
        const card = document.createElement('div');
        card.id = 'ak-prereg-form-reset-card';
        card.className = 'card';
        card.style.cssText = 'margin-bottom:18px;border-left:4px solid #2563eb;';
        card.innerHTML =
            '<h3 style="margin:0 0 8px;">Pre-registration form</h3>' +
            '<p style="color:#64748b;font-size:0.88rem;margin:0 0 12px;">Pre-registration uses 4 steps (parent, child, address, questions).</p>' +
            '<button type="button" class="btn-primary" id="ak-prereg-form-reset-btn">Reset pre-registration form to defaults</button>' +
            '<p id="ak-prereg-form-reset-msg" style="margin:10px 0 0;font-size:0.85rem;"></p>';
        regTab.insertBefore(card, regTab.querySelector('.card') || regTab.firstChild);
        document.getElementById('ak-prereg-form-reset-btn')?.addEventListener('click', async () => {
            const msg = document.getElementById('ak-prereg-form-reset-msg');
            if (!confirm('Reset the global pre-registration form to the default 4-step layout?')) return;
            try {
                const adm = typeof getStoredAdminUser === 'function' ? getStoredAdminUser() : null;
                const aid = adm && adm.id ? Number(adm.id) : null;
                if (!aid) throw new Error('actingAdminId is required. Sign in to admin again.');
                const r = await fetch('/api/admin/preregistration-form-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ ...PREREG_FORM_DEFAULT_V2, actingAdminId: aid })
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data.error || r.statusText);
                if (msg) {
                    msg.textContent = 'Pre-registration form reset to defaults.';
                    msg.style.color = '#047857';
                }
            } catch (e) {
                if (msg) {
                    msg.textContent = e.message || 'Reset failed';
                    msg.style.color = '#b91c1c';
                }
            }
        });
    }

    const PREREG_ADMIN_FIELD_TYPES = ['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'boolean'];

    function preregFieldTypeOptions(selected) {
        const sel = String(selected || 'text').toLowerCase();
        return PREREG_ADMIN_FIELD_TYPES.map((t) => `<option value="${t}"${t === sel ? ' selected' : ''}>${t}</option>`).join('');
    }

    function ensurePreregFormEditorCard() {
        const tab = document.getElementById('tab-reg-form');
        if (!tab || document.getElementById('ak-prereg-form-editor-card')) return;
        const card = document.createElement('div');
        card.id = 'ak-prereg-form-editor-card';
        card.className = 'card';
        card.style.cssText = 'margin-top:16px;border-left:4px solid #2563eb;';
        card.innerHTML =
            '<h3 style="margin:0 0 8px;">Pre-registration form fields (4-step)</h3>' +
            '<p style="color:#64748b;font-size:0.88rem;margin:0 0 12px;">Customize pre-registration fields shown to applicants.</p>' +
            '<table class="data-table"><thead><tr><th>Field key</th><th>Label</th><th>Type</th><th>Step</th><th>Enabled</th><th>Required</th><th>Options JSON (for select)</th><th></th></tr></thead><tbody id="ak-prereg-editor-tbody"><tr><td colspan="8">Open tab to load…</td></tr></tbody></table>' +
            '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">' +
            '<button type="button" class="btn-primary" style="background:#0d9488;" id="ak-prereg-add-field-btn">+ Add field</button>' +
            '<button type="button" class="btn-primary" style="background:#475569;" id="ak-prereg-load-fields-btn">Reload</button>' +
            '<button type="button" class="btn-primary" id="ak-prereg-save-fields-btn">Save pre-registration form</button>' +
            '</div>' +
            '<p id="ak-prereg-editor-msg" style="margin-top:10px;font-weight:600;font-size:0.88rem;"></p>';
        tab.appendChild(card);
        document.getElementById('ak-prereg-add-field-btn')?.addEventListener('click', () => {
            const rows = window.__akPreregAdminRows || [];
            rows.push({
                key: 'custom_' + Date.now(),
                label: 'Custom field',
                type: 'text',
                step: 4,
                enabled: true,
                required: false
            });
            window.__akPreregAdminRows = rows;
            renderPreregFieldEditorRows();
        });
        document.getElementById('ak-prereg-load-fields-btn')?.addEventListener('click', () => loadAdminPreregFormConfig());
        document.getElementById('ak-prereg-save-fields-btn')?.addEventListener('click', () => saveAdminPreregFormConfig());
    }

    function injectEventManagementFormGuide() {
        const tab = document.getElementById('tab-seminars');
        if (!tab || document.getElementById('ak-event-form-guide-card')) return;
        const firstCard = tab.querySelector('.card');
        if (!firstCard) return;
        const card = document.createElement('div');
        card.id = 'ak-event-form-guide-card';
        card.className = 'card';
        card.style.cssText = 'margin-bottom:14px;border-left:4px solid #0d9488;background:#f0fdfa;';
        card.innerHTML =
            '<h3 style="margin:0 0 8px;color:#0f766e;">Event forms: Pre-registration + Main registration</h3>' +
            '<p style="font-size:0.88rem;color:#475569;margin:0 0 10px;">This event workflow uses two configurable forms: <strong>Pre-registration</strong> first, then <strong>Main registration</strong>. Set event dates here, and manage all fields in Registration Form Fields.</p>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
            '<button type="button" class="btn-primary" style="background:#0d9488;" id="ak-open-prereg-editor">Open pre-registration fields</button>' +
            '<button type="button" class="btn-primary" style="background:#2563eb;" id="ak-open-mainreg-editor">Open main registration fields</button>' +
            '</div>';
        tab.insertBefore(card, firstCard);
        document.getElementById('ak-open-prereg-editor')?.addEventListener('click', () => {
            if (typeof window.switchTab === 'function') window.switchTab('tab-reg-form');
            setTimeout(() => {
                document.getElementById('ak-prereg-form-editor-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        });
        document.getElementById('ak-open-mainreg-editor')?.addEventListener('click', () => {
            if (typeof window.switchTab === 'function') window.switchTab('tab-reg-form');
            setTimeout(() => {
                document.getElementById('admin-reg-fields-tbody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        });
    }

    function renderPreregFieldEditorRows() {
        const tbody = document.getElementById('ak-prereg-editor-tbody');
        if (!tbody) return;
        const rows = window.__akPreregAdminRows || [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;">No fields configured.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map((f, idx) => {
                const optionsJson = f.type === 'select' && Array.isArray(f.options) ? JSON.stringify(f.options) : '';
                const safeOptions = String(optionsJson).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                const keySafe = String(f.key || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                const labelSafe = String(f.label || f.key || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                return (
                    '<tr>' +
                    `<td><input type="text" id="ak-prereg-key-${idx}" value="${keySafe}" style="margin:0;min-width:140px;"></td>` +
                    `<td><input type="text" id="ak-prereg-label-${idx}" value="${labelSafe}" style="margin:0;min-width:180px;"></td>` +
                    `<td><select id="ak-prereg-type-${idx}" style="margin:0;">${preregFieldTypeOptions(f.type)}</select></td>` +
                    `<td><input type="number" id="ak-prereg-step-${idx}" min="1" max="9" value="${parseInt(f.step, 10) || 1}" style="margin:0;width:64px;"></td>` +
                    `<td><input type="checkbox" id="ak-prereg-enabled-${idx}" ${f.enabled !== false ? 'checked' : ''}></td>` +
                    `<td><input type="checkbox" id="ak-prereg-required-${idx}" ${f.required ? 'checked' : ''}></td>` +
                    `<td><input type="text" id="ak-prereg-options-${idx}" value="${safeOptions}" placeholder='[{"value":"Male","label":"Male"}]' style="margin:0;min-width:200px;"></td>` +
                    `<td><button type="button" class="btn-primary" style="padding:4px 8px;font-size:0.75rem;background:#64748b;" onclick="removeAdminPreregFieldRow(${idx})">Remove</button></td>` +
                    '</tr>'
                );
            })
            .join('');
    }

    window.removeAdminPreregFieldRow = function removeAdminPreregFieldRow(idx) {
        const rows = window.__akPreregAdminRows || [];
        if (idx < 0 || idx >= rows.length) return;
        rows.splice(idx, 1);
        window.__akPreregAdminRows = rows;
        renderPreregFieldEditorRows();
    };

    async function loadAdminPreregFormConfig() {
        ensurePreregFormEditorCard();
        const tbody = document.getElementById('ak-prereg-editor-tbody');
        const msg = document.getElementById('ak-prereg-editor-msg');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading…</td></tr>';
        if (msg) msg.textContent = '';
        try {
            const adm = typeof getStoredAdminUser === 'function' ? getStoredAdminUser() : null;
            const aid = adm && adm.id ? Number(adm.id) : null;
            if (!aid) throw new Error('actingAdminId is required. Sign in to admin again.');
            const r = await fetch(
                '/api/admin/preregistration-form-config?actingAdminId=' + encodeURIComponent(String(aid)),
                { credentials: 'same-origin' }
            );
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || r.statusText);
            const fields = Array.isArray(data.fields) ? data.fields : [];
            window.__akPreregAdminRows = fields;
            renderPreregFieldEditorRows();
        } catch (e) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#b91c1c;">Failed to load</td></tr>';
            if (msg) {
                msg.textContent = e.message || 'Load failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    async function saveAdminPreregFormConfig() {
        const rows = window.__akPreregAdminRows || [];
        const msg = document.getElementById('ak-prereg-editor-msg');
        const fields = [];
        for (let idx = 0; idx < rows.length; idx++) {
            const key = String((document.getElementById(`ak-prereg-key-${idx}`) || {}).value || '').trim();
            if (!key) continue;
            const type = String((document.getElementById(`ak-prereg-type-${idx}`) || {}).value || 'text').toLowerCase();
            const row = {
                key,
                label: String((document.getElementById(`ak-prereg-label-${idx}`) || {}).value || key).trim(),
                type,
                step: parseInt((document.getElementById(`ak-prereg-step-${idx}`) || {}).value, 10) || 1,
                enabled: !!(document.getElementById(`ak-prereg-enabled-${idx}`) || {}).checked,
                required: !!(document.getElementById(`ak-prereg-required-${idx}`) || {}).checked
            };
            if (type === 'select') {
                const raw = String((document.getElementById(`ak-prereg-options-${idx}`) || {}).value || '').trim();
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) row.options = parsed;
                    } catch (_) {
                        if (msg) {
                            msg.textContent = `Invalid options JSON for field: ${key}`;
                            msg.style.color = '#b91c1c';
                        }
                        return;
                    }
                }
            }
            fields.push(row);
        }
        try {
            const adm = typeof getStoredAdminUser === 'function' ? getStoredAdminUser() : null;
            const aid = adm && adm.id ? Number(adm.id) : null;
            if (!aid) throw new Error('actingAdminId is required. Sign in to admin again.');
            const payload = { version: 3, fields };
            const r = await fetch('/api/admin/preregistration-form-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ ...payload, actingAdminId: aid })
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || r.statusText);
            window.__akPreregAdminRows = fields;
            renderPreregFieldEditorRows();
            if (msg) {
                msg.textContent = 'Pre-registration form saved.';
                msg.style.color = '#047857';
            }
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Save failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    function patchRegistrationFormTabLoader() {
        if (typeof window.switchTab !== 'function' || window.switchTab.__akRegFormHook) return;
        const orig = window.switchTab;
        window.switchTab = function (tabId, menuEl) {
            orig.call(this, tabId, menuEl);
            if (tabId === 'tab-reg-form') {
                loadAdminPreregFormConfig();
            }
        };
        window.switchTab.__akRegFormHook = true;
    }

    function collapseDuplicateCmsFields() {
        const hideSecond = (id) => {
            const nodes = document.querySelectorAll('#' + id);
            if (nodes.length < 2) return;
            const grid = nodes[1].closest('div[style*="grid-template-columns"]');
            if (grid && grid.querySelector('#' + id)) grid.style.display = 'none';
        };
        [
            'cms-footer-tagline',
            'cms-top-email',
            'cms-top-phone',
            'cms-top-date',
            'cms-hero-eyebrow',
            'cms-hero-title'
        ].forEach(hideSecond);
    }

    function patchSwitchTabForCms() {
        if (typeof window.switchTab !== 'function' || window.switchTab.__akCmsTabHook) return;
        const orig = window.switchTab;
        window.switchTab = function (tabId, menuEl) {
            orig.call(this, tabId, menuEl);
            if (tabId === 'tab-site-cms') {
                tightenAutismCmsTab();
                reorderAutismHomepageCms();
                if (typeof refreshHomepageLivePreview === 'function') refreshHomepageLivePreview(false);
            }
        };
        window.switchTab.__akCmsTabHook = true;
    }

    function patchLoadAdminSiteCms() {
        if (typeof loadAdminSiteCms !== 'function' || loadAdminSiteCms.__akCmsHook) return;
        const orig = loadAdminSiteCms;
        window.loadAdminSiteCms = async function () {
            await orig.apply(this, arguments);
            collapseDuplicateCmsFields();
            reorderAutismHomepageCms();
        };
        window.loadAdminSiteCms.__akCmsHook = true;
    }

    document.addEventListener('DOMContentLoaded', () => {
        fixLegacyAdminLoginPage();
        hideMenuItems();
        injectPreregFields();
        ensureSeminarPreregOverrideEditor();
        labelMainRegistrationOtpSection();
        patchOpenCreateSeminarModal();
        injectEventManagementFormGuide();
        injectPreregFormResetCard();
        ensurePreregFormEditorCard();
        patchSaveSeminar();
        patchSeminarPayload();
        patchEditSeminarFlowFlags();
        document.getElementById('seminar-flow-prereg-required')?.addEventListener('change', syncSeminarFlowFormSections);
        document.getElementById('seminar-flow-main-required')?.addEventListener('change', syncSeminarFlowFormSections);
        syncSeminarFlowFormSections();
        patchRegistrationFormTabLoader();
        patchCreateStaffUserRoles();
        patchLoadAdminSiteCms();
        patchSwitchTabForCms();
        collapseDuplicateCmsFields();
        applyAdminBranding();
        wireSiteImageUpload();
        injectHomepageCmsGuide();
        reorderAutismHomepageCms();
        tightenAutismCmsTab();
        hideGalleryCmsBlocks();
        hideMedicalQualOptions();
        injectApplicationsStatusFilter();
        patchAutismAdminRegistrationUi();
        patchAdminApplicationsQueue();
        injectMainSeminarMessaging();
        if (window.AutismTerminology) window.AutismTerminology.applyAll();
    });
})();
