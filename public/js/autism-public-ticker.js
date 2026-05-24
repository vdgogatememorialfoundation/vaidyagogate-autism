/**
 * Autism public site: header announcement ticker (right → left).
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-portal')) return;

    const FALLBACK_TICKER = [
        {
            title: 'Autism Awareness Programme 2026',
            body: 'Free registration — sign in and pre-register from your applicant dashboard.'
        },
        {
            title: 'Welcome',
            body: 'Creative competitions, e-tickets, and certificates — all at no cost.'
        }
    ];

    function mergeTickerItems(cms) {
        const out = [];
        const seen = new Set();
        function add(item) {
            if (!item) return;
            const title = item.title || item.headline || '';
            const body = item.body || item.description || item.subtitle || item.text || '';
            if (!title && !body) return;
            const key = String(title) + '|' + String(body).slice(0, 60);
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ title: title || body.slice(0, 80), body, link: item.link || '' });
        }
        (cms.scrollingAnnouncements || []).forEach(add);
        (cms.publicNotices || []).forEach((n) =>
            add({ title: n.title || 'Notice', body: n.body || n.description || '', link: n.link || '' })
        );
        if (cms.ticker && String(cms.ticker).trim()) {
            add({ title: String(cms.ticker).trim(), body: '' });
        }
        return out.length ? out : FALLBACK_TICKER.slice();
    }

    function renderAutismTicker(cms) {
        const items = mergeTickerItems(cms || {});
        if (typeof window.renderCongressTicker === 'function') {
            window.renderCongressTicker(items);
            const wrap = document.getElementById('scrolling-announce-wrap');
            if (wrap) wrap.classList.remove('hidden');
            return;
        }
        const wrap = document.getElementById('scrolling-announce-wrap');
        const track = document.getElementById('scrolling-announce-track');
        if (!wrap || !track) return;
        wrap.classList.remove('hidden');
        track.className = 'cg-ticker-track';
        const esc = (s) =>
            String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;');
        const html = items
            .map((it) => {
                const text = esc(it.title || it.body || 'Update');
                return '<span class="cg-ticker-item">' + text + '</span>';
            })
            .join('');
        track.innerHTML = html + html;
    }

    const origCongressTicker = window.renderCongressTicker;
    window.renderCongressTicker = function renderCongressTickerAutism(items) {
        const list =
            items && items.length
                ? items
                : FALLBACK_TICKER.slice();
        if (typeof origCongressTicker === 'function') {
            origCongressTicker(list);
            const wrap = document.getElementById('scrolling-announce-wrap');
            if (wrap && list.length) wrap.classList.remove('hidden');
            return;
        }
        renderAutismTicker({ scrollingAnnouncements: list });
    };

    const origApply = window.applySiteCms;
    window.applySiteCms = function applySiteCmsAutism(cms) {
        if (typeof origApply === 'function') origApply(cms);
        renderAutismTicker(cms);
    };

    window.renderScrollingAnnouncements = function renderScrollingAnnouncementsAutism(items) {
        renderAutismTicker({ scrollingAnnouncements: items || [] });
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
                if (ann.ticker) merged.ticker = ann.ticker;
                merged.scrollingAnnouncements = [
                    ...(merged.scrollingAnnouncements || []),
                    ...(ann.scrollingAnnouncements || [])
                ];
                merged.publicNotices = [...(merged.publicNotices || []), ...(ann.publicNotices || [])];
            }
            renderAutismTicker(merged);
        } catch (_) {
            renderAutismTicker({});
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapTicker);
    } else {
        bootstrapTicker();
    }
})();
