/**
 * Load homepage photos from API (folder scan + admin uploads). Refreshes periodically.
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('autism-kids')) return;

    const POLL_MS = 180000;
    let lastJson = '';

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function cacheBust(src) {
        const sep = src.indexOf('?') >= 0 ? '&' : '?';
        return src + sep + 'v=' + Date.now();
    }

    function applyHero(hero) {
        const main = document.querySelector('.ak-hero-photo-main');
        const subs = document.querySelectorAll('.ak-hero-photo-sub');
        if (main && hero[0]) {
            main.src = cacheBust(hero[0].src);
            main.alt = 'Children at the autism awareness programme';
        }
        if (subs[0] && hero[1]) subs[0].src = cacheBust(hero[1].src);
        if (subs[1] && hero[2]) subs[1].src = cacheBust(hero[2].src);
    }

    function applyShowcase(gallery) {
        const grid = document.getElementById('ak-photo-showcase-grid');
        if (!grid || !gallery.length) return;
        const captions = ['Together outdoors', 'School programme', 'Learning together', 'Play & friendship', 'Community smiles', 'Event day'];
        grid.innerHTML = gallery
            .slice(0, 6)
            .map((img, i) => {
                const large = i === 0 ? ' ak-showcase-large' : '';
                return (
                    '<figure class="ak-showcase-item' +
                    large +
                    '"><img src="' +
                    esc(cacheBust(img.src)) +
                    '" alt="' +
                    esc(captions[i] || 'Programme photo') +
                    '" loading="lazy" decoding="async"><figcaption>' +
                    esc(captions[i] || 'Our programme') +
                    '</figcaption></figure>'
                );
            })
            .join('');
    }

    async function refresh() {
        try {
            const r = await fetch('/api/public/autism-site-images');
            const data = await r.json();
            if (!r.ok) return;
            const json = JSON.stringify(data);
            if (json === lastJson) return;
            lastJson = json;
            const hero = data.hero && data.hero.length ? data.hero : data.images || [];
            const gallery =
                data.gallery && data.gallery.length
                    ? data.gallery
                    : (data.images || []).slice(0, 6);
            if (hero.length) applyHero(hero);
            if (gallery.length) applyShowcase(gallery);
        } catch (_) {}
    }

    function init() {
        refresh();
        setInterval(refresh, POLL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
