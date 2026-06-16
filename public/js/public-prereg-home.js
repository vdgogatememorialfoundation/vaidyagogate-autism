/**
 * Homepage: promote public pre-registration events (no sign-in).
 */
(function () {
    'use strict';

    async function loadPublicPreregEvents() {
        const section = document.getElementById('ak-public-prereg-section');
        const list = document.getElementById('ak-public-prereg-events');
        const heroBtn = document.getElementById('ak-hero-public-prereg-btn');
        if (!section || !list) return;
        try {
            const r = await fetch('/api/public/preregistration/events');
            const data = await r.json().catch(() => ({}));
            const events = (data.events || []).filter((e) => e && e.preregOpen);
            if (!events.length) {
                section.classList.add('hidden');
                if (heroBtn) heroBtn.classList.add('hidden');
                return;
            }
            section.classList.remove('hidden');
            if (heroBtn) {
                heroBtn.classList.remove('hidden');
                heroBtn.onclick = function () {
                    window.location.href = '/preregister?event=' + encodeURIComponent(String(events[0].id));
                };
            }
            list.innerHTML = events
                .map(
                    (ev) =>
                        '<article class="ak-public-prereg-card">' +
                        '<h3>' +
                        escapeHtml(ev.title || 'Event') +
                        '</h3>' +
                        '<p>No account needed — fill the form in a few minutes. We email you a tracking ID.</p>' +
                        '<a class="ak-btn-v2 ak-btn-v2-primary" href="/preregister?event=' +
                        encodeURIComponent(String(ev.id)) +
                        '"><i class="fas fa-clipboard-list" aria-hidden="true"></i> Pre-register now</a>' +
                        '</article>'
                )
                .join('');
        } catch (_) {
            section.classList.add('hidden');
            if (heroBtn) heroBtn.classList.add('hidden');
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    document.addEventListener('DOMContentLoaded', loadPublicPreregEvents);
})();
