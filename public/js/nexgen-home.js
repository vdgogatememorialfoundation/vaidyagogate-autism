/**
 * NexGen AI homepage — particles, scroll animations, counters, UX polish
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('nexgen-ai')) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── Preloader ───────────────────────────────────────── */
    function hidePreloader() {
        const el = document.getElementById('site-preloader');
        if (!el || el.classList.contains('done')) return;
        el.classList.add('done');
        setTimeout(() => {
            el.style.display = 'none';
        }, 650);
    }

    /* ── Floating particles ─────────────────────────────── */
    function initParticles() {
        if (reducedMotion) return;
        const canvas = document.getElementById('nx-particles');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let w = 0;
        let h = 0;
        let dots = [];
        const COUNT = 48;

        function resize() {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        }

        function seed() {
            dots = [];
            for (let i = 0; i < COUNT; i++) {
                dots.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 0.6 + Math.random() * 1.8,
                    vx: (Math.random() - 0.5) * 0.35,
                    vy: (Math.random() - 0.5) * 0.35,
                    hue: Math.random() > 0.5 ? 187 : 270
                });
            }
        }

        function draw() {
            ctx.clearRect(0, 0, w, h);
            dots.forEach((d) => {
                d.x += d.vx;
                d.y += d.vy;
                if (d.x < 0) d.x = w;
                if (d.x > w) d.x = 0;
                if (d.y < 0) d.y = h;
                if (d.y > h) d.y = 0;
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fillStyle = 'hsla(' + d.hue + ', 90%, 65%, 0.45)';
                ctx.fill();
            });
            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const a = dots[i];
                    const b = dots[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        ctx.strokeStyle = 'rgba(34, 211, 238, ' + (0.12 * (1 - dist / 120)) + ')';
                        ctx.lineWidth = 0.6;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(draw);
        }

        resize();
        seed();
        draw();
        window.addEventListener('resize', () => {
            resize();
            seed();
        });
    }

    /* ── Header on scroll ─────────────────────────────── */
    function initHeaderScroll() {
        const header = document.getElementById('cg-header');
        if (!header) return;
        let ticking = false;
        window.addEventListener(
            'scroll',
            () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    header.classList.toggle('nx-header-scrolled', window.scrollY > 24);
                    ticking = false;
                });
            },
            { passive: true }
        );
    }

    /* ── Stagger children reveal ──────────────────────── */
    function initStaggerReveal() {
        const groups = document.querySelectorAll('.nx-stagger');
        if (!('IntersectionObserver' in window)) return;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    e.target.classList.add('nx-stagger-active');
                    io.unobserve(e.target);
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
        );
        groups.forEach((g) => io.observe(g));
        if (reducedMotion) groups.forEach((g) => g.classList.add('nx-stagger-active'));
    }

    /* ── Stat counter animation ───────────────────────── */
    function animateValue(el, end, suffix) {
        const duration = 1400;
        const start = 0;
        const t0 = performance.now();
        function tick(now) {
            const p = Math.min(1, (now - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = Math.round(start + (end - start) * eased);
            el.textContent = val + (suffix || '');
            if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function initStatCounters() {
        const grid = document.getElementById('vg-stats-grid');
        if (!grid || reducedMotion) return;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    grid.querySelectorAll('.vg-stat strong').forEach((strong) => {
                        if (strong.dataset.nxCounted) return;
                        const raw = strong.textContent.trim();
                        const num = parseInt(raw.replace(/[^\d]/g, ''), 10);
                        const suffix = raw.replace(/[\d,]/g, '');
                        if (!Number.isNaN(num) && num > 0 && num < 100000) {
                            strong.dataset.nxCounted = '1';
                            animateValue(strong, num, suffix);
                        }
                    });
                    io.disconnect();
                });
            },
            { threshold: 0.3 }
        );
        io.observe(grid);
    }

    /* ── Hero typing line (decorative) ────────────────── */
    function initHeroTyping() {
        if (reducedMotion) return;
        const el = document.getElementById('nx-typing-line');
        if (!el) return;
        const phrases = [
            'Smart email reminders',
            'One-click e-tickets',
            'Free for every family',
            'Competitions & certificates'
        ];
        let pi = 0;
        let ci = 0;
        let deleting = false;
        function type() {
            const phrase = phrases[pi];
            if (!deleting) {
                ci++;
                el.textContent = phrase.slice(0, ci);
                if (ci === phrase.length) {
                    deleting = true;
                    setTimeout(type, 2200);
                    return;
                }
                setTimeout(type, 55);
            } else {
                ci--;
                el.textContent = phrase.slice(0, ci);
                if (ci === 0) {
                    deleting = false;
                    pi = (pi + 1) % phrases.length;
                    setTimeout(type, 400);
                    return;
                }
                setTimeout(type, 28);
            }
        }
        type();
    }

    /* ── Ripple on primary buttons ────────────────────── */
    function initRipples() {
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('.ak-btn-v2-primary, .nx-btn-glow');
            if (!btn) return;
            const r = document.createElement('span');
            r.className = 'nx-ripple';
            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            r.style.width = r.style.height = size + 'px';
            r.style.left = e.clientX - rect.left - size / 2 + 'px';
            r.style.top = e.clientY - rect.top - size / 2 + 'px';
            btn.appendChild(r);
            setTimeout(() => r.remove(), 600);
        });
    }

    /* ── Sticky mobile CTA visibility ───────────────── */
    function initStickyCta() {
        const bar = document.getElementById('nx-sticky-cta');
        if (!bar) return;
        const hero = document.getElementById('ak-hero');
        if (!hero || !('IntersectionObserver' in window)) return;
        const io = new IntersectionObserver(
            ([e]) => {
                bar.classList.toggle('nx-sticky-visible', !e.isIntersecting);
            },
            { threshold: 0 }
        );
        io.observe(hero);
    }

    function init() {
        initParticles();
        initHeaderScroll();
        initStaggerReveal();
        initStatCounters();
        initHeroTyping();
        initRipples();
        initStickyCta();
        window.addEventListener('load', hidePreloader, { once: true });
        setTimeout(hidePreloader, 4500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
