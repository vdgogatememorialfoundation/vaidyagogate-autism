/* Horizontal left/right scroll slider for wide tables in the admin / co-admin / staff console. */
(function () {
    'use strict';

    const STEP = 260;
    /* Form-builder tables whose parents insert siblings relative to the <table>. */
    const SKIP = '#tab-reg-form';

    function buildControls(wrap) {
        const bar = document.createElement('div');
        bar.className = 'tsx-bar';
        bar.innerHTML =
            '<button type="button" class="tsx-btn tsx-left" aria-label="Scroll table left"><i class="fas fa-chevron-left"></i></button>' +
            '<input type="range" class="tsx-range" min="0" max="1000" value="0" step="1" aria-label="Scroll table horizontally">' +
            '<button type="button" class="tsx-btn tsx-right" aria-label="Scroll table right"><i class="fas fa-chevron-right"></i></button>';
        const range = bar.querySelector('.tsx-range');
        const left = bar.querySelector('.tsx-left');
        const right = bar.querySelector('.tsx-right');

        const maxScroll = () => Math.max(0, wrap.scrollWidth - wrap.clientWidth);
        const sync = () => {
            const max = maxScroll();
            bar.classList.toggle('tsx-hidden', max < 4);
            range.value = max ? Math.round((wrap.scrollLeft / max) * 1000) : 0;
            left.disabled = wrap.scrollLeft <= 1;
            right.disabled = wrap.scrollLeft >= max - 1;
        };
        range.addEventListener('input', () => {
            wrap.scrollLeft = (Number(range.value) / 1000) * maxScroll();
        });
        left.addEventListener('click', () => wrap.scrollBy({ left: -STEP, behavior: 'smooth' }));
        right.addEventListener('click', () => wrap.scrollBy({ left: STEP, behavior: 'smooth' }));
        wrap.addEventListener('scroll', sync, { passive: true });
        if ('ResizeObserver' in window) {
            new ResizeObserver(sync).observe(wrap);
            const table = wrap.querySelector('table');
            if (table) new ResizeObserver(sync).observe(table);
        }
        window.addEventListener('resize', sync);
        bar.__sync = sync;
        return bar;
    }

    function enhance(table) {
        if (!table || table.__tsxDone) return;
        if (table.closest('.tsx-wrap')) {
            table.__tsxDone = true;
            return;
        }
        if (!table.parentNode || !table.isConnected) return;
        if (table.closest(SKIP) || table.querySelector('#seminar-reg-override-tbody')) {
            table.__tsxDone = true;
            return;
        }
        table.__tsxDone = true;
        const wrap = document.createElement('div');
        wrap.className = 'tsx-wrap';
        table.replaceWith(wrap);
        wrap.appendChild(table);
        const bar = buildControls(wrap);
        wrap.after(bar);
        requestAnimationFrame(bar.__sync);
    }

    function scan(root) {
        (root || document).querySelectorAll('table.data-table, .tab-pane table').forEach(enhance);
    }

    function resyncAll() {
        document.querySelectorAll('.tsx-bar').forEach((b) => b.__sync && b.__sync());
    }

    document.addEventListener('DOMContentLoaded', () => {
        scan();
        const mo = new MutationObserver((muts) => {
            let added = false;
            muts.forEach((m) => {
                m.addedNodes.forEach((n) => {
                    if (n.nodeType !== 1) return;
                    if (n.matches && n.matches('table')) {
                        enhance(n);
                        added = true;
                    } else if (n.querySelectorAll) {
                        scan(n);
                        added = true;
                    }
                });
            });
            if (added || muts.length) resyncAll();
        });
        mo.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', () => setTimeout(resyncAll, 60), true);
    });
})();
