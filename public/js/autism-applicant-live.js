/**
 * Autism dashboard: live polling for pre-reg + main registration (IST timestamps).
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-portal-dash')) return;

    const POLL_MS = 4000;
    let preregTimer = null;
    let mainRegTimer = null;
    let lastPreregFp = '';
    let lastMainRegFp = '';

    function formatIstNow() {
        if (window.PortalDateTime && window.PortalDateTime.format) {
            return window.PortalDateTime.format(new Date().toISOString()) + ' IST';
        }
        return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }

    function updateLiveLabels() {
        const t = formatIstNow();
        ['seminar-track-live', 'prereg-track-live', 'comp-track-live', 'dashboard-live-status'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('hidden');
            el.innerHTML =
                '<i class="fas fa-circle" style="color:#10b981;font-size:0.45rem;vertical-align:middle;animation:ak-pulse 1.2s infinite;"></i> Live · updated ' +
                t;
        });
    }

    function tabVisible(id) {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    }

    function preregTimelineSig(row) {
        const steps = (row && row.timeline && row.timeline.steps) || [];
        return steps.map((s) => [s.key, s.state, s.at || ''].join(':')).join(',');
    }

    function shouldPollPrereg() {
        return tabVisible('tab-prereg-track') || tabVisible('tab-prereg') || tabVisible('tab-applications');
    }

    function shouldPollMainReg() {
        return tabVisible('tab-main-reg-track') || tabVisible('tab-applications');
    }

    let compTimer = null;
    let lastCompFp = '';

    async function pollCompetition() {
        if (!tabVisible('tab-competition') && !tabVisible('tab-comp-track')) return;
        const uid =
            typeof doctorNumericUserId === 'function'
                ? doctorNumericUserId()
                : window.currentUser && window.currentUser.id;
        if (!uid) return;
        try {
            const r = await fetch('/api/competition-submissions/' + uid, { cache: 'no-store' });
            const rows = await r.json();
            if (!r.ok || !Array.isArray(rows)) return;
            const fp = rows.map((x) => [x.id, x.status, x.updated_at].join(':')).join('|');
            if (fp === lastCompFp) {
                updateLiveLabels();
                return;
            }
            lastCompFp = fp;
            if (typeof window.loadCompetitionList === 'function') window.loadCompetitionList();
            updateLiveLabels();
        } catch (_) {}
    }

    function startCompPoll() {
        if (compTimer) return;
        compTimer = setInterval(pollCompetition, POLL_MS);
        pollCompetition();
    }

    function stopCompPoll() {
        if (compTimer) {
            clearInterval(compTimer);
            compTimer = null;
        }
    }

    async function pollPrereg() {
        if (!shouldPollPrereg()) return;
        const uid =
            typeof doctorNumericUserId === 'function'
                ? doctorNumericUserId()
                : window.currentUser && window.currentUser.id;
        if (!uid) return;
        try {
            const r = await fetch('/api/preregistrations/' + uid, { cache: 'no-store' });
            const rows = await r.json();
            if (!r.ok || !Array.isArray(rows)) return;
            const fp = rows
                .map((x) =>
                    [x.id, x.status, x.updated_at || '', x.application_no || '', preregTimelineSig(x)].join(':')
                )
                .join('|');
            if (fp === lastPreregFp) {
                updateLiveLabels();
                return;
            }
            lastPreregFp = fp;
            if (typeof loadPreregList === 'function') loadPreregList();
            updateLiveLabels();
        } catch (_) {}
    }

    async function pollMainReg() {
        if (!shouldPollMainReg()) return;
        if (typeof loadApplications !== 'function') return;
        try {
            await loadApplications(true);
            updateLiveLabels();
        } catch (_) {}
    }

    function startPreregPoll() {
        if (preregTimer) return;
        preregTimer = setInterval(pollPrereg, POLL_MS);
        pollPrereg();
    }

    function stopPreregPoll() {
        if (preregTimer) {
            clearInterval(preregTimer);
            preregTimer = null;
        }
    }

    function startMainRegPoll() {
        if (mainRegTimer) return;
        mainRegTimer = setInterval(pollMainReg, POLL_MS);
        pollMainReg();
    }

    function stopMainRegPoll() {
        if (mainRegTimer) {
            clearInterval(mainRegTimer);
            mainRegTimer = null;
        }
    }

    function ensureDashboardBanner() {
        if (document.getElementById('dashboard-live-status')) return;
        const area = document.querySelector('.content-area');
        if (!area) return;
        const bar = document.createElement('p');
        bar.id = 'dashboard-live-status';
        bar.className = 'ak-live-bar hidden';
        bar.style.cssText =
            'margin:0 0 16px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;font-size:0.88rem;font-weight:600;color:#1e40af;';
        area.insertBefore(bar, area.firstChild);
    }

    function hookTracking() {
        if (typeof loadApplications === 'function') {
            loadApplications().then(() => updateLiveLabels());
        }
        startPreregPoll();
        startMainRegPoll();
        startCompPoll();
    }

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akLiveHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            updateLiveLabels();
            if (
                tabId === 'tab-applications' ||
                tabId === 'tab-prereg' ||
                tabId === 'tab-prereg-track' ||
                tabId === 'tab-main-reg-track' ||
                tabId === 'tab-competition' ||
                tabId === 'tab-comp-track'
            ) {
                if (tabId === 'tab-prereg-track' || tabId === 'tab-prereg') pollPrereg();
                if (tabId === 'tab-main-reg-track' || tabId === 'tab-applications') pollMainReg();
            }
        };
        window.switchTab.__akLiveHook = true;
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPreregPoll();
            stopMainRegPoll();
            stopCompPoll();
        } else {
            startPreregPoll();
            startMainRegPoll();
            startCompPoll();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        ensureDashboardBanner();
        setTimeout(hookTracking, 600);
        setTimeout(hookTracking, 2500);
    });
})();
