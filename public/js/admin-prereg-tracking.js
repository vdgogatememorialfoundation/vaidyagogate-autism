/**
 * Admin: pre-registration approval queue + link to final registration status.
 */
(function () {
    'use strict';

    let preregRows = [];
    let selectedId = null;
    let statusFilter = 'all';

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
            sel.innerHTML = '<option value="">All events</option>';
            seminars.forEach((s) => {
                const o = document.createElement('option');
                o.value = s.id;
                o.textContent = s.title || 'Event ' + s.id;
                sel.appendChild(o);
            });
            sel.dataset.loaded = '1';
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
                    '<td><img src="/api/qrcode/' +
                    encodeURIComponent(r.application_no || '') +
                    '" alt="" width="44" height="44" style="display:block;margin-bottom:4px;"><code>' +
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
                    '</td>' +
                    '</tr>'
                );
            })
            .join('');
        tbody.querySelectorAll('[data-ak-view]').forEach((btn) => {
            btn.addEventListener('click', () => openDetail(parseInt(btn.dataset.akView, 10)));
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
                  .map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>')
                  .join('')
            : '<dt>Form data</dt><dd style="color:#64748b;">No extra fields submitted.</dd>';
        document.getElementById('ak-prereg-detail-title').textContent = name + ' — ' + (row.seminar_title || 'Event');
        document.getElementById('ak-prereg-detail-body').innerHTML =
            '<dl>' +
            '<dt>Application no.</dt><dd><code>' +
            esc(row.application_no) +
            '</code><br><img src="/api/qrcode/' +
            encodeURIComponent(row.application_no || '') +
            '" alt="Barcode" width="96" height="96" style="margin-top:8px;"></dd>' +
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

    async function setStatus(status) {
        const id = parseInt(document.getElementById('ak-prereg-detail')?.dataset.rowId, 10);
        if (!id) return;
        const msg = document.getElementById('ak-prereg-action-msg');
        try {
            await api('/api/admin/preregistrations/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preregistrationId: id, status })
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
        document.getElementById('ak-prereg-goto-reg')?.addEventListener('click', () => {
            if (typeof switchTab === 'function') {
                switchTab('tab-applications');
                const search = document.getElementById('applications-search');
                const row = preregRows.find((r) => r.id === selectedId);
                if (search && row && row.application_no) {
                    search.value = row.application_no;
                    if (typeof adminFilterApplicationsList === 'function') adminFilterApplicationsList();
                }
            }
        });
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
