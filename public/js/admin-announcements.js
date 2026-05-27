/**
 * Admin: website notices, applicant dashboard updates, targeted announcements.
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
        const host = document.getElementById('ak-ann-admin-list');
        if (!host) return;
        const userId = document.getElementById('ak-ann-filter-user')?.value?.trim();
        let url = '/api/admin/applicant-announcements';
        if (userId) url += '?userId=' + encodeURIComponent(userId);
        host.innerHTML = '<p style="color:#64748b;">Loading…</p>';
        try {
            const rows = await api(url);
            if (!rows.length) {
                host.innerHTML = '<p style="color:#64748b;">No targeted announcements yet.</p>';
                return;
            }
            host.innerHTML = rows
                .map((r) => {
                    const who = r.user_id
                        ? esc([r.first_name, r.last_name].filter(Boolean).join(' ') || 'User ' + r.user_id) +
                          (r.email ? '<br><small>' + esc(r.email) + '</small>' : '')
                        : '<em>All participants</em>';
                    return (
                        '<div class="ak-ann-card" style="margin-bottom:10px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fafafa;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">' +
                        '<div><div style="font-size:0.78rem;color:#64748b;margin-bottom:4px;">' +
                        who +
                        '</div><strong>' +
                        esc(r.title) +
                        '</strong><div style="color:#475569;margin-top:4px;font-size:0.88rem;">' +
                        esc((r.body || '').slice(0, 200)) +
                        '</div><div style="font-size:0.78rem;color:#94a3b8;margin-top:6px;">' +
                        esc((r.created_at || '').slice(0, 16)) +
                        ' · ' +
                        (r.is_active ? 'Active' : 'Off') +
                        '</div></div>' +
                        '<button type="button" class="btn-primary" style="background:#b91c1c;padding:4px 10px;font-size:0.78rem;" data-del-ann="' +
                        r.id +
                        '">Delete</button></div>'
                    );
                })
                .join('');
            host.querySelectorAll('[data-del-ann]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Delete this announcement?')) return;
                    await api('/api/admin/applicant-announcements/' + btn.dataset.delAnn, { method: 'DELETE' });
                    loadList();
                });
            });
        } catch (e) {
            host.innerHTML = '<p style="color:#b91c1c;">' + esc(e.message) + '</p>';
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
                msg.textContent = 'Published. Participants will see it on their dashboard.';
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
        if (typeof window.loadAkContentUpdatesTab === 'function') {
            window.loadAkContentUpdatesTab();
        }
        loadList();
        if (window.__akAnnAdminInit) return;
        window.__akAnnAdminInit = true;
        document.getElementById('ak-ann-refresh')?.addEventListener('click', loadList);
        document.getElementById('ak-ann-filter-btn')?.addEventListener('click', loadList);
        document.getElementById('ak-ann-save')?.addEventListener('click', submitAnn);
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
