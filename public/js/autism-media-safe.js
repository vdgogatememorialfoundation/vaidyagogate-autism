/**
 * Autism public site: block stock/CMS photos; use safe placeholders only.
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('autism-kids')) return;

    const BLOCKED = /\/images\/autism\/.*\.(jpe?g|png|webp)/i;

    function initials(name) {
        const p = String(name || '?')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (!p.length) return '?';
        return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }

    function stripImg(img) {
        if (!img || img.dataset.akSafe === '1') return;
        const src = img.getAttribute('src') || '';
        if (BLOCKED.test(src) || (/\/uploads\//i.test(src) && /\.(jpe?g|png|webp)/i.test(src))) {
            img.remove();
            return;
        }
        img.dataset.akSafe = '1';
    }

    function stripAll(root) {
        (root || document).querySelectorAll('img').forEach(stripImg);
    }

    function speakerAvatarsOnly() {
        document.querySelectorAll('#speakers-grid .speaker-photo-wrap').forEach((wrap) => {
            const card = wrap.closest('.speaker-card');
            const name = card && card.querySelector('h3') ? card.querySelector('h3').textContent : '';
            const div = document.createElement('div');
            div.className = 'speaker-avatar ak-speaker-initial';
            div.setAttribute('aria-hidden', 'true');
            div.textContent = initials(name);
            wrap.replaceWith(div);
        });
    }

    function hideGallery() {
        const g = document.getElementById('gallerySection');
        if (g) g.classList.add('hidden');
        document.querySelectorAll('#gallery-grid img, .vgmf-gallery-thumb').forEach((el) => el.remove());
    }

    function hideRiskyHero() {
        const root = document.getElementById('congress-hero-root');
        if (root) root.style.display = 'none';
        document.querySelectorAll('.congress-hero-bg[style*="background-image"]').forEach((el) => {
            el.style.backgroundImage = 'none';
            el.style.background = 'linear-gradient(135deg,#2563eb,#7c3aed)';
        });
        const sap = document.getElementById('sap-image');
        if (sap) {
            sap.classList.add('hidden');
            sap.removeAttribute('src');
        }
    }

    function patchApplyCms() {
        if (typeof window.applySiteCms !== 'function' || window.applySiteCms.__akSafe) return;
        const orig = window.applySiteCms;
        window.applySiteCms = function (cms) {
            orig(cms);
            stripAll();
            speakerAvatarsOnly();
            hideGallery();
            hideRiskyHero();
        };
        window.applySiteCms.__akSafe = true;
    }

    function init() {
        stripAll();
        hideGallery();
        hideRiskyHero();
        patchApplyCms();
        const obs = new MutationObserver(() => {
            stripAll();
            speakerAvatarsOnly();
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
