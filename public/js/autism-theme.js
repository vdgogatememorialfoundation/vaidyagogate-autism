/**
 * Autism portal UI: copy, labels, feature cards, auth modal.
 */
(function () {
    'use strict';

    const isPublic = document.body.classList.contains('ak-portal');
    const isDash = document.body.classList.contains('ak-portal-dash');

    const AUTISM_FEATURES = [
        { icon: 'fa-heart', title: 'Warm & welcoming', text: 'A safe, friendly programme for children, families, and schools.' },
        { icon: 'fa-palette', title: 'Creative fun', text: 'Join competitions — share drawings, photos, videos, and stories.' },
        { icon: 'fa-ticket-alt', title: 'Simple e-tickets', text: 'Sign up, pre-register, and download your pass in a few clicks.' },
        { icon: 'fa-hands-helping', title: 'Helpful team', text: 'Our volunteers guide you at every step — just ask!' }
    ];

    function patchPublicSite() {
        const authTitle = document.querySelector('#authModal h3');
        if (authTitle) {
            authTitle.textContent = 'Your account';
            authTitle.classList.add('ak-auth-title');
        }

        document.querySelectorAll('[data-menu-key="certificate"]').forEach((el) => {
            el.textContent = 'Verify certificate';
        });

        const verifyHead = document.querySelector('#verifySection .section-head h2');
        if (verifyHead && !verifyHead.dataset.akPatched) {
            verifyHead.innerHTML =
                '<i class="fas fa-search" aria-hidden="true"></i> Find your registration';
            verifyHead.dataset.akPatched = '1';
        }
        const verifySub = document.querySelector('#verifySection .section-head p');
        if (verifySub) verifySub.textContent = 'Search by name or application number';

        const semTitle = document.querySelector('#seminars-section .section-head h2');
        if (semTitle) semTitle.textContent = 'Join an event';
        const semSub = document.querySelector('#seminars-section .section-head p');
        if (semSub) semSub.textContent = 'Pick a programme and continue in your dashboard';

        const footerTag = document.getElementById('footer-tagline');
        if (footerTag) footerTag.textContent = 'Celebrating every child — Autism Awareness Programme';

        patchFeatureCards();
    }

    function patchFeatureCards() {
        const grid = document.getElementById('feature-cards-grid');
        if (!grid || grid.dataset.akFeatures === '1') return;
        grid.dataset.akFeatures = '1';
        grid.innerHTML = AUTISM_FEATURES.map(
            (c) =>
                '<article class="feature-card">' +
                '<div class="card-icon"><i class="fas ' +
                c.icon +
                '"></i></div>' +
                '<h3>' +
                c.title +
                '</h3><p>' +
                c.text +
                '</p></article>'
        ).join('');
    }

    function patchDashboard() {
        const title = document.getElementById('doctor-auth-title');
        if (title) title.textContent = 'Welcome back!';
        const loginHint = document.querySelector('#doctor-auth-login-panel p');
        if (loginHint) loginHint.textContent = 'Sign in to your participant dashboard.';
        const signupHint = document.querySelector('#doctor-auth-signup-panel p');
        if (signupHint) signupHint.textContent = 'Create a free account for the Autism Awareness Programme.';

        const sidebarTitle = document.querySelector('.sidebar-header p');
        if (sidebarTitle) sidebarTitle.textContent = 'Your dashboard';

        document.querySelectorAll('.sidebar-header h2').forEach((h) => {
            if (/doctor|portal/i.test(h.textContent)) h.textContent = 'My programme';
        });
    }

    function patchScanner() {
        const h2 = document.querySelector('#auth-overlay h2');
        if (h2) h2.innerHTML = '<i class="fas fa-qrcode"></i> Event check-in';
        const sub = document.querySelector('.auth-sub');
        if (sub) sub.textContent = 'Staff scanner — scan participant e-tickets at the venue.';
        const foot = document.querySelector('.auth-foot');
        if (foot) foot.textContent = 'Autism Awareness Programme · staff only';
        const eyebrow = document.querySelector('.scanner-eyebrow');
        if (eyebrow) eyebrow.textContent = 'Autism programme';
        const h1 = document.querySelector('.scanner-top h1');
        if (h1) h1.textContent = 'Scan e-tickets';
    }

    function observeFeatureGrid() {
        const grid = document.getElementById('feature-cards-grid');
        if (!grid) return;
        const obs = new MutationObserver(() => {
            if (grid.dataset.akFeatures !== '1' && grid.children.length) patchFeatureCards();
        });
        obs.observe(grid, { childList: true });
    }

    function init() {
        if (isPublic) {
            patchPublicSite();
            observeFeatureGrid();
            setTimeout(patchFeatureCards, 800);
            setTimeout(patchFeatureCards, 2500);
        }
        if (isDash) patchDashboard();
        if (document.body.classList.contains('ak-portal-scan')) patchScanner();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
