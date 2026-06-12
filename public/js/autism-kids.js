/**
 * Children-friendly site: scroll reveals, gentle interactions.
 */
(function () {
    'use strict';

    function showJourneySteps() {
        document.querySelectorAll('.ak-journey .ak-step').forEach((el) => el.classList.add('ak-visible'));
    }

    function initReveal() {
        showJourneySteps();
        const reveals = document.querySelectorAll('.ak-reveal');
        const all = [...reveals];
        if (!all.length) return;

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add('ak-visible');
                        io.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -24px 0px' }
        );
        all.forEach((el, i) => {
            if (el.classList.contains('ak-step')) {
                el.style.transitionDelay = i * 0.08 + 's';
            }
            io.observe(el);
        });
    }

    window.akShowJourneySteps = showJourneySteps;

    function initHeroCta() {
        document.querySelectorAll('[data-ak-goto-dashboard]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const logged = localStorage.getItem('seminar_doctor_user');
                if (logged) {
                    e.preventDefault();
                    window.location.href = '/dashboard';
                } else if (typeof openAuthModal === 'function') {
                    e.preventDefault();
                    openAuthModal('login');
                }
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initReveal();
        initHeroCta();
        document.body.classList.add('ak-ready');
    });
})();
