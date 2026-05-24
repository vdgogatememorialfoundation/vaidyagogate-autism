/**
 * Autism dashboard: live polling for pre-reg + main registration (IST timestamps).
 */
(function () {
    'use strict';
    if (!document.body.classList.contains('ak-portal-dash')) return;

    const POLL_MS = 4000;
    let preregTimer = null;
    let lastPreregFp = '';

    function formatIstNow() {
        if (window.PortalDateTime && window.PortalDateTime.format) {
            return window.PortalDateTime.format(new Date().toISOString()) + ' IST';
        }
        return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }

    function updateLiveLabels() {
        const t = formatIstNow();
        ['seminar-track-live', 'prereg-track-live', 'dashboard-live-status'].forEach((id) => {
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

    function shouldPollPrereg() {
        return tabVisible('tab-prereg') || tabVisible('tab-applications');
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
            const fp = rows.map((x) => [x.id, x.status, x.updated_at].join(':')).join('|');
            if (fp === lastPreregFp) {
                updateLiveLabels();
                return;
            }
            lastPreregFp = fp;
            if (typeof loadPreregList === 'function') loadPreregList();
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
        if (typeof syncDoctorTrackingPolls === 'function') {
            syncDoctorTrackingPolls();
        }
        if (typeof loadApplications === 'function') {
            loadApplications().then(() => {
                if (typeof syncDoctorTrackingPolls === 'function') syncDoctorTrackingPolls();
                updateLiveLabels();
            });
        }
        startPreregPoll();
    }

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akLiveHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            updateLiveLabels();
            if (tabId === 'tab-applications' || tabId === 'tab-prereg') {
                if (typeof syncDoctorTrackingPolls === 'function') syncDoctorTrackingPolls();
            }
        };
        window.switchTab.__akLiveHook = true;
    }

    const origLoadApps = window.loadApplications;
    if (typeof origLoadApps === 'function' && !origLoadApps.__akLiveHook) {
        window.loadApplications = async function (silentPoll) {
            await origLoadApps.apply(this, arguments);
            if (!silentPoll || silentPoll) updateLiveLabels();
        };
        window.loadApplications.__akLiveHook = true;
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopPreregPoll();
        else {
            startPreregPoll();
            if (typeof syncDoctorTrackingPolls === 'function') syncDoctorTrackingPolls();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        ensureDashboardBanner();
        setTimeout(hookTracking, 600);
        setTimeout(hookTracking, 2500);
    });
})();
