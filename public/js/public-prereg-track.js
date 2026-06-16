/**
 * Public pre-registration status lookup — no sign-in, live polling.
 */
(function () {
    'use strict';

    const POLL_MS = 5000;
    let pollTimer = null;
    let lastFp = '';
    let activeQuery = null;

    function qs(id) {
        return document.getElementById(id);
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function formatWhen(iso) {
        if (!iso) return '';
        if (window.PortalDateTime && window.PortalDateTime.formatLong) {
            const s = window.PortalDateTime.formatLong(iso);
            return s && !/\bIST\b/i.test(s) ? s + ' IST' : s;
        }
        try {
            return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
        } catch (_) {
            return String(iso);
        }
    }

    function formatIstNow() {
        if (window.PortalDateTime && window.PortalDateTime.format) {
            return window.PortalDateTime.format(new Date().toISOString()) + ' IST';
        }
        return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }

    function statusLabel(st) {
        const s = String(st || 'submitted').toLowerCase().replace(/_/g, ' ');
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function statusColors(st) {
        const s = String(st || '').toLowerCase();
        if (s === 'approved') return { bg: '#d1fae5', fg: '#047857' };
        if (s === 'rejected') return { bg: '#fee2e2', fg: '#b91c1c' };
        if (s === 'revision_required') return { bg: '#ede9fe', fg: '#6d28d9' };
        return { bg: '#fef3c7', fg: '#92400e' };
    }

    function renderSteps(stepDefs) {
        const steps = stepDefs || [];
        if (!steps.length) return '';

        const html = steps
            .map((s) => {
                let cls = 'ak-track-v3-step';
                if (s.state === 'completed') cls += ' is-done';
                else if (s.state === 'active') cls += ' is-current';
                else if (s.state === 'fail') cls += ' is-fail';
                else cls += ' is-upcoming';

                const icon =
                    s.state === 'completed'
                        ? 'fa-check'
                        : s.state === 'active'
                          ? 'fa-spinner fa-spin'
                          : s.state === 'fail'
                            ? 'fa-times'
                            : 'fa-circle';

                const when =
                    s.at && (s.state === 'completed' || s.state === 'active')
                        ? '<p class="ak-track-v3-when">' + esc(formatWhen(s.at)) + '</p>'
                        : s.state === 'pending'
                          ? '<p class="ak-track-v3-when" style="color:#94a3b8!important;">Upcoming</p>'
                          : '';

                return (
                    '<div class="' +
                    cls +
                    '"><div class="ak-track-v3-icon"><i class="fas ' +
                    icon +
                    '"></i></div><div class="ak-track-v3-body"><strong>' +
                    esc(s.title || s.key || '') +
                    '</strong>' +
                    (s.desc ? '<p>' + esc(s.desc) + '</p>' : '') +
                    when +
                    '</div></div>'
                );
            })
            .join('');

        let doneCount = 0;
        let currentIdx = -1;
        steps.forEach((s, i) => {
            if (s.state === 'completed') doneCount = i + 1;
            if (s.state === 'active') currentIdx = i;
        });
        if (currentIdx < 0 && doneCount < steps.length && doneCount > 0) currentIdx = doneCount;
        const pct =
            steps.length <= 1 ? 0 : Math.min(100, Math.round((Math.max(doneCount, currentIdx + 1) / steps.length) * 100));

        return (
            '<div class="ak-track-card-v3__progress-wrap"><div class="ak-track-card-v3__progress-label"><span>Progress</span><span>' +
            pct +
            '%</span></div><div class="ak-track-card-v3__progress-bar"><div class="ak-track-card-v3__progress-fill" style="width:' +
            pct +
            '%;"></div></div></div><div class="ak-track-v3-stepper">' +
            html +
            '</div>'
        );
    }

    function renderFoot(data) {
        const st = String(data.status || '').toLowerCase();
        const parts = [];

        if (data.registrationApplicationNo) {
            parts.push(
                '<p style="margin:0 0 10px;font-size:0.88rem;color:#475569;">Main registration ID: <code>' +
                    esc(data.registrationApplicationNo) +
                    '</code></p>'
            );
        }

        if (st === 'approved') {
            parts.push(
                '<p class="ak-track-card-v3__msg" style="margin:0 0 12px;">Your pre-registration is approved. Sign in to the applicant portal when final registration opens.</p>' +
                    '<div class="ak-track-card-v3__actions">' +
                    '<a href="/dashboard" class="ak-pub-track-approved-cta"><i class="fas fa-right-to-bracket"></i> Sign in to applicant portal</a>' +
                    '</div>'
            );
        } else if (st === 'revision_required') {
            parts.push(
                '<p class="ak-track-card-v3__msg" style="margin:0 0 12px;">Changes are needed on your application. Sign in to update and resubmit.</p>' +
                    '<div class="ak-track-card-v3__actions">' +
                    '<a href="/dashboard" class="ak-pub-track-approved-cta"><i class="fas fa-edit"></i> Sign in to update</a>' +
                    '</div>'
            );
        } else if (st === 'submitted') {
            parts.push(
                '<p class="ak-track-card-v3__msg" style="margin:0;">This page updates automatically — keep it open or return anytime with your tracking ID and email.</p>'
            );
        }

        if (!parts.length) return '';
        return '<div class="ak-track-card-v3__foot">' + parts.join('') + '</div>';
    }

    function renderCard(data) {
        const colors = statusColors(data.status);
        const steps = (data.timeline && data.timeline.steps) || [];
        const eventDate = data.eventDate
            ? '<div style="font-size:0.85rem;color:#64748b;margin-top:4px;"><i class="fas fa-calendar-day" style="margin-right:4px;"></i>' +
              esc(data.eventDate) +
              '</div>'
            : '';

        return (
            '<article class="ak-track-card-v3 ak-track-card-v3--prereg">' +
            '<div class="ak-track-card-v3__bar"></div>' +
            '<div class="ak-track-card-v3__head">' +
            '<div><span class="ak-track-card-v3__type">Pre-registration</span>' +
            '<div class="ak-track-card-v3__title">' +
            esc(data.seminarTitle || 'Event') +
            '</div>' +
            eventDate +
            '<div class="ak-track-card-v3__code">Tracking ID: <strong>' +
            esc(data.applicationNo) +
            '</strong></div>' +
            '</div>' +
            '<span class="ak-track-card-v3__pill" style="background:' +
            colors.bg +
            ';color:' +
            colors.fg +
            ';">' +
            esc(statusLabel(data.status)) +
            '</span></div>' +
            (steps.length ? renderSteps(steps) : '') +
            renderFoot(data) +
            '</article>'
        );
    }

    function updateLiveBar() {
        const el = qs('pub-track-live');
        if (!el) return;
        el.classList.remove('hidden');
        el.innerHTML =
            '<i class="fas fa-circle" style="color:#10b981;font-size:0.45rem;vertical-align:middle;animation:ak-pulse 1.2s infinite;"></i> Live · updates every few seconds · ' +
            formatIstNow();
    }

    function fingerprint(data) {
        const steps = (data.timeline && data.timeline.steps) || [];
        const sig = steps.map((s) => [s.key, s.state, s.at || ''].join(':')).join(',');
        return [data.status, data.updatedAt || '', data.registrationStatus || '', sig].join('|');
    }

    function showError(msg) {
        const el = qs('pub-track-error');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.classList.remove('hidden');
        } else {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    async function fetchStatus(query) {
        const params = new URLSearchParams({
            applicationNo: query.applicationNo,
            email: query.email
        });
        const r = await fetch('/api/public/preregistrations/track?' + params.toString(), { cache: 'no-store' });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText || 'Lookup failed');
        return data;
    }

    async function loadAndRender(query, quiet) {
        if (!quiet) showError('');
        const data = await fetchStatus(query);
        qs('pub-track-card').innerHTML = renderCard(data);
        qs('pub-track-form-wrap')?.classList.add('hidden');
        qs('pub-track-result')?.classList.remove('hidden');
        lastFp = fingerprint(data);
        updateLiveBar();
        return data;
    }

    function stopPoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startPoll() {
        stopPoll();
        if (!activeQuery) return;
        pollTimer = setInterval(async () => {
            if (document.hidden || !activeQuery) return;
            try {
                const data = await fetchStatus(activeQuery);
                const fp = fingerprint(data);
                if (fp !== lastFp) {
                    lastFp = fp;
                    qs('pub-track-card').innerHTML = renderCard(data);
                }
                updateLiveBar();
            } catch (_) {}
        }, POLL_MS);
    }

    async function onSubmit(e) {
        e.preventDefault();
        const applicationNo = (qs('pub-track-id')?.value || '').trim();
        const email = (qs('pub-track-email')?.value || '').trim();
        if (!applicationNo || !email) {
            showError('Enter tracking ID and email.');
            return;
        }
        const btn = qs('pub-track-submit');
        if (btn) btn.disabled = true;
        try {
            activeQuery = { applicationNo, email };
            lastFp = '';
            await loadAndRender(activeQuery, false);
            startPoll();
            const url = new URL(window.location.href);
            url.searchParams.set('id', applicationNo);
            url.searchParams.set('email', email);
            window.history.replaceState({}, '', url.pathname + '?' + url.searchParams.toString());
        } catch (err) {
            showError(err.message || 'Could not find application.');
            activeQuery = null;
            stopPoll();
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function resetLookup() {
        activeQuery = null;
        lastFp = '';
        stopPoll();
        qs('pub-track-result')?.classList.add('hidden');
        qs('pub-track-form-wrap')?.classList.remove('hidden');
        qs('pub-track-live')?.classList.add('hidden');
        showError('');
        window.history.replaceState({}, '', window.location.pathname);
    }

    function initFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const id = (params.get('id') || params.get('applicationNo') || '').trim();
        const email = (params.get('email') || '').trim();
        if (id && qs('pub-track-id')) qs('pub-track-id').value = id;
        if (email && qs('pub-track-email')) qs('pub-track-email').value = email;
        if (id && email) {
            activeQuery = { applicationNo: id, email };
            loadAndRender(activeQuery, false)
                .then(() => startPoll())
                .catch((err) => showError(err.message || 'Could not find application.'));
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        qs('pub-track-form')?.addEventListener('submit', onSubmit);
        qs('pub-track-change')?.addEventListener('click', resetLookup);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopPoll();
            else if (activeQuery) startPoll();
        });
        initFromUrl();
    });
})();
