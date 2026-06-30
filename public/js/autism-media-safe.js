/**
 * Autism public site: allow only curated /images/autism/* photos; block random CMS uploads.
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('autism-kids')) return;

    const ALLOWED_IMG = /^\/images\/autism\/[^?#]+\.(jpe?g|png|webp|avif)$/i;

    function initials(name) {
        const p = String(name || '?')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (!p.length) return '?';
        return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }

    function isAllowedSrc(src) {
        if (!src) return false;
        if (src.endsWith('.svg') && src.includes('/images/autism/')) return true;
        return ALLOWED_IMG.test(src.split('?')[0]);
    }

    function stripImg(img) {
        if (!img || img.dataset.akSafe === '1') return;
        const src = img.getAttribute('src') || '';
        if (isAllowedSrc(src)) {
            img.dataset.akSafe = '1';
            return;
        }
        if (/\.(jpe?g|png|webp|gif)/i.test(src)) {
            img.remove();
        }
    }

    function stripAll(root) {
        (root || document).querySelectorAll('img').forEach(stripImg);
    }

    // Allow faculty/speaker photos - REMOVED blocking
    // function speakerAvatarsOnly() {
    //     document.querySelectorAll('#speakers-grid .speaker-photo-wrap').forEach((wrap) => {
    //         const card = wrap.closest('.speaker-card');
    //         const name = card && card.querySelector('h3') ? card.querySelector('h3').textContent : '';
    //         const div = document.createElement('div');
    //         div.className = 'speaker-avatar ak-speaker-initial';
    //         div.setAttribute('aria-hidden', 'true');
    //         div.textContent = initials(name);
    //         wrap.replaceWith(div);
    //     });
    // }

    function hideGallery() {
        document.getElementById('gallerySection')?.remove();
        document.querySelectorAll('#gallery-grid, .vgmf-gallery-thumb, .ak-photo-showcase').forEach((el) => el.remove());
    }

    function sanitizeHeroBanners() {
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
            // speakerAvatarsOnly(); // Allow speaker photos to show
            hideGallery();
            sanitizeHeroBanners();
        };
        window.applySiteCms.__akSafe = true;
    }

    function init() {
        stripAll();
        hideGallery();
        sanitizeHeroBanners();
        patchApplyCms();
        const obs = new MutationObserver(() => {
            stripAll();
            // speakerAvatarsOnly(); // Allow speaker photos
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
