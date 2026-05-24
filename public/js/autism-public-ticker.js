/**
 * Autism public site: announcement ticker + CMS hooks.
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
            add({ title: n.title || 'Notice', body: n.body || '', link: n.link || '' })
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
            const res = await fetch('/api/public/site-cms', { cache: 'no-store' });
            if (!res.ok) return;
            const cms = await res.json();
            renderAutismTicker(cms);
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
