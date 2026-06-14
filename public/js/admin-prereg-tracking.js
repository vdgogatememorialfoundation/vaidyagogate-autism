/**
 * Admin: pre-registration approval queue + link to final registration status.
 */
(function () {
    'use strict';

    let preregRows = [];
    let selectedId = null;
    let statusFilter = 'all';
    let cachedSeminars = [];

    function seminarFlowFlags(seminar) {
        try {
            const parsed = seminar && seminar.registration_form_json ? JSON.parse(seminar.registration_form_json) : {};
            const flow = parsed && typeof parsed.flow === 'object' ? parsed.flow : {};
            const hasFlow =
                Object.prototype.hasOwnProperty.call(flow, 'preregistrationRequired') ||
                Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationRequired');
            if (!hasFlow) {
                return { preregistrationRequired: true, mainRegistrationRequired: true, mainRegistrationOpen: true };
            }
            const preregistrationRequired = flow.preregistrationRequired === true;
            const mainRegistrationRequired = flow.mainRegistrationRequired === true;
            let mainRegistrationOpen = true;
            if (mainRegistrationRequired && !preregistrationRequired) {
                mainRegistrationOpen = true;
            } else if (mainRegistrationRequired && preregistrationRequired) {
                mainRegistrationOpen = Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationOpen')
                    ? flow.mainRegistrationOpen === true
                    : false;
            } else {
                mainRegistrationOpen = false;
            }
            return { preregistrationRequired, mainRegistrationRequired, mainRegistrationOpen };
        } catch (_) {
            return { preregistrationRequired: true, mainRegistrationRequired: true, mainRegistrationOpen: true };
        }
    }

    function updateMainRegOpenPanel() {
        const panel = document.getElementById('ak-main-reg-open-panel');
        const desc = document.getElementById('ak-main-reg-open-desc');
        const msg = document.getElementById('ak-main-reg-open-msg');
        const openBtn = document.getElementById('ak-open-main-reg');
        const closeBtn = document.getElementById('ak-close-main-reg');
        const seminarId = document.getElementById('ak-prereg-seminar')?.value || '';
        if (!panel) return;
        if (!seminarId) {
            panel.style.display = 'none';
            return;
        }
        const seminar = cachedSeminars.find((s) => String(s.id) === String(seminarId));
        if (!seminar) {
            panel.style.display = 'none';
            return;
        }
        const flags = seminarFlowFlags(seminar);
        if (!flags.preregistrationRequired || !flags.mainRegistrationRequired) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';
        const title = seminar.title || 'Event ' + seminar.id;
        if (desc) {
            desc.textContent =
                (flags.mainRegistrationOpen
                    ? 'Final registration is open for "' + title + '". Approved participants can register in their dashboard.'
                    : 'Final registration is closed for "' + title + '". Pre-registration stays live; open final registration when you are ready.') +
                ' You can also change this in event settings.';
        }
        if (openBtn) openBtn.disabled = !!flags.mainRegistrationOpen;
        if (closeBtn) closeBtn.disabled = !flags.mainRegistrationOpen;
        if (msg) {
            msg.textContent = flags.mainRegistrationOpen
                ? 'Status: open for applicants'
                : 'Status: closed — waiting for you to open';
            msg.style.color = flags.mainRegistrationOpen ? '#047857' : '#b45309';
        }
    }

    async function setMainRegistrationOpen(open) {
        const seminarId = document.getElementById('ak-prereg-seminar')?.value || '';
        const msg = document.getElementById('ak-main-reg-open-msg');
        if (!seminarId) return;
        try {
            const data = await api('/api/admin/seminars/' + encodeURIComponent(seminarId) + '/main-registration-open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ open: !!open })
            });
            const seminar = cachedSeminars.find((s) => String(s.id) === String(seminarId));
            if (seminar) {
                let cfg = {};
                try {
                    cfg = seminar.registration_form_json ? JSON.parse(seminar.registration_form_json) : {};
                } catch (_) {
                    cfg = {};
                }
                if (!cfg.flow || typeof cfg.flow !== 'object') cfg.flow = {};
                cfg.flow.mainRegistrationOpen = !!open;
                seminar.registration_form_json = JSON.stringify(cfg);
            }
            updateMainRegOpenPanel();
            if (msg) {
                msg.textContent = data.message || (open ? 'Final registration opened.' : 'Final registration closed.');
                msg.style.color = '#047857';
            }
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Update failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function badge(status) {
        const st = String(status || 'submitted').toLowerCase();
        return '<span class="ak-badge ak-badge-' + esc(st) + '">' + esc(st.replace(/_/g, ' ')) + '</span>';
    }

    function regStatusLabel(row) {
        if (!row.registration_id) return '<span class="ak-reg-pill">Not started</span>';
        const st = String(row.registration_status || '').toLowerCase();
        return '<span class="ak-reg-pill">' + esc(st || 'in progress') + (row.registration_application_no ? ' · ' + esc(row.registration_application_no) : '') + '</span>';
    }

    async function api(path, opts) {
        if (typeof window.autismAdminFetch === 'function') {
            return window.autismAdminFetch(path, opts);
        }
        const r = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts || {}));
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        return data;
    }

    async function loadSeminarsSelect() {
        const sel = document.getElementById('ak-prereg-seminar');
        if (!sel || sel.dataset.loaded) return;
        try {
            const list = await api('/api/admin/seminars');
            const seminars = Array.isArray(list) ? list : list.seminars || [];
            cachedSeminars = seminars;
            sel.innerHTML = '<option value="">All events</option>';
            seminars.forEach((s) => {
                const o = document.createElement('option');
                o.value = s.id;
                o.textContent = s.title || 'Event ' + s.id;
                sel.appendChild(o);
            });
            sel.dataset.loaded = '1';
            updateMainRegOpenPanel();
        } catch (_) {}
    }

    async function loadStats() {
        const seminarId = document.getElementById('ak-prereg-seminar')?.value || '';
        const q = seminarId ? '?seminarId=' + encodeURIComponent(seminarId) : '';
        try {
            const stats = await api('/api/admin/preregistrations/stats' + q);
            const map = {
                total: stats.total || 0,
                submitted: stats.submitted || 0,
                approved: stats.approved || 0,
                rejected: stats.rejected || 0,
                revision_required: stats.revision_required || 0
            };
            Object.keys(map).forEach((k) => {
                const el = document.getElementById('ak-stat-' + k);
                if (el) el.textContent = map[k];
            });
        } catch (e) {
            console.warn('prereg stats', e);
        }
    }

    function parseFormData(raw) {
        if (!raw) return {};
        try {
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (_) {
            return {};
        }
    }

    const PREREG_FIELD_LABELS = {
        parent_name: 'Full Name (Parents)',
        parent_gender: 'Gender (Parent)',
        parent_dob: 'Date of Birth (Parent)',
        child_name: "Child's Name",
        child_gender: 'Gender (Child)',
        child_dob: 'Date of Birth (Child)',
        address: 'Full Address',
        pin: 'Pincode',
        city: 'City',
        state: 'State',
        country: 'Country',
        attendees_count: 'Number of People Attending',
        child_health: "Child's Health",
        diet: 'Diet',
        financial_planning: 'Financial Planning'
    };

    function qrImgHtml(code, size) {
        const c = String(code || '').trim();
        const px = size || 44;
        if (!c) {
            return '<span style="color:#94a3b8;font-size:0.78rem;">No application no.</span>';
        }
        const src = '/api/qrcode/' + encodeURIComponent(c);
        return (
            '<img src="' +
            src +
            '" alt="Barcode ' +
            esc(c) +
            '" width="' +
            px +
            '" height="' +
            px +
            '" style="display:block;margin-bottom:4px;background:#fff;border-radius:6px;padding:2px;" onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'block\');">' +
            '<span style="display:none;color:#b91c1c;font-size:0.75rem;">Barcode failed to load</span>'
        );
    }

    function filteredRows() {
        const q = (document.getElementById('ak-prereg-search')?.value || '').trim().toLowerCase();
        return preregRows.filter((r) => {
            if (statusFilter !== 'all' && String(r.status || '').toLowerCase() !== statusFilter) return false;
            if (!q) return true;
            const hay = [
                r.application_no,
                r.first_name,
                r.last_name,
                r.email,
                r.phone,
                r.seminar_title
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }

    function renderTable() {
        const tbody = document.getElementById('ak-prereg-tbody');
        if (!tbody) return;
        const rows = filteredRows();
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">No pre-registrations match your filters.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map((r) => {
                const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
                const sel = selectedId === r.id ? ' style="background:#eff6ff;"' : '';
                return (
                    '<tr data-id="' +
                    r.id +
                    '"' +
                    sel +
                    '>' +
                    '<td>' +
                    qrImgHtml(r.application_no, 44) +
                    '<code>' +
                    esc(r.application_no || '—') +
                    '</code></td>' +
                    '<td>' +
                    esc(name) +
                    '<br><small style="color:#64748b;">' +
                    esc(r.email || '') +
                    '</small></td>' +
                    '<td>' +
                    esc(r.seminar_title || r.seminar_id) +
                    '</td>' +
                    '<td>' +
                    badge(r.status) +
                    '</td>' +
                    '<td>' +
                    regStatusLabel(r) +
                    '</td>' +
                    '<td>' +
                    esc((r.created_at || '').slice(0, 16)) +
                    '</td>' +
                    '<td>' +
                    '<button type="button" class="btn-primary" style="padding:5px 10px;font-size:0.78rem;" data-ak-view="' +
                    r.id +
                    '">Review</button>' +
                    '<button type="button" class="btn-primary" style="padding:5px 10px;font-size:0.78rem;margin-left:6px;background:#b91c1c;" data-ak-delete="' +
                    r.id +
                    '">Delete</button>' +
                    '</td>' +
                    '</tr>'
                );
            })
            .join('');
        tbody.querySelectorAll('[data-ak-view]').forEach((btn) => {
            btn.addEventListener('click', () => openDetail(parseInt(btn.dataset.akView, 10)));
        });
        tbody.querySelectorAll('[data-ak-delete]').forEach((btn) => {
            btn.addEventListener('click', () => deletePrereg(parseInt(btn.dataset.akDelete, 10)));
        });
    }

    function openDetail(id) {
        selectedId = id;
        const row = preregRows.find((r) => r.id === id);
        const panel = document.getElementById('ak-prereg-detail');
        if (!row || !panel) return;
        panel.classList.add('is-open');
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
        const fd = parseFormData(row.form_data);
        const fieldsHtml = Object.keys(fd).length
            ? Object.entries(fd)
                  .map(([k, v]) => {
                      const label = PREREG_FIELD_LABELS[k] || k.replace(/_/g, ' ');
                      return '<dt>' + esc(label) + '</dt><dd>' + esc(v) + '</dd>';
                  })
                  .join('')
            : '<dt>Form data</dt><dd style="color:#64748b;">No extra fields submitted.</dd>';
        document.getElementById('ak-prereg-detail-title').textContent = name + ' — ' + (row.seminar_title || 'Event');
        document.getElementById('ak-prereg-detail-body').innerHTML =
            '<dl>' +
            '<dt>Application no.</dt><dd><code>' +
            esc(row.application_no) +
            '</code><br>' +
            qrImgHtml(row.application_no, 96) +
            '</dd>' +
            '<dt>Email / phone</dt><dd>' +
            esc(row.email) +
            ' · ' +
            esc(row.phone) +
            '</dd>' +
            '<dt>Pre-reg status</dt><dd>' +
            badge(row.status) +
            '</dd>' +
            '<dt>Final registration</dt><dd>' +
            regStatusLabel(row) +
            '</dd>' +
            fieldsHtml +
            '</dl>';
        panel.dataset.rowId = String(id);
        renderTable();
    }

    async function deletePrereg(preregId) {
        const id = parseInt(preregId, 10);
        if (!Number.isInteger(id) || id < 1) return;
        const row = preregRows.find((r) => r.id === id);
        const appNo = row ? row.application_no : '';
        if (!confirm('Permanently delete pre-registration ' + (appNo ? ' ' + appNo : String(id)) + '? This cannot be undone.'))
            return;
        try {
            await api('/api/admin/preregistrations/' + encodeURIComponent(String(id)), {
                method: 'DELETE'
            });
            const panel = document.getElementById('ak-prereg-detail');
            if (panel) {
                panel.classList.remove('is-open');
                panel.dataset.rowId = '';
            }
            selectedId = null;
            await refresh();
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
    }

    async function setStatus(status) {
        const id = parseInt(document.getElementById('ak-prereg-detail')?.dataset.rowId, 10);
        if (!id) return;
        const msg = document.getElementById('ak-prereg-action-msg');
        let rejection_reason = '';
        if (status === 'rejected' || status === 'revision_required') {
            rejection_reason = prompt('Note to applicant (optional — included in email):', '') || '';
        }
        try {
            await api('/api/admin/preregistrations/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preregistrationId: id, status, rejection_reason })
            });
            if (msg) {
                msg.textContent = 'Status updated to ' + status.replace(/_/g, ' ') + '.';
                msg.style.color = '#047857';
            }
            await refresh();
            openDetail(id);
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Update failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    async function refresh() {
        const seminarId = document.getElementById('ak-prereg-seminar')?.value || '';
        const st = document.getElementById('ak-prereg-status-filter')?.value || 'all';
        statusFilter = st;
        let url = '/api/admin/preregistrations?';
        if (seminarId) url += 'seminarId=' + encodeURIComponent(seminarId) + '&';
        if (st && st !== 'all') url += 'status=' + encodeURIComponent(st);
        const tbody = document.getElementById('ak-prereg-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading…</td></tr>';
        try {
            preregRows = await api(url);
            await loadStats();
            renderTable();
            updateMainRegOpenPanel();
        } catch (e) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:#b91c1c;text-align:center;">' + esc(e.message) + '</td></tr>';
        }
    }

    function wireStatClicks() {
        document.querySelectorAll('.ak-prereg-stat[data-filter]').forEach((el) => {
            el.addEventListener('click', () => {
                const f = el.dataset.filter || 'all';
                const sel = document.getElementById('ak-prereg-status-filter');
                if (sel) sel.value = f;
                statusFilter = f;
                document.querySelectorAll('.ak-prereg-stat').forEach((s) => s.classList.remove('is-selected'));
                el.classList.add('is-selected');
                renderTable();
            });
        });
    }

    window.initAdminPreregTracking = function initAdminPreregTracking() {
        if (window.__akPreregInit) {
            refresh();
            return;
        }
        window.__akPreregInit = true;
        loadSeminarsSelect().then(refresh);
        wireStatClicks();
        document.getElementById('ak-prereg-seminar')?.addEventListener('change', refresh);
        document.getElementById('ak-prereg-status-filter')?.addEventListener('change', refresh);
        document.getElementById('ak-prereg-search')?.addEventListener('input', renderTable);
        document.getElementById('ak-prereg-refresh')?.addEventListener('click', refresh);
        document.getElementById('ak-prereg-approve')?.addEventListener('click', () => setStatus('approved'));
        document.getElementById('ak-prereg-reject')?.addEventListener('click', () => setStatus('rejected'));
        document.getElementById('ak-prereg-revision')?.addEventListener('click', () => setStatus('revision_required'));
        document.getElementById('ak-prereg-delete')?.addEventListener('click', () => {
            const id = parseInt(document.getElementById('ak-prereg-detail')?.dataset.rowId, 10);
            if (id) deletePrereg(id);
        });
        document.getElementById('ak-prereg-goto-reg')?.addEventListener('click', () => {
            if (typeof switchTab === 'function') {
                switchTab('tab-final-tracking');
            }
        });
        document.getElementById('ak-open-main-reg')?.addEventListener('click', () => setMainRegistrationOpen(true));
        document.getElementById('ak-close-main-reg')?.addEventListener('click', () => setMainRegistrationOpen(false));
    };

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akPreregHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            if (tabId === 'tab-prereg-tracking' && typeof initAdminPreregTracking === 'function') {
                initAdminPreregTracking();
            }
        };
        window.switchTab.__akPreregHook = true;
    }
})();
