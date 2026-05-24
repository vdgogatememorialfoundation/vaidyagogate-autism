/**
 * Admin: creative competition submissions review + barcodes.
 */
(function () {
    'use strict';

    let compRows = [];

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function badge(status) {
        const st = String(status || 'submitted').toLowerCase();
        return '<span class="ak-badge ak-badge-' + esc(st) + '">' + esc(st.replace(/_/g, ' ')) + '</span>';
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

    function filteredRows() {
        const q = (document.getElementById('ak-comp-search')?.value || '').trim().toLowerCase();
        const st = (document.getElementById('ak-comp-status-filter')?.value || 'all').toLowerCase();
        return compRows.filter((r) => {
            if (st !== 'all' && String(r.status || '').toLowerCase() !== st) return false;
            if (!q) return true;
            const code = r.application_no || 'COMP-' + r.id;
            return [code, r.title, r.first_name, r.last_name, r.email, r.category, r.seminar_title]
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    }

    function renderTable() {
        const tbody = document.getElementById('ak-comp-tbody');
        if (!tbody) return;
        const rows = filteredRows();
        if (!rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">No competition entries match.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map((r) => {
                const code = r.application_no || 'COMP-' + r.id;
                const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
                return (
                    '<tr>' +
                    '<td><img src="/api/qrcode/' +
                    encodeURIComponent(code) +
                    '" alt="" width="48" height="48" style="display:block;margin-bottom:4px;"><code style="font-size:0.78rem;">' +
                    esc(code) +
                    '</code></td>' +
                    '<td><strong>' +
                    esc(r.title || '—') +
                    '</strong><br><small style="color:#64748b;">' +
                    esc(r.category || '') +
                    '</small></td>' +
                    '<td>' +
                    esc(name) +
                    '<br><small style="color:#64748b;">' +
                    esc(r.email || '') +
                    '</small></td>' +
                    '<td>' +
                    esc(r.seminar_title || '—') +
                    '</td>' +
                    '<td>' +
                    badge(r.status) +
                    '</td>' +
                    '<td>' +
                    esc((r.created_at || '').slice(0, 16)) +
                    '</td>' +
                    '<td><select data-comp-id="' +
                    r.id +
                    '" class="ak-comp-status-select" style="min-width:140px;">' +
                    ['submitted', 'under_review', 'approved', 'rejected']
                        .map(
                            (s) =>
                                '<option value="' +
                                s +
                                '"' +
                                (String(r.status || '').toLowerCase() === s ? ' selected' : '') +
                                '>' +
                                s.replace(/_/g, ' ') +
                                '</option>'
                        )
                        .join('') +
                    '</select></td>' +
                    '</tr>'
                );
            })
            .join('');
        tbody.querySelectorAll('.ak-comp-status-select').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const id = parseInt(sel.dataset.compId, 10);
                const status = sel.value;
                const msg = document.getElementById('ak-comp-action-msg');
                try {
                    await api('/api/admin/competition-submissions/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ submissionId: id, status })
                    });
                    if (msg) {
                        msg.textContent = 'Status updated.';
                        msg.style.color = '#047857';
                    }
                    await refresh();
                } catch (e) {
                    if (msg) {
                        msg.textContent = e.message || 'Update failed';
                        msg.style.color = '#b91c1c';
                    }
                }
            });
        });
    }

    async function refresh() {
        const tbody = document.getElementById('ak-comp-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading…</td></tr>';
        try {
            compRows = await api('/api/admin/competition-submissions');
            renderTable();
        } catch (e) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="color:#b91c1c;text-align:center;">' + esc(e.message) + '</td></tr>';
        }
    }

    window.initAdminCompetitionTracking = function initAdminCompetitionTracking() {
        if (window.__akCompInit) {
            refresh();
            return;
        }
        window.__akCompInit = true;
        document.getElementById('ak-comp-refresh')?.addEventListener('click', refresh);
        document.getElementById('ak-comp-search')?.addEventListener('input', renderTable);
        document.getElementById('ak-comp-status-filter')?.addEventListener('change', renderTable);
        refresh();
    };

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akCompHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            if (tabId === 'tab-competition-tracking' && typeof initAdminCompetitionTracking === 'function') {
                initAdminCompetitionTracking();
            }
        };
        window.switchTab.__akCompHook = true;
    }
})();
