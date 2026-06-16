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
            const events = (data.events || []).filter((e) => e && (e.preregOpen || (e.upcoming && e.opensAt)));
            if (!events.length) {
                section.classList.add('hidden');
                if (heroBtn) heroBtn.classList.add('hidden');
                return;
            }
            section.classList.remove('hidden');
            if (heroBtn) {
                heroBtn.classList.remove('hidden');
                const target = events.find((e) => e.preregOpen) || events[0];
                heroBtn.onclick = function () {
                    window.location.href = '/preregister?event=' + encodeURIComponent(String(target.id));
                };
            }
            list.innerHTML = events
                .map((ev) => {
                    const openNow = !!ev.preregOpen;
                    const btnLabel = openNow ? 'Pre-register now' : 'View countdown';
                    const sub = openNow
                        ? 'No account needed — fill the form in a few minutes. We email you a tracking ID.'
                        : 'Pre-registration opens soon — see the live countdown and return when the form opens.';
                    return (
                        '<article class="ak-public-prereg-card">' +
                        '<h3>' +
                        escapeHtml(ev.title || 'Event') +
                        '</h3>' +
                        '<p>' +
                        sub +
                        '</p>' +
                        '<a class="ak-btn-v2 ak-btn-v2-primary" href="/preregister?event=' +
                        encodeURIComponent(String(ev.id)) +
                        '"><i class="fas fa-' +
                        (openNow ? 'clipboard-list' : 'hourglass-half') +
                        '" aria-hidden="true"></i> ' +
                        btnLabel +
                        '</a>' +
                        '</article>'
                    );
                })
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
