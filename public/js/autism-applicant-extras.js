/**
 * Applicant portal "bright" extras: welcome hero, journey progress, event countdown,
 * menu badges, animated counters, tips carousel, live indicator and focus refresh.
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-portal-dash')) return;

    const REFRESH_MS = 5000;
    let refreshTimer = null;
    let lastJourneyFp = '';
    let tipsTimer = null;
    let tipIdx = 0;

    const TIPS = [
        { icon: 'fa-clipboard-check', title: 'Pre-register first', text: 'Pre-registration is step 1. Once approved, the main registration form unlocks for your event.' },
        { icon: 'fa-qrcode', title: 'Keep your e-ticket handy', text: 'Your QR e-ticket shows the attendee count. Show it at the entry desk for a quick scan.' },
        { icon: 'fa-users', title: 'Attendees count', text: 'Coming with family? Enter the exact number of attendees so the seat count is reserved for everyone.' },
        { icon: 'fa-bell', title: 'Realtime tracking', text: 'Status changes appear here automatically — no need to refresh the page.' },
        { icon: 'fa-award', title: 'Certificates', text: 'Certificates appear under "Certificates" after the event once attendance is confirmed.' },
        { icon: 'fa-life-ring', title: 'Need help?', text: 'Raise a support ticket from the menu and our team will reply inside the portal.' }
    ];

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function uid() {
        if (typeof doctorNumericUserId === 'function') return doctorNumericUserId();
        const u = window.currentUser;
        const n = u ? parseInt(u.id != null ? u.id : u.user_id, 10) : NaN;
        return Number.isInteger(n) && n > 0 ? n : null;
    }

    function user() {
        return window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    }

    function greeting() {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    }

    function firstName() {
        const u = user();
        if (!u) return '';
        const n = u.first_name || (u.name ? String(u.name).split(' ')[0] : '') || '';
        return String(n).trim();
    }

    function fmtDate(v) {
        if (!v) return '';
        if (window.PortalDateTime && window.PortalDateTime.formatDateOnly) return window.PortalDateTime.formatDateOnly(v);
        if (window.PortalDateTime && window.PortalDateTime.formatDate) return window.PortalDateTime.formatDate(v);
        const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return String(v);
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function dateOnlyMs(v) {
        const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return NaN;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    }

    async function getJson(url) {
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error((j && j.error) || String(r.status));
        return j;
    }

    /* ---------------- decorative blobs ---------------- */
    function mountBlobs() {
        if (document.querySelector('.ab-blobs')) return;
        const wrap = document.createElement('div');
        wrap.className = 'ab-blobs';
        wrap.setAttribute('aria-hidden', 'true');
        wrap.innerHTML =
            '<span class="ab-blob ab-blob--1"></span><span class="ab-blob ab-blob--2"></span>' +
            '<span class="ab-blob ab-blob--3"></span><span class="ab-blob ab-blob--4"></span>' +
            '<i class="fas fa-puzzle-piece ab-puzzle" style="left:6%;top:14%;color:#0ea5e9;"></i>' +
            '<i class="fas fa-puzzle-piece ab-puzzle" style="right:6%;bottom:18%;color:#16a34a;animation-direction:reverse;"></i>';
        document.body.appendChild(wrap);
    }

    /* ---------------- header: live pill + copy id ---------------- */
    function mountHeaderBits() {
        const info = document.querySelector('.top-header .user-info');
        if (info && !document.getElementById('ab-live-pill')) {
            const pill = document.createElement('span');
            pill.id = 'ab-live-pill';
            pill.className = 'ab-live-pill';
            pill.title = 'Your registrations refresh automatically';
            pill.innerHTML = '<i class="fas fa-circle"></i> Live';
            info.insertBefore(pill, info.firstChild);
        }
        const idEl = document.getElementById('header-id');
        if (idEl && !idEl.dataset.abCopy) {
            idEl.dataset.abCopy = '1';
            idEl.title = 'Click to copy your Applicant ID';
            idEl.addEventListener('click', () => {
                const txt = idEl.textContent.replace(/^ID:\s*/i, '').trim();
                if (!txt || txt === '—' || !navigator.clipboard) return;
                navigator.clipboard.writeText(txt).then(() => {
                    const prev = idEl.textContent;
                    idEl.textContent = 'Copied!';
                    setTimeout(() => { idEl.textContent = prev; }, 1200);
                }).catch(() => {});
            });
        }
    }

    /* ---------------- dashboard widgets ---------------- */
    function mountDashboardWidgets() {
        const pane = document.getElementById('tab-dashboard');
        if (!pane || document.getElementById('ab-hero')) return;
        const title = pane.querySelector('.section-title');
        const lead = title ? title.nextElementSibling : null;
        const wrap = document.createElement('div');
        wrap.id = 'ab-hero';
        wrap.innerHTML =
            '<div class="ab-hero">' +
            '<div class="ab-hero-card">' +
            '<div class="ab-hero-eyebrow">Autism Awareness Programme</div>' +
            '<h2 id="ab-hero-title">Welcome!</h2>' +
            '<p id="ab-hero-text">Register, track and manage your participation — everything updates live.</p>' +
            '<div class="ab-hero-chips">' +
            '<button type="button" class="ab-chip" data-go="tab-prereg"><i class="fas fa-clipboard-list"></i> Pre-register</button>' +
            '<button type="button" class="ab-chip" data-go="tab-applications"><i class="fas fa-route"></i> Track main registration</button>' +
            '<button type="button" class="ab-chip" data-go="tab-ticket"><i class="fas fa-qrcode"></i> My e-tickets</button>' +
            '<button type="button" class="ab-chip" data-go="tab-support"><i class="fas fa-life-ring"></i> Support</button>' +
            '</div>' +
            '<div class="ab-hero-art" aria-hidden="true"><span>🧩</span><span>🎈</span><span>🌈</span><span>⭐</span></div>' +
            '</div>' +
            '<div class="ab-countdown" id="ab-countdown"><div class="ab-countdown-label"><i class="fas fa-calendar-day"></i> Next event</div><div class="ab-skel" style="width:70%"></div><div class="ab-skel" style="width:40%;margin-top:6px"></div></div>' +
            '</div>' +
            '<div class="ab-journey" id="ab-journey">' +
            '<div class="ab-journey-head"><h3><i class="fas fa-map-signs" style="color:#16a34a"></i> My journey</h3><span id="ab-journey-summary" style="font-size:0.82rem;color:#475569;font-weight:700;"></span></div>' +
            '<div class="ab-journey-steps" id="ab-journey-steps"></div>' +
            '<div class="ab-journey-bar"><div id="ab-journey-fill"></div></div>' +
            '<div class="ab-tips" id="ab-tips"></div>' +
            '</div>';
        if (lead && lead.tagName === 'P') lead.insertAdjacentElement('afterend', wrap);
        else if (title) title.insertAdjacentElement('afterend', wrap);
        else pane.insertBefore(wrap, pane.firstChild);

        wrap.querySelectorAll('.ab-chip[data-go]').forEach((b) => {
            b.addEventListener('click', () => go(b.getAttribute('data-go')));
        });
        renderJourney([]);
        renderTip();
        if (!tipsTimer) tipsTimer = setInterval(() => { tipIdx = (tipIdx + 1) % TIPS.length; renderTip(); }, 7000);
    }

    function go(tabId) {
        const btn = document.querySelector('.menu-item[data-tab="' + tabId + '"]');
        if (typeof switchTab === 'function') switchTab(tabId, btn || undefined);
        else if (btn) btn.click();
    }

    function updateHero() {
        const t = document.getElementById('ab-hero-title');
        if (!t) return;
        const n = firstName();
        t.textContent = greeting() + (n ? ', ' + n : '') + '!';
    }

    function renderTip() {
        const box = document.getElementById('ab-tips');
        if (!box) return;
        const tip = TIPS[tipIdx];
        box.innerHTML =
            '<i class="fas ' + tip.icon + ' ab-tips-icon"></i>' +
            '<div class="ab-tips-body"><b>' + esc(tip.title) + '</b><p>' + esc(tip.text) + '</p></div>' +
            '<div class="ab-tips-dots">' +
            TIPS.map((_, i) => '<span class="' + (i === tipIdx ? 'on' : '') + '"></span>').join('') +
            '</div>';
    }

    const JOURNEY = [
        { key: 'prereg', icon: 'fa-clipboard-list', label: 'Pre-registration', tab: 'tab-prereg' },
        { key: 'main', icon: 'fa-file-signature', label: 'Main registration', tab: 'tab-applications' },
        { key: 'ticket', icon: 'fa-qrcode', label: 'E-ticket', tab: 'tab-ticket' },
        { key: 'checkin', icon: 'fa-door-open', label: 'Checked in', tab: 'tab-ticket' },
        { key: 'cert', icon: 'fa-award', label: 'Certificate', tab: 'tab-certificate' }
    ];

    function renderJourney(states) {
        const host = document.getElementById('ab-journey-steps');
        if (!host) return;
        let done = 0;
        let currentSet = false;
        host.innerHTML = JOURNEY.map((s, i) => {
            const st = states[i] || {};
            let cls = 'ab-jstep';
            if (st.done) { cls += ' is-done'; done++; }
            else if (!currentSet) { cls += ' is-current'; currentSet = true; }
            return (
                '<button type="button" class="' + cls + '" data-go="' + s.tab + '">' +
                '<div class="ab-jstep-dot"><i class="fas ' + (st.done ? 'fa-check' : s.icon) + '"></i></div>' +
                '<b>' + esc(s.label) + '</b>' +
                '<small>' + esc(st.note || (st.done ? 'Done' : 'Pending')) + '</small>' +
                '</button>'
            );
        }).join('');
        host.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.getAttribute('data-go'))));
        const fill = document.getElementById('ab-journey-fill');
        if (fill) requestAnimationFrame(() => { fill.style.width = Math.round((done / JOURNEY.length) * 100) + '%'; });
        const sum = document.getElementById('ab-journey-summary');
        if (sum) sum.textContent = done + ' of ' + JOURNEY.length + ' milestones reached';
    }

    async function refreshJourney() {
        const id = uid();
        if (!id) return;
        const [prereg, apps, tickets, certs] = await Promise.all([
            getJson('/api/preregistrations/' + id).catch(() => []),
            getJson('/api/applications/' + id).catch(() => []),
            getJson('/api/doctor/event-tickets/' + id).catch(() => []),
            getJson('/api/doctor/certificates/' + id).catch(() => [])
        ]);
        const pr = Array.isArray(prereg) ? prereg : [];
        const ap = Array.isArray(apps) ? apps : [];
        const tk = Array.isArray(tickets) ? tickets : [];
        const ce = Array.isArray(certs) ? certs : (certs && Array.isArray(certs.certificates) ? certs.certificates : []);

        const prApproved = pr.filter((r) => /approved|completed/i.test(String(r.status || ''))).length;
        const apOk = ap.filter((r) => /completed|approved|e_ticket|checked_in|certificate/i.test(String(r.status || ''))).length;
        const scanned = tk.filter((t) => Number(t.is_scanned) === 1).length;
        const states = [
            { done: prApproved > 0, note: pr.length ? (prApproved ? prApproved + ' approved' : pr.length + ' submitted') : 'Not started' },
            { done: apOk > 0, note: ap.length ? (apOk ? apOk + ' confirmed' : ap.length + ' in review') : 'Not started' },
            { done: tk.length > 0, note: tk.length ? tk.length + ' issued' : 'Awaiting' },
            { done: scanned > 0, note: scanned ? scanned + ' scanned' : 'At the venue' },
            { done: ce.length > 0, note: ce.length ? ce.length + ' ready' : 'After event' }
        ];
        const fp = JSON.stringify(states);
        if (fp === lastJourneyFp) return;
        lastJourneyFp = fp;
        renderJourney(states);
        setBadge('tab-ticket', tk.length);
        setBadge('tab-certificate', ce.length);
    }

    function setBadge(tab, n) {
        const item = document.querySelector('.menu-item[data-tab="' + tab + '"]');
        if (!item) return;
        let b = item.querySelector('.ab-menu-badge');
        if (!n) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement('span'); b.className = 'ab-menu-badge'; item.appendChild(b); }
        if (b.textContent !== String(n)) b.textContent = String(n);
    }

    async function refreshCountdown() {
        const box = document.getElementById('ab-countdown');
        if (!box) return;
        let rows = [];
        try { rows = await getJson('/api/seminars?bucket=current'); } catch (_) { rows = []; }
        if (!Array.isArray(rows)) rows = [];
        const today = new Date();
        const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const upcoming = rows
            .map((s) => ({ s, ms: dateOnlyMs(s.event_date) }))
            .filter((x) => !Number.isNaN(x.ms) && x.ms >= todayMs)
            .sort((a, b) => a.ms - b.ms)[0];
        let html = '<div class="ab-countdown-label"><i class="fas fa-calendar-day"></i> Next event</div>';
        if (!upcoming) {
            html += '<div class="ab-countdown-empty">No upcoming event dates announced yet. Watch the programme updates above.</div>';
        } else {
            const days = Math.round((upcoming.ms - todayMs) / 86400000);
            html += '<div class="ab-countdown-title">' + esc(upcoming.s.title || 'Event') + '</div>';
            html += '<div class="ab-countdown-date"><i class="fas fa-map-marker-alt" style="color:#ec4899"></i> ' + esc(fmtDate(upcoming.s.event_date)) + (upcoming.s.venue ? ' · ' + esc(upcoming.s.venue) : '') + '</div>';
            if (days === 0) {
                html += '<div class="ab-countdown-today"><i class="fas fa-star"></i> It\'s today! See you at the venue.</div>';
            } else {
                const weeks = Math.floor(days / 7);
                html +=
                    '<div class="ab-countdown-nums">' +
                    '<div class="ab-countdown-num"><b>' + days + '</b><small>days</small></div>' +
                    '<div class="ab-countdown-num"><b>' + weeks + '</b><small>weeks</small></div>' +
                    '<div class="ab-countdown-num"><b>' + (days % 7) + '</b><small>+ days</small></div>' +
                    '</div>';
            }
            html += '<button type="button" class="btn-primary" style="align-self:flex-start;padding:8px 14px;font-size:0.85rem;" data-go="tab-seminars"><i class="fas fa-calendar-check"></i> View events</button>';
        }
        box.innerHTML = html;
        box.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.getAttribute('data-go'))));
    }

    /* ---------------- animated counters ---------------- */
    const counterState = new Map();
    function animateCounters() {
        document.querySelectorAll('#tab-dashboard .stat-card h4').forEach((el) => {
            const target = parseInt(el.textContent, 10);
            if (Number.isNaN(target)) return;
            const prev = counterState.get(el);
            if (prev === target) return;
            counterState.set(el, target);
            const from = Number.isInteger(prev) ? prev : 0;
            const start = performance.now();
            const dur = 650;
            const step = (now) => {
                const p = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = String(Math.round(from + (target - from) * eased));
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }
    const statObserver = new MutationObserver(() => animateCounters());

    /* ---------------- lifecycle ---------------- */
    function dashboardVisible() {
        const main = document.getElementById('dashboard-main');
        return main && !main.classList.contains('hidden');
    }

    async function tick() {
        if (!dashboardVisible() || !uid()) return;
        updateHero();
        try { await refreshJourney(); } catch (_) {}
    }

    function start() {
        mountBlobs();
        mountHeaderBits();
        mountDashboardWidgets();
        const grid = document.querySelector('#tab-dashboard .stat-grid');
        if (grid) statObserver.observe(grid, { childList: true, characterData: true, subtree: true });
        refreshCountdown();
        tick();
        if (!refreshTimer) refreshTimer = setInterval(tick, REFRESH_MS);
        setInterval(refreshCountdown, 120000);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        tick();
        if (typeof loadApplications === 'function' && dashboardVisible()) {
            try { loadApplications(true); } catch (_) {}
        }
    });

    const mainEl = document.getElementById('dashboard-main');
    if (mainEl) {
        new MutationObserver(() => { if (dashboardVisible()) tick(); }).observe(mainEl, { attributes: true, attributeFilter: ['class'] });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
