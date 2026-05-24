/**
 * Autism public site: header announcement ticker (right → left).
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-portal')) return;

    function mergeTickerItems(cms) {
        const out = [];
        const seen = new Set();
        function add(item) {
            if (!item || (!item.title && !item.body)) return;
            const key = String(item.title || '') + '|' + String(item.body || '').slice(0, 60);
            if (seen.has(key)) return;
            seen.add(key);
            out.push(item);
        }
        (cms.scrollingAnnouncements || []).forEach(add);
        (cms.publicNotices || []).forEach((n) =>
            add({ title: n.title || 'Notice', body: n.body || n.description || '', link: n.link || '' })
        );
        return out;
    }

    function renderAutismTicker(cms) {
        const items = mergeTickerItems(cms || {});
        if (typeof window.renderCongressTicker === 'function') {
            window.renderCongressTicker(items);
            return;
        }
        if (typeof window.renderScrollingAnnouncements === 'function') {
            window.renderScrollingAnnouncements(items);
        }
    }

    const origApply = window.applySiteCms;
    window.applySiteCms = function applySiteCmsAutism(cms) {
        if (typeof origApply === 'function') origApply(cms);
        renderAutismTicker(cms);
    };

    async function bootstrapTicker() {
        try {
            const [cmsRes, annRes] = await Promise.all([
                fetch('/api/public/site-cms', { cache: 'no-store' }),
                fetch('/api/public/announcements', { cache: 'no-store' })
            ]);
            const merged = {};
            if (cmsRes.ok) Object.assign(merged, await cmsRes.json());
            if (annRes.ok) {
                const ann = await annRes.json();
                merged.scrollingAnnouncements = [
                    ...(merged.scrollingAnnouncements || []),
                    ...(ann.scrollingAnnouncements || [])
                ];
                merged.publicNotices = [...(merged.publicNotices || []), ...(ann.publicNotices || [])];
            }
            renderAutismTicker(merged);
        } catch (_) {
            /* optional */
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapTicker);
    } else {
        bootstrapTicker();
    }
})();
