/**
 * Admin: final (main) registration tracking queue (autism portal — no payment step).
 */
(function () {
    'use strict';

    const AK_FINAL_STATUSES = [
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

    let finalRows = [];
    let selectedId = null;
    let statusFilter = 'all';

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function fileHref(stored) {
        if (typeof window.publicFileHref === 'function') return window.publicFileHref(stored);
        const p = String(stored || '').trim();
        if (!p) return '';
        if (/^https?:\/\//i.test(p)) return p;
        if (p.startsWith('/')) return p;
        return '/uploads/' + p;
    }

    function looksLikeStoredFile(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return false;
        if (/^https?:\/\//i.test(s)) return true;
        if (s.startsWith('/uploads/') || s.startsWith('/api/assets/')) return true;
        if (/\.(pdf|jpe?g|png|gif|webp|bmp|pptx?|docx?)$/i.test(s)) return true;
        return false;
    }

    function formatFormDataDetailHtml(fd) {
        const data = fd || {};
        const skip = new Set(['password', 'agree_terms']);
        let html = '';
        if (data.certificate_path && looksLikeStoredFile(data.certificate_path)) {
            const href = fileHref(data.certificate_path);
            html +=
                '<dt>Certificate</dt><dd><a href="' +
                esc(href) +
                '" target="_blank" rel="noopener">View certificate</a></dd>';
        }
        Object.keys(data).forEach((k) => {
            if (skip.has(k) || k === 'certificate_path' || k === 'ncism_certificate_check') return;
            const v = data[k];
            if (v == null || String(v).trim() === '') return;
            if (k === 'additional_documents' && Array.isArray(v)) {
                html += '<dt>Additional documents</dt><dd><ul>';
                v.forEach((d) => {
                    const href = d && d.path ? fileHref(d.path) : '';
                    html +=
                        '<li>' +
                        esc((d && d.label) || 'Document') +
                        (href
                            ? ' — <a href="' +
                              esc(href) +
                              '" target="_blank" rel="noopener">View</a>'
                            : '') +
                        '</li>';
                });
                html += '</ul></dd>';
                return;
            }
            if (looksLikeStoredFile(v)) {
                const href = fileHref(v);
                html +=
                    '<dt>' +
                    esc(k.replace(/_/g, ' ')) +
                    '</dt><dd><a href="' +
                    esc(href) +
                    '" target="_blank" rel="noopener">View file</a> <span style="color:#64748b;font-size:0.82rem;">(' +
                    esc(String(v).split('/').pop()) +
                    ')</span></dd>';
            } else {
                html += '<dt>' + esc(k.replace(/_/g, ' ')) + '</dt><dd>' + esc(String(v)) + '</dd>';
            }
        });
        return html || '<dt>Form data</dt><dd style="color:#64748b;">No fields submitted.</dd>';
    }

    function badge(status) {
        const st = String(status || 'submitted').toLowerCase();
        return '<span class="ak-badge ak-badge-' + esc(st) + '">' + esc(st.replace(/_/g, ' ')) + '</span>';
    }

    async function api(path, opts) {
        if (typeof window.autismAdminFetch === 'function') {
            return window.autismAdminFetch(path, opts);
        }
        const url = typeof withActingAdminUrl === 'function' ? withActingAdminUrl(path) : path;
        const r = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        return data;
    }

    async function loadSeminarsSelect() {
        const sel = document.getElementById('ak-final-seminar');
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
        const seminarId = document.getElementById('ak-final-seminar')?.value || '';
        const q = seminarId ? '?seminarId=' + encodeURIComponent(seminarId) : '';
        try {
            const stats = await api('/api/admin/final-registrations/stats' + q);
            const map = {
                total: stats.total || 0,
                submitted: stats.submitted || 0,
                pending_approval: stats.pending_approval || 0,
                revision_required: stats.revision_required || 0,
                e_ticket_issued: stats.e_ticket_issued || 0,
                completed: stats.completed || 0,
                rejected: stats.rejected || 0
            };
            Object.keys(map).forEach((k) => {
                const el = document.getElementById('ak-final-stat-' + k);
                if (el) el.textContent = map[k];
            });
        } catch (e) {
            console.warn('final reg stats', e);
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
        const q = (document.getElementById('ak-final-search')?.value || '').trim().toLowerCase();
        return finalRows.filter((r) => {
            if (statusFilter !== 'all' && String(r.status || '').toLowerCase() !== statusFilter) return false;
            if (!q) return true;
            const hay = [
                r.application_no,
                r.first_name,
                r.last_name,
                r.email,
                r.phone,
                r.seminar_title,
                r.user_id_string
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }

    function statusOptionsHtml(current) {
        const cur = String(current || 'submitted').toLowerCase();
        return AK_FINAL_STATUSES.map((s) => {
            const v = s.value || s;
            const label = s.label || String(v).replace(/_/g, ' ');
            return (
                '<option value="' +
                esc(v) +
                '"' +
                (cur === String(v).toLowerCase() ? ' selected' : '') +
                '>' +
                esc(label) +
                '</option>'
            );
        }).join('');
    }

    function renderTable() {
        const tbody = document.getElementById('ak-final-tbody');
        if (!tbody) return;
        const rows = filteredRows();
        if (!rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">No final registrations match your filters.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map((r) => {
                const name = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || '—';
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
                    esc(r.seminar_title || r.seminar_id || '—') +
                    '</td>' +
                    '<td>' +
                    badge(r.status) +
                    '</td>' +
                    '<td>' +
                    esc((r.created_at || '').slice(0, 16)) +
                    '</td>' +
                    '<td><select data-ak-final-status="' +
                    r.id +
                    '" style="padding:4px 8px;font-size:0.82rem;">' +
                    statusOptionsHtml(r.status) +
                    '</select></td>' +
                    '<td><button type="button" class="btn-primary" style="padding:5px 10px;font-size:0.78rem;" data-ak-final-view="' +
                    r.id +
                    '">Review</button>' +
                    '<button type="button" class="btn-primary" style="padding:5px 10px;font-size:0.78rem;margin-left:6px;background:#b91c1c;" data-ak-final-delete="' +
                    r.id +
                    '">Delete</button></td>' +
                    '</tr>'
                );
            })
            .join('');
        tbody.querySelectorAll('[data-ak-final-view]').forEach((btn) => {
            btn.addEventListener('click', () => openDetail(parseInt(btn.dataset.akFinalView, 10)));
        });
        tbody.querySelectorAll('[data-ak-final-delete]').forEach((btn) => {
            btn.addEventListener('click', () => deleteFinalRegistration(parseInt(btn.dataset.akFinalDelete, 10)));
        });
        tbody.querySelectorAll('[data-ak-final-status]').forEach((sel) => {
            sel.addEventListener('change', () => setStatus(parseInt(sel.dataset.akFinalStatus, 10), sel.value));
        });
    }

    function updateDetailActionButtons(row) {
        const st = String((row && row.status) || '').toLowerCase();
        const approveBtn = document.getElementById('ak-final-approve');
        const ticketBtn = document.getElementById('ak-final-issue-ticket');
        if (approveBtn) {
            approveBtn.disabled = !['submitted', 'revision_required', 'documents_requested'].includes(st);
        }
        if (ticketBtn) {
            const canIssue = st === 'pending_approval';
            ticketBtn.disabled = !canIssue;
            ticketBtn.title = canIssue
                ? 'Creates participant e-ticket (no payment on autism portal)'
                : 'Approve the application first, then issue e-ticket';
        }
    }

    function openDetail(id) {
        selectedId = id;
        const row = finalRows.find((r) => r.id === id);
        const panel = document.getElementById('ak-final-detail');
        if (!row || !panel) return;
        panel.classList.add('is-open');
        const name = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ');
        const fd = parseFormData(row.form_data);
        document.getElementById('ak-final-detail-title').textContent = name + ' — ' + (row.seminar_title || 'Event');
        document.getElementById('ak-final-detail-body').innerHTML =
            '<dl>' +
            '<dt>Application no.</dt><dd><code>' +
            esc(row.application_no) +
            '</code></dd>' +
            '<dt>Applicant ID</dt><dd>' +
            esc(row.user_id_string || '—') +
            '</dd>' +
            '<dt>Email / phone</dt><dd>' +
            esc(row.email) +
            ' · ' +
            esc(row.phone) +
            '</dd>' +
            '<dt>Status</dt><dd>' +
            badge(row.status) +
            '</dd>' +
            formatFormDataDetailHtml(fd) +
            '</dl>';
        panel.dataset.rowId = String(id);
        updateDetailActionButtons(row);
        renderTable();
    }

    async function deleteFinalRegistration(regId) {
        const id = parseInt(regId, 10);
        if (!Number.isInteger(id) || id < 1) return;
        const row = finalRows.find((r) => r.id === id);
        const appNo = row ? row.application_no : '';
        if (!confirm('Permanently delete registration ' + (appNo ? appNo : String(id)) + '? This removes ticket data too.'))
            return;
        try {
            await api('/api/admin/registrations/' + encodeURIComponent(String(id)), { method: 'DELETE' });
            const panel = document.getElementById('ak-final-detail');
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

    async function setStatus(id, status, confirmTicket) {
        const msg = document.getElementById('ak-final-action-msg');
        const st = String(status || '').toLowerCase();
        if (st === 'e_ticket_issued' && confirmTicket !== false) {
            if (!confirm('Issue e-ticket for this registration? No payment is required on the autism portal.')) return;
        }
        try {
            const body =
                typeof withActingAdminBody === 'function'
                    ? withActingAdminBody({ applicationId: id, status: st })
                    : { applicationId: id, status: st };
            const r = await fetch('/api/admin/applications/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || r.statusText);
            if (msg) {
                msg.textContent = data.message || 'Status updated.';
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
        const seminarId = document.getElementById('ak-final-seminar')?.value || '';
        const st = document.getElementById('ak-final-status-filter')?.value || 'all';
        statusFilter = st;
        let url = '/api/admin/applications?';
        if (seminarId) url += 'seminarId=' + encodeURIComponent(seminarId) + '&';
        if (st && st !== 'all') url += 'status=' + encodeURIComponent(st);
        const tbody = document.getElementById('ak-final-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading…</td></tr>';
        try {
            finalRows = await api(url);
            await loadStats();
            renderTable();
        } catch (e) {
            if (tbody) {
                tbody.innerHTML =
                    '<tr><td colspan="7" style="color:#b91c1c;text-align:center;">' + esc(e.message) + '</td></tr>';
            }
        }
    }

    function wireStatClicks() {
        document.querySelectorAll('.ak-final-stat[data-filter]').forEach((el) => {
            el.addEventListener('click', () => {
                const f = el.dataset.filter || 'all';
                const sel = document.getElementById('ak-final-status-filter');
                if (sel) sel.value = f;
                statusFilter = f;
                document.querySelectorAll('.ak-final-stat').forEach((s) => s.classList.remove('is-selected'));
                el.classList.add('is-selected');
                renderTable();
            });
        });
    }

    window.initAdminFinalTracking = function initAdminFinalTracking() {
        if (window.__akFinalInit) {
            refresh();
            return;
        }
        window.__akFinalInit = true;
        loadSeminarsSelect().then(refresh);
        wireStatClicks();
        document.getElementById('ak-final-seminar')?.addEventListener('change', refresh);
        document.getElementById('ak-final-status-filter')?.addEventListener('change', refresh);
        document.getElementById('ak-final-search')?.addEventListener('input', renderTable);
        document.getElementById('ak-final-refresh')?.addEventListener('click', refresh);
        document.getElementById('ak-final-revision')?.addEventListener('click', () => {
            const id = parseInt(document.getElementById('ak-final-detail')?.dataset.rowId, 10);
            if (id) setStatus(id, 'revision_required', false);
        });
        document.getElementById('ak-final-approve')?.addEventListener('click', () => {
            const id = parseInt(document.getElementById('ak-final-detail')?.dataset.rowId, 10);
            if (id) setStatus(id, 'pending_approval', false);
        });
        document.getElementById('ak-final-issue-ticket')?.addEventListener('click', () => {
            const id = parseInt(document.getElementById('ak-final-detail')?.dataset.rowId, 10);
            if (id) setStatus(id, 'e_ticket_issued');
        });
        document.getElementById('ak-final-reject')?.addEventListener('click', () => {
            const id = parseInt(document.getElementById('ak-final-detail')?.dataset.rowId, 10);
            if (id) setStatus(id, 'rejected', false);
        });
        document.getElementById('ak-final-delete')?.addEventListener('click', () => {
            const id = parseInt(document.getElementById('ak-final-detail')?.dataset.rowId, 10);
            if (id) deleteFinalRegistration(id);
        });
        document.getElementById('ak-final-open-queue')?.addEventListener('click', () => {
            if (typeof switchTab === 'function') switchTab('tab-applications');
        });
    };

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akFinalHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            if (tabId === 'tab-final-tracking' && typeof initAdminFinalTracking === 'function') {
                initAdminFinalTracking();
            }
        };
        window.switchTab.__akFinalHook = true;
    }
})();
