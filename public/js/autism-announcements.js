/**
 * Applicant dashboard + homepage announcements (IST).
 */
(function () {
    'use strict';

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function formatAt(iso) {
        if (!iso) return '';
        if (window.PortalDateTime && window.PortalDateTime.format) {
            return window.PortalDateTime.format(iso) + ' IST';
        }
        return String(iso).slice(0, 16);
    }

    async function loadApplicantAnnouncements() {
        const box = document.getElementById('doctor-updates-list');
        if (!box) return;
        const uid =
            typeof doctorNumericUserId === 'function'
                ? doctorNumericUserId()
                : window.currentUser && window.currentUser.id;
        if (!uid) {
            box.innerHTML = '<li style="color:#64748b;">Sign in to see updates.</li>';
            return;
        }
        try {
            const r = await fetch('/api/applicant/announcements?userId=' + encodeURIComponent(uid), {
                cache: 'no-store'
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || r.statusText);
            const personal = (data.targeted || []).filter(Boolean);
            const global = (data.global || []).filter(Boolean);
            let html = '';
            if (personal.length) {
                html +=
                    '<li style="list-style:none;margin:0 0 12px;padding:0;"><span style="font-size:0.75rem;font-weight:800;color:#7c3aed;text-transform:uppercase;">For you</span></li>';
                personal.forEach((u) => {
                    html +=
                        '<li style="margin-bottom:12px;list-style:none;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:12px;">' +
                        '<strong style="color:#5b21b6;">' +
                        esc(u.title) +
                        '</strong>' +
                        (u.body ? '<div style="margin-top:6px;color:#475569;">' + esc(u.body) + '</div>' : '') +
                        (u.created_at
                            ? '<div style="margin-top:6px;font-size:0.78rem;color:#94a3b8;">' +
                              esc(formatAt(u.created_at)) +
                              '</div>'
                            : '') +
                        '</li>';
                });
            }
            if (global.length) {
                html +=
                    '<li style="list-style:none;margin:12px 0 8px;padding:0;"><span style="font-size:0.75rem;font-weight:800;color:#0369a1;text-transform:uppercase;">Programme updates</span></li>';
                global.forEach((u) => {
                    html +=
                        '<li style="margin-bottom:10px;list-style:none;">' +
                        '<strong>' +
                        esc(u.title) +
                        '</strong>' +
                        (u.body ? '<div style="margin-top:4px;color:#475569;">' + esc(u.body) + '</div>' : '') +
                        (u.at ? '<div style="margin-top:4px;font-size:0.78rem;color:#94a3b8;">' + esc(formatAt(u.at)) + '</div>' : '') +
                        '</li>';
                });
            }
            box.innerHTML = html || '<li style="color:#64748b;">No announcements yet.</li>';
        } catch (e) {
            box.innerHTML = '<li style="color:#b91c1c;">' + esc(e.message || 'Could not load') + '</li>';
        }
    }

    function initApplicant() {
        if (!document.body.classList.contains('ak-portal-dash')) return;
        loadApplicantAnnouncements();
        setInterval(() => {
            if (!document.hidden) loadApplicantAnnouncements();
        }, 30000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) loadApplicantAnnouncements();
        });
    }

    async function loadHomeAnnouncements() {
        const board = document.getElementById('ak-home-announcements');
        if (!board) return;
        try {
            const r = await fetch('/api/public/announcements', { cache: 'no-store' });
            const data = await r.json();
            if (!r.ok) return;
            const cards = (data.scrollingAnnouncements || []).slice(0, 4);
            const notices = (data.publicNotices || []).slice(0, 4);
            const items = [
                ...cards.map((c) => ({
                    title: c.title || c.headline || 'Announcement',
                    body: c.subtitle || c.text || c.body || '',
                    at: c.date || null
                })),
                ...notices.map((n) => ({
                    title: n.title || 'Notice',
                    body: n.description || n.body || '',
                    at: n.date || null
                }))
            ];
            if (!items.length) {
                board.innerHTML = '<p class="muted">No announcements at the moment.</p>';
                return;
            }
            board.innerHTML = items
                .map(
                    (it) =>
                        '<article class="ak-home-ann-card"><h4>' +
                        esc(it.title) +
                        '</h4><p>' +
                        esc(it.body) +
                        '</p>' +
                        (it.at ? '<time>' + esc(formatAt(it.at)) + '</time>' : '') +
                        '</article>'
                )
                .join('');
        } catch (_) {
            board.innerHTML = '<p class="muted">Announcements load when you are online.</p>';
        }
    }

    function initPublic() {
        if (!document.body.classList.contains('autism-kids')) return;
        loadHomeAnnouncements();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initApplicant();
            initPublic();
        });
    } else {
        initApplicant();
        initPublic();
    }

    window.loadApplicantAnnouncements = loadApplicantAnnouncements;
    if (document.body.classList.contains('ak-portal-dash')) {
        window.loadDoctorPortalUpdatesFromCms = loadApplicantAnnouncements;
    }
})();
