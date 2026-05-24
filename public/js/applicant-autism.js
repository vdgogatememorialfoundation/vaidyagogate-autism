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
        const tabApps = document.getElementById('tab-applications');
        if (tabApps) {
            const h2 = tabApps.querySelector('.section-title');
            if (h2) h2.textContent = 'Main registration';
            const lead = tabApps.querySelector('.ak-main-reg-lead');
            if (lead) {
                lead.textContent =
                    'Step 2 — after pre-registration is approved, complete main registration here and track your application.';
            }
        }
        const preregPane = document.getElementById('tab-prereg');
        if (preregPane) {
            const ph = preregPane.querySelector('.section-title');
            if (ph) ph.textContent = 'Pre-registration';
            const pl = preregPane.querySelector('.ak-prereg-lead');
            if (pl) {
                pl.textContent =
                    'Step 1 — submit pre-registration first. When approved, use Main registration to complete your application.';
            }
        }
    }

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
        if (typeof switchTab === 'function') switchTab('tab-prereg');
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

    async function loadPreregList() {
        const uid = currentUserId();
        const box = document.getElementById('prereg-list');
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/preregistrations/' + uid);
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
                            ? '<p style="margin-top:10px;font-size:0.9rem;color:#047857;font-weight:600;"><i class="fas fa-check-circle"></i> You can open <strong>Main registration</strong> to complete final registration.</p>'
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
        const box = document.getElementById('comp-list');
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

    function patchAutismRegistrationFlow() {
        if (typeof hideAutismRegistrationQualUi === 'function') hideAutismRegistrationQualUi();
        if (typeof nextStep !== 'function' || nextStep.__autismSkipQualHook) return;
        const origNext = nextStep;
        window.nextStep = function (step) {
            if (step === 3 || step === 4) step = 5;
            return origNext.call(this, step);
        };
        window.nextStep.__autismSkipQualHook = true;
    }

    document.addEventListener('DOMContentLoaded', () => {
        hideAutismDisabledTabs();
        separatePreregAndMainRegistration();
        patchAutismRegistrationFlow();
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
