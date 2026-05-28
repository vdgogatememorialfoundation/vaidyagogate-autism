/**
 * Homepage stats strip — rendered via applySiteCms in vgmf-home.js when CMS loads.
 */
(function () {
    async function loadHomeStats() {
        const grid = document.getElementById('vg-stats-grid');
        if (!grid || grid.children.length) return;
        if (window.__homeCms && typeof window.applySiteCms === 'function') {
            window.applySiteCms(window.__homeCms);
            return;
        }
        try {
            const cmsRes = await fetch('/api/public/site-cms', { cache: 'no-store' });
            const cms = await cmsRes.json().catch(() => ({}));
            if (typeof window.applySiteCms === 'function') window.applySiteCms(cms);
        } catch (_) {}
    }

    document.addEventListener('DOMContentLoaded', loadHomeStats);
})();
