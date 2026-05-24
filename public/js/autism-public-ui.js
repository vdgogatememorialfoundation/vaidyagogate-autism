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
        if (key === 'gallery') {
            a.remove();
            return;
        }
        if (NAV_LABELS[key]) a.textContent = NAV_LABELS[key];
    });

    document.querySelectorAll('footer a[data-menu-key="gallery"]').forEach((a) => {
        const li = a.closest('li');
        if (li) li.remove();
        else a.remove();
    });

    if (window.VGMF_QUICK_ACCESS) {
        window.VGMF_QUICK_ACCESS = window.VGMF_QUICK_ACCESS.filter((c) => c.section !== 'gallery');
    }
    if (typeof window.renderQuickAccess === 'function') window.renderQuickAccess();

    const fab = document.getElementById('cg-fab-register');
    if (fab) {
        fab.innerHTML = '<i class="fas fa-heart" aria-hidden="true"></i> Join us';
    }

    document.querySelectorAll('.cg-utility-signup').forEach((el) => {
        if (el.textContent.includes('Create account')) {
            el.innerHTML = '<i class="fas fa-user-plus"></i> Sign up free';
        }
    });
})();
