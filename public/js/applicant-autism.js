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

    function separatePreregAndMainRegistration() {
        document.querySelectorAll('[data-tab="tab-seminars"]').forEach((el) => el.remove());
        setupAutismHubNavigation();
        const tabApps = document.getElementById('tab-applications');
        if (tabApps) {
            document.getElementById('ak-main-reg-start')?.remove();
            tabApps.querySelector('.data-table')?.closest('.card')?.remove();
        }
    }

    function setupAutismHubNavigation() {
        const menu = document.querySelector('.menu-items');
        if (!menu) return;
        menu.querySelectorAll('[data-tab="tab-prereg"], [data-tab="tab-applications"], [data-tab="tab-competition"]').forEach((el) => el.remove());
        const hubItems = [
            { tab: 'tab-event-register', icon: 'fa-calendar-plus', label: 'Register Event' },
            { tab: 'tab-event-track', icon: 'fa-route', label: 'Track Event' },
            { tab: 'tab-comp-register', icon: 'fa-cloud-upload-alt', label: 'Register Competition' },
            { tab: 'tab-comp-track', icon: 'fa-photo-video', label: 'Track Competition' }
        ];
        const anchor = menu.querySelector('[data-tab="tab-feedback"]');
        hubItems.forEach((it) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'menu-item';
            btn.dataset.tab = it.tab;
            btn.innerHTML = '<i class="fas ' + it.icon + '"></i> ' + it.label;
            if (anchor) menu.insertBefore(btn, anchor);
            else menu.appendChild(btn);
        });
        wrapAutismRegisterTrackSections();
    }

    function wrapAutismRegisterTrackSections() {
        const preregPane = document.getElementById('tab-prereg');
        if (preregPane && !document.getElementById('tab-event-register')) {
            const formCard = preregPane.querySelector('#prereg-form')?.closest('.card');
            const listCard = preregPane.querySelector('#prereg-list')?.closest('.card');
            const regPane = document.createElement('div');
            regPane.id = 'tab-event-register';
            regPane.className = 'tab-pane hidden';
            regPane.innerHTML =
                '<h3 class="section-title">Register for event</h3>' +
                '<p class="ak-prereg-lead" style="color:#64748b;margin-bottom:16px;">Submit pre-registration (step 1). After approval, complete main registration from the registration form.</p>';
            if (formCard) regPane.appendChild(formCard);
            const trackPane = document.createElement('div');
            trackPane.id = 'tab-event-track';
            trackPane.className = 'tab-pane hidden';
            trackPane.innerHTML =
                '<h3 class="section-title">Track event registration</h3>' +
                '<p style="color:#64748b;margin-bottom:16px;">Pre-registration and main registration status.</p>';
            if (listCard) trackPane.appendChild(listCard);
            const mainTrack = document.getElementById('applications-tracker-container');
            if (mainTrack) {
                const mc = mainTrack.closest('.card') || mainTrack;
                trackPane.appendChild(mc);
            }
            preregPane.replaceWith(regPane, trackPane);
        }
        const compPane = document.getElementById('tab-competition');
        if (compPane && !document.getElementById('tab-comp-register')) {
            const formCard = compPane.querySelector('#competition-form')?.closest('.card');
            const listCard = compPane.querySelector('#comp-list')?.closest('.card');
            const regPane = document.createElement('div');
            regPane.id = 'tab-comp-register';
            regPane.className = 'tab-pane hidden';
            regPane.innerHTML =
                '<h3 class="section-title">Register competition entry</h3>' +
                '<p style="color:#64748b;margin-bottom:16px;">Upload photos, videos, PPT, or PDF for competitions.</p>';
            if (formCard) regPane.appendChild(formCard);
            const trackPane = document.createElement('div');
            trackPane.id = 'tab-comp-track';
            trackPane.className = 'tab-pane hidden';
            trackPane.innerHTML =
                '<h3 class="section-title">Track competition entries</h3>' +
                '<p style="color:#64748b;margin-bottom:16px;">Status of your competition submissions.</p>';
            if (listCard) trackPane.appendChild(listCard);
            compPane.replaceWith(regPane, trackPane);
        }
    }

    function preregListEl() {
        return document.getElementById('prereg-list');
    }

    function compListEl() {
        return document.getElementById('comp-list');
    }

    function showEventRegisterView() {
        if (typeof switchTab === 'function') switchTab('tab-event-register');
        loadPreregSeminars();
        loadPreregFormConfig(null).then(() => renderPreregFields(document.getElementById('prereg-fields')));
    }

    function showEventTrackView() {
        if (typeof switchTab === 'function') switchTab('tab-event-track');
        loadPreregList();
        if (typeof loadApplications === 'function') loadApplications(true);
    }

    function showCompRegisterView() {
        if (typeof switchTab === 'function') switchTab('tab-comp-register');
        loadPreregSeminars().then(() => {
            const compSel = document.getElementById('comp-seminar-select');
            const preregSel = document.getElementById('prereg-seminar-select');
            if (compSel && preregSel) compSel.innerHTML = preregSel.innerHTML;
        });
    }

    function showCompTrackView() {
        if (typeof switchTab === 'function') switchTab('tab-comp-track');
        loadCompetitionList();
    }

    window.showEventRegisterView = showEventRegisterView;
    window.showEventTrackView = showEventTrackView;
    window.showCompRegisterView = showCompRegisterView;
    window.showCompTrackView = showCompTrackView;

    function hideAutismDisabledTabs() {
        HIDDEN_TABS.forEach((tabId) => {
            document.querySelectorAll(`[data-tab="${tabId}"]`).forEach((el) => el.remove());
            document.getElementById(tabId)?.remove();
        });
        document.getElementById('nav-volunteer')?.remove();
        document.getElementById('tab-volunteer')?.remove();
        const ann = document.querySelector('.announcements-box');
        if (ann) {
            const h = ann.querySelector('h4');
            if (h) h.innerHTML = '<i class="fas fa-bullhorn"></i> Announcements';
        }
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

    window.PORTAL_IS_AUTISM = true;

  let preregFields = [];
  let preregSeminars = [];
  let preregResubmitId = null;

    async function loadPreregFormConfig(seminarId) {
        const q = seminarId ? `?seminarId=${encodeURIComponent(seminarId)}` : '';
        const data = await fetchJson('/api/preregistration-form-config' + q);
        preregFields = data.fields || [];
        if (typeof window.__akExposePreregFields === 'function') {
            window.__akExposePreregFields(preregFields);
        } else {
            window.__akPreregFields = preregFields;
        }
        return data;
    }

    function renderPreregFields(container) {
        if (!container) return;
        container.innerHTML = '';
        (preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            if (
                f.key === 'qual' ||
                f.onlyWhenAdvancedQual ||
                f.onlyWhenPgCollege ||
                ['ncism', 'certificate', 'cpin', 'college', 'ccity', 'cstate'].includes(String(f.key || ''))
            ) {
                return;
            }
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
            window.__akPreregSeminars = preregSeminars;
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
            if (preregResubmitId) {
                await fetchJson('/api/preregistrations/resubmit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, preregistrationId: preregResubmitId, formData })
                });
                preregResubmitId = null;
                const sel = document.getElementById('prereg-seminar-select');
                if (sel) sel.disabled = false;
                if (msg) {
                    msg.textContent = 'Pre-registration updated and sent for review again.';
                    msg.style.color = '#047857';
                }
                loadPreregList();
                return;
            }
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

    function fillPreregFormFromData(formData) {
        (preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const el = document.getElementById('prereg-field-' + f.key);
            if (!el || formData[f.key] == null) return;
            if (f.type === 'boolean') el.checked = !!formData[f.key];
            else el.value = formData[f.key];
        });
    }

    window.beginPreregRevision = async function beginPreregRevision(row) {
        if (!row || !row.id) return;
        preregResubmitId = row.id;
        showEventRegisterView();
        await loadPreregSeminars();
        const sel = document.getElementById('prereg-seminar-select');
        if (sel) {
            sel.value = String(row.seminar_id || '');
            sel.disabled = true;
        }
        await loadPreregFormConfig(row.seminar_id || null);
        renderPreregFields(document.getElementById('prereg-fields'));
        let fd = {};
        try {
            fd = typeof row.form_data === 'string' ? JSON.parse(row.form_data || '{}') : row.form_data || {};
        } catch (_) {}
        fillPreregFormFromData(fd);
        const msg = document.getElementById('prereg-status-msg');
        if (msg) {
            msg.textContent = 'Update your pre-registration below, then submit again.';
            msg.style.color = '#6d28d9';
        }
        document.getElementById('prereg-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    async function downloadPreregPdf(row) {
        if (!row || !window.jspdf) {
            alert('PDF download is not available. Refresh the page and try again.');
            return;
        }
        let fd = {};
        try {
            fd = typeof row.form_data === 'string' ? JSON.parse(row.form_data || '{}') : row.form_data || {};
        } catch (_) {}
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 18;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Pre-registration application', 14, y);
        y += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Application no.: ' + (row.application_no || '—'), 14, y);
        y += 6;
        doc.text('Event: ' + (row.seminar_title || row.seminar_id || '—'), 14, y);
        y += 6;
        doc.text('Status: ' + String(row.status || 'submitted').replace(/_/g, ' '), 14, y);
        y += 10;
        Object.keys(fd).forEach((k) => {
            if (y > 270) {
                doc.addPage();
                y = 18;
            }
            doc.text(k + ': ' + String(fd[k] == null ? '' : fd[k]).slice(0, 120), 14, y);
            y += 6;
        });
        doc.save('prereg-' + (row.application_no || row.id) + '.pdf');
    }
    window.downloadPreregPdf = downloadPreregPdf;

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

    function renderFlipkartPrereg(r) {
        const st = String(r.status || 'submitted').toLowerCase();
        const regSt = String(r.registration_status || '').toLowerCase();
        const hasReg = !!r.registration_id;
        const steps = [
            { title: 'Submitted', icon: 'fa-clipboard-check' },
            { title: 'Review', icon: 'fa-magnifying-glass' },
            { title: 'Approved', icon: 'fa-circle-check' },
            { title: 'Registration', icon: 'fa-file-signature' },
            { title: 'E-ticket', icon: 'fa-qrcode' }
        ];
        let cur = 0;
        if (st === 'rejected' || st === 'revision_required') cur = 1;
        else if (st === 'submitted') cur = 1;
        else if (st === 'approved') cur = 2;
        if (hasReg && st === 'approved') cur = 3;
        if (hasReg && (regSt === 'completed' || regSt === 'checked_in' || regSt === 'e_ticket_issued')) cur = 4;
        const fail = st === 'rejected';
        const pct = fail ? 25 : Math.min(100, Math.round((cur / (steps.length - 1)) * 100));
        const html = steps
            .map((s, i) => {
                let cls = 'ak-fk-step';
                if (fail && i === 1) cls += ' is-fail';
                else if (i < cur) cls += ' is-done';
                else if (i === cur) cls += ' is-current';
                const icon = i < cur ? 'fa-check' : s.icon;
                return (
                    '<div class="' +
                    cls +
                    '"><div class="ak-fk-dot"><i class="fas ' +
                    icon +
                    '"></i></div><strong>' +
                    s.title +
                    '</strong></div>'
                );
            })
            .join('');
        return (
            '<div class="ak-fk-track"><div class="ak-fk-track-title">Pre-registration · ' +
            (r.application_no || '') +
            '</div><div class="ak-fk-steps"><span class="ak-fk-bar-fill" style="width:' +
            pct +
            '%"></span>' +
            html +
            '</div></div>'
        );
    }

    function eventRegStatusMeta(status) {
        const st = String(status || 'submitted').toLowerCase();
        const map = {
            submitted: { label: 'Submitted', color: '#d97706', bg: '#fef3c7' },
            pending_approval: { label: 'Under review', color: '#2563eb', bg: '#dbeafe' },
            revision_required: { label: 'Revision needed', color: '#6d28d9', bg: '#ede9fe' },
            approved_pending_payment: { label: 'Approved', color: '#047857', bg: '#d1fae5' },
            completed: { label: 'Approved', color: '#047857', bg: '#d1fae5' },
            e_ticket_issued: { label: 'E-ticket issued', color: '#047857', bg: '#d1fae5' },
            checked_in: { label: 'Checked in', color: '#047857', bg: '#d1fae5' },
            certificate_issued: { label: 'Certificate ready', color: '#047857', bg: '#d1fae5' },
            rejected: { label: 'Not approved', color: '#b91c1c', bg: '#fee2e2' },
            cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' }
        };
        return map[st] || map.submitted;
    }

    function renderFlipkartFromTimelineSteps(stepDefs, titlePrefix, code) {
        let cur = 0;
        stepDefs.forEach((s, i) => {
            if (s.state === 'active') cur = i;
            if (s.state === 'completed') cur = Math.max(cur, i + 1);
        });
        const lastIdx = Math.max(1, stepDefs.length - 1);
        const pct = Math.min(100, Math.round((cur / lastIdx) * 100));
        const html = stepDefs
            .map((s, i) => {
                let cls = 'ak-fk-step';
                const done = s.state === 'completed' || i < cur;
                const active = s.state === 'active' || (i === cur && !done);
                if (done) cls += ' is-done';
                else if (active) cls += ' is-current';
                const iconClass = String(s.icon || 'fa-circle').startsWith('fa-') ? s.icon : 'fa-' + (s.icon || 'circle');
                return (
                    '<div class="' +
                    cls +
                    '"><div class="ak-fk-dot"><i class="fas ' +
                    (done ? 'fa-check' : iconClass) +
                    '"></i></div><strong>' +
                    escapeAkHtml(String(s.title || '').slice(0, 32)) +
                    '</strong></div>'
                );
            })
            .join('');
        return (
            '<div class="ak-fk-track"><div class="ak-fk-track-title">' +
            escapeAkHtml(titlePrefix) +
            ' · ' +
            escapeAkHtml(code) +
            '</div><div class="ak-fk-steps"><span class="ak-fk-bar-fill" style="width:' +
            pct +
            '%"></span>' +
            html +
            '</div></div>'
        );
    }

    function escapeAkHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderAutismEventRegistrationCard(a) {
        const st = String(a.status || 'submitted').toLowerCase();
        const meta = eventRegStatusMeta(st);
        const tl = a.timeline || {};
        let stepDefs = (tl.steps || []).filter(
            (s) => s.key !== 'approved_pending_payment' && s.key !== 'completed'
        );
        if (!stepDefs.length) {
            stepDefs = [
                { title: 'Submitted', icon: 'fa-clipboard-check', state: 'completed' },
                { title: 'Review', icon: 'fa-magnifying-glass', state: 'pending' },
                { title: 'Approved', icon: 'fa-circle-check', state: 'pending' },
                { title: 'E-ticket', icon: 'fa-qrcode', state: 'pending' }
            ];
        }
        const fk = renderFlipkartFromTimelineSteps(stepDefs, 'Main registration', a.application_no || '');
        const appIdx =
            typeof userApplications !== 'undefined'
                ? userApplications.findIndex((x) => Number(x.id) === Number(a.id))
                : -1;
        let revisionBlock = '';
        if (st === 'revision_required' || st === 'documents_requested') {
            revisionBlock =
                '<div class="ak-revision-banner">' +
                '<p style="margin:0 0 8px;font-weight:600;color:#9a3412;"><i class="fas fa-exclamation-triangle"></i> Documents need correction</p>' +
                '<button type="button" class="btn-warning" style="padding:6px 12px;font-size:0.85rem;" onclick="openSeminarDocumentResubmitById(' +
                Number(a.id) +
                ')">Re-upload documents</button></div>';
        }
        const yearBadge = a.portal_year
            ? '<span class="ak-prereg-pill" style="background:#e0f2fe;color:#0369a1;">' + escapeAkHtml(String(a.portal_year)) + '</span>'
            : '';
        return (
            '<div class="ak-prereg-card ak-event-reg-card">' +
            fk +
            '<div class="ak-prereg-card-head">' +
            '<div><strong>' +
            escapeAkHtml(a.seminar_title || 'Event registration') +
            '</strong><br><code style="font-size:0.85rem;">' +
            escapeAkHtml(a.application_no || '—') +
            '</code></div>' +
            '<span class="ak-prereg-pill" style="background:' +
            meta.bg +
            ';color:' +
            meta.color +
            '">' +
            escapeAkHtml(meta.label) +
            '</span>' +
            yearBadge +
            '</div>' +
            revisionBlock +
            (a.application_no
                ? '<div class="ak-barcode-inline"><img src="/api/qrcode/' +
                  encodeURIComponent(a.application_no) +
                  '" alt="Registration barcode" width="72" height="72"><div><strong style="font-size:0.82rem;color:#64748b;">Application barcode</strong><br><code>' +
                  escapeAkHtml(a.application_no) +
                  '</code></div></div>' +
                  '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">' +
                  (appIdx >= 0
                      ? '<button type="button" class="btn-primary" style="padding:6px 12px;font-size:0.85rem;background:#475569;" onclick="downloadApplicationByIndex(' +
                        appIdx +
                        ')">Download PDF</button>'
                      : '') +
                  '</div>'
                : '') +
            '</div>'
        );
    }

    window.renderAutismEventRegistrationCard = renderAutismEventRegistrationCard;

    async function loadPreregList() {
        const uid = currentUserId();
        const box = preregListEl();
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/preregistrations/' + uid);
            if (!rows.length) {
                const trackOnly = !!box.closest('#tab-event-track');
                box.innerHTML =
                    '<p style="color:#64748b;">' +
                    (trackOnly
                        ? 'No pre-registrations to track yet.'
                        : 'No pre-registrations yet. Submit the form above to start.') +
                    '</p>';
                return;
            }
            box.innerHTML = rows
                .map((r) => {
                    const meta = preregStatusMeta(r.status);
                    const canReg = meta.step >= 3;
                    return (
                        '<div class="ak-prereg-card">' +
                        renderFlipkartPrereg(r) +
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
                            ? '<p style="margin-top:10px;font-size:0.9rem;color:#047857;font-weight:600;"><i class="fas fa-check-circle"></i> Pre-registration approved — complete <strong>main registration</strong> when the form opens.</p>'
                            : r.status === 'revision_required'
                              ? '<p style="margin-top:10px;font-size:0.9rem;color:#6d28d9;font-weight:600;">Please update and resubmit your pre-registration.</p>' +
                                '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">' +
                                '<button type="button" class="btn-warning" style="padding:6px 12px;font-size:0.85rem;" data-ak-prereg-edit="' +
                                r.id +
                                '">Edit &amp; resubmit</button>' +
                                '<button type="button" class="btn-primary" style="padding:6px 12px;font-size:0.85rem;background:#475569;" data-ak-prereg-dl="' +
                                r.id +
                                '">Download PDF</button></div>'
                              : r.status === 'rejected'
                                ? '<p style="margin-top:10px;font-size:0.9rem;color:#b91c1c;">Contact us if you need help.</p>'
                                : '<p style="margin-top:10px;font-size:0.9rem;color:#64748b;">We will notify you when pre-registration is approved.</p>') +
                        (r.application_no
                            ? '<div class="ak-barcode-inline"><img src="/api/qrcode/' +
                              encodeURIComponent(r.application_no) +
                              '" alt="Pre-reg barcode" width="72" height="72"><div><strong style="font-size:0.82rem;color:#64748b;">Pre-reg barcode</strong><br><code>' +
                              (r.application_no || '') +
                              '</code></div></div>'
                            : '') +
                        '</div>'
                    );
                })
                .join('');
            const rowsById = {};
            rows.forEach((r) => {
                rowsById[r.id] = r;
            });
            box.querySelectorAll('[data-ak-prereg-edit]').forEach((btn) => {
                btn.addEventListener('click', () => beginPreregRevision(rowsById[parseInt(btn.dataset.akPreregEdit, 10)]));
            });
            box.querySelectorAll('[data-ak-prereg-dl]').forEach((btn) => {
                btn.addEventListener('click', () => downloadPreregPdf(rowsById[parseInt(btn.dataset.akPreregDl, 10)]));
            });
        } catch (e) {
            box.innerHTML = '<p style="color:#b91c1c;">' + (e.message || 'Load failed') + '</p>';
        }
    }

    function compStatusMeta(status) {
        const st = String(status || 'submitted').toLowerCase();
        const map = {
            draft: { label: 'Draft', color: '#64748b', bg: '#f1f5f9', step: 0 },
            submitted: { label: 'Submitted', color: '#d97706', bg: '#fef3c7', step: 1 },
            under_review: { label: 'Under review', color: '#2563eb', bg: '#dbeafe', step: 2 },
            approved: { label: 'Approved', color: '#047857', bg: '#d1fae5', step: 3 },
            rejected: { label: 'Not selected', color: '#b91c1c', bg: '#fee2e2', step: 2 }
        };
        return map[st] || map.submitted;
    }

    function renderFlipkartCompetition(r) {
        const st = String(r.status || 'submitted').toLowerCase();
        const steps = [
            { title: 'Submitted', icon: 'fa-upload' },
            { title: 'Review', icon: 'fa-magnifying-glass' },
            { title: 'Decision', icon: 'fa-trophy' }
        ];
        let cur = 0;
        if (st === 'submitted') cur = 1;
        else if (st === 'under_review') cur = 1;
        else if (st === 'approved' || st === 'rejected') cur = 2;
        const fail = st === 'rejected';
        const pct = fail ? 66 : Math.min(100, Math.round((cur / (steps.length - 1)) * 100));
        const html = steps
            .map((s, i) => {
                let cls = 'ak-fk-step';
                if (fail && i === 2) cls += ' is-fail';
                else if (i < cur) cls += ' is-done';
                else if (i === cur) cls += ' is-current';
                const icon = i < cur ? 'fa-check' : s.icon;
                return (
                    '<div class="' +
                    cls +
                    '"><div class="ak-fk-dot"><i class="fas ' +
                    icon +
                    '"></i></div><strong>' +
                    s.title +
                    '</strong></div>'
                );
            })
            .join('');
        const code = r.application_no || 'COMP-' + r.id;
        return (
            '<div class="ak-fk-track"><div class="ak-fk-track-title">Competition · ' +
            code +
            '</div><div class="ak-fk-steps"><span class="ak-fk-bar-fill" style="width:' +
            pct +
            '%"></span>' +
            html +
            '</div></div>'
        );
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
        const box = compListEl();
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/competition-submissions/' + uid);
            if (!rows.length) {
                box.innerHTML = '<p style="color:#64748b;">No competition entries yet.</p>';
                return;
            }
            box.innerHTML = rows
                .map((r) => {
                    const meta = compStatusMeta(r.status);
                    const code = r.application_no || 'COMP-' + r.id;
                    return (
                        '<div class="ak-prereg-card">' +
                        renderFlipkartCompetition(r) +
                        '<div class="ak-prereg-card-head"><div><strong>' +
                        (r.title || 'Entry') +
                        '</strong>' +
                        (r.seminar_title ? '<br><small style="color:#64748b;">' + r.seminar_title + '</small>' : '') +
                        '</div><span class="ak-prereg-pill" style="background:' +
                        meta.bg +
                        ';color:' +
                        meta.color +
                        '">' +
                        meta.label +
                        '</span></div>' +
                        '<p style="font-size:0.88rem;color:#64748b;margin:8px 0 0;">' +
                        (r.files || []).length +
                        ' file(s) · ' +
                        (r.category || 'general') +
                        '</p>' +
                        (r.admin_notes
                            ? '<p style="margin-top:8px;font-size:0.88rem;color:#475569;"><strong>Office note:</strong> ' +
                              String(r.admin_notes).replace(/</g, '&lt;') +
                              '</p>'
                            : '') +
                        '<div class="ak-barcode-inline"><img src="/api/qrcode/' +
                        encodeURIComponent(code) +
                        '" alt="Entry barcode" width="72" height="72"><div><strong style="font-size:0.82rem;color:#64748b;">Entry barcode</strong><br><code>' +
                        code +
                        '</code></div></div></div>'
                    );
                })
                .join('');
        } catch (e) {
            box.innerHTML = '<p style="color:#b91c1c;">' + (e.message || 'Load failed') + '</p>';
        }
    }

    function setupDashboardHub() {
        const dash = document.getElementById('tab-dashboard');
        if (!dash || dash.querySelector('.ak-hub-actions')) return;
        const quickCard = dash.querySelector('.card');
        const hub = document.createElement('div');
        hub.className = 'card ak-hub-card';
        hub.style.marginBottom = '16px';
        hub.innerHTML =
            '<h3 style="color:#0f766e;margin-bottom:14px;"><i class="fas fa-compass"></i> Registration hub</h3>' +
            '<div class="ak-hub-actions">' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="event-register"><i class="fas fa-calendar-plus"></i><span>Register Event</span><small>Pre-registration form</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="event-track"><i class="fas fa-route"></i><span>Track Event</span><small>Pre-reg &amp; main status</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="comp-register"><i class="fas fa-cloud-upload-alt"></i><span>Register Competition</span><small>Upload entry files</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="comp-track"><i class="fas fa-photo-video"></i><span>Track Competition</span><small>Entry review status</small></button>' +
            '</div>';
        if (quickCard) dash.insertBefore(hub, quickCard);
        else dash.appendChild(hub);
        hub.querySelectorAll('[data-ak-hub]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const k = btn.dataset.akHub;
                if (k === 'event-register') showEventRegisterView();
                else if (k === 'event-track') showEventTrackView();
                else if (k === 'comp-register') showCompRegisterView();
                else if (k === 'comp-track') showCompTrackView();
            });
        });
        const ql = dash.querySelector('.card h3');
        if (ql && ql.textContent.indexOf('Quick') >= 0) {
            const qlWrap = ql.closest('.card');
            if (qlWrap) {
                qlWrap.querySelectorAll('button').forEach((b) => {
                    const oc = b.getAttribute('onclick') || '';
                    if (oc.indexOf('tab-seminars') >= 0 || oc.indexOf('tab-orders') >= 0) b.remove();
                });
            }
        }
    }

    function wireAutismTabs() {
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

    window.loadPreregList = loadPreregList;
    window.loadCompetitionList = loadCompetitionList;

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

    function renderMainRegExtraFields() {
        const container = document.getElementById('reg-autism-extra-fields');
        if (!container) return;
        container.innerHTML = '';
        const fields =
            typeof getAutismMainRegExtraFields === 'function'
                ? getAutismMainRegExtraFields()
                : (window.__registrationFormFields || []).filter((f) => f && f.step >= 3);
        if (!fields.length) {
            container.innerHTML =
                '<p style="color:#64748b;font-size:0.88rem;">No extra fields configured. Continue to preview.</p>';
            return;
        }
        fields.forEach((f) => {
            if (!f || f.enabled === false) return;
            const fg = document.createElement('div');
            fg.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = (f.label || f.key) + (f.required !== false ? ' *' : '');
            fg.appendChild(label);
            let input;
            const t = String(f.type || 'text').toLowerCase();
            if (t === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else if (t === 'select') {
                input = document.createElement('select');
                const blank = document.createElement('option');
                blank.value = '';
                blank.textContent = 'Select';
                input.appendChild(blank);
                (f.options || []).forEach((o) => {
                    const opt = document.createElement('option');
                    opt.value = o.value != null ? o.value : o.label;
                    opt.textContent = o.label || o.value;
                    input.appendChild(opt);
                });
            } else if (t === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
            } else if (t === 'file') {
                input = document.createElement('input');
                input.type = 'file';
                input.accept = f.key === 'photo' ? 'image/*' : '*/*';
            } else {
                input = document.createElement('input');
                input.type = t === 'email' ? 'email' : t === 'tel' ? 'tel' : t === 'date' ? 'date' : 'text';
            }
            input.id = 'reg-field-' + f.key;
            input.dataset.fieldKey = f.key;
            if (f.required !== false && t !== 'boolean' && t !== 'file') input.required = true;
            if (f.defaultValue && t !== 'boolean' && t !== 'file') input.value = f.defaultValue;
            fg.appendChild(input);
            container.appendChild(fg);
        });
    }

    window.renderAutismMainRegistrationFields = renderMainRegExtraFields;

    function patchAutismRegistrationFlow() {
        if (typeof hideAutismRegistrationQualUi === 'function') hideAutismRegistrationQualUi();
        if (typeof nextStep !== 'function' || nextStep.__autismSkipQualHook) return;
        const origNext = nextStep;
        window.nextStep = function (step) {
            if (step === 4) step = 5;
            return origNext.call(this, step);
        };
        window.nextStep.__autismSkipQualHook = true;
    }

    function patchSwitchTabForHub() {
        if (typeof switchTab !== 'function' || switchTab.__akHubHook) return;
        const orig = switchTab;
        window.switchTab = function (tabId, menuEl) {
            orig.call(this, tabId, menuEl);
            if (tabId === 'tab-event-register') {
                loadPreregSeminars();
                loadPreregFormConfig(null).then(() =>
                    renderPreregFields(document.getElementById('prereg-fields'))
                );
            } else if (tabId === 'tab-event-track') {
                loadPreregList();
                if (typeof loadApplications === 'function') loadApplications(true);
            } else if (tabId === 'tab-comp-register') {
                loadPreregSeminars().then(() => {
                    const compSel = document.getElementById('comp-seminar-select');
                    const preregSel = document.getElementById('prereg-seminar-select');
                    if (compSel && preregSel) compSel.innerHTML = preregSel.innerHTML;
                });
            } else if (tabId === 'tab-comp-track') {
                loadCompetitionList();
            }
        };
        window.switchTab.__akHubHook = true;
    }

    function patchLoadRegistrationFormConfig() {
        if (typeof loadRegistrationFormConfigAndApply !== 'function' || loadRegistrationFormConfigAndApply.__akMainRegHook) {
            return;
        }
        const orig = loadRegistrationFormConfigAndApply;
        window.loadRegistrationFormConfigAndApply = async function () {
            await orig.apply(this, arguments);
            if (typeof hideAutismRegistrationQualUi === 'function') hideAutismRegistrationQualUi();
            renderMainRegExtraFields();
        };
        window.loadRegistrationFormConfigAndApply.__akMainRegHook = true;
    }

    document.addEventListener('DOMContentLoaded', () => {
        hideAutismDisabledTabs();
        separatePreregAndMainRegistration();
        setupDashboardHub();
        patchSwitchTabForHub();
        patchAutismRegistrationFlow();
        patchLoadRegistrationFormConfig();
        applyBranding();
        const accountFields = document.getElementById('profile-account-fields');
        if (accountFields) {
            accountFields.classList.remove('hidden');
            accountFields.style.display = 'grid';
        }
        wireAutismTabs();
        if (typeof loadApplicantAnnouncements === 'function') loadApplicantAnnouncements();
        if (typeof loadApplications === 'function') {
            setTimeout(() => {
                loadApplications();
                if (typeof syncDoctorTrackingPolls === 'function') syncDoctorTrackingPolls();
            }, 800);
        }
        setTimeout(updateProfileDisplayName, 400);
        setTimeout(updateProfileDisplayName, 2500);
    });
})();
