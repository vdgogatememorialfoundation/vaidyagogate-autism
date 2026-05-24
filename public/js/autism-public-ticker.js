/**
 * Autism public site: header announcement ticker (right → left, single pass, no duplicate items).
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-portal')) return;

    const FALLBACK_TICKER = [
        {
            title: 'Autism Awareness Programme 2026',
            body: 'Free registration — sign in and pre-register from your applicant dashboard.'
        }
    ];

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function itemLabel(it) {
        const title = String(it.title || it.headline || '').trim();
        const body = String(it.body || it.description || it.subtitle || it.text || '').trim();
        if (title && body && title !== body) return title + ' — ' + body;
        return title || body;
    }

    function mergeTickerItems(cms) {
        const out = [];
        const seen = new Set();
        function add(item) {
            if (!item) return;
            const label = itemLabel(item);
            if (!label) return;
            const key = label.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ title: label, body: '', link: item.link || '' });
        }
        (cms.scrollingAnnouncements || []).forEach(add);
        const tt = cms.tickerText || cms.ticker;
        if (tt && String(tt).trim()) {
            add({ title: String(tt).trim(), body: '' });
        }
        return out.length ? out : FALLBACK_TICKER.slice();
    }

    function renderAutismTicker(cms) {
        const wrap = document.getElementById('scrolling-announce-wrap');
        const track = document.getElementById('scrolling-announce-track');
        if (!wrap || !track) return;

        const items = mergeTickerItems(cms || {});
        if (!items.length) {
            wrap.classList.add('hidden');
            track.innerHTML = '';
            return;
        }

        wrap.classList.remove('hidden');
        const line = items.map((it) => itemLabel(it)).filter(Boolean).join('   ·   ');
        track.className = 'cg-ticker-track ak-ticker-marquee';
        track.innerHTML = '<span class="cg-ticker-item">' + esc(line) + '</span>';
        const dur = Math.min(48, Math.max(20, 16 + line.length * 0.14));
        track.style.setProperty('--ak-ticker-dur', dur + 's');
    }

    window.renderCongressTicker = function renderCongressTickerAutism(items) {
        if (Array.isArray(items) && items.length && (items[0].title || items[0].body)) {
            renderAutismTicker({ scrollingAnnouncements: items });
            return;
        }
        renderAutismTicker(items && typeof items === 'object' ? items : { scrollingAnnouncements: items || [] });
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
            const cmsRes = await fetch('/api/public/site-cms', { cache: 'no-store' });
            const merged = cmsRes.ok ? await cmsRes.json() : {};
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
