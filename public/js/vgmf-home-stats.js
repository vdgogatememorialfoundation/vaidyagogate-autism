/**
 * Homepage stats strip (minimal — no search/scroll extras).
 */
(function () {
    async function loadHomeStats() {
        const grid = document.getElementById('vg-stats-grid');
        if (!grid) return;
        let cms = {};
        try {
            const cmsRes = await fetch('/api/public/site-cms');
            cms = await cmsRes.json().catch(() => ({}));
        } catch (_) {}

        const fallback = [
            { value: '1+', label: 'Active seminars' },
            { value: '20+', label: 'Expert speakers' },
            { value: '1972', label: 'Founded' },
            { value: '24/7', label: 'Online portal' }
        ];
        const fromCms = Array.isArray(cms.homeStats) ? cms.homeStats.filter((s) => s && (s.value || s.label)) : [];
        const stats = fromCms.length ? fromCms : fallback;
        grid.innerHTML = stats
            .map(
                (s) =>
                    '<div class="vg-stat"><strong>' +
                    s.value +
                    '</strong><span>' +
                    s.label +
                    '</span></div>'
            )
            .join('');
    }

    document.addEventListener('DOMContentLoaded', loadHomeStats);
})();
