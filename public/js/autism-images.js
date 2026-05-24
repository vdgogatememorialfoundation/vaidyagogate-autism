/**
 * Reliable hero/gallery images (Picsum seeds) + fallback if primary URL fails.
 */
(function () {
    'use strict';

    const IMG_MAP = {
        'ak-hero-main': 'https://picsum.photos/seed/autism-hero-main/800/800',
        'ak-hero-a': 'https://picsum.photos/seed/autism-hero-a/600/600',
        'ak-hero-b': 'https://picsum.photos/seed/autism-hero-b/600/600',
        'ak-hero-c': 'https://picsum.photos/seed/autism-hero-c/600/600',
        'ak-g1': 'https://picsum.photos/seed/autism-g1/500/320',
        'ak-g2': 'https://picsum.photos/seed/autism-g2/500/320',
        'ak-g3': 'https://picsum.photos/seed/autism-g3/500/320',
        'ak-g4': 'https://picsum.photos/seed/autism-g4/500/320',
        'ak-g5': 'https://picsum.photos/seed/autism-g5/500/320'
    };

    function applySrc(img, key) {
        const url = IMG_MAP[key];
        if (!url) return;
        img.src = url;
        img.loading = img.loading || 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
    }

    function init() {
        const main = document.querySelector('.ak-photo-main img');
        if (main) applySrc(main, 'ak-hero-main');
        const a = document.querySelector('.ak-photo-a img');
        if (a) applySrc(a, 'ak-hero-a');
        const b = document.querySelector('.ak-photo-b img');
        if (b) applySrc(b, 'ak-hero-b');
        const c = document.querySelector('.ak-photo-c img');
        if (c) applySrc(c, 'ak-hero-c');
        document.querySelectorAll('.ak-gallery-row img').forEach((img, i) => {
            applySrc(img, 'ak-g' + (i + 1));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
