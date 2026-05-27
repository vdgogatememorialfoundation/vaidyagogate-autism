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

    function resolveApplicantUserId() {
        if (typeof doctorNumericUserId === 'function') {
            const n = doctorNumericUserId();
            if (n) return n;
        }
        if (window.currentUser && window.currentUser.id != null) {
            const n = Number(window.currentUser.id);
            if (Number.isInteger(n) && n > 0) return n;
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

    async function loadApplicantAnnouncements() {
        const box = document.getElementById('doctor-updates-list');
        if (!box) return;
        const uid = resolveApplicantUserId();
        if (!uid) {
            box.innerHTML = '<li style="color:#64748b;">Loading updates…</li>';
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
                    const pdfHref = u.pdf_path
                        ? u.pdf_path.startsWith('/')
                            ? u.pdf_path
                            : '/uploads/' + u.pdf_path
                        : '';
                    html +=
                        '<li style="margin-bottom:10px;list-style:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;">' +
                        '<strong>' +
                        esc(u.title) +
                        '</strong>' +
                        (u.body ? '<div style="margin-top:4px;color:#475569;">' + esc(u.body) + '</div>' : '') +
                        (pdfHref
                            ? '<div style="margin-top:6px;"><a href="' +
                              esc(pdfHref) +
                              '" target="_blank" rel="noopener" style="color:#0d9488;font-size:0.85rem;"><i class="fas fa-file-pdf"></i> View PDF</a></div>'
                            : '') +
                        (u.at || u.created_at
                            ? '<div style="margin-top:4px;font-size:0.78rem;color:#94a3b8;">' +
                              esc(formatAt(u.at || u.created_at)) +
                              '</div>'
                            : '') +
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
        let retries = 0;
        const retryTimer = setInterval(() => {
            if (resolveApplicantUserId() || retries++ > 12) clearInterval(retryTimer);
            if (!document.hidden) loadApplicantAnnouncements();
        }, 500);
        setInterval(() => {
            if (!document.hidden) loadApplicantAnnouncements();
        }, 30000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) loadApplicantAnnouncements();
        });
    }

    function initPublic() {
        /* Homepage announcements use header ticker only (autism-public-ticker.js). */
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
