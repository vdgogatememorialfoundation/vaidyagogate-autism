/**
 * Admin: pre-registration approval queue + link to final registration status.
 */
(function () {
    'use strict';

    let preregRows = [];
    let selectedId = null;
    let statusFilter = 'all';
    let sourceFilter = 'all';
    let cachedSeminars = [];
    const POLL_MS = 4000;
    let pollTimer = null;
    let lastRowFp = '';
    let highlightIds = new Set();

    function formatIstNow() {
        return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }

    function tabVisible() {
        const el = document.getElementById('tab-prereg-tracking');
        return el && !el.classList.contains('hidden');
    }

    function rowFingerprint(rows) {
        return (rows || [])
            .map((r) => {
                const src = preregSourceLabel(r).key;
                return [r.id, r.status, r.updated_at || r.created_at || '', r.application_no || '', src].join(':');
            })
            .join('|');
    }

    function updateLiveBar() {
        const bar = document.getElementById('ak-prereg-live-bar');
        if (!bar) return;
        if (!tabVisible() || document.hidden) {
            bar.classList.add('hidden');
            return;
        }
        bar.classList.remove('hidden');
        bar.innerHTML =
            '<i class="fas fa-circle" style="color:#10b981;font-size:0.45rem;vertical-align:middle;animation:ak-pulse 1.2s infinite;"></i> Live · includes public (no sign-in) submissions · updated ' +
            formatIstNow();
    }

    function flashPublicSubmission(row) {
        const bar = document.getElementById('ak-prereg-live-bar');
        if (!bar || !row) return;
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'New applicant';
        bar.style.background = '#dbeafe';
        bar.style.borderColor = '#93c5fd';
        bar.innerHTML =
            '<i class="fas fa-bolt" style="color:#2563eb;"></i> New public form submission: <strong>' +
            esc(name) +
            '</strong> · ' +
            esc(row.application_no || '') +
            ' · ' +
            formatIstNow();
        setTimeout(() => {
            if (bar) {
                bar.style.background = '';
                bar.style.borderColor = '';
                updateLiveBar();
            }
        }, 8000);
    }

    function stopPoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startPoll() {
        if (pollTimer) return;
        pollTimer = setInterval(() => refresh({ silent: true }), POLL_MS);
    }

    function detectNewRows(prevRows, nextRows) {
        const prevIds = new Set((prevRows || []).map((r) => r.id));
        (nextRows || []).forEach((r) => {
            if (!prevIds.has(r.id)) {
                highlightIds.add(r.id);
                if (preregSourceLabel(r).key === 'public') flashPublicSubmission(r);
            }
        });
    }

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
                    ? 'Main registration is open for "' + title + '". Approved participants can register in their dashboard.'
                    : 'Main registration is closed for "' + title + '". Pre-registration stays live; open main registration when you are ready.') +
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
                msg.textContent = data.message || (open ? 'Main registration opened.' : 'Main registration closed.');
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
            const pubEl = document.getElementById('ak-stat-public_form');
            if (pubEl) pubEl.textContent = stats.public_form != null ? stats.public_form : '0';
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

    function preregSourceLabel(row) {
        const fd = parseFormData(row && row.form_data);
        if (fd._submitted_via === 'public_prereg_form') {
            return { key: 'public', label: 'Public form', cls: 'ak-src-public' };
        }
        return { key: 'portal', label: 'Portal', cls: 'ak-src-portal' };
    }

    function sourceBadge(row) {
        const s = preregSourceLabel(row);
        return (
            '<span class="ak-prereg-src ' +
            s.cls +
            '" title="' +
            (s.key === 'public' ? 'Submitted without sign-in' : 'Submitted via applicant portal') +
            '">' +
            esc(s.label) +
            '</span>'
        );
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
            if (sourceFilter === 'public' && preregSourceLabel(r).key !== 'public') return false;
            if (sourceFilter === 'portal' && preregSourceLabel(r).key !== 'portal') return false;
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
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">No pre-registrations match your filters.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map((r) => {
                const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
                const sel = selectedId === r.id ? ' style="background:#eff6ff;"' : '';
                const isNew = highlightIds.has(r.id);
                const rowStyle =
                    selectedId === r.id
                        ? ' style="background:#eff6ff;"'
                        : isNew
                          ? ' class="ak-prereg-row-new"'
                          : '';
                return (
                    '<tr data-id="' +
                    r.id +
                    '"' +
                    rowStyle +
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
                    '<br>' +
                    sourceBadge(r) +
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

    function closeDetail() {
        const panel = document.getElementById('ak-prereg-detail');
        const backdrop = document.getElementById('ak-prereg-detail-backdrop');
        if (panel) {
            panel.classList.remove('is-open');
            panel.dataset.rowId = '';
        }
        if (backdrop) backdrop.classList.remove('is-open');
        document.body.style.overflow = '';
        selectedId = null;
        renderTable();
    }

    function openDetail(id) {
        selectedId = id;
        const row = preregRows.find((r) => r.id === id);
        const panel = document.getElementById('ak-prereg-detail');
        const backdrop = document.getElementById('ak-prereg-detail-backdrop');
        if (!row || !panel) return;
        panel.classList.add('is-open');
        if (backdrop) backdrop.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
        const fd = parseFormData(row.form_data);
        const fieldsHtml = Object.keys(fd).length
            ? Object.entries(fd)
                  .filter(([k]) => !String(k).startsWith('_') && k !== 'contact_email' && k !== 'contact_phone')
                  .map(([k, v]) => {
                      const label = PREREG_FIELD_LABELS[k] || k.replace(/_/g, ' ');
                      return '<dt>' + esc(label) + '</dt><dd>' + esc(v) + '</dd>';
                  })
                  .join('')
            : '<dt>Form data</dt><dd style="color:#64748b;">No extra fields submitted.</dd>';
        const src = preregSourceLabel(row);
        document.getElementById('ak-prereg-detail-title').textContent = name + ' — ' + (row.seminar_title || 'Event');
        document.getElementById('ak-prereg-detail-body').innerHTML =
            '<dl>' +
            '<dt>Application no.</dt><dd><code>' +
            esc(row.application_no) +
            '</code><br>' +
            qrImgHtml(row.application_no, 96) +
            '</dd>' +
            '<dt>Source</dt><dd>' +
            sourceBadge(row) +
            (src.key === 'public'
                ? ' <span style="color:#64748b;font-size:0.85rem;">— no sign-in at submission</span>'
                : '') +
            '</dd>' +
            '<dt>Email / phone</dt><dd>' +
            esc(row.email) +
            ' · ' +
            esc(row.phone) +
            '</dd>' +
            '<dt>Pre-reg status</dt><dd>' +
            badge(row.status) +
            '</dd>' +
            '<dt>Main registration</dt><dd>' +
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
            closeDetail();
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

    async function refresh(opts) {
        const silent = opts && opts.silent;
        if (silent && !tabVisible()) return;
        const seminarId = document.getElementById('ak-prereg-seminar')?.value || '';
        const st = document.getElementById('ak-prereg-status-filter')?.value || 'all';
        statusFilter = st;
        let url = '/api/admin/preregistrations?';
        if (seminarId) url += 'seminarId=' + encodeURIComponent(seminarId) + '&';
        if (st && st !== 'all') url += 'status=' + encodeURIComponent(st);
        const tbody = document.getElementById('ak-prereg-tbody');
        if (!silent && tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading…</td></tr>';
        try {
            const prevRows = preregRows.slice();
            const nextRows = await api(url);
            const fp = rowFingerprint(nextRows);
            const fpChanged = fp !== lastRowFp;
            if (silent && prevRows.length && fpChanged) {
                detectNewRows(prevRows, nextRows);
            }
            lastRowFp = fp;
            preregRows = nextRows;
            await loadStats();
            renderTable();
            updateMainRegOpenPanel();
            if (selectedId && (!silent || fpChanged)) {
                const still = preregRows.find((r) => r.id === selectedId);
                if (still) openDetail(selectedId);
                else closeDetail();
            }
            updateLiveBar();
        } catch (e) {
            if (!silent && tbody) {
                tbody.innerHTML = '<tr><td colspan="8" style="color:#b91c1c;text-align:center;">' + esc(e.message) + '</td></tr>';
            }
        }
    }

    function wireStatClicks() {
        document.querySelectorAll('.ak-prereg-stat[data-filter]').forEach((el) => {
            el.addEventListener('click', () => {
                const f = el.dataset.filter || 'all';
                if (f === 'public') {
                    const srcSel = document.getElementById('ak-prereg-source-filter');
                    if (srcSel) srcSel.value = 'public';
                    sourceFilter = 'public';
                    const stSel = document.getElementById('ak-prereg-status-filter');
                    if (stSel) stSel.value = 'all';
                    statusFilter = 'all';
                    document.querySelectorAll('.ak-prereg-stat').forEach((s) => s.classList.remove('is-selected'));
                    el.classList.add('is-selected');
                    renderTable();
                    return;
                }
                const sel = document.getElementById('ak-prereg-status-filter');
                if (sel) sel.value = f;
                statusFilter = f;
                const srcSel = document.getElementById('ak-prereg-source-filter');
                if (srcSel) srcSel.value = 'all';
                sourceFilter = 'all';
                document.querySelectorAll('.ak-prereg-stat').forEach((s) => s.classList.remove('is-selected'));
                el.classList.add('is-selected');
                renderTable();
            });
        });
    }

    window.initAdminPreregTracking = function initAdminPreregTracking() {
        if (window.__akPreregInit) {
            refresh();
            startPoll();
            updateLiveBar();
            return;
        }
        window.__akPreregInit = true;
        loadSeminarsSelect().then(() => refresh()).then(() => {
            startPoll();
            updateLiveBar();
        });
        wireStatClicks();
        document.getElementById('ak-prereg-seminar')?.addEventListener('change', refresh);
        document.getElementById('ak-prereg-status-filter')?.addEventListener('change', refresh);
        document.getElementById('ak-prereg-source-filter')?.addEventListener('change', () => {
            sourceFilter = document.getElementById('ak-prereg-source-filter')?.value || 'all';
            renderTable();
        });
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
        document.getElementById('ak-prereg-close')?.addEventListener('click', closeDetail);
        document.getElementById('ak-prereg-detail-backdrop')?.addEventListener('click', closeDetail);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('ak-prereg-detail')?.classList.contains('is-open')) {
                closeDetail();
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopPoll();
            else if (tabVisible()) {
                startPoll();
                refresh({ silent: true });
            }
        });
    };

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akPreregHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            if (tabId === 'tab-prereg-tracking' && typeof initAdminPreregTracking === 'function') {
                initAdminPreregTracking();
            } else {
                closeDetail();
                stopPoll();
                updateLiveBar();
            }
        };
        window.switchTab.__akPreregHook = true;
    }
})();
