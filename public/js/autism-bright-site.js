(function () {
    'use strict';
    if (!document.body.classList.contains('ab-site')) return;

    const yearEl = document.getElementById('ab-hero-year');
    if (yearEl) {
        const dateText = (document.getElementById('top-date') || {}).textContent || '';
        const m = dateText.match(/20\d{2}/);
        yearEl.textContent = m ? m[0] : String(new Date().getFullYear());
    }

    const onScroll = () => {
        document.body.classList.toggle('ab-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const revealTargets = document.querySelectorAll(
        '.ak-pillar, .ak-step, .ak-bento-card, .vg-stat, .feature-card, .speaker-card, .ak-cta-band, .ab-trust, .ab-art-card'
    );
    revealTargets.forEach((el, i) => {
        el.classList.add('ab-reveal');
        el.style.transitionDelay = ((i % 6) * 70) + 'ms';
    });
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add('ab-in');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12 });
        revealTargets.forEach((el) => io.observe(el));
    } else {
        revealTargets.forEach((el) => el.classList.add('ab-in'));
    }

    const statsGrid = document.getElementById('vg-stats-grid');
    if (statsGrid && 'MutationObserver' in window) {
        const countUp = (strong) => {
            const raw = strong.textContent.trim();
            const num = parseInt(raw.replace(/[^\d]/g, ''), 10);
            if (!Number.isFinite(num) || num <= 0 || strong.dataset.abCounted) return;
            strong.dataset.abCounted = '1';
            const suffix = raw.replace(/[\d,\s]/g, '');
            const start = performance.now();
            const dur = 1100;
            const tick = (now) => {
                const p = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                strong.textContent = Math.round(num * eased).toLocaleString('en-IN') + suffix;
                if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };
        const mo = new MutationObserver(() => {
            statsGrid.querySelectorAll('.vg-stat strong').forEach(countUp);
        });
        mo.observe(statsGrid, { childList: true, subtree: true });
    }
})();
