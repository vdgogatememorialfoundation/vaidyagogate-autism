/**
 * Homepage stats strip — rendered via applySiteCms in vgmf-home.js when CMS loads.
 */
(function () {
    async function loadHomeStats() {
        const grid = document.getElementById('vg-stats-grid');
        if (!grid) return;
        const onlyLoading =
            grid.children.length === 1 &&
            grid.textContent &&
            /loading/i.test(grid.textContent);
        if (grid.children.length && !onlyLoading) return;
        if (window.__homeCms && typeof window.applySiteCms === 'function') {
            window.applySiteCms(window.__homeCms);
            return;
        }
        document.addEventListener(
            'ak-cms-ready',
            () => {
                if (window.__homeCms && typeof window.applySiteCms === 'function') {
                    window.applySiteCms(window.__homeCms);
                }
            },
            { once: true }
        );
    }

    document.addEventListener('DOMContentLoaded', loadHomeStats);
})();
