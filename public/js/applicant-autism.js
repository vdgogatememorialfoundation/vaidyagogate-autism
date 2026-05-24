/**
 * Autism applicant portal extensions: preregistration, competition uploads, tab visibility.
 */
(function () {
    'use strict';

    const HIDDEN_TABS = [
        'tab-abstract',
        'tab-case-track',
        'tab-orders',
        'tab-receipts',
        'tab-payments',
        'tab-volunteer'
    ];

    function hideAutismDisabledTabs() {
        HIDDEN_TABS.forEach((tabId) => {
            document.querySelectorAll(`[data-tab="${tabId}"]`).forEach((el) => el.remove());
            document.getElementById(tabId)?.remove();
        });
        document.getElementById('nav-volunteer')?.remove();
        document.getElementById('tab-volunteer')?.remove();
        document.querySelector('.announcements-box')?.remove();
        document.querySelector('[onclick*="tab-orders"]')?.remove();
        document.getElementById('make-payments-container')?.remove();
    }

    function updateProfileDisplayName() {
        if (typeof formatApplicantDisplayName !== 'function') return;
        const user = window.currentUser;
        if (!user) return;
        const name = formatApplicantDisplayName(user);
        const profileEl = document.getElementById('profile-display-name');
        if (profileEl) profileEl.textContent = name || '—';
        const hi = document.getElementById('header-name');
        if (hi) hi.textContent = name ? `Hi, ${name}` : 'Hi there';
    }

    function currentUserId() {
        if (window.currentUser && window.currentUser.id != null) {
            const n = Number(window.currentUser.id);
            return Number.isInteger(n) && n > 0 ? n : null;
        }
        if (typeof doctorNumericUserId === 'function') {
            const n = doctorNumericUserId();
            if (n) return n;
        }
        try {
            if (typeof PortalAuth !== 'undefined') {
                const u = PortalAuth.getUser('doctor');
                if (u && u.id != null) {
                    const n = Number(u.id);
                    if (Number.isInteger(n) && n > 0) return n;
                }
            }
            const keys = ['seminar_doctor_user', 'portalUser', 'doctorUser', 'seminar_user'];
            for (let i = 0; i < keys.length; i++) {
                const raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                const u = JSON.parse(raw);
                if (u && u.id != null) {
                    const n = Number(u.id);
                    if (Number.isInteger(n) && n > 0) return n;
                }
            }
        } catch (_) {
            /* ignore */
        }
        return null;
    }

    async function fetchJson(url, opts) {
        if (window.httpJson) return window.httpJson(url, opts);
        const r = await fetch(url, opts);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        return data;
    }

  let preregFields = [];
  let preregSeminars = [];

    async function loadPreregFormConfig(seminarId) {
        const q = seminarId ? `?seminarId=${encodeURIComponent(seminarId)}` : '';
        const data = await fetchJson('/api/preregistration-form-config' + q);
        preregFields = data.fields || [];
        return data;
    }

    function renderPreregFields(container) {
        if (!container) return;
        container.innerHTML = '';
        (preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const fg = document.createElement('div');
            fg.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = f.label + (f.required ? ' *' : '');
            fg.appendChild(label);
            let input;
            if (f.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else if (f.type === 'select') {
                input = document.createElement('select');
                (f.options || []).forEach((o) => {
                    const opt = document.createElement('option');
                    opt.value = o.value;
                    opt.textContent = o.label || o.value;
                    input.appendChild(opt);
                });
            } else if (f.type === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
            } else {
                input = document.createElement('input');
                input.type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : f.type === 'date' ? 'date' : 'text';
            }
            input.id = 'prereg-field-' + f.key;
            input.dataset.fieldKey = f.key;
            if (f.required && f.type !== 'boolean') input.required = true;
            fg.appendChild(input);
            container.appendChild(fg);
        });
    }

    async function loadPreregSeminars() {
        const sel = document.getElementById('prereg-seminar-select');
        if (!sel) return;
        try {
            const list = await fetchJson('/api/seminars');
            preregSeminars = Array.isArray(list) ? list : list.seminars || [];
            sel.innerHTML = '<option value="">Select event</option>';
            preregSeminars.forEach((s) => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.title || 'Event ' + s.id;
                sel.appendChild(opt);
            });
        } catch (e) {
            sel.innerHTML = '<option value="">Could not load events</option>';
        }
    }

    async function submitPreregistration(ev) {
        ev.preventDefault();
        const uid = currentUserId();
        const sid = parseInt(document.getElementById('prereg-seminar-select')?.value, 10);
        if (!uid) return alert('Please sign in again.');
         if (!sid) return alert('Select an event.');
        const formData = {};
        (preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const el = document.getElementById('prereg-field-' + f.key);
            if (!el) return;
            formData[f.key] = f.type === 'boolean' ? !!el.checked : el.value;
        });
        const msg = document.getElementById('prereg-status-msg');
        try {
            await fetchJson('/api/preregistrations/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: uid, seminarId: sid, formData })
            });
            if (msg) {
                msg.textContent = 'Pre-registration submitted successfully.';
                msg.style.color = '#047857';
            }
            loadPreregList();
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Submit failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    function preregStatusMeta(status) {
        const st = String(status || 'submitted').toLowerCase();
        const map = {
            submitted: { label: 'Pending review', color: '#d97706', bg: '#fef3c7', step: 2 },
            approved: { label: 'Approved', color: '#047857', bg: '#d1fae5', step: 3 },
            rejected: { label: 'Not approved', color: '#b91c1c', bg: '#fee2e2', step: 2 },
            revision_required: { label: 'Revision needed', color: '#6d28d9', bg: '#ede9fe', step: 2 }
        };
        return map[st] || map.submitted;
    }

    function renderPreregTracker(rows) {
        const steps = [
            { n: 1, title: 'Pre-register', hint: 'Submit your form' },
            { n: 2, title: 'Admin review', hint: 'We check your details' },
            { n: 3, title: 'Final registration', hint: 'Complete full registration' },
            { n: 4, title: 'E-ticket', hint: 'Download your pass' }
        ];
        const active = rows.length
            ? Math.max(...rows.map((r) => preregStatusMeta(r.status).step))
            : 1;
        return (
            '<div class="ak-user-pipeline">' +
            steps
                .map((s) => {
                    const on = s.n <= active ? ' is-done' : '';
                    const cur = s.n === active ? ' is-current' : '';
                    return (
                        '<div class="ak-user-pipeline-step' +
                        on +
                        cur +
                        '"><span class="num">' +
                        s.n +
                        '</span><strong>' +
                        s.title +
                        '</strong><small>' +
                        s.hint +
                        '</small></div>'
                    );
                })
                .join('') +
            '</div>'
        );
    }

    async function loadPreregList() {
        const uid = currentUserId();
        const box = document.getElementById('prereg-list');
        const pipelineBox = document.getElementById('prereg-tracker');
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/preregistrations/' + uid);
            if (pipelineBox) pipelineBox.innerHTML = renderPreregTracker(rows);
            if (!rows.length) {
                box.innerHTML =
                    '<p style="color:#64748b;">No pre-registrations yet. Submit the form above to start.</p>';
                return;
            }
            box.innerHTML = rows
                .map((r) => {
                    const meta = preregStatusMeta(r.status);
                    const canReg = meta.step >= 3;
                    return (
                        '<div class="ak-prereg-card">' +
                        '<div class="ak-prereg-card-head">' +
                        '<div><strong>' +
                        (r.seminar_title || 'Event ' + r.seminar_id) +
                        '</strong><br><code style="font-size:0.85rem;">' +
                        (r.application_no || '—') +
                        '</code></div>' +
                        '<span class="ak-prereg-pill" style="background:' +
                        meta.bg +
                        ';color:' +
                        meta.color +
                        '">' +
                        meta.label +
                        '</span></div>' +
                        '<p style="font-size:0.88rem;color:#64748b;margin:8px 0 0;">Submitted ' +
                        (window.PortalDateTime && window.PortalDateTime.format
                            ? window.PortalDateTime.format(r.created_at) + ' IST'
                            : (r.created_at || '').slice(0, 16)) +
                        '</p>' +
                        (canReg
                            ? '<p style="margin-top:10px;font-size:0.9rem;color:#047857;font-weight:600;"><i class="fas fa-check-circle"></i> You can open <strong>Track seminar applications</strong> to complete final registration.</p>'
                            : r.status === 'revision_required'
                              ? '<p style="margin-top:10px;font-size:0.9rem;color:#6d28d9;font-weight:600;">Please update and resubmit your pre-registration.</p>'
                              : r.status === 'rejected'
                                ? '<p style="margin-top:10px;font-size:0.9rem;color:#b91c1c;">Contact us if you need help.</p>'
                                : '<p style="margin-top:10px;font-size:0.9rem;color:#64748b;">We will notify you when pre-registration is approved.</p>') +
                        '</div>'
                    );
                })
                .join('');
        } catch (e) {
            box.innerHTML = '<p style="color:#b91c1c;">' + (e.message || 'Load failed') + '</p>';
        }
    }

    async function submitCompetition(ev) {
        ev.preventDefault();
        const uid = currentUserId();
        if (!uid) return alert('Please sign in again.');
        const title = document.getElementById('comp-title')?.value?.trim();
        const category = document.getElementById('comp-category')?.value || '';
        const description = document.getElementById('comp-description')?.value || '';
        const seminarId = document.getElementById('comp-seminar-select')?.value || '';
        const files = document.getElementById('comp-files')?.files;
        if (!title) return alert('Enter a title.');
        if (!files || !files.length) return alert('Upload at least one file (photo, video, PPT, or PDF).');
        const fd = new FormData();
        fd.append('userId', uid);
        fd.append('title', title);
        fd.append('category', category);
        fd.append('description', description);
        if (seminarId) fd.append('seminarId', seminarId);
        for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
        const msg = document.getElementById('comp-status-msg');
        try {
            const r = await fetch('/api/competition-submissions/submit', { method: 'POST', body: fd });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || r.statusText);
            if (msg) {
                msg.textContent = data.message || 'Submitted successfully.';
                msg.style.color = '#047857';
            }
            document.getElementById('competition-form')?.reset();
            loadCompetitionList();
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Submit failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    async function loadCompetitionList() {
        const uid = currentUserId();
        const box = document.getElementById('comp-list');
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/competition-submissions/' + uid);
            if (!rows.length) {
                box.innerHTML = '<p style="color:#64748b;">No competition entries yet.</p>';
                return;
            }
            box.innerHTML = rows
                .map(
                    (r) =>
                        '<div class="card" style="margin-bottom:12px;"><strong>' +
                        (r.title || 'Entry') +
                        '</strong> — ' +
                        (r.status || 'submitted') +
                        '<br><small style="color:#64748b;">' +
                        (r.files || []).length +
                        ' file(s)</small></div>'
                )
                .join('');
        } catch (e) {
            box.innerHTML = '<p style="color:#b91c1c;">' + (e.message || 'Load failed') + '</p>';
        }
    }

    function wireAutismTabs() {
        document.querySelectorAll('[data-tab="tab-prereg"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                loadPreregSeminars();
                loadPreregFormConfig(null).then(() => {
                    renderPreregFields(document.getElementById('prereg-fields'));
                });
                loadPreregList();
            });
        });
        document.querySelectorAll('[data-tab="tab-competition"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                loadPreregSeminars().then(() => {
                    const compSel = document.getElementById('comp-seminar-select');
                    const preregSel = document.getElementById('prereg-seminar-select');
                    if (compSel && preregSel) compSel.innerHTML = preregSel.innerHTML;
                });
                loadCompetitionList();
            });
        });
        const preregSel = document.getElementById('prereg-seminar-select');
        if (preregSel) {
            preregSel.addEventListener('change', () => {
                const sid = parseInt(preregSel.value, 10);
                loadPreregFormConfig(sid || null).then(() => {
                    renderPreregFields(document.getElementById('prereg-fields'));
                });
            });
        }
        document.getElementById('prereg-form')?.addEventListener('submit', submitPreregistration);
        document.getElementById('competition-form')?.addEventListener('submit', submitCompetition);
    }

    function applyBranding() {
        document.title = "Dashboard | Autism Awareness Programme";
        const h2 = document.querySelector('.sidebar-header h2');
        if (h2) h2.textContent = 'My Dashboard';
        const sub = document.querySelector('.sidebar-header p');
        if (sub) sub.textContent = 'Autism Awareness Programme';
        const ht = document.querySelector('.header-title');
        if (ht) ht.textContent = 'Autism Awareness Programme — Dashboard';
        updateProfileDisplayName();
    }

    document.addEventListener('DOMContentLoaded', () => {
        hideAutismDisabledTabs();
        applyBranding();
        wireAutismTabs();
        setTimeout(updateProfileDisplayName, 400);
        setTimeout(updateProfileDisplayName, 2500);
    });
})();
