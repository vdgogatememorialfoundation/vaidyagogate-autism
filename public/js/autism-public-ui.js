/**
 * Autism portal: simpler labels, touch-friendly tweaks, page-specific home chrome, no gallery nav.
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

    function stripGalleryNav() {
        document
            .querySelectorAll(
                '#cg-nav-menu-links a[data-nav-section="gallery"], footer a[data-menu-key="gallery"], .ak-quick-link[data-ak-section="gallery"]'
            )
            .forEach((el) => el.remove());
    }

    function filterCmsMenu(cms) {
        if (!cms || !Array.isArray(cms.siteMenu)) return cms;
        const filtered = cms.siteMenu.filter((i) => String((i && i.section) || '').toLowerCase() !== 'gallery');
        // Always add prereg-search item if not present
        const hasPrereg = filtered.some((i) => String((i.section || '')).toLowerCase() === 'prereg-search');
        if (!hasPrereg) {
            filtered.push({
                label: 'Find registration',
                section: 'prereg-search',
                href: '/preregister/search',
                visible: true,
                order: 4,
                key: 'prereg-search'
            });
        }
        return { ...cms, siteMenu: filtered };
    }

    const NAV_ICONS = {
        about: 'fa-heart',
        schedule: 'fa-calendar-days',
        'prereg-search': 'fa-search',
        verify: 'fa-search',
        contact: 'fa-envelope',
        home: 'fa-home'
    };

    document.querySelectorAll('[data-nav-section]').forEach((a) => {
        const key = a.getAttribute('data-nav-section');
        if (NAV_LABELS[key]) {
            const icon = NAV_ICONS[key] || 'fa-circle';
            a.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i> ' + NAV_LABELS[key];
        }
    });

    const fab = document.getElementById('cg-fab-register');
    if (fab) {
        fab.innerHTML = '<i class="fas fa-heart" aria-hidden="true"></i> Join us';
    }

    document.querySelectorAll('.cg-utility-signup').forEach((el) => {
        el.innerHTML = '<i class="fas fa-user-plus" aria-hidden="true"></i> Sign up free';
    });

    if (typeof window.applySiteMenu === 'function' && !window.applySiteMenu.__akNoGallery) {
        const origMenu = window.applySiteMenu;
        window.applySiteMenu = function (cms) {
            origMenu(filterCmsMenu(cms));
            stripGalleryNav();
        };
        window.applySiteMenu.__akNoGallery = true;
    }

    stripGalleryNav();
})();
