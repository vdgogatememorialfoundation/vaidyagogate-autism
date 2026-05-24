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
        'tab-payments'
    ];

    function hideAutismDisabledTabs() {
        HIDDEN_TABS.forEach((tabId) => {
            document.querySelectorAll(`[data-tab="${tabId}"]`).forEach((el) => {
                el.classList.add('hidden');
                el.style.display = 'none';
            });
            const pane = document.getElementById(tabId);
            if (pane) pane.classList.add('hidden');
        });
    }

    function currentUserId() {
        try {
            const raw = localStorage.getItem('portalUser') || localStorage.getItem('doctorUser');
            if (!raw) return null;
            const u = JSON.parse(raw);
            return u && u.id ? u.id : null;
        } catch (_) {
            return null;
        }
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
            const fg = document.createElement('motion-div' in document ? 'div' : 'div');
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

    async function loadPreregList() {
        const uid = currentUserId();
        const box = document.getElementById('prereg-list');
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/preregistrations/' + uid);
            if (!rows.length) {
                box.innerHTML = '<p style="color:#64748b;">No pre-registrations yet.</p>';
                return;
            }
            box.innerHTML =
                '<table class="data-table"><thead><tr><th>Event</th><th>Application no.</th><th>Status</th><th>Submitted</th></tr></thead><tbody>' +
                rows
                    .map(
                        (r) =>
                            '<tr><td>' +
                            (r.seminar_title || r.seminar_id) +
                            '</td><td>' +
                            (r.application_no || '—') +
                            '</td><td>' +
                            (r.status || '—') +
                            '</td><td>' +
                            (r.created_at || '').slice(0, 16) +
                            '</td></tr>'
                    )
                    .join('') +
                '</tbody></table>';
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
        const hi = document.getElementById('header-name');
        if (hi && hi.textContent.includes('Doctor')) hi.textContent = hi.textContent.replace('Doctor', 'Applicant');
    }

    document.addEventListener('DOMContentLoaded', () => {
        hideAutismDisabledTabs();
        applyBranding();
        wireAutismTabs();
    });
})();
