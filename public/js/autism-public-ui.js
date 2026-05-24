/**
 * Autism portal: simpler labels and touch-friendly tweaks on the public site.
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('autism-kids')) return;

    const NAV_LABELS = {
        about: 'About us',
        schedule: 'Programme',
        verify: 'Find my registration',
        contact: 'Get in touch'
    };

    document.querySelectorAll('[data-nav-section]').forEach((a) => {
        const key = a.getAttribute('data-nav-section');
        if (NAV_LABELS[key]) a.textContent = NAV_LABELS[key];
    });

    const fab = document.getElementById('cg-fab-register');
    if (fab) {
        fab.innerHTML = '<i class="fas fa-heart" aria-hidden="true"></i> Join us';
    }

    document.querySelectorAll('.cg-utility-signup').forEach((el) => {
        if (el.textContent.includes('Create account')) {
            el.innerHTML = '<i class="fas fa-user-plus"></i> Sign up free';
        }
    });

    function removeGalleryNav() {
        document
            .querySelectorAll('[data-nav-section="gallery"], [data-menu-key="gallery"], a[href*="gallery"]')
            .forEach((el) => el.remove());
        const foot = document.getElementById('footer-explore-links');
        if (foot) {
            foot.querySelectorAll('a').forEach((a) => {
                if (/gallery/i.test(a.textContent || '') || a.getAttribute('data-menu-key') === 'gallery') {
                    a.closest('li')?.remove();
                }
            });
        }
    }

    removeGalleryNav();
    document.addEventListener('DOMContentLoaded', removeGalleryNav);
})();
