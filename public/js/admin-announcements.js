/**
 * Admin: per-participant announcements + shortcuts to site-wide CMS.
 */
(function () {
    'use strict';

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
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

    async function loadList() {
        const tbody = document.getElementById('ak-ann-admin-tbody');
        if (!tbody) return;
        const userId = document.getElementById('ak-ann-filter-user')?.value?.trim();
        let url = '/api/admin/applicant-announcements';
        if (userId) url += '?userId=' + encodeURIComponent(userId);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading…</td></tr>';
        try {
            const rows = await api(url);
            if (!rows.length) {
                tbody.innerHTML =
                    '<tr><td colspan="5" style="text-align:center;color:#64748b;">No targeted announcements yet.</td></tr>';
                return;
            }
            tbody.innerHTML = rows
                .map((r) => {
                    const who = r.user_id
                        ? esc([r.first_name, r.last_name].filter(Boolean).join(' ') || 'User ' + r.user_id) +
                          '<br><small>' +
                          esc(r.email || '') +
                          '</small>'
                        : '<em>All participants</em>';
                    return (
                        '<tr><td>' +
                        who +
                        '</td><td><strong>' +
                        esc(r.title) +
                        '</strong><br><small style="color:#64748b;">' +
                        esc((r.body || '').slice(0, 120)) +
                        '</small></td><td>' +
                        (r.is_active ? 'Active' : 'Off') +
                        '</td><td>' +
                        esc((r.created_at || '').slice(0, 16)) +
                        '</td><td><button type="button" class="btn-danger" style="padding:4px 10px;font-size:0.78rem;" data-del-ann="' +
                        r.id +
                        '">Delete</button></td></tr>'
                    );
                })
                .join('');
            tbody.querySelectorAll('[data-del-ann]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Delete this announcement?')) return;
                    await api('/api/admin/applicant-announcements/' + btn.dataset.delAnn, { method: 'DELETE' });
                    loadList();
                });
            });
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:#b91c1c;">' + esc(e.message) + '</td></tr>';
        }
    }

    async function submitAnn() {
        const msg = document.getElementById('ak-ann-admin-msg');
        const userId = document.getElementById('ak-ann-user-id')?.value?.trim();
        const title = document.getElementById('ak-ann-title')?.value?.trim();
        const body = document.getElementById('ak-ann-body')?.value?.trim();
        if (!title) {
            if (msg) {
                msg.textContent = 'Enter a title.';
                msg.style.color = '#b91c1c';
            }
            return;
        }
        try {
            await api('/api/admin/applicant-announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId || null,
                    title,
                    body
                })
            });
            if (msg) {
                msg.textContent = 'Saved. Participant(s) will see it on their dashboard (IST).';
                msg.style.color = '#047857';
            }
            document.getElementById('ak-ann-title').value = '';
            document.getElementById('ak-ann-body').value = '';
            loadList();
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Save failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    window.initAdminAnnouncements = function initAdminAnnouncements() {
        if (window.__akAnnAdminInit) {
            loadList();
            return;
        }
        window.__akAnnAdminInit = true;
        document.getElementById('ak-ann-refresh')?.addEventListener('click', loadList);
        document.getElementById('ak-ann-filter-btn')?.addEventListener('click', loadList);
        document.getElementById('ak-ann-save')?.addEventListener('click', submitAnn);
        loadList();
    };

    const orig = window.switchTab;
    if (typeof orig === 'function' && !orig.__akAnnHook) {
        window.switchTab = function (id) {
            orig.apply(this, arguments);
            if (id === 'tab-announcements') initAdminAnnouncements();
        };
        window.switchTab.__akAnnHook = true;
    }
})();
