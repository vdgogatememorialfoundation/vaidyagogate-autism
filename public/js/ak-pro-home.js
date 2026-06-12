/**
 * Professional homepage — animations, gallery from site images manifest.
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-pro-site')) return;

    const GALLERY_CAPTIONS = [
        'Community together',
        'Creative learning',
        'Programme day',
        'Families & schools',
        'Inclusive play',
        'Celebrating strengths'
    ];

    const DEFAULT_GALLERY = [
        '/images/autism/gallery-1.jpg',
        '/images/autism/gallery-2.jpg',
        '/images/autism/gallery-3.jpg',
        '/images/autism/hero-c.jpg',
        '/images/autism/istockphoto-1696713978-612x612.jpg',
        '/images/autism/UjxUnpMLv1627V4EJsmq.jpg'
    ];

    const HERO_SIDE = '/images/autism/hero-c.jpg';

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function cacheBust(src) {
        if (!src) return '';
        const sep = src.indexOf('?') >= 0 ? '&' : '?';
        return src + sep + 'v=' + Date.now();
    }

    function uniqueSrcs(list) {
        const seen = new Set();
        const out = [];
        (list || []).forEach((item) => {
            const src = typeof item === 'string' ? item : item && item.src;
            if (!src || seen.has(src)) return;
            seen.add(src);
            out.push(src);
        });
        return out;
    }

    function renderGallery(srcs) {
        const grid = document.getElementById('ak-photo-showcase-grid');
        if (!grid) return;
        const spans = ['pro-gal-span-7', 'pro-gal-span-5', 'pro-gal-span-4', 'pro-gal-span-4', 'pro-gal-span-4', 'pro-gal-span-4'];
        const images = uniqueSrcs(srcs).slice(0, 6);
        if (!images.length) return;
        grid.innerHTML = images
            .map((src, i) => {
                const span = spans[i] || 'pro-gal-span-4';
                return (
                    '<figure class="pro-gal-item ' +
                    span +
                    '">' +
                    '<img src="' +
                    esc(cacheBust(src)) +
                    '" alt="' +
                    esc(GALLERY_CAPTIONS[i] || 'Programme moment') +
                    '" loading="lazy" decoding="async">' +
                    '<figcaption>' +
                    esc(GALLERY_CAPTIONS[i] || 'Our programme') +
                    '</figcaption></figure>'
                );
            })
            .join('');
    }

    window.__akProRenderGallery = renderGallery;

    function applyHeroImages(heroList) {
        const main = document.querySelector('.ak-hero-photo-main');
        const side = document.querySelector('.pro-hero-side-card img');
        const list = uniqueSrcs(heroList);
        if (main && list[0]) {
            main.src = cacheBust(list[0]);
            main.alt = 'Autism Awareness Programme — welcoming community';
        }
        if (side) {
            const sideSrc = list.find((s) => s !== (main && main.src.split('?')[0])) || HERO_SIDE;
            side.src = cacheBust(sideSrc);
            side.alt = 'Families and children at the programme';
        }
    }

    function addStepNumbers() {
        document.querySelectorAll('.ak-steps .ak-step').forEach((step, idx) => {
            if (step.querySelector('.pro-step-num')) return;
            const iconWrap = step.querySelector('.ak-step-icon');
            if (!iconWrap) return;
            const num = document.createElement('span');
            num.className = 'pro-step-num';
            num.textContent = String(idx + 1);
            num.setAttribute('aria-hidden', 'true');
            iconWrap.style.position = 'relative';
            iconWrap.appendChild(num);
        });
    }

    function wrapStepsTimeline() {
        const steps = document.querySelector('.ak-steps');
        if (!steps || steps.classList.contains('pro-timeline')) return;
        steps.classList.add('pro-timeline');
    }

    function animateStats() {
        const grid = document.getElementById('vg-stats-grid');
        if (!grid || !('IntersectionObserver' in window)) return;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    e.target.querySelectorAll('.vg-stat strong').forEach((el) => {
                        el.classList.add('pro-stat-pulse');
                    });
                    io.unobserve(e.target);
                });
            },
            { threshold: 0.3 }
        );
        io.observe(grid);
    }

    async function loadManifestGallery() {
        try {
            const r = await fetch('/images/autism/manifest.json', { cache: 'no-store' });
            if (!r.ok) return null;
            return await r.json();
        } catch (_) {
            return null;
        }
    }

    async function refreshImages() {
        let gallery = DEFAULT_GALLERY.map((src) => ({ src }));
        let hero = [{ src: '/images/autism/hero-main.jpg' }];

        try {
            const api = await fetch('/api/public/autism-site-images');
            const data = await api.json();
            if (api.ok) {
                if (data.hero && data.hero.length) hero = data.hero;
                if (data.gallery && data.gallery.length) gallery = data.gallery;
                else if (data.images && data.images.length) {
                    const all = data.images;
                    hero = all.slice(0, 1);
                    gallery = all.filter((img) => {
                        const s = img.src || img;
                        return s && s !== (hero[0].src || hero[0]);
                    });
                }
            }
        } catch (_) {}

        const manifest = await loadManifestGallery();
        if (manifest && Array.isArray(manifest.images) && manifest.images.length) {
            const names = manifest.images.map((i) => i.src);
            const galNames = names.filter(
                (s) =>
                    /gallery|istock|360_F|UjxUnp|group-happy|playing-colourful|hero-c/i.test(s) &&
                    !/hero-main|hero-a\.|hero-b\./i.test(s)
            );
            if (galNames.length >= 3) gallery = galNames.slice(0, 6).map((src) => ({ src }));
            const mainHero = names.find((s) => /hero-main/i.test(s));
            if (mainHero) hero = [{ src: mainHero }];
        }

        applyHeroImages(hero);
        renderGallery(gallery);
    }

    function init() {
        wrapStepsTimeline();
        addStepNumbers();
        animateStats();
        renderGallery(DEFAULT_GALLERY.map((src) => ({ src })));
        refreshImages();
        setInterval(refreshImages, 180000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
