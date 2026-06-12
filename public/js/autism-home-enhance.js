/**
 * Autism homepage v2 — scroll reveal, FAQ accordion, quick nav
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-v2')) return;

    const FAQ = [
        {
            q: 'Who can register?',
            a: 'Children, parents, teachers, and volunteers can create a free account and join the Autism Awareness Programme.'
        },
        {
            q: 'Is there a registration fee?',
            a: 'No. This programme is free. You only need to sign up, pre-register, and complete registration to get your e-ticket.'
        },
        {
            q: 'How do I get my e-ticket?',
            a: 'After you complete registration in your dashboard, download your e-ticket from the portal and bring it on event day.'
        },
        {
            q: 'Can I enter competitions?',
            a: 'Yes! During registration you can upload creative entries — drawings, photos, videos, or stories — as described in your dashboard.'
        }
    ];

    function renderFaq(items) {
        const list = document.getElementById('faq-list');
        const section = document.getElementById('faq-section');
        if (!list) return;
        const data =
            Array.isArray(items) && items.length
                ? items.filter((f) => f && (f.q || f.a)).map((f) => ({ q: f.q, a: f.a }))
                : FAQ;
        if (!data.length) return;
        list.dataset.akV2 = '1';
        if (section) section.classList.remove('hidden');
        list.innerHTML = data
            .map(
                (item, i) =>
                    '<div class="ak-faq-item' +
                    (i === 0 ? ' is-open' : '') +
                    '">' +
                    '<button type="button" class="ak-faq-q" aria-expanded="' +
                    (i === 0 ? 'true' : 'false') +
                    '">' +
                    item.q +
                    ' <i class="fas fa-chevron-down" aria-hidden="true"></i></button>' +
                    '<div class="ak-faq-a">' +
                    item.a +
                    '</div></div>'
            )
            .join('');
        list.querySelectorAll('.ak-faq-q').forEach((btn) => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.ak-faq-item');
                const open = item.classList.contains('is-open');
                list.querySelectorAll('.ak-faq-item').forEach((el) => {
                    el.classList.remove('is-open');
                    el.querySelector('.ak-faq-q').setAttribute('aria-expanded', 'false');
                });
                if (!open) {
                    item.classList.add('is-open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
    }

    window.akRenderFaq = renderFaq;

    function revealOnScroll() {
        const els = document.querySelectorAll('.ak-reveal-v2, .ak-reveal');
        const show = (el) => el.classList.add('is-visible');
        const markInViewport = () => {
            const vh = window.innerHeight || document.documentElement.clientHeight;
            els.forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.top < vh * 0.92 && r.bottom > 0) show(el);
            });
        };
        markInViewport();
        if (!('IntersectionObserver' in window)) {
            els.forEach(show);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        show(e.target);
                        io.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
        );
        els.forEach((el) => {
            if (!el.classList.contains('is-visible')) io.observe(el);
        });
        window.setTimeout(() => els.forEach(show), 2500);
    }

    function wireQuickLinks() {
        document.querySelectorAll('[data-ak-section]').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const sec = a.getAttribute('data-ak-section');
                if (typeof showSection === 'function' && sec) showSection(sec);
            });
        });
    }

    function init() {
        renderFaq();
        revealOnScroll();
        wireQuickLinks();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
