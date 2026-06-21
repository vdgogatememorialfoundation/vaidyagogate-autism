/**
 * Autism applicant portal extensions: preregistration, competition uploads, tab visibility.
 */
(function () {
    'use strict';

    window.PORTAL_IS_AUTISM = true;

    let _seminarsFetchPromise = null;
    let _seminarsCache = null;
    let _seminarsCacheAt = 0;
    const SEMINARS_CACHE_MS = 20000;
    const _lastGridFp = { prereg: '', main: '' };
    let _loadPreregSeminarsPromise = null;
    let competitionEvents = [];

    const HIDDEN_TABS = [
        'tab-orders',
        'tab-receipts',
        'tab-payments',
        'tab-volunteer'
    ];

    function separatePreregAndMainRegistration() {
        document.querySelectorAll('[data-tab="tab-seminars"]').forEach((el) => el.remove());
        const legacyApps = document.getElementById('tab-applications');
        if (legacyApps) {
            legacyApps.classList.add('hidden');
            legacyApps.style.display = 'none';
            legacyApps.setAttribute('aria-hidden', 'true');
        }
        setupAutismHubNavigation();
        mountMainRegFormOnEventTab();
        ensureApplicantTrackingTabs();
        const tabApps = document.getElementById('tab-applications');
        if (tabApps) {
            document.getElementById('ak-main-reg-start')?.remove();
            tabApps.querySelector('.data-table')?.closest('.card')?.remove();
        }
    }

    function mainRegFormPanelEl() {
        return document.getElementById('multi-step-form');
    }

    function mountMainRegFormOnEventTab() {
        const regPane = document.getElementById('tab-main-reg-hub') || document.getElementById('tab-event-register');
        const form = document.getElementById('multi-step-form');
        if (!regPane || !form || form.dataset.akMountedOnEvent === '1') return;
        if (!document.getElementById('ak-main-reg-form-heading')) {
            const h = document.createElement('h4');
            h.id = 'ak-main-reg-form-heading';
            h.className = 'hidden';
            h.style.cssText = 'margin-bottom:12px;color:#0f766e;';
            h.textContent = 'Main registration form';
            form.insertBefore(h, form.firstChild);
        }
        regPane.appendChild(form);
        form.dataset.akMountedOnEvent = '1';
    }

    function registerModalEl() {
        return document.getElementById('ak-register-modal');
    }

    function registerModalBodyEl() {
        return document.getElementById('ak-register-modal-body');
    }

    function rememberPanelHome(panel) {
        if (!panel || panel.__akRegisterModalHome) return;
        panel.__akRegisterModalHome = panel.parentElement;
    }

    function isPanelInRegisterModal(panel) {
        const body = registerModalBodyEl();
        return !!(panel && body && body.contains(panel));
    }

    function closeRegisterModal(panelOpt) {
        const modal = registerModalEl();
        const body = registerModalBodyEl();
        if (!modal || !body) return;
        let panel = panelOpt;
        if (!panel && body.firstElementChild) panel = body.firstElementChild;
        if (panel) {
            panel.classList.add('hidden');
            const home = panel.__akRegisterModalHome;
            if (home && home !== body) home.appendChild(panel);
        }
        modal.classList.add('hidden');
        document.body.classList.remove('ak-register-modal-open');
        document.body.style.overflow = '';
    }

    function openRegisterModal(title, panel) {
        const modal = registerModalEl();
        const body = registerModalBodyEl();
        if (!modal || !body || !panel) return;
        const other =
            panel.id === 'ak-prereg-form-panel' ? mainRegFormPanelEl() : preregFormPanelEl();
        if (other && isPanelInRegisterModal(other)) closeRegisterModal(other);
        rememberPanelHome(panel);
        const titleEl = document.getElementById('ak-register-modal-title');
        if (titleEl) titleEl.textContent = title || 'Registration';
        panel.classList.remove('hidden');
        body.appendChild(panel);
        modal.classList.remove('hidden');
        document.body.classList.add('ak-register-modal-open');
        document.body.style.overflow = 'hidden';
        document.getElementById('ak-register-modal-close')?.focus();
    }

    function dismissRegisterModal() {
        const body = registerModalBodyEl();
        const panel = body && body.firstElementChild;
        if (!panel) {
            closeRegisterModal();
            return;
        }
        if (panel.id === 'multi-step-form') {
            if (typeof window.cancelRegistration === 'function') window.cancelRegistration();
            return;
        }
        hidePreregFormPanel();
        preregResubmitId = null;
        const sel = document.getElementById('prereg-seminar-select');
        if (sel) sel.disabled = false;
    }

    function wireRegisterModal() {
        document.getElementById('ak-register-modal-close')?.addEventListener('click', dismissRegisterModal);
        document.getElementById('ak-register-modal-backdrop')?.addEventListener('click', dismissRegisterModal);
        document.getElementById('ak-success-ok-btn')?.addEventListener('click', closeSubmissionSuccessModal);
        document.getElementById('ak-success-backdrop')?.addEventListener('click', closeSubmissionSuccessModal);
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const modal = registerModalEl();
            if (!modal || modal.classList.contains('hidden')) return;
            dismissRegisterModal();
        });
    }

    function showMainRegFormPanel(eventTitle) {
        const panel = mainRegFormPanelEl();
        if (!panel) return;
        const heading = document.getElementById('ak-main-reg-form-heading');
        if (heading) {
            heading.textContent = eventTitle ? 'Main registration — ' + eventTitle : 'Main registration form';
            heading.classList.remove('hidden');
        }
        const title = eventTitle ? 'Main registration — ' + eventTitle : 'Main registration';
        openRegisterModal(title, panel);
    }

    function hideMainRegFormPanel() {
        const panel = mainRegFormPanelEl();
        if (isPanelInRegisterModal(panel)) closeRegisterModal(panel);
        else if (panel) panel.classList.add('hidden');
        const heading = document.getElementById('ak-main-reg-form-heading');
        if (heading) heading.classList.add('hidden');
    }

    function setupAutismHubNavigation() {
        const menu = document.querySelector('.menu-items');
        if (!menu) return;
        menu.querySelectorAll('[data-tab="tab-prereg"], [data-tab="tab-applications"], [data-tab="tab-competition"]').forEach((el) => el.remove());
        const hubItems = [
            { tab: 'tab-prereg-hub', icon: 'fa-clipboard-list', label: 'Pre-registration' },
            { tab: 'tab-prereg-track', icon: 'fa-route', label: 'Pre-reg tracking' },
            { tab: 'tab-main-reg-hub', icon: 'fa-file-signature', label: 'Main registration' },
            { tab: 'tab-main-reg-track', icon: 'fa-tasks', label: 'Main reg tracking' },
            { tab: 'tab-comp-register', icon: 'fa-cloud-upload-alt', label: 'Register Competition' },
            { tab: 'tab-comp-track', icon: 'fa-photo-video', label: 'Track Competition' },
            { tab: 'tab-abstract', icon: 'fa-file-upload', label: 'Case presentation' },
            { tab: 'tab-case-track', icon: 'fa-route', label: 'Track case applications' }
        ];
        const anchor = menu.querySelector('[data-tab="tab-feedback"]');
        hubItems.forEach((it) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'menu-item';
            btn.dataset.tab = it.tab;
            btn.innerHTML = '<i class="fas ' + it.icon + '"></i> ' + it.label;
            if (anchor) menu.insertBefore(btn, anchor);
            else menu.appendChild(btn);
        });
        wrapAutismRegisterTrackSections();
    }

    function ensureApplicantTrackingTabs() {
        if (document.getElementById('tab-prereg-track')) return;

        const preregTrack = document.createElement('div');
        preregTrack.id = 'tab-prereg-track';
        preregTrack.className = 'tab-pane hidden';
        preregTrack.innerHTML =
            '<div class="ak-track-page">' +
            '<div class="ak-track-page-head">' +
            '<h3><i class="fas fa-route" style="color:#0f766e;margin-right:8px;"></i> Pre-registration tracking</h3>' +
            '<p>Status, timeline, and your pre-registration tracking IDs.</p>' +
            '</div>' +
            '<section class="ak-track-section">' +
            '<p id="prereg-track-live" class="hidden" style="font-size:0.88rem;font-weight:600;color:#0f766e;margin-bottom:12px;"></p>' +
            '<div id="prereg-list" class="ak-track-list"><p style="color:#64748b;">Loading…</p></div>' +
            '</section></div>';

        const mainTrack = document.createElement('div');
        mainTrack.id = 'tab-main-reg-track';
        mainTrack.className = 'tab-pane hidden';
        mainTrack.innerHTML =
            '<div class="ak-track-page">' +
            '<div class="ak-track-page-head">' +
            '<h3><i class="fas fa-tasks" style="color:#1a237e;margin-right:8px;"></i> Main registration tracking</h3>' +
            '<p>Application status, timeline, and your main registration tracking ID.</p>' +
            '</div>' +
            '<section class="ak-track-section">' +
            '<p id="seminar-track-live" class="hidden" style="font-size:0.88rem;font-weight:600;color:#1e40af;margin-bottom:12px;"></p>' +
            '<div id="applications-tracker-container" class="ak-track-list"><p style="color:#64748b;">Loading trackers…</p></div>' +
            '<div class="card" style="margin-top:16px;">' +
            '<h3 style="margin-bottom:12px;color:#0f766e;">Application list</h3>' +
            '<table class="data-table">' +
            '<thead><tr><th>Application #</th><th>Status</th><th>Actions</th></tr></thead>' +
            '<tbody id="applications-list"><tr><td colspan="3" style="text-align:center;color:#64748b;">Loading…</td></tr></tbody>' +
            '</table></div></section></div>';

        const preregHub = document.getElementById('tab-prereg-hub');
        const mainHub = document.getElementById('tab-main-reg-hub');
        const anchor = document.getElementById('tab-comp-register') || document.getElementById('tab-feedback');
        const parent = (preregHub && preregHub.parentNode) || (mainHub && mainHub.parentNode);
        if (!parent) return;

        const existingPreregList = document.getElementById('prereg-list');
        if (existingPreregList && !existingPreregList.closest('#tab-prereg-track')) {
            const slot = preregTrack.querySelector('#prereg-list');
            if (slot) slot.replaceWith(existingPreregList);
        }
        const existingTracker = document.getElementById('applications-tracker-container');
        if (existingTracker && !existingTracker.closest('#tab-main-reg-track')) {
            const slot = mainTrack.querySelector('#applications-tracker-container');
            if (slot) slot.replaceWith(existingTracker);
        }
        const legacyAppsTab = document.getElementById('tab-applications');
        if (legacyAppsTab) {
            legacyAppsTab.querySelectorAll('.card').forEach((card) => {
                if (card.querySelector('#applications-list') && !mainTrack.querySelector('#applications-list')) {
                    mainTrack.querySelector('.ak-track-section')?.appendChild(card);
                }
            });
            legacyAppsTab.classList.add('hidden');
        }

        parent.insertBefore(preregTrack, anchor);
        parent.insertBefore(mainTrack, anchor);

        preregHub?.querySelector('.ak-prereg-submissions')?.remove();
        mainHub?.querySelector('#ak-main-reg-submissions')?.remove();
    }

    function wrapAutismRegisterTrackSections() {
        const legacyRegister = document.getElementById('tab-event-register');
        if (legacyRegister && !document.getElementById('tab-prereg-hub')) {
            legacyRegister.id = 'tab-prereg-hub';
            const title = legacyRegister.querySelector('.section-title');
            if (title) title.textContent = 'Pre-registration';
            const lead = legacyRegister.querySelector('.ak-prereg-lead');
            if (lead) {
                lead.textContent =
                    'Apply for events that require pre-registration. Your submitted details appear below.';
            }
            const grid = legacyRegister.querySelector('#ak-events-grid');
            if (grid) grid.id = 'ak-prereg-events-grid';
            const track = document.getElementById('tab-event-track');
            if (track && !document.getElementById('tab-main-reg-hub')) {
                track.id = 'tab-main-reg-hub';
                const head = track.querySelector('.ak-track-page-head h3');
                if (head) {
                    head.innerHTML =
                        '<i class="fas fa-file-signature" style="color:#1a237e;margin-right:8px;"></i> Main registration';
                }
                const headP = track.querySelector('.ak-track-page-head p');
                if (headP) {
                    headP.textContent =
                        'Complete main registration and view everything you submitted.';
                }
                const preregSection = track.querySelector('.ak-track-section');
                if (preregSection) preregSection.remove();
                if (!track.querySelector('#ak-main-events-grid')) {
                    const mainGrid = document.createElement('div');
                    mainGrid.id = 'ak-main-events-grid';
                    mainGrid.className = 'seminars-grid';
                    mainGrid.style.marginBottom = '24px';
                    track.insertBefore(mainGrid, track.firstChild);
                }
            }
            const preregList = document.getElementById('prereg-list');
            const preregHub = document.getElementById('tab-prereg-hub');
            if (preregList && preregHub && preregList.closest('#tab-main-reg-hub')) {
                let subs = preregHub.querySelector('.ak-prereg-submissions');
                if (!subs) {
                    subs = document.createElement('div');
                    subs.className = 'card ak-prereg-submissions';
                    subs.style.marginTop = '20px';
                    subs.innerHTML =
                        '<h4 style="margin-bottom:12px;color:#0f766e;"><i class="fas fa-folder-open"></i> Your pre-registration submissions</h4>' +
                        '<p style="font-size:0.88rem;color:#64748b;margin-bottom:12px;">All information you sent, status, and application IDs.</p>';
                    preregHub.appendChild(subs);
                }
                subs.appendChild(preregList);
            }
            mountMainRegFormOnEventTab();
        }
        const preregPane = document.getElementById('tab-prereg');
        if (preregPane && !document.getElementById('tab-prereg-hub')) {
            const formCard = preregPane.querySelector('#prereg-form')?.closest('.card');
            const listCard = preregPane.querySelector('#prereg-list')?.closest('.card');
            const preregHub = document.createElement('div');
            preregHub.id = 'tab-prereg-hub';
            preregHub.className = 'tab-pane hidden';
            preregHub.innerHTML =
                '<h3 class="section-title">Pre-registration</h3>' +
                '<p class="ak-prereg-lead" style="color:#64748b;margin-bottom:16px;">Apply for events that require pre-registration. Your submitted details appear below.</p>' +
                '<h2 class="section-title" style="font-size:1.15rem;margin-bottom:12px;">Available events</h2>' +
                '<div id="ak-prereg-events-grid" class="seminars-grid" style="margin-bottom:24px;"></div>';
            if (formCard) {
                const fg = formCard.querySelector('.form-group');
                if (fg && formCard.querySelector('#prereg-seminar-grid')) fg.remove();
                if (!formCard.id) formCard.id = 'ak-prereg-form-panel';
                formCard.classList.add('hidden');
                if (!formCard.querySelector('#ak-prereg-form-heading')) {
                    const h = document.createElement('h4');
                    h.id = 'ak-prereg-form-heading';
                    h.style.cssText = 'margin-bottom:12px;color:#0f766e;';
                    h.textContent = 'Pre-registration form';
                    formCard.insertBefore(h, formCard.firstChild);
                }
                preregHub.appendChild(formCard);
            }
            const submissions = document.createElement('div');
            submissions.className = 'card';
            submissions.style.marginTop = '20px';
            submissions.innerHTML =
                '<h4 style="margin-bottom:12px;color:#0f766e;"><i class="fas fa-folder-open"></i> Your pre-registration submissions</h4>' +
                '<p style="font-size:0.88rem;color:#64748b;margin-bottom:8px;">All information you sent, status, and 12-digit tracking IDs.</p>' +
                '<p id="prereg-track-live" class="hidden" style="font-size:0.88rem;font-weight:600;color:#0f766e;margin-bottom:12px;"></p>' +
                '<div id="prereg-list" class="ak-track-list"></div>';
            preregHub.appendChild(submissions);
            if (listCard) listCard.remove();

            const mainHub = document.createElement('div');
            mainHub.id = 'tab-main-reg-hub';
            mainHub.className = 'tab-pane hidden';
            mainHub.innerHTML =
                '<h3 class="section-title">Main registration</h3>' +
                '<p style="color:#64748b;margin-bottom:16px;">After pre-registration is approved (if required), complete main registration here.</p>' +
                '<h2 class="section-title" style="font-size:1.15rem;margin-bottom:12px;">Available events</h2>' +
                '<div id="ak-main-events-grid" class="seminars-grid" style="margin-bottom:24px;"></div>' +
                '<div class="card" id="ak-main-reg-submissions" style="margin-top:20px;">' +
                '<h4 style="margin-bottom:12px;color:#1a237e;"><i class="fas fa-folder-open"></i> Your main registrations</h4>' +
                '<p style="font-size:0.88rem;color:#64748b;margin-bottom:8px;">Track status and view everything submitted for main registration.</p>' +
                '<p id="seminar-track-live" class="hidden" style="font-size:0.88rem;font-weight:600;color:#1e40af;margin-bottom:12px;"></p>' +
                '<div id="applications-tracker-container" class="ak-track-list"><p style="color:#64748b;">Loading…</p></div>' +
                '</div>';

            const legacyGrid = preregPane.querySelector('#ak-events-grid');
            if (legacyGrid) legacyGrid.id = 'ak-prereg-events-grid';

            preregPane.replaceWith(preregHub, mainHub);
        }
        const compPane = document.getElementById('tab-competition');
        if (compPane && !document.getElementById('tab-comp-register')) {
            const formCard = compPane.querySelector('#competition-form')?.closest('.card');
            const listCard = compPane.querySelector('#comp-list')?.closest('.card');
            const regPane = document.createElement('div');
            regPane.id = 'tab-comp-register';
            regPane.className = 'tab-pane hidden';
            regPane.innerHTML =
                '<h3 class="section-title">Register competition entry</h3>' +
                '<p style="color:#64748b;margin-bottom:16px;">Upload photos, videos, PPT, or PDF for competitions.</p>';
            if (formCard) regPane.appendChild(formCard);
            const trackPane = document.createElement('div');
            trackPane.id = 'tab-comp-track';
            trackPane.className = 'tab-pane hidden';
            trackPane.innerHTML =
                '<div class="ak-track-page">' +
                '<div class="ak-track-page-head">' +
                '<h3><i class="fas fa-photo-video" style="color:#7c3aed;margin-right:8px;"></i> Track competition entries</h3>' +
                '<p>See when your files are received, reviewed, and approved.</p>' +
                '</div>' +
                '<section class="ak-track-section ak-track-section--comp">' +
                '<h4 class="ak-track-section-title"><i class="fas fa-trophy"></i> Your entries</h4>' +
                '<div id="comp-list" class="ak-track-list"></div>' +
                '</section></div>';
            if (listCard) {
                listCard.querySelector('#comp-list')?.remove();
                listCard.remove();
            }
            compPane.replaceWith(regPane, trackPane);
        }
        ensureApplicantTrackingTabs();
    }

    function showPreregTrackView() {
        if (typeof switchTab === 'function') switchTab('tab-prereg-track');
        loadPreregList();
    }

    function showMainRegTrackView() {
        if (typeof switchTab === 'function') switchTab('tab-main-reg-track');
        if (typeof loadApplications === 'function') loadApplications(true);
    }

    function preregListEl() {
        return document.getElementById('prereg-list');
    }

    function compListEl() {
        return document.getElementById('comp-list');
    }

    function showPreregHubView() {
        if (typeof switchTab === 'function') switchTab('tab-prereg-hub');
        hideEventRegisterForms();
        loadPreregSeminars();
    }

    function showMainRegHubView() {
        if (typeof switchTab === 'function') switchTab('tab-main-reg-hub');
        hideEventRegisterForms();
        loadMainRegEvents();
    }

    window.showPreregTrackView = showPreregTrackView;
    window.showMainRegTrackView = showMainRegTrackView;

    window.showEventRegisterView = showPreregHubView;
    window.showEventTrackView = showMainRegHubView;
    window.showMainRegHubView = showMainRegHubView;

    function showCompRegisterView() {
        if (typeof switchTab === 'function') switchTab('tab-comp-register');
        loadCompetitionEvents().then(() => renderCompetitionSchedulePanel());
    }

    function showCompTrackView() {
        if (typeof switchTab === 'function') switchTab('tab-comp-track');
        loadCompetitionList();
    }

    async function loadCompetitionEvents() {
        try {
            const data = await fetchJson('/api/competition/events');
            competitionEvents = Array.isArray(data.events) ? data.events : [];
        } catch (_) {
            competitionEvents = [];
        }
        refreshCompetitionNavVisibility();
        populateCompetitionEventSelect();
        return competitionEvents;
    }

    function refreshCompetitionNavVisibility() {
        const hasComp = competitionEvents.length > 0;
        document.querySelectorAll('[data-tab="tab-comp-register"], [data-tab="tab-comp-track"]').forEach((el) => {
            el.style.display = hasComp ? '' : 'none';
        });
        document.querySelectorAll('[data-ak-hub="comp-register"], [data-ak-hub="comp-track"]').forEach((el) => {
            el.style.display = hasComp ? '' : 'none';
        });
        document
            .querySelectorAll('.ak-hub-tile[onclick*="showCompRegisterView"], .ak-hub-tile[onclick*="showCompTrackView"]')
            .forEach((el) => {
                el.style.display = hasComp ? '' : 'none';
            });
    }

    function populateCompetitionEventSelect() {
        const sel = document.getElementById('comp-seminar-select');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">Select event</option>';
        competitionEvents.forEach((ev) => {
            const opt = document.createElement('option');
            opt.value = String(ev.id);
            const st =
                ev.windowState === 'open'
                    ? ' — open now'
                    : ev.windowState === 'upcoming'
                      ? ' — opens soon'
                      : ev.windowState === 'unscheduled'
                        ? ' — schedule pending'
                        : ' — closed';
            opt.textContent = (ev.title || 'Event') + st;
            if (ev.windowState !== 'open') opt.disabled = ev.windowState === 'closed';
            sel.appendChild(opt);
        });
        if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
        renderCompetitionSchedulePanel();
    }

    function renderCompetitionSchedulePanel() {
        const panel = document.getElementById('comp-event-schedule');
        const sel = document.getElementById('comp-seminar-select');
        const submitBtn = document.querySelector('#competition-form button[type="submit"]');
        if (!panel) return;
        if (!competitionEvents.length) {
            panel.classList.remove('hidden');
            panel.innerHTML =
                '<strong style="color:#6b21a8;">No competition events</strong><p style="margin:6px 0 0;">Registration forms are available; competition uploads are not open for any event yet.</p>';
            if (submitBtn) submitBtn.disabled = true;
            return;
        }
        const sid = sel && sel.value ? parseInt(sel.value, 10) : null;
        const ev = sid ? competitionEvents.find((x) => Number(x.id) === sid) : null;
        if (!ev) {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        panel.classList.remove('hidden');
        let html = '';
        if (ev.instructions) {
            html += '<p style="margin:0 0 8px;"><strong style="color:#6b21a8;">Competition details</strong><br>' + escapeAkHtml(ev.instructions) + '</p>';
        }
        const startLabel = ev.competitionStart ? akFormatTrackDateTime(ev.competitionStart) : '—';
        const endLabel = ev.competitionEnd ? akFormatTrackDateTime(ev.competitionEnd) : '—';
        html += '<p style="margin:0;font-size:0.84rem;"><strong>Submissions:</strong> ' + escapeAkHtml(startLabel) + ' to ' + escapeAkHtml(endLabel) + '</p>';
        if (ev.windowState === 'open') {
            html +=
                '<p style="margin:8px 0 0;color:#047857;font-weight:600;"><i class="fas fa-check-circle"></i> Open for submissions now.</p>';
            if (submitBtn) submitBtn.disabled = false;
        } else if (ev.windowState === 'upcoming') {
            html +=
                '<p style="margin:8px 0 0;color:#b45309;font-weight:600;"><i class="fas fa-hourglass-half"></i> Not open yet — check back when submissions start.</p>';
            if (submitBtn) submitBtn.disabled = true;
        } else if (ev.windowState === 'unscheduled') {
            html +=
                '<p style="margin:8px 0 0;color:#64748b;font-weight:600;">Schedule not set yet by organisers.</p>';
            if (submitBtn) submitBtn.disabled = true;
        } else {
            html += '<p style="margin:8px 0 0;color:#94a3b8;font-weight:600;">Submissions closed for this event.</p>';
            if (submitBtn) submitBtn.disabled = true;
        }
        panel.innerHTML = html;
    }

    function showCaseRegisterView() {
        if (typeof switchTab === 'function') switchTab('tab-abstract');
        if (typeof loadCaseProgramsGrid === 'function') loadCaseProgramsGrid();
    }

    function showCaseTrackView() {
        if (typeof switchTab === 'function') switchTab('tab-case-track');
        if (typeof loadCaseApplicationsTracker === 'function') loadCaseApplicationsTracker();
    }

    window.showCompRegisterView = showCompRegisterView;
    window.showCompTrackView = showCompTrackView;
    window.showCaseRegisterView = showCaseRegisterView;
    window.showCaseTrackView = showCaseTrackView;

    function enableCasePresentationNav() {
        document.querySelectorAll('[data-tab="tab-abstract"], [data-tab="tab-case-track"]').forEach((el) => {
            el.classList.remove('hidden');
            el.style.display = '';
        });
    }

    function hideAutismDisabledTabs() {
        HIDDEN_TABS.forEach((tabId) => {
            document.querySelectorAll(`[data-tab="${tabId}"]`).forEach((el) => el.remove());
            document.getElementById(tabId)?.remove();
        });
        document.getElementById('nav-volunteer')?.remove();
        document.getElementById('tab-volunteer')?.remove();
        const ann = document.querySelector('.announcements-box');
        if (ann) {
            const h = ann.querySelector('h4');
            if (h) h.innerHTML = '<i class="fas fa-bullhorn"></i> Announcements';
        }
        document.querySelector('[onclick*="tab-orders"]')?.remove();
        document.getElementById('make-payments-container')?.remove();
    }

    function updateProfileDisplayName() {
        if (typeof formatApplicantDisplayName !== 'function') return;
        const user = window.currentUser;
        if (!user) return;
        const name = formatApplicantDisplayName(user);
        const profileEl = document.getElementById('profile-display-name');
        if (profileEl) profileEl.textContent = name || '—';
        const hi = document.getElementById('header-name');
        if (hi) hi.textContent = name ? `Hi, ${name}` : 'Hi there';
    }

    function currentUserId() {
        if (window.currentUser) {
            const raw = window.currentUser.id != null ? window.currentUser.id : window.currentUser.user_id;
            if (raw != null) {
                const n = Number(raw);
                if (Number.isInteger(n) && n > 0) return n;
            }
        }
        if (typeof doctorNumericUserId === 'function') {
            const n = doctorNumericUserId();
            if (n) return n;
        }
        try {
            if (typeof PortalAuth !== 'undefined') {
                const u = PortalAuth.getUser('doctor');
                if (u) {
                    const raw = u.id != null ? u.id : u.user_id;
                    if (raw != null) {
                        const n = Number(raw);
                        if (Number.isInteger(n) && n > 0) return n;
                    }
                }
            }
            const keys = ['seminar_doctor_user', 'portalUser', 'doctorUser', 'seminar_user'];
            for (let i = 0; i < keys.length; i++) {
                const raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                const u = JSON.parse(raw);
                const idRaw = u && (u.id != null ? u.id : u.user_id);
                if (idRaw != null) {
                    const n = Number(idRaw);
                    if (Number.isInteger(n) && n > 0) return n;
                }
            }
        } catch (_) {
            /* ignore */
        }
        return null;
    }

    async function fetchJson(url, opts) {
        if (window.httpJson) return window.httpJson(url, opts);
        const r = await fetch(url, opts);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        return data;
    }

    window.PORTAL_IS_AUTISM = true;

    let preregFields = [];
    let preregSeminars = [];
    let preregResubmitId = null;
    let preregGridCountdownTimer = null;
    let preregWizardStep = 1;
    const DEFAULT_PREREG_STEP_SECTIONS = [
        { step: 1, title: 'Parent', subtitle: '' },
        { step: 2, title: 'Child', subtitle: '' },
        { step: 3, title: 'Address', subtitle: '' },
        { step: 4, title: 'Questions', subtitle: '' }
    ];
    let preregStepSections = DEFAULT_PREREG_STEP_SECTIONS.slice();
    let __preregPinLookupTimer = null;

    function normalizePreregStepSections(raw) {
        const fb = DEFAULT_PREREG_STEP_SECTIONS;
        const src = Array.isArray(raw) && raw.length ? raw : fb;
        const byStep = {};
        fb.forEach((s) => {
            byStep[s.step] = { ...s };
        });
        src.forEach((s) => {
            if (!s || s.step == null) return;
            const n = parseInt(s.step, 10);
            if (Number.isNaN(n) || n < 1) return;
            byStep[n] = {
                step: n,
                title: s.title != null && String(s.title).trim() ? String(s.title).trim() : byStep[n].title,
                subtitle: s.subtitle != null ? String(s.subtitle).trim() : byStep[n].subtitle
            };
        });
        return Object.keys(byStep)
            .map((k) => byStep[parseInt(k, 10)])
            .sort((a, b) => a.step - b.step);
    }

    function preregStepTitle(step) {
        const n = parseInt(step, 10);
        const hit = preregStepSections.find((s) => s.step === n);
        return (hit && hit.title) || `Step ${n}`;
    }

    function preregStepSubtitle(step) {
        const n = parseInt(step, 10);
        const hit = preregStepSections.find((s) => s.step === n);
        return hit && hit.subtitle ? hit.subtitle : '';
    }

    function getPreregWizardSteps() {
        const maxStep = preregMaxWizardStep();
        const steps = [];
        for (let s = 1; s <= maxStep; s++) {
            const hit = preregStepSections.find((st) => st.step === s);
            steps.push({ n: s, label: (hit && hit.title) || `Step ${s}` });
        }
        return steps;
    }

    function appendPreregStepPanelHeading(panel, step) {
        const title = preregStepTitle(step);
        const subtitle = preregStepSubtitle(step);
        const h = document.createElement('h4');
        h.className = 'ak-form-step-heading';
        h.style.cssText = 'color:#0f766e;margin:0 0 14px;font-size:1.05rem;';
        h.textContent = title;
        panel.appendChild(h);
        if (subtitle) {
            const p = document.createElement('p');
            p.className = 'ak-form-step-subheading';
            p.style.cssText = 'color:#64748b;margin:-8px 0 14px;font-size:0.88rem;';
            p.textContent = subtitle;
            panel.appendChild(p);
        }
    }

    async function loadPreregFormConfig(seminarId) {
        const q = seminarId ? `?seminarId=${encodeURIComponent(seminarId)}` : '';
        const data = await fetchJson('/api/preregistration-form-config' + q);
        window.__preregOtpOnApplication = !!data.otpOnApplication;
        window.__preregOtpOnStep1 = !!data.otpOnStep1;
        window.__preregOtpOnSubmit = !!data.otpOnSubmit;
        window.__preregEmailConfigured = !!data.emailConfigured;
        window.__preregWhatsappConfigured = !!data.whatsappConfigured;
        preregStepSections = normalizePreregStepSections(data.stepSections);
        window.__preregStepSections = preregStepSections;
        const otpOn = window.__preregOtpOnApplication;
        preregFields = (data.fields || []).map((f) => {
            if (!f || !otpOn) return { ...f, verifyOtp: false };
            if (f.key === 'email' && f.verifyOtp && !data.emailConfigured) return { ...f, verifyOtp: false };
            if (f.key === 'phone' && f.verifyOtp && !data.whatsappConfigured) return { ...f, verifyOtp: false };
            return f;
        });
        if (typeof window.__akExposePreregFields === 'function') {
            window.__akExposePreregFields(preregFields);
        } else {
            window.__akPreregFields = preregFields;
        }
        syncPreregOtpUi();
        return data;
    }

    function preregFieldNeedsEmailOtp() {
        if (!window.__preregOtpOnApplication || !window.__preregEmailConfigured) return false;
        return !!(
            window.__preregOtpOnStep1 ||
            (preregFields || []).some((f) => f && f.key === 'email' && f.verifyOtp && f.enabled !== false)
        );
    }

    function preregFieldNeedsPhoneOtp() {
        if (!window.__preregOtpOnApplication || !window.__preregWhatsappConfigured) return false;
        return !!(
            window.__preregOtpOnStep1 ||
            (preregFields || []).some((f) => f && f.key === 'phone' && f.verifyOtp && f.enabled !== false)
        );
    }

    function syncPreregOtpUi() {
        const panel = document.getElementById('prereg-seminar-otp-panel');
        const hint = document.getElementById('prereg-otp-panel-hint');
        const needs = preregFieldNeedsEmailOtp() || preregFieldNeedsPhoneOtp();
        if (panel) {
            if (window.__preregOtpOnApplication && needs) panel.classList.remove('hidden');
            else panel.classList.add('hidden');
        }
        if (hint) {
            const parts = [];
            if (window.__preregOtpOnStep1) parts.push('email / WhatsApp on this form');
            if (window.__preregOtpOnSubmit) parts.push('preview before submit');
            hint.textContent = parts.length
                ? 'Verify on: ' + parts.join(' and ') + '.'
                : needs
                  ? 'Use Send code on email or phone fields before submitting.'
                  : 'OTP is disabled for this event.';
        }
        document.querySelectorAll('.prereg-field-otp-row').forEach((row) => {
            const key = row.getAttribute('data-field-key');
            const show =
                (key === 'email' && preregFieldNeedsEmailOtp()) || (key === 'phone' && preregFieldNeedsPhoneOtp());
            row.style.display = show ? '' : 'none';
        });
    }

    function preregFieldsForStep(step) {
        return (preregFields || []).filter((f) => {
            if (!f || f.enabled === false) return false;
            if (
                f.key === 'qual' ||
                f.onlyWhenAdvancedQual ||
                f.onlyWhenPgCollege ||
                ['ncism', 'certificate', 'cpin', 'college', 'ccity', 'cstate'].includes(String(f.key || ''))
            ) {
                return false;
            }
            const s = Number(f.step) || 1;
            return s === step;
        });
    }

    function preregMaxWizardStep() {
        const steps = (preregFields || [])
            .map((f) => Number(f.step) || 1)
            .filter((n) => n > 0);
        return steps.length ? Math.max(...steps) : 4;
    }

    function fillPreregSelectOptions(sel, options, placeholder) {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholder || 'Select';
        sel.appendChild(opt0);
        for (const v of options || []) {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = v;
            sel.appendChild(o);
        }
        if (prev && (options || []).includes(prev)) sel.value = prev;
        else if ((options || []).length === 1) sel.value = options[0];
    }

    function setPreregPinHint(msg, isError) {
        const el = document.getElementById('prereg-pin-hint');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
        el.style.color = isError ? '#b91c1c' : '#64748b';
    }

    function ensurePreregCityControl(cities) {
        const existing = document.getElementById('prereg-field-city');
        if (!existing) return;
        const fg = existing.closest('.form-group');
        if (!fg) return;
        const label = fg.querySelector('label');
        const labelText = label ? label.textContent : 'City *';
        const prev = existing.value;
        if ((cities || []).length > 1) {
            const sel = document.createElement('select');
            sel.id = 'prereg-field-city';
            sel.dataset.fieldKey = 'city';
            sel.required = true;
            fillPreregSelectOptions(sel, cities, 'Select city');
            if (prev) sel.value = prev;
            existing.replaceWith(sel);
        } else if (existing.tagName === 'SELECT') {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.id = 'prereg-field-city';
            inp.dataset.fieldKey = 'city';
            inp.required = true;
            inp.value = prev || (cities && cities[0]) || '';
            existing.replaceWith(inp);
        }
        if (label) label.textContent = labelText;
    }

    async function autofillPreregAddress() {
        const pinEl = document.getElementById('prereg-field-pin');
        if (!pinEl) return;
        const pin = String(pinEl.value || '').replace(/\D/g, '');
        if (pin.length !== 6) {
            if (pin.length) setPreregPinHint('Enter a valid 6-digit pincode', true);
            return;
        }
        setPreregPinHint('Looking up pincode…');
        try {
            const r = await fetch('/api/public/pincode-lookup?pin=' + encodeURIComponent(pin));
            const data = await r.json();
            if (!data || !data.ok) {
                setPreregPinHint((data && data.error) || 'Pincode not found', true);
                return;
            }
            const cities = data.cities || [];
            ensurePreregCityControl(cities);
            const cityEl = document.getElementById('prereg-field-city');
            if (cityEl) {
                if (cityEl.tagName === 'SELECT') fillPreregSelectOptions(cityEl, cities, 'Select city');
                else if (cities.length === 1) cityEl.value = cities[0];
            }
            const stateEl = document.getElementById('prereg-field-state');
            if (stateEl && (data.states || []).length) {
                if (stateEl.tagName === 'SELECT') {
                    fillPreregSelectOptions(stateEl, data.states || [], 'Select state');
                } else {
                    stateEl.value = (data.states && data.states[0]) || '';
                }
            }
            const countryEl = document.getElementById('prereg-field-country');
            if (countryEl) countryEl.value = data.country || 'India';
            setPreregPinHint(
                cities.length > 1
                    ? 'Multiple cities for this pincode — choose one (state auto-filled)'
                    : 'City, state and country filled from pincode'
            );
        } catch (_) {
            setPreregPinHint('Could not look up pincode. Check your connection and try again.', true);
        }
    }

    function wirePreregPinLookup() {
        const pinEl = document.getElementById('prereg-field-pin');
        if (!pinEl || pinEl.dataset.bound === '1') return;
        pinEl.dataset.bound = '1';
        pinEl.setAttribute('inputmode', 'numeric');
        pinEl.setAttribute('maxlength', '6');
        pinEl.addEventListener('blur', autofillPreregAddress);
        pinEl.addEventListener('input', () => {
            clearTimeout(__preregPinLookupTimer);
            __preregPinLookupTimer = setTimeout(autofillPreregAddress, 400);
        });
    }

    function renderPreregWizardNav() {
        const nav = document.getElementById('prereg-wizard-nav');
        if (!nav) return;
        nav.innerHTML = '';
        getPreregWizardSteps().forEach((st) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.step = String(st.n);
            btn.textContent = st.n + '. ' + st.label;
            btn.addEventListener('click', () => {
                if (st.n < preregWizardStep && validatePreregStep(preregWizardStep, false)) {
                    showPreregWizardStep(st.n);
                } else if (st.n === preregWizardStep) {
                    return;
                } else if (st.n > preregWizardStep) {
                    if (!validatePreregStepsThrough(st.n - 1)) return;
                    showPreregWizardStep(st.n);
                }
            });
            nav.appendChild(btn);
        });
    }

    function updatePreregWizardNav() {
        const nav = document.getElementById('prereg-wizard-nav');
        if (!nav) return;
        nav.querySelectorAll('button[data-step]').forEach((btn) => {
            const n = parseInt(btn.dataset.step, 10);
            btn.classList.toggle('is-active', n === preregWizardStep);
            btn.classList.toggle('is-done', n < preregWizardStep);
        });
    }

    function updatePreregWizardActions() {
        const maxStep = preregMaxWizardStep();
        const back = document.getElementById('prereg-wizard-back');
        const next = document.getElementById('prereg-wizard-next');
        const submit = document.getElementById('prereg-submit-btn');
        if (back) back.style.display = preregWizardStep > 1 ? '' : 'none';
        if (next) next.style.display = preregWizardStep < maxStep ? '' : 'none';
        if (submit) submit.style.display = preregWizardStep >= maxStep ? '' : 'none';
    }

    function showPreregWizardStep(step) {
        preregWizardStep = Math.max(1, Math.min(step, preregMaxWizardStep()));
        document.querySelectorAll('.ak-prereg-step-panel').forEach((panel) => {
            panel.classList.toggle('hidden', parseInt(panel.dataset.step, 10) !== preregWizardStep);
        });
        updatePreregWizardNav();
        updatePreregWizardActions();
        if (preregWizardStep === 3) wirePreregPinLookup();
    }

    function resetPreregWizard() {
        preregWizardStep = 1;
        showPreregWizardStep(1);
        setPreregPinHint('');
    }

    function createPreregFieldInput(f) {
        let input;
        if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else if (f.type === 'select') {
            input = document.createElement('select');
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = 'Select';
            input.appendChild(opt0);
            (f.options || []).forEach((o) => {
                const opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = o.label || o.value;
                input.appendChild(opt);
            });
        } else if (f.type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
        } else if (f.type === 'file') {
            input = document.createElement('input');
            input.type = 'file';
        } else {
            input = document.createElement('input');
            if (f.type === 'email') input.type = 'email';
            else if (f.type === 'tel') input.type = 'tel';
            else if (f.type === 'date') input.type = 'date';
            else if (f.type === 'number') input.type = 'number';
            else input.type = 'text';
        }
        input.id = 'prereg-field-' + f.key;
        input.dataset.fieldKey = f.key;
        if (f.required && f.type !== 'boolean') input.required = true;
        if (f.defaultValue != null && f.type !== 'boolean') input.value = String(f.defaultValue);
        return input;
    }

    function renderPreregFields(container) {
        if (!container) return;
        container.innerHTML = '';
        const maxStep = preregMaxWizardStep();
        for (let step = 1; step <= maxStep; step++) {
            const panel = document.createElement('div');
            panel.className = 'ak-prereg-step-panel' + (step === 1 ? '' : ' hidden');
            panel.dataset.step = String(step);
            if (preregFieldsForStep(step).length) appendPreregStepPanelHeading(panel, step);
            preregFieldsForStep(step).forEach((f) => {
                const fg = document.createElement('div');
                fg.className = 'form-group';
                const label = document.createElement('label');
                label.textContent = f.label + (f.required ? ' *' : '');
                fg.appendChild(label);
                fg.appendChild(createPreregFieldInput(f));
                if (
                    (f.key === 'email' && preregFieldNeedsEmailOtp()) ||
                    (f.key === 'phone' && preregFieldNeedsPhoneOtp())
                ) {
                    const otpRow = document.createElement('div');
                    otpRow.className = 'prereg-field-otp-row';
                    otpRow.dataset.fieldKey = f.key;
                    otpRow.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
                    const ch = f.key === 'email' ? 'email' : 'phone';
                    otpRow.innerHTML =
                        '<button type="button" class="btn-primary" onclick="akSendPreregOtp(\'' +
                        ch +
                        '\')">Send code</button>' +
                        '<input type="text" id="prereg-otp-code-' +
                        ch +
                        '" placeholder="Code" style="max-width:100px;padding:8px;">' +
                        '<button type="button" class="btn-primary" onclick="akVerifyPreregOtp(\'' +
                        ch +
                        '\')">Verify</button>' +
                        '<span id="prereg-otp-status-' +
                        ch +
                        '" style="font-size:0.85rem;color:#64748b;"></span>';
                    fg.appendChild(otpRow);
                }
                panel.appendChild(fg);
            });
            container.appendChild(panel);
        }
        renderPreregWizardNav();
        resetPreregWizard();
        wirePreregPinLookup();
        syncPreregOtpUi();
        applyUserDefaultsToPreregForm();
    }

    function applyUserDefaultsToPreregForm() {
        const u = window.currentUser;
        if (!u) return;
        const fullName = [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(' ').trim();
        const defaults = {
            parent_name: fullName,
            email: u.email || '',
            phone: u.phone || ''
        };
        (window.__akPreregFields || preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const val = defaults[f.key];
            if (val == null || String(val).trim() === '') return;
            const el = document.getElementById('prereg-field-' + f.key);
            if (!el) return;
            if (f.type !== 'boolean' && String(el.value || '').trim() !== '') return;
            if (f.type === 'boolean') el.checked = !!val;
            else el.value = val;
        });
    }

    function akPreregSeminarId() {
        return parseInt(document.getElementById('prereg-seminar-select')?.value, 10) || 0;
    }

    window.akSendPreregOtp = function (channel) {
        const sid = akPreregSeminarId();
        if (!sid) return alert('Select an event first.');
        if (typeof sendRegistrationOtpForField !== 'function') return;
        const saved = typeof activeSeminarIdForReg !== 'undefined' ? activeSeminarIdForReg : null;
        activeSeminarIdForReg = sid;
        sendRegistrationOtpForField(channel);
        activeSeminarIdForReg = saved;
    };

    window.akVerifyPreregOtp = function (channel) {
        const sid = akPreregSeminarId();
        if (!sid) return alert('Select an event first.');
        if (typeof verifyRegistrationOtpForField !== 'function') return;
        const saved = typeof activeSeminarIdForReg !== 'undefined' ? activeSeminarIdForReg : null;
        activeSeminarIdForReg = sid;
        verifyRegistrationOtpForField(channel);
        activeSeminarIdForReg = saved;
    };

    function preregFieldValue(f) {
        const el = document.getElementById('prereg-field-' + f.key);
        if (!el) return '';
        if (f.type === 'boolean') return el.checked;
        if (f.type === 'file') return el.files && el.files[0] ? el.files[0].name : '';
        return String(el.value || '').trim();
    }

    function seminarFlowFlags(seminarRow) {
        try {
            const parsed = seminarRow && seminarRow.registration_form_json ? JSON.parse(seminarRow.registration_form_json) : {};
            const flow = parsed && typeof parsed.flow === 'object' ? parsed.flow : {};
            const hasFlow =
                Object.prototype.hasOwnProperty.call(flow, 'preregistrationRequired') ||
                Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationRequired');
            if (!hasFlow) {
                return {
                    preregistrationRequired: true,
                    mainRegistrationRequired: true,
                    mainRegistrationOpen: true,
                    autoAcceptPreregistration: false,
                    autoAcceptRegistration: false
                };
            }
            const preregistrationRequired = flow.preregistrationRequired === true;
            const mainRegistrationRequired = flow.mainRegistrationRequired === true;
            let mainRegistrationOpen = true;
            if (mainRegistrationRequired && !preregistrationRequired) {
                mainRegistrationOpen = true;
            } else if (mainRegistrationRequired && preregistrationRequired) {
                mainRegistrationOpen = Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationOpen')
                    ? flow.mainRegistrationOpen === true
                    : false;
            } else {
                mainRegistrationOpen = false;
            }
            return {
                preregistrationRequired,
                mainRegistrationRequired,
                mainRegistrationOpen,
                autoAcceptPreregistration: flow.autoAcceptPreregistration === true,
                autoAcceptRegistration: flow.autoAcceptRegistration === true
            };
        } catch (_) {
            return {
                preregistrationRequired: true,
                mainRegistrationRequired: true,
                mainRegistrationOpen: true,
                autoAcceptPreregistration: false,
                autoAcceptRegistration: false
            };
        }
    }

    function preregFormPanelEl() {
        return document.getElementById('ak-prereg-form-panel');
    }

    function showPreregFormPanel(eventTitle) {
        hideMainRegFormPanel();
        const panel = preregFormPanelEl();
        if (!panel) return;
        const heading = document.getElementById('ak-prereg-form-heading');
        if (heading) {
            heading.textContent = eventTitle
                ? 'Pre-registration form — ' + eventTitle
                : 'Pre-registration form';
        }
        const title = eventTitle ? 'Pre-registration — ' + eventTitle : 'Pre-registration';
        openRegisterModal(title, panel);
    }

    function hidePreregFormPanel() {
        const panel = preregFormPanelEl();
        if (isPanelInRegisterModal(panel)) closeRegisterModal(panel);
        else if (panel) panel.classList.add('hidden');
        const msg = document.getElementById('prereg-status-msg');
        if (msg) msg.textContent = '';
    }

    function ensureHubBanner(hostId, bannerId) {
        const host = document.getElementById(hostId);
        if (!host) return null;
        let el = document.getElementById(bannerId);
        if (!el) {
            el = document.createElement('div');
            el.id = bannerId;
            el.setAttribute('role', 'status');
            el.className = 'ak-hub-success-banner hidden';
            el.style.cssText =
                'margin:0 0 16px;padding:14px 16px;border-radius:10px;font-weight:600;line-height:1.5;';
            host.insertBefore(el, host.firstChild);
        }
        return el;
    }

    function showHubSuccessBanner(hostId, bannerId, html, tone) {
        const el = ensureHubBanner(hostId, bannerId);
        if (!el) return;
        const colors =
            tone === 'error'
                ? { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }
                : { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' };
        el.style.background = colors.bg;
        el.style.border = '1px solid ' + colors.border;
        el.style.color = colors.text;
        el.innerHTML = html;
        el.classList.remove('hidden');
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {}
    }

    let successModalOnClose = null;

    async function resolveBrandingLogoUrl() {
        if (window.__siteLogoPath) return window.__siteLogoPath;
        try {
            const res = await fetch('/api/branding/logo', { cache: 'no-store' });
            const data = await res.json();
            return (data && data.logoPath) || '/api/branding/logo/file';
        } catch (_) {
            return '/api/branding/logo/file';
        }
    }

    function closeSubmissionSuccessModal() {
        document.getElementById('ak-submit-success-modal')?.classList.add('hidden');
        document.body.classList.remove('ak-success-modal-open');
        const fn = successModalOnClose;
        successModalOnClose = null;
        if (fn) fn();
    }

    async function showSubmissionSuccessModal(opts) {
        opts = opts || {};
        dismissRegisterModal();
        if (typeof window.closeFormPreviewModal === 'function') window.closeFormPreviewModal();
        const modal = document.getElementById('ak-submit-success-modal');
        const titleEl = document.getElementById('ak-success-title');
        const msgEl = document.getElementById('ak-success-message');
        const trackEl = document.getElementById('ak-success-tracking');
        const logoEl = document.getElementById('ak-success-logo');
        const code = opts.applicationNo ? String(opts.applicationNo) : '';
        const title =
            opts.title ||
            (opts.kind === 'main' ? 'Main registration submitted' : 'Pre-registration submitted');
        const message = opts.message || 'Your application was received successfully.';
        if (!modal) {
            alert(message + (code ? '\n\nTracking ID: ' + code : ''));
            if (typeof opts.onClose === 'function') opts.onClose();
            return;
        }
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (trackEl) {
            trackEl.textContent = '';
            trackEl.classList.add('hidden');
        }
        const noteEl = document.getElementById('ak-success-note');
        if (noteEl) {
            noteEl.textContent =
                opts.kind === 'main'
                    ? 'Open Main reg tracking from the menu to see your application status and tracking ID.'
                    : 'Open Pre-reg tracking from the menu to see your application status and tracking ID.';
        }
        const okBtn = document.getElementById('ak-success-ok-btn');
        if (okBtn) {
            okBtn.textContent =
                opts.kind === 'main' ? 'Open main reg tracking' : 'Open pre-reg tracking';
        }
        if (logoEl) logoEl.classList.add('hidden');
        successModalOnClose = typeof opts.onClose === 'function' ? opts.onClose : null;
        modal.classList.remove('hidden');
        document.body.classList.add('ak-success-modal-open');
        document.getElementById('ak-success-ok-btn')?.focus();
        if (logoEl) {
            try {
                const url = await resolveBrandingLogoUrl();
                if (url) {
                    logoEl.src = url;
                    logoEl.classList.remove('hidden');
                }
            } catch (_) {}
        }
    }
    window.formatMainRegSubmitSuccessHtml = formatMainRegSubmitSuccessHtml;
    window.formatPreregSubmitSuccessHtml = formatPreregSubmitSuccessHtml;
    window.showHubSuccessBanner = showHubSuccessBanner;
    window.closeSubmissionSuccessModal = closeSubmissionSuccessModal;

    function formatPreregSubmitSuccessHtml(result) {
        const appNo = result && result.applicationNo ? escapeAkHtml(String(result.applicationNo)) : '';
        const msg = result && result.message ? escapeAkHtml(result.message) : 'Application submitted successfully.';
        const st = String((result && result.status) || 'submitted').toLowerCase();
        const followUp =
            st === 'approved'
                ? 'When final registration opens, use the <strong>Main registration</strong> tab.'
                : 'Open <strong>Pre-reg tracking</strong> from the menu for status updates.';
        return (
            '<p style="margin:0 0 6px;"><i class="fas fa-check-circle"></i> ' +
            msg +
            '</p>' +
            '<p style="margin:8px 0 0;font-size:0.88rem;font-weight:500;">' +
            followUp +
            '</p>'
        );
    }

    function formatMainRegSubmitSuccessHtml(result) {
        const msg =
            result && result.message
                ? escapeAkHtml(result.message)
                : 'Main registration submitted successfully.';
        return (
            '<p style="margin:0 0 6px;"><i class="fas fa-check-circle"></i> ' +
            msg +
            '</p>' +
            '<p style="margin:8px 0 0;font-size:0.88rem;font-weight:500;">Open <strong>Main reg tracking</strong> from the menu for your status and tracking ID.</p>'
        );
    }

    function hideEventRegisterForms() {
        hidePreregFormPanel();
        hideMainRegFormPanel();
    }

    function preregStatusForSeminar(seminarId) {
        const row = window.__akPreregBySeminar && window.__akPreregBySeminar[Number(seminarId)];
        return row ? String(row.status || '').toLowerCase() : '';
    }

    function isPreregApprovedForSeminar(seminarId) {
        return preregStatusForSeminar(seminarId) === 'approved';
    }

    function updatePreregCacheForSeminar(seminarId, patch) {
        const sid = Number(seminarId);
        if (!Number.isFinite(sid) || sid < 1) return;
        if (!window.__akPreregBySeminar) window.__akPreregBySeminar = {};
        const prev = window.__akPreregBySeminar[sid] || {};
        window.__akPreregBySeminar[sid] = Object.assign({}, prev, patch, { seminar_id: sid });
        _lastGridFp.prereg = '';
        _lastGridFp.main = '';
        const raw = window.__akAllSeminars || [];
        if (raw.length) {
            paintAutismEventsGrid('ak-prereg-events-grid', raw, window.__akPreregBySeminar, 'prereg');
            paintAutismEventsGrid('ak-main-events-grid', raw, window.__akPreregBySeminar, 'main');
        }
    }

    function openMainRegistrationForSeminar(seminarId) {
        const sid = Number(seminarId);
        if (!Number.isFinite(sid) || sid < 1) return;
        const existingApps =
            typeof userApplications !== 'undefined' && Array.isArray(userApplications) ? userApplications : [];
        if (existingApps.length >= 1) {
            const existing = existingApps[0];
            alert(
                'You already have a main registration (' +
                    (existing.application_no || existing.id) +
                    '). Only one main registration is allowed per account. Track it under Main registration.'
            );
            showMainRegHubView();
            return;
        }
        const seminar =
            (window.__akAllSeminars || []).find((x) => Number(x.id) === sid) ||
            (window.activeSeminars || []).find((x) => Number(x.id) === sid);
        if (seminar) {
            const flags = seminarFlowFlags(seminar);
            const mainWin = effectiveMainRegistrationWindowStateClient(seminar);
            if (mainWin.state === 'admin_closed') {
                alert(
                    'Final registration is not open yet for this event. You will be notified when the organisers enable it.'
                );
                return;
            }
            if (mainWin.state === 'unscheduled') {
                alert('Registration schedule is not set for this event yet.');
                return;
            }
            if (mainWin.state === 'upcoming') {
                alert(
                    'Registration has not opened yet for this seminar. Please wait until the countdown reaches zero.'
                );
                return;
            }
            if (mainWin.state === 'closed') {
                alert('Registration for this seminar has closed.');
                return;
            }
            if (flags.preregistrationRequired && !isPreregApprovedForSeminar(sid)) {
                alert('Complete pre-registration and wait for approval before main registration.');
                return;
            }
            if (flags.preregistrationRequired && !flags.mainRegistrationOpen) {
                alert(
                    'Final registration is not open yet for this event. You will be notified when the organisers enable it.'
                );
                return;
            }
        }
        if (typeof window.startRegistration === 'function') {
            const list = (window.__akAllSeminars || []).filter((s) => seminarFlowFlags(s).mainRegistrationRequired);
            window.activeSeminars = list.length ? list.slice() : window.activeSeminars || [];
            if (!window.activeSeminars.some((x) => Number(x.id) === sid)) {
                const fromAll = (window.__akAllSeminars || []).find((x) => Number(x.id) === sid);
                if (fromAll) window.activeSeminars.push(fromAll);
            }
            if (typeof window.switchTab === 'function') window.switchTab('tab-main-reg-hub');
            hidePreregFormPanel();
            window.startRegistration(sid);
            return;
        }
        if (typeof window.switchTab === 'function') window.switchTab('tab-main-reg-hub');
    }

    function akEscapeHtml(v) {
        if (typeof escapeHtml === 'function') return escapeHtml(v);
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function akFormatTrackDateTime(iso) {
        if (typeof formatTrackDateTime === 'function') return formatTrackDateTime(iso);
        if (window.PortalDateTime && window.PortalDateTime.formatLong) return window.PortalDateTime.formatLong(iso);
        return iso ? String(iso) : '—';
    }

    function akFormatEventDate(iso) {
        if (typeof formatEventDate === 'function') return formatEventDate(iso);
        return akFormatTrackDateTime(iso);
    }

    function registrationScheduleWindowStateClient(seminar, startKey, endKey) {
        const parseMs =
            window.PortalDateTime && window.PortalDateTime.parseMs
                ? (v) => window.PortalDateTime.parseMs(v)
                : (v) => (v ? new Date(v).getTime() : null);
        const parseEnd =
            window.PortalDateTime && window.PortalDateTime.parseRegistrationEndMs
                ? (v) => window.PortalDateTime.parseRegistrationEndMs(v)
                : parseMs;
        const startRaw = seminar && seminar[startKey];
        const endRaw = seminar && seminar[endKey];
        if (!startRaw || !String(startRaw).trim() || !endRaw || !String(endRaw).trim()) {
            return { state: 'unscheduled' };
        }
        const ps = parseMs(startRaw);
        const pe = parseEnd(endRaw);
        if (ps == null || Number.isNaN(ps) || pe == null || Number.isNaN(pe)) {
            return { state: 'unscheduled' };
        }
        const now = Date.now();
        if (now < ps) return { state: 'upcoming', opensAt: ps };
        if (now > pe) return { state: 'closed' };
        return { state: 'open' };
    }

    function preregWindowStateClient(seminar) {
        return registrationScheduleWindowStateClient(seminar, 'preregistration_start', 'preregistration_end');
    }

    function mainRegistrationWindowStateClient(seminar) {
        return registrationScheduleWindowStateClient(seminar, 'registration_start', 'registration_end');
    }

    function effectiveMainRegistrationWindowStateClient(seminar) {
        const flags = seminarFlowFlags(seminar);
        if (flags.preregistrationRequired && flags.mainRegistrationRequired && !flags.mainRegistrationOpen) {
            return { state: 'admin_closed' };
        }
        return mainRegistrationWindowStateClient(seminar);
    }

    function scheduleNotSetStatusHtml(kind) {
        const label =
            kind === 'prereg'
                ? 'Pre-registration schedule is not set yet.'
                : 'Registration schedule is not set yet.';
        return (
            '<p style="font-size:0.85rem;color:#64748b;margin-bottom:10px;"><i class="fas fa-calendar-xmark"></i> ' +
            akEscapeHtml(label) +
            '</p>'
        );
    }

    function hasExistingMainRegistration() {
        const apps =
            typeof userApplications !== 'undefined' && Array.isArray(userApplications) ? userApplications : [];
        return apps.length >= 1;
    }

    function alreadyRegisteredMainActionBlock() {
        return (
            '<button type="button" class="btn-primary" style="width:100%;background:#475569;" onclick="showMainRegTrackView()">Open tracking</button>'
        );
    }

    function alreadyRegisteredMainStatusHtml() {
        return (
            '<p style="font-size:0.85rem;color:#15803d;margin-bottom:10px;"><i class="fas fa-check-circle"></i> Already registered — see Main reg tracking</p>'
        );
    }

    function applyAlreadyRegisteredMainUi(actionBlock, statusBlock, gridMode) {
        if (gridMode !== 'main' || !hasExistingMainRegistration()) {
            return { actionBlock, statusBlock };
        }
        const isRegisterAction =
            actionBlock.indexOf('Register now') >= 0 || actionBlock.indexOf('data-mode="main"') >= 0;
        if (!isRegisterAction) return { actionBlock, statusBlock };
        if (statusBlock.indexOf('Already registered') < 0) {
            statusBlock += alreadyRegisteredMainStatusHtml();
        }
        return { actionBlock: alreadyRegisteredMainActionBlock(), statusBlock };
    }

    function syncMainRegStartCard() {
        const card = document.getElementById('ak-main-reg-start');
        if (!card || !document.body.classList.contains('ak-portal-dash')) return;
        if (!hasExistingMainRegistration()) return;
        const apps =
            typeof userApplications !== 'undefined' && Array.isArray(userApplications) ? userApplications : [];
        const app = apps[0];
        card.innerHTML =
            '<p style="margin:0 0 10px;font-size:0.92rem;color:#15803d;"><i class="fas fa-check-circle"></i> Already registered. Open <strong>Main reg tracking</strong> for status.</p>' +
            alreadyRegisteredMainActionBlock();
    }

    function buildAutismEventGridCard(s, preregBySeminar, gridMode) {
        gridMode = gridMode || 'prereg';
        const flags = seminarFlowFlags(s);
        const mainOnly = !flags.preregistrationRequired && flags.mainRegistrationRequired;
        if (gridMode === 'prereg' && !flags.preregistrationRequired) {
            return '';
        }
        if (gridMode === 'main' && !flags.mainRegistrationRequired) {
            return '';
        }
        const prereg = preregBySeminar[Number(s.id)] || null;
        const st = String((prereg && prereg.status) || '').toLowerCase();
        const preWin = flags.preregistrationRequired ? preregWindowStateClient(s) : { state: 'open' };
        const mainWin = flags.mainRegistrationRequired ? effectiveMainRegistrationWindowStateClient(s) : { state: 'open' };
        const eventLabel = akFormatEventDate(s.event_date);
        const preEndLabel = s.preregistration_end ? akFormatTrackDateTime(s.preregistration_end) : '';
        const regEndLabel = s.registration_end ? akFormatTrackDateTime(s.registration_end) : '';
        let statusBlock = '';
        let actionBlock = '';

        if (mainOnly) {
            if (mainWin.state === 'unscheduled') {
                statusBlock += scheduleNotSetStatusHtml('main');
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Register now</button>';
            } else if (mainWin.state === 'upcoming') {
                statusBlock +=
                    '<div style="background:#eef2ff;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #c7d2fe;">' +
                    '<p style="font-size:0.8rem;color:#4338ca;font-weight:600;"><i class="fas fa-hourglass-half"></i> Registration opens</p>' +
                    '<p style="font-size:0.9rem;color:#312e81;">' +
                    akEscapeHtml(akFormatTrackDateTime(s.registration_start)) +
                    '</p>' +
                    '<p id="ak-main-countdown-' +
                    s.id +
                    '" data-main-opens-at="' +
                    mainWin.opensAt +
                    '" style="font-size:1.1rem;font-weight:700;color:#0f766e;">' +
                    formatCountdownTo(mainWin.opensAt) +
                    '</p></div>';
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Register now</button>';
            } else if (mainWin.state === 'closed') {
                statusBlock += '<p style="font-size:0.85rem;color:#b45309;margin-bottom:10px;">Registration closed</p>';
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Registration closed</button>';
            } else {
                if (regEndLabel) {
                    statusBlock +=
                        '<p style="font-size:0.8rem;color:#64748b;margin-bottom:10px;">Closes ' + akEscapeHtml(regEndLabel) + '</p>';
                }
                actionBlock =
                    '<button type="button" class="btn-primary ak-prereg-grid-action" data-mode="main" data-sid="' +
                    s.id +
                    '" style="width:100%;">Register now</button>';
            }
        } else if (st === 'approved' && flags.mainRegistrationRequired && gridMode === 'prereg') {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#15803d;margin-bottom:8px;"><i class="fas fa-check-circle"></i> Pre-registration approved</p>';
            if (mainWin.state === 'admin_closed') {
                statusBlock +=
                    '<p style="font-size:0.85rem;color:#64748b;margin-bottom:10px;">Final registration is not open yet. We will notify you when it opens.</p>';
            } else if (mainWin.state === 'unscheduled') {
                statusBlock += scheduleNotSetStatusHtml('main');
            } else {
                statusBlock +=
                    '<p style="font-size:0.85rem;color:#64748b;margin-bottom:10px;">Open the <strong>Main registration</strong> tab when final registration opens.</p>';
            }
            if (mainWin.state === 'upcoming') {
                statusBlock +=
                    '<div style="background:#ecfdf5;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #a7f3d0;">' +
                    '<p style="font-size:0.8rem;color:#047857;font-weight:600;">Final registration opens</p>' +
                    '<p style="font-size:0.9rem;color:#065f46;">' +
                    akEscapeHtml(akFormatTrackDateTime(s.registration_start)) +
                    '</p>' +
                    '<p id="ak-main-countdown-' +
                    s.id +
                    '" data-main-opens-at="' +
                    mainWin.opensAt +
                    '" style="font-size:1.1rem;font-weight:700;color:#0f766e;">' +
                    formatCountdownTo(mainWin.opensAt) +
                    '</p></div>';
            }
            actionBlock =
                '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">' +
                (mainWin.state === 'admin_closed' || mainWin.state === 'unscheduled'
                    ? mainWin.state === 'admin_closed'
                        ? 'Final registration not open yet'
                        : 'Final registration schedule pending'
                    : 'Use Main registration tab') +
                '</button>';
        } else if (st === 'approved' && flags.mainRegistrationRequired && gridMode === 'main') {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#15803d;margin-bottom:8px;"><i class="fas fa-check-circle"></i> Pre-registration approved</p>';
            if (mainWin.state === 'admin_closed') {
                statusBlock +=
                    '<p style="font-size:0.85rem;color:#64748b;margin-bottom:10px;"><i class="fas fa-hourglass-half"></i> Final registration is not open yet. Please check back later.</p>';
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Final registration not open yet</button>';
            } else if (mainWin.state === 'unscheduled') {
                statusBlock += scheduleNotSetStatusHtml('main');
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Register now</button>';
            } else if (mainWin.state === 'upcoming') {
                statusBlock +=
                    '<div style="background:#ecfdf5;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #a7f3d0;">' +
                    '<p style="font-size:0.8rem;color:#047857;font-weight:600;">Final registration opens</p>' +
                    '<p style="font-size:0.9rem;color:#065f46;">' +
                    akEscapeHtml(akFormatTrackDateTime(s.registration_start)) +
                    '</p>' +
                    '<p id="ak-main-countdown-' +
                    s.id +
                    '" data-main-opens-at="' +
                    mainWin.opensAt +
                    '" style="font-size:1.1rem;font-weight:700;color:#0f766e;">' +
                    formatCountdownTo(mainWin.opensAt) +
                    '</p></div>';
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Register now</button>';
            } else if (mainWin.state === 'closed') {
                statusBlock += '<p style="font-size:0.85rem;color:#b45309;margin-bottom:10px;">Registration closed</p>';
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Registration closed</button>';
            } else {
                if (regEndLabel) {
                    statusBlock +=
                        '<p style="font-size:0.8rem;color:#64748b;margin-bottom:10px;">Closes ' + akEscapeHtml(regEndLabel) + '</p>';
                }
                actionBlock =
                    '<button type="button" class="btn-primary ak-prereg-grid-action" data-mode="main" data-sid="' +
                    s.id +
                    '" style="width:100%;">Register now</button>';
            }
        } else if (flags.preregistrationRequired && (st === 'submitted' || st === 'pending_approval')) {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#0f766e;margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> Pre-registration submitted</p>' +
                '<p style="font-size:0.85rem;color:#64748b;margin-bottom:10px;">Application under review — open Pre-reg tracking for updates.</p>';
            actionBlock =
                '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Under review</button>';
        } else if (flags.preregistrationRequired && st === 'revision_required') {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#0f766e;margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> Pre-registration enabled</p>' +
                '<p style="font-size:0.85rem;color:#7c3aed;margin-bottom:10px;">Update required</p>';
            actionBlock =
                '<button type="button" class="btn-primary ak-prereg-grid-action" data-mode="revise" data-sid="' +
                s.id +
                '" style="width:100%;background:#7c3aed;">Update application</button>';
        } else if (flags.preregistrationRequired && preWin.state === 'unscheduled' && !st) {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#0f766e;margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> Pre-registration enabled</p>';
            statusBlock += scheduleNotSetStatusHtml('prereg');
            actionBlock =
                '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Preregister</button>';
        } else if (flags.preregistrationRequired && preWin.state === 'upcoming') {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#0f766e;margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> Pre-registration enabled</p>';
            statusBlock +=
                '<div style="background:#eef2ff;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #c7d2fe;">' +
                '<p style="font-size:0.8rem;color:#4338ca;font-weight:600;"><i class="fas fa-hourglass-half"></i> Opens</p>' +
                '<p style="font-size:0.9rem;color:#312e81;">' +
                akEscapeHtml(akFormatTrackDateTime(s.preregistration_start)) +
                '</p>' +
                '<p id="ak-prereg-countdown-' +
                s.id +
                '" data-prereg-opens-at="' +
                preWin.opensAt +
                '" style="font-size:1.1rem;font-weight:700;color:#0f766e;">' +
                formatCountdownTo(preWin.opensAt) +
                '</p></div>';
            actionBlock =
                '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Preregister</button>';
        } else if (flags.preregistrationRequired && preWin.state === 'closed' && !st) {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#0f766e;margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> Pre-registration enabled</p>' +
                '<p style="font-size:0.85rem;color:#b45309;margin-bottom:10px;"><i class="fas fa-lock"></i> Pre-registration closed.</p>';
            actionBlock =
                '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Preregister</button>';
        } else if (flags.preregistrationRequired && !st) {
            statusBlock +=
                '<p style="font-size:0.85rem;color:#0f766e;margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> Pre-registration enabled</p>';
            if (preEndLabel) {
                statusBlock +=
                    '<p style="font-size:0.8rem;color:#64748b;margin-bottom:10px;">Closes ' + akEscapeHtml(preEndLabel) + '</p>';
            }
            actionBlock =
                '<button type="button" class="btn-primary ak-prereg-grid-action" data-mode="pick" data-sid="' +
                s.id +
                '" style="width:100%;">Preregister</button>';
        } else if (!flags.preregistrationRequired && flags.mainRegistrationRequired) {
            if (mainWin.state === 'unscheduled') {
                statusBlock += scheduleNotSetStatusHtml('main');
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Register now</button>';
            } else if (mainWin.state === 'upcoming') {
                statusBlock +=
                    '<div style="background:#eef2ff;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #c7d2fe;">' +
                    '<p style="font-size:0.8rem;color:#4338ca;font-weight:600;">Registration opens</p>' +
                    '<p id="ak-main-countdown-' +
                    s.id +
                    '" data-main-opens-at="' +
                    mainWin.opensAt +
                    '" style="font-size:1.1rem;font-weight:700;color:#0f766e;">' +
                    formatCountdownTo(mainWin.opensAt) +
                    '</p></div>';
                actionBlock =
                    '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Register now</button>';
            } else {
                if (regEndLabel) {
                    statusBlock +=
                        '<p style="font-size:0.8rem;color:#64748b;margin-bottom:10px;">Closes ' + akEscapeHtml(regEndLabel) + '</p>';
                }
                actionBlock =
                    '<button type="button" class="btn-primary ak-prereg-grid-action" data-mode="main" data-sid="' +
                    s.id +
                    '" style="width:100%;">Register now</button>';
            }
        } else {
            statusBlock += '<p style="font-size:0.85rem;color:#64748b;margin-bottom:10px;">Registration not available</p>';
            actionBlock =
                '<button type="button" disabled class="btn-primary" style="width:100%;opacity:0.55;">Unavailable</button>';
        }

        ({ actionBlock, statusBlock } = applyAlreadyRegisteredMainUi(actionBlock, statusBlock, gridMode));

        return (
            '<div class="ak-prereg-event-card" data-sid="' +
            s.id +
            '" style="background:white;border-radius:12px;padding:25px;box-shadow:0 4px 15px rgba(0,0,0,0.03);border-top:4px solid #0f766e;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div><h3 style="color:#0f766e;margin-bottom:10px;">' +
            akEscapeHtml(s.title || 'Event') +
            '</h3>' +
            '<p style="color:#64748b;font-size:0.9rem;margin-bottom:12px;">' +
            akEscapeHtml(s.description || '') +
            '</p>' +
            '<p style="font-size:0.85rem;"><strong>Event:</strong> ' +
            akEscapeHtml(eventLabel) +
            '</p>' +
            (s.portal_year
                ? '<p style="font-size:0.8rem;color:#64748b;">Year ' + akEscapeHtml(String(s.portal_year)) + '</p>'
                : '') +
            '<p style="font-size:0.85rem;margin-top:8px;"><strong>Fee:</strong> ₹' +
            (s.price || 0) +
            '</p></div>' +
            '<div>' +
            statusBlock +
            actionBlock +
            '</div></div>'
        );
    }

    function wireAutismEventGridActions(grid, preregBySeminar, rawSeminars) {
        if (!grid) return;
        const sel = document.getElementById('prereg-seminar-select');
        const byId = {};
        (rawSeminars || []).forEach((s) => {
            byId[Number(s.id)] = s;
        });
        grid.querySelectorAll('.ak-prereg-grid-action').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = String(btn.getAttribute('data-mode') || '');
                const sid = String(btn.getAttribute('data-sid') || '');
                if (mode === 'main') {
                    openMainRegistrationForSeminar(sid);
                    return;
                }
                if (mode === 'revise') {
                    const row = preregBySeminar[Number(sid)];
                    if (row) window.beginPreregRevision(row);
                    return;
                }
                const existingPrereg = preregBySeminar[Number(sid)];
                const existingSt = String((existingPrereg && existingPrereg.status) || '').toLowerCase();
                if (
                    existingSt === 'submitted' ||
                    existingSt === 'approved' ||
                    existingSt === 'revision_required' ||
                    existingSt === 'pending_approval'
                ) {
                    alert('You have already submitted pre-registration for this event. Track status in your submissions list below.');
                    return;
                }
                const seminar = byId[Number(sid)];
                if (seminar && seminarFlowFlags(seminar).preregistrationRequired) {
                    const preWin = preregWindowStateClient(seminar);
                    if (preWin.state === 'unscheduled') {
                        alert('Pre-registration schedule is not set for this event yet.');
                        return;
                    }
                    if (preWin.state !== 'open') {
                        alert(
                            preWin.state === 'upcoming'
                                ? 'Pre-registration has not opened yet.'
                                : 'Pre-registration has closed.'
                        );
                        return;
                    }
                }
                if (sel) sel.value = sid;
                window.__akActivePreregSeminarId = Number(sid);
                grid.querySelectorAll('.ak-prereg-event-card').forEach((card) => {
                    card.style.outline = '';
                    card.style.boxShadow = '0 4px 15px rgba(0,0,0,0.03)';
                });
                const card = btn.closest('.ak-prereg-event-card');
                if (card) {
                    card.style.outline = '2px solid #0f766e';
                    card.style.boxShadow = '0 8px 24px rgba(15,118,110,0.15)';
                }
                showPreregFormPanel(seminar && seminar.title ? seminar.title : '');
                loadPreregFormConfig(Number(sid) || null).then(() => {
                    renderPreregFields(document.getElementById('prereg-fields'));
                    resetPreregWizard();
                });
            });
        });
    }

    function seminarsGridFingerprint(rawSeminars, preregBySeminar, gridMode) {
        const preregFp = Object.keys(preregBySeminar || {})
            .sort()
            .map((k) => k + ':' + String((preregBySeminar[k] && preregBySeminar[k].status) || ''))
            .join(',');
        const semFp = (rawSeminars || [])
            .map((s) => [s.id, s.title || '', s.registration_start || '', s.registration_end || '', s.preregistration_start || '', s.preregistration_end || ''].join('|'))
            .join(';');
        return String(gridMode || '') + '::' + semFp + '::' + preregFp;
    }

    async function fetchApplicantSeminars(force) {
        if (force) {
            _seminarsCache = null;
            _seminarsCacheAt = 0;
        }
        if (!force && _seminarsCache && Date.now() - _seminarsCacheAt < SEMINARS_CACHE_MS) {
            return _seminarsCache;
        }
        if (_seminarsFetchPromise) return _seminarsFetchPromise;
        _seminarsFetchPromise = fetchJson('/api/seminars?bucket=current')
            .then((list) => {
                const raw = Array.isArray(list) ? list : list.seminars || [];
                _seminarsCache = raw;
                _seminarsCacheAt = Date.now();
                return raw;
            })
            .finally(() => {
                _seminarsFetchPromise = null;
            });
        return _seminarsFetchPromise;
    }

    function paintAutismEventsGrid(gridId, rawSeminars, preregBySeminar, gridMode) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const fp = seminarsGridFingerprint(rawSeminars, preregBySeminar, gridMode);
        if (_lastGridFp[gridMode] === fp && grid.childElementCount > 0) {
            startPreregGridCountdownTimer();
            return;
        }
        _lastGridFp[gridMode] = fp;
        clearPreregGridCountdownTimer();
        const rows = (Array.isArray(rawSeminars) ? rawSeminars : [])
            .map((s) => buildAutismEventGridCard(s, preregBySeminar || {}, gridMode))
            .filter(Boolean);
        grid.innerHTML = rows.length
            ? rows.join('')
            : '<p style="grid-column:1/-1;text-align:center;width:100%;color:#64748b;">No events available for registration at this time.</p>';
        const rawFiltered = (Array.isArray(rawSeminars) ? rawSeminars : []).filter((s) => {
            const f = seminarFlowFlags(s);
            return gridMode === 'main' ? f.mainRegistrationRequired : f.preregistrationRequired;
        });
        wireAutismEventGridActions(grid, preregBySeminar || {}, rawFiltered);
        startPreregGridCountdownTimer();
    }

    function validatePreregStep(step, showAlert) {
        const missing = [];
        preregFieldsForStep(step).forEach((f) => {
            if (!f.required) return;
            const v = preregFieldValue(f);
            if (f.type === 'boolean') {
                if (!v) missing.push(f.label);
            } else if (v === '') missing.push(f.label);
        });
        if (missing.length && showAlert !== false) {
            alert('Please complete: ' + missing.join(', '));
            return false;
        }
        return !missing.length;
    }

    function validatePreregStepsThrough(lastStep) {
        for (let s = 1; s <= lastStep; s++) {
            if (!validatePreregStep(s, true)) return false;
        }
        return true;
    }

    function validateAllPreregSteps() {
        const maxStep = preregMaxWizardStep();
        return validatePreregStepsThrough(maxStep);
    }

    function onPreregWizardNext() {
        if (!validatePreregStep(preregWizardStep, true)) return;
        showPreregWizardStep(preregWizardStep + 1);
    }

    function onPreregWizardBack() {
        showPreregWizardStep(preregWizardStep - 1);
    }

    function clearPreregGridCountdownTimer() {
        if (preregGridCountdownTimer) {
            clearInterval(preregGridCountdownTimer);
            preregGridCountdownTimer = null;
        }
    }

    function formatCountdownTo(targetMs) {
        const diff = Math.max(0, targetMs - Date.now());
        if (diff <= 0) return 'Opening now';
        const sec = Math.floor(diff / 1000) % 60;
        const min = Math.floor(diff / 60000) % 60;
        const hr = Math.floor(diff / 3600000) % 24;
        const day = Math.floor(diff / 86400000);
        const parts = [];
        if (day) parts.push(`${day}d`);
        if (day || hr) parts.push(`${hr}h`);
        parts.push(`${min}m`);
        parts.push(`${sec}s`);
        return parts.join(' ');
    }

    function startPreregGridCountdownTimer() {
        clearPreregGridCountdownTimer();
        const tick = () => {
            let hasUpcoming = false;
            let needReload = false;
            document.querySelectorAll('[data-prereg-opens-at]').forEach((el) => {
                const opensAt = Number(el.getAttribute('data-prereg-opens-at'));
                if (!Number.isFinite(opensAt) || opensAt <= 0) return;
                if (Date.now() < opensAt) {
                    hasUpcoming = true;
                    el.textContent = 'Opens in ' + formatCountdownTo(opensAt);
                } else {
                    el.textContent = 'Open';
                    if (!el.dataset.akReloaded) {
                        el.dataset.akReloaded = '1';
                        needReload = true;
                    }
                }
            });
            document.querySelectorAll('[data-main-opens-at]').forEach((el) => {
                const opensAt = Number(el.getAttribute('data-main-opens-at'));
                if (!Number.isFinite(opensAt) || opensAt <= 0) return;
                if (Date.now() < opensAt) {
                    hasUpcoming = true;
                    el.textContent = 'Opens in ' + formatCountdownTo(opensAt);
                } else {
                    el.textContent = 'Open now';
                    if (!el.dataset.akReloaded) {
                        el.dataset.akReloaded = '1';
                        needReload = true;
                    }
                }
            });
            if (needReload) {
                _lastGridFp.prereg = '';
                _lastGridFp.main = '';
                loadPreregSeminars(true);
                loadMainRegEvents(true);
            }
            if (!hasUpcoming) clearPreregGridCountdownTimer();
        };
        tick();
        preregGridCountdownTimer = setInterval(tick, 1000);
    }

    async function loadPreregSeminars(force) {
        const sel = document.getElementById('prereg-seminar-select');
        if (!sel) return;
        if (_loadPreregSeminarsPromise && !force) return _loadPreregSeminarsPromise;
        _loadPreregSeminarsPromise = (async () => {
        function renderMainOnlyHint(mainOnlySeminars) {
            const formGroup = sel.closest('.form-group');
            if (!formGroup) return;
            let hint = document.getElementById('prereg-main-only-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.id = 'prereg-main-only-hint';
                hint.style.cssText =
                    'margin-top:10px;padding:10px;border-radius:8px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;font-size:0.88rem;';
                formGroup.appendChild(hint);
            }
            if (!mainOnlySeminars.length) {
                hint.style.display = 'none';
                return;
            }
            const safe = (v) =>
                String(v == null ? '' : v)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            hint.style.display = 'block';
            hint.innerHTML =
                'Direct registration events: ' +
                mainOnlySeminars.map((s) => `<strong>${safe(s.title || 'Event ' + s.id)}</strong>`).join(', ') +
                '. <button type="button" id="open-main-reg-from-prereg" class="btn-primary" style="margin-left:8px;padding:4px 10px;font-size:0.8rem;">Open main registration</button>';
            const btn = document.getElementById('open-main-reg-from-prereg');
            if (btn) {
                btn.onclick = function () {
                    if (typeof window.showMainRegHubView === 'function') {
                        window.showMainRegHubView();
                        return;
                    }
                    if (typeof window.switchTab === 'function') window.switchTab('tab-main-reg-hub');
                    if (typeof window.loadMainRegEvents === 'function') window.loadMainRegEvents();
                };
            }
        }
        try {
            const raw = await fetchApplicantSeminars(!!force);
            window.__akAllSeminars = raw;
            preregSeminars = raw.filter((s) => seminarFlowFlags(s).preregistrationRequired);
            const mainOnlySeminars = raw.filter((s) => {
                const flags = seminarFlowFlags(s);
                return !flags.preregistrationRequired && flags.mainRegistrationRequired;
            });
            const uid = currentUserId();
            const preregRows = uid ? await fetchJson('/api/preregistrations/' + encodeURIComponent(uid)).catch(() => []) : [];
            const preregBySeminar = {};
            (Array.isArray(preregRows) ? preregRows : []).forEach((r) => {
                const sid = Number(r && r.seminar_id);
                if (!sid || preregBySeminar[sid]) return;
                preregBySeminar[sid] = r;
            });
            window.__akPreregBySeminar = preregBySeminar;
            window.__akPreregSeminars = preregSeminars;
            sel.innerHTML = '<option value="">Select event</option>';
            preregSeminars.forEach((s) => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.title || 'Event ' + s.id;
                sel.appendChild(opt);
            });
            paintAutismEventsGrid('ak-prereg-events-grid', raw, preregBySeminar, 'prereg');
            loadPreregList();
            if (!preregSeminars.length) {
                sel.innerHTML = '<option value="">No pre-registration events available</option>';
            }
        } catch (e) {
            clearPreregGridCountdownTimer();
            sel.innerHTML = '<option value="">Could not load events</option>';
        }
        })();
        return _loadPreregSeminarsPromise;
    }

    async function loadMainRegEvents(force) {
        try {
            const raw = await fetchApplicantSeminars(!!force);
            window.__akAllSeminars = raw;
            const uid = currentUserId();
            const preregRows = uid ? await fetchJson('/api/preregistrations/' + encodeURIComponent(uid)).catch(() => []) : [];
            const preregBySeminar = {};
            (Array.isArray(preregRows) ? preregRows : []).forEach((r) => {
                const sid = Number(r && r.seminar_id);
                if (!sid || preregBySeminar[sid]) return;
                preregBySeminar[sid] = r;
            });
            window.__akPreregBySeminar = preregBySeminar;
            paintAutismEventsGrid('ak-main-events-grid', raw, preregBySeminar, 'main');
            if (typeof loadApplications === 'function') loadApplications(true);
        } catch (e) {
            const grid = document.getElementById('ak-main-events-grid');
            if (grid) {
                grid.innerHTML =
                    '<p style="grid-column:1/-1;text-align:center;color:#b91c1c;">Could not load events.</p>';
            }
        }
    }

    async function submitPreregistration(ev) {
        ev.preventDefault();
        const maxStep = preregMaxWizardStep();
        if (!validateAllPreregSteps()) {
            if (preregWizardStep < maxStep) {
                if (validatePreregStep(preregWizardStep, true)) showPreregWizardStep(preregWizardStep + 1);
            }
            return;
        }
        if (preregWizardStep < maxStep) showPreregWizardStep(maxStep);
        const uid = currentUserId();
        const sid = parseInt(document.getElementById('prereg-seminar-select')?.value, 10);
        if (!uid) return alert('Please sign in again.');
        if (!sid) return alert('Select an event.');
        const formData = {};
        (preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const el = document.getElementById('prereg-field-' + f.key);
            if (!el) return;
            formData[f.key] = f.type === 'boolean' ? !!el.checked : el.value;
        });
        const msg = document.getElementById('prereg-status-msg');
        try {
            if (preregResubmitId) {
                const resubmitResult = await fetchJson('/api/preregistrations/resubmit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, preregistrationId: preregResubmitId, formData })
                });
                preregResubmitId = null;
                const sel = document.getElementById('prereg-seminar-select');
                if (sel) sel.disabled = false;
                resetPreregWizard();
                document.getElementById('prereg-form')?.reset();
                hidePreregFormPanel();
                updatePreregCacheForSeminar(sid, {
                    status: resubmitResult.status || 'submitted',
                    application_no:
                        (resubmitResult && resubmitResult.applicationNo) || window.__akLastPreregApplicationNo || '',
                    form_data: formData
                });
                const afterPreregSuccess = function () {
                    showPreregTrackView();
                    showHubSuccessBanner(
                        'tab-prereg-track',
                        'ak-prereg-track-banner',
                        formatPreregSubmitSuccessHtml(
                            Object.assign({}, resubmitResult, {
                                applicationNo:
                                    (resubmitResult && resubmitResult.applicationNo) ||
                                    (window.__akLastPreregApplicationNo || '')
                            })
                        )
                    );
                    loadPreregSeminars(true);
                };
                await showSubmissionSuccessModal({
                    kind: 'prereg',
                    title: 'Pre-registration updated',
                    message:
                        (resubmitResult && resubmitResult.message) ||
                        'Pre-registration updated and sent for review again.',
                    onClose: afterPreregSuccess
                });
                return;
            }
            const submitResult = await fetchJson('/api/preregistrations/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: uid, seminarId: sid, formData })
            });
            if (submitResult && submitResult.applicationNo) {
                window.__akLastPreregApplicationNo = submitResult.applicationNo;
            }
            resetPreregWizard();
            document.getElementById('prereg-form')?.reset();
            const countryEl = document.getElementById('prereg-field-country');
            if (countryEl) countryEl.value = 'India';
            hidePreregFormPanel();
            updatePreregCacheForSeminar(sid, {
                status: submitResult.status || 'submitted',
                application_no: submitResult.applicationNo,
                form_data: formData
            });
            const preregPendingReview = String(submitResult.status || 'submitted').toLowerCase() === 'submitted';
            const afterPreregSuccess = function () {
                showPreregTrackView();
                showHubSuccessBanner(
                    'tab-prereg-track',
                    'ak-prereg-track-banner',
                    formatPreregSubmitSuccessHtml(submitResult)
                );
                loadPreregSeminars(true);
            };
            await showSubmissionSuccessModal({
                kind: 'prereg',
                title: preregPendingReview ? 'Pre-registration submitted' : 'Pre-registration accepted',
                message: preregPendingReview
                    ? 'Your pre-registration was received and is under review. Open Pre-reg tracking for status.'
                    : submitResult.message ||
                      'Your pre-registration was received successfully.',
                onClose: afterPreregSuccess
            });
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Submit failed';
                msg.style.color = '#b91c1c';
            }
            showHubSuccessBanner(
                'tab-prereg-hub',
                'ak-prereg-hub-banner',
                escapeAkHtml(e.message || 'Submit failed'),
                'error'
            );
            if (typeof switchTab === 'function') switchTab('tab-prereg-hub');
        }
    }

    function fillPreregFormFromData(formData) {
        (preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const el = document.getElementById('prereg-field-' + f.key);
            if (!el || formData[f.key] == null) return;
            if (f.type === 'boolean') el.checked = !!formData[f.key];
            else el.value = formData[f.key];
        });
    }

    window.beginPreregRevision = async function beginPreregRevision(row) {
        if (!row || !row.id) return;
        preregResubmitId = row.id;
        if (typeof switchTab === 'function') switchTab('tab-prereg-hub');
        await loadPreregSeminars();
        const sel = document.getElementById('prereg-seminar-select');
        if (sel) {
            sel.value = String(row.seminar_id || '');
            sel.disabled = true;
        }
        window.__akActivePreregSeminarId = Number(row.seminar_id);
        showPreregFormPanel(row.seminar_title || '');
        await loadPreregFormConfig(row.seminar_id || null);
        renderPreregFields(document.getElementById('prereg-fields'));
        let fd = {};
        try {
            fd = typeof row.form_data === 'string' ? JSON.parse(row.form_data || '{}') : row.form_data || {};
        } catch (_) {}
        fillPreregFormFromData(fd);
        resetPreregWizard();
        const msg = document.getElementById('prereg-status-msg');
        if (msg) {
            msg.textContent = 'Update your pre-registration below, then submit again.';
            msg.style.color = '#6d28d9';
        }
    };

    function preregFieldLabel(key) {
        const map = {
            parent_name: 'Full Name (Parents)',
            parent_gender: 'Gender (Parent)',
            parent_dob: 'Date of Birth (Parent)',
            child_name: "Child's Name",
            child_gender: 'Gender (Child)',
            child_dob: 'Date of Birth (Child)',
            address: 'Full Address',
            pin: 'Pincode',
            city: 'City',
            state: 'State',
            country: 'Country',
            attendees_count: 'Number of People Attending',
            child_health: "Child's Health",
            diet: 'Diet',
            financial_planning: 'Financial Planning'
        };
        return map[key] || String(key || '').replace(/_/g, ' ');
    }

    function preregPdfGeneratedAt() {
        if (window.PortalDateTime && window.PortalDateTime.nowIso) {
            const iso = window.PortalDateTime.nowIso();
            return window.PortalDateTime.formatLong(iso) || iso;
        }
        return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }

    async function downloadPreregPdf(row) {
        if (!row || !window.jspdf) {
            alert('PDF download is not available. Refresh the page and try again.');
            return;
        }
        let fd = {};
        try {
            fd = typeof row.form_data === 'string' ? JSON.parse(row.form_data || '{}') : row.form_data || {};
        } catch (_) {}
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const marginX = 14;
        const valueX = 66;
        const lineMaxW = pageW - valueX - marginX;
        let logoData = '';
        if (typeof ensurePdfLogoDataUrl === 'function') {
            try {
                logoData = await ensurePdfLogoDataUrl();
            } catch (_) {}
        }

        function drawHeader() {
            doc.setFillColor(15, 118, 110);
            doc.rect(0, 0, pageW, 24, 'F');
            if (logoData) {
                try {
                    doc.addImage(logoData, 'PNG', marginX, 3, 18, 18);
                } catch (_) {}
            }
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Autism Awareness Programme', logoData ? marginX + 22 : marginX, 10);
            doc.setFontSize(10);
            doc.text('Vaidya Gogate Memorial Foundation', logoData ? marginX + 22 : marginX, 16);
            doc.setTextColor(0, 0, 0);
        }

        function drawFooter(pageNo) {
            doc.setDrawColor(203, 213, 225);
            doc.line(marginX, pageH - 14, pageW - marginX, pageH - 14);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text('Generated: ' + preregPdfGeneratedAt(), marginX, pageH - 9);
            doc.text('Page ' + pageNo, pageW - marginX - 16, pageH - 9);
            doc.setTextColor(0, 0, 0);
        }

        let y = 30;
        drawHeader();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Pre-registration submission form', marginX, y);
        y += 9;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Application no.: ' + (row.application_no || '—'), marginX, y);
        y += 6;
        doc.text('Event: ' + (row.seminar_title || row.seminar_id || '—'), marginX, y);
        y += 6;
        doc.text('Status: ' + String(row.status || 'submitted').replace(/_/g, ' '), marginX, y);
        y += 8;

        const groupedEntries = [
            {
                title: 'Parent details',
                items: Object.keys(fd)
                    .filter((k) => k.startsWith('parent_'))
                    .map((k) => [preregFieldLabel(k), fd[k] == null ? '' : String(fd[k])])
            },
            {
                title: 'Child details',
                items: Object.keys(fd)
                    .filter((k) => k.startsWith('child_'))
                    .map((k) => [preregFieldLabel(k), fd[k] == null ? '' : String(fd[k])])
            },
            {
                title: 'Address',
                items: ['address', 'pin', 'city', 'state', 'country']
                    .filter((k) => Object.prototype.hasOwnProperty.call(fd, k))
                    .map((k) => [preregFieldLabel(k), fd[k] == null ? '' : String(fd[k])])
            },
            {
                title: 'Programme information',
                items: Object.keys(fd)
                    .filter(
                        (k) =>
                            !k.startsWith('parent_') &&
                            !k.startsWith('child_') &&
                            !['address', 'pin', 'city', 'state', 'country'].includes(k)
                    )
                    .map((k) => [preregFieldLabel(k), fd[k] == null ? '' : String(fd[k])])
            }
        ];
        doc.setDrawColor(226, 232, 240);
        doc.line(marginX, y, pageW - marginX, y);
        y += 6;

        groupedEntries.forEach((group) => {
            if (!group.items.length) return;
            if (y + 10 > pageH - 18) {
                drawFooter(doc.getNumberOfPages());
                doc.addPage();
                drawHeader();
                y = 30;
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(15, 118, 110);
            doc.text(group.title, marginX, y);
            doc.setTextColor(0, 0, 0);
            y += 6;
            group.items.forEach(([label, value]) => {
                const valueLines = doc.splitTextToSize(value, lineMaxW);
                const blockH = Math.max(6, valueLines.length * 5 + 1);
                if (y + blockH > pageH - 18) {
                    drawFooter(doc.getNumberOfPages());
                    doc.addPage();
                    drawHeader();
                    y = 30;
                }
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.text(label + ':', marginX, y);
                doc.setFont('helvetica', 'normal');
                doc.text(valueLines, valueX, y);
                y += blockH;
            });
            y += 3;
        });
        drawFooter(doc.getNumberOfPages());
        doc.save('Pre_Registration_' + (row.application_no || row.id) + '.pdf');
    }

    function buildPreregPdfFromDraft(seminarTitle, formData) {
        return {
            application_no: 'DRAFT',
            seminar_title: seminarTitle || 'Event',
            status: 'draft',
            form_data: formData || {}
        };
    }

    window.downloadPreregDraftPdf = function downloadPreregDraftPdf() {
        const sid =
            parseInt(document.getElementById('prereg-seminar-select')?.value, 10) ||
            Number(window.__akActivePreregSeminarId) ||
            0;
        const sel = document.getElementById('prereg-seminar-select');
        const semTitle = sel?.selectedOptions?.[0]?.textContent || 'Event';
        const formData = {};
        (window.__akPreregFields || preregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const el = document.getElementById('prereg-field-' + f.key);
            if (!el) return;
            formData[f.key] = f.type === 'boolean' ? !!el.checked : el.value;
        });
        if (!sid) return alert('Select an event first.');
        downloadPreregPdf(buildPreregPdfFromDraft(semTitle, formData));
    };
    window.downloadPreregPdf = downloadPreregPdf;

    function preregStatusMeta(status) {
        const st = String(status || 'submitted').toLowerCase();
        const map = {
            submitted: { label: 'Pending review', color: '#d97706', bg: '#fef3c7', step: 2 },
            approved: { label: 'Approved', color: '#047857', bg: '#d1fae5', step: 3 },
            rejected: { label: 'Not approved', color: '#b91c1c', bg: '#fee2e2', step: 2 },
            revision_required: { label: 'Revision needed', color: '#6d28d9', bg: '#ede9fe', step: 2 }
        };
        return map[st] || map.submitted;
    }

    function eventRegStatusMeta(status) {
        const st = String(status || 'submitted').toLowerCase();
        const map = {
            submitted: { label: 'Submitted', color: '#d97706', bg: '#fef3c7' },
            pending_approval: { label: 'Under review', color: '#2563eb', bg: '#dbeafe' },
            revision_required: { label: 'Revision needed', color: '#6d28d9', bg: '#ede9fe' },
            approved_pending_payment: { label: 'Approved', color: '#047857', bg: '#d1fae5' },
            completed: { label: 'Approved', color: '#047857', bg: '#d1fae5' },
            e_ticket_issued: { label: 'E-ticket issued', color: '#047857', bg: '#d1fae5' },
            checked_in: { label: 'Checked in', color: '#047857', bg: '#d1fae5' },
            certificate_issued: { label: 'Certificate ready', color: '#047857', bg: '#d1fae5' },
            rejected: { label: 'Not approved', color: '#b91c1c', bg: '#fee2e2' },
            cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' }
        };
        return map[st] || map.submitted;
    }

    function escapeAkHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatAkTrackWhen(iso) {
        if (!iso) return '';
        if (window.PortalDateTime && window.PortalDateTime.formatLong) {
            const s = window.PortalDateTime.formatLong(iso);
            return s && !/\bIST\b/i.test(s) ? s + ' IST' : s;
        }
        return String(iso).slice(0, 16);
    }

    function renderAkTrackStepsV3(stepDefs, accentClass) {
        const steps = stepDefs || [];
        let doneCount = 0;
        let currentIdx = -1;
        steps.forEach((s, i) => {
            if (s.state === 'completed') doneCount = i + 1;
            if (s.state === 'active') currentIdx = i;
        });
        if (currentIdx < 0 && doneCount < steps.length && doneCount > 0) currentIdx = doneCount;
        const progressPct =
            steps.length <= 1 ? 0 : Math.min(100, Math.round((Math.max(doneCount, currentIdx + 1) / steps.length) * 100));

        const html = steps
            .map((s, i) => {
                let cls = 'ak-track-v3-step';
                if (s.state === 'completed') cls += ' is-done';
                else if (s.state === 'active') cls += ' is-current';
                else if (s.state === 'fail') cls += ' is-fail';
                else cls += ' is-upcoming';
                const icon =
                    s.state === 'completed'
                        ? 'fa-check'
                        : String(s.icon || 'fa-circle').replace(/^fa-/, 'fa-');
                const iconClass = icon.startsWith('fa-') ? icon : 'fa-' + icon;
                const when =
                    s.at && (s.state === 'completed' || s.state === 'active')
                        ? '<p class="ak-track-v3-when">' + escapeAkHtml(formatAkTrackWhen(s.at)) + '</p>'
                        : s.state === 'pending'
                          ? '<p class="ak-track-v3-when" style="color:#94a3b8!important;">Upcoming</p>'
                          : '';
                return (
                    '<div class="' +
                    cls +
                    '"><div class="ak-track-v3-icon"><i class="fas ' +
                    iconClass +
                    '"></i></div><div class="ak-track-v3-body"><strong>' +
                    escapeAkHtml(s.title) +
                    '</strong>' +
                    (s.desc ? '<p>' + escapeAkHtml(s.desc) + '</p>' : '') +
                    when +
                    '</div></div>'
                );
            })
            .join('');

        return (
            '<div class="ak-track-card-v3__progress-wrap">' +
            '<div class="ak-track-card-v3__progress-label"><span>Progress</span><span>' +
            Math.min(doneCount + (currentIdx >= doneCount ? 1 : 0), steps.length) +
            ' / ' +
            steps.length +
            ' steps</span></div>' +
            '<div class="ak-track-card-v3__progress-bar"><div class="ak-track-card-v3__progress-fill" style="width:' +
            progressPct +
            '%"></div></div></div>' +
            '<div class="ak-track-v3-stepper ' +
            (accentClass || '') +
            '">' +
            html +
            '</div>'
        );
    }

    function renderAkTrackCardV3(opts) {
        const o = opts || {};
        const mod = o.modifier || 'event';
        const stepsHtml = renderAkTrackStepsV3(o.steps || [], 'ak-track-card-v3--' + mod);
        const meta = o.statusMeta || { label: '—', color: '#64748b', bg: '#f1f5f9' };
        return (
            '<article class="ak-track-card-v3 ak-track-card-v3--' +
            mod +
            '">' +
            '<div class="ak-track-card-v3__bar"></div>' +
            '<div class="ak-track-card-v3__head">' +
            '<div><span class="ak-track-card-v3__type">' +
            escapeAkHtml(o.typeLabel || 'Application') +
            '</span>' +
            '<div class="ak-track-card-v3__title">' +
            escapeAkHtml(o.title || '') +
            '</div>' +
            (o.subtitle ? '<div class="ak-track-card-v3__code">' + escapeAkHtml(o.subtitle) + '</div>' : '') +
            (o.code
                ? '<div class="ak-track-card-v3__code" style="margin-top:6px;font-weight:700;color:#0f172a;">' +
                  escapeAkHtml(o.code) +
                  '</div>'
                : '') +
            '</div>' +
            '<span class="ak-track-card-v3__pill" style="background:' +
            meta.bg +
            ';color:' +
            meta.color +
            '">' +
            escapeAkHtml(meta.label) +
            '</span></div>' +
            stepsHtml +
            (o.footHtml
                ? '<div class="ak-track-card-v3__foot">' + o.footHtml + '</div>'
                : '') +
            '</article>'
        );
    }

    function buildPreregStepDefs(r) {
        if (r && r.timeline && Array.isArray(r.timeline.steps) && r.timeline.steps.length) {
            return timelineToStepDefs(r.timeline);
        }
        const st = String(r.status || 'submitted').toLowerCase();
        const regSt = String(r.registration_status || '').toLowerCase();
        const hasReg = !!r.registration_id;
        const fail = st === 'rejected';
        const steps = [
            {
                title: 'Application submitted',
                desc: 'Your pre-registration was received.',
                icon: 'fa-clipboard-check',
                state: 'completed',
                at: r.created_at
            },
            {
                title: 'Under review',
                desc: fail
                    ? 'Not approved at this stage.'
                    : st === 'revision_required'
                      ? 'Please update and resubmit.'
                      : 'Our team is checking your details.',
                icon: 'fa-magnifying-glass',
                state:
                    fail || st === 'revision_required'
                        ? st === 'revision_required'
                            ? 'active'
                            : 'fail'
                        : st === 'submitted'
                          ? 'active'
                          : 'completed',
                at:
                    st === 'revision_required' || st === 'approved' || fail
                        ? r.updated_at || r.created_at
                        : st === 'submitted'
                          ? r.created_at
                          : null
            },
            {
                title: 'Pre-registration approved',
                desc: 'You can proceed to main registration when it opens.',
                icon: 'fa-circle-check',
                state: st === 'approved' ? 'completed' : st === 'submitted' || fail ? 'pending' : 'pending',
                at: st === 'approved' ? r.updated_at || r.created_at : null
            },
            {
                title: 'Main registration',
                desc: hasReg ? 'Final registration started or completed.' : 'Opens after pre-registration approval.',
                icon: 'fa-file-signature',
                state:
                    hasReg && st === 'approved'
                        ? 'active'
                        : hasReg
                          ? 'completed'
                          : 'pending',
                at: hasReg ? r.updated_at : null
            },
            {
                title: 'E-ticket',
                desc: 'Download your pass with QR code for event day.',
                icon: 'fa-qrcode',
                state:
                    hasReg &&
                    (regSt === 'completed' || regSt === 'checked_in' || regSt === 'e_ticket_issued')
                        ? 'completed'
                        : 'pending',
                at:
                    hasReg &&
                    (regSt === 'completed' || regSt === 'checked_in' || regSt === 'e_ticket_issued')
                        ? r.updated_at
                        : null
            }
        ];
        if (st === 'approved') {
            steps[2].state = 'completed';
            steps[2].at = r.updated_at || r.created_at;
            if (hasReg) steps[3].state = regSt === 'e_ticket_issued' || regSt === 'checked_in' ? 'completed' : 'active';
        }
        if (fail) steps[2].state = 'pending';
        return steps;
    }

    function buildCompStepDefs(r) {
        const st = String(r.status || 'submitted').toLowerCase();
        const fail = st === 'rejected';
        return [
            {
                title: 'Entry submitted',
                desc: 'Your files were uploaded successfully.',
                icon: 'fa-cloud-upload-alt',
                state: 'completed'
            },
            {
                title: 'Under review',
                desc: 'Judges or staff are reviewing your entry.',
                icon: 'fa-magnifying-glass',
                state:
                    st === 'under_review' || st === 'submitted'
                        ? 'active'
                        : st === 'approved' || fail
                          ? 'completed'
                          : 'pending'
            },
            {
                title: fail ? 'Not selected' : 'Decision',
                desc: fail ? 'Thank you for participating.' : 'Final outcome for this entry.',
                icon: fail ? 'fa-circle-xmark' : 'fa-trophy',
                state: st === 'approved' ? 'completed' : fail ? 'fail' : 'pending'
            }
        ];
    }

    function timelineToStepDefs(tl) {
        const raw = (tl && tl.steps) || [];
        return raw
            .filter((s) => s.key !== 'approved_pending_payment' && s.key !== 'completed')
            .map((s) => ({
                title: s.title || s.key,
                desc: s.desc || '',
                icon: s.icon || 'fa-circle',
                state: s.state === 'completed' ? 'completed' : s.state === 'active' ? 'active' : 'pending',
                at: s.at
            }));
    }

    function akTrackEmptyHtml(icon, message) {
        return (
            '<div class="ak-track-empty"><i class="fas ' +
            icon +
            '"></i><p>' +
            message +
            '</p></div>'
        );
    }

    function preregSubmittedDetailsHtml(r) {
        let fd = {};
        try {
            fd = typeof r.form_data === 'string' ? JSON.parse(r.form_data || '{}') : r.form_data || {};
        } catch (_) {
            fd = {};
        }
        const keys = Object.keys(fd).filter((k) => fd[k] != null && String(fd[k]).trim() !== '');
        if (!keys.length) return '';
        const rows = keys
            .map((k) => {
                const lab = typeof preregFieldLabel === 'function' ? preregFieldLabel(k) : k;
                return (
                    '<div class="preview-row"><span class="lbl">' +
                    escapeAkHtml(lab) +
                    '</span><span class="val">' +
                    escapeAkHtml(String(fd[k])) +
                    '</span></div>'
                );
            })
            .join('');
        return (
            '<div class="ak-submitted-details" style="margin-top:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">' +
            '<p style="font-size:0.78rem;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 8px;">Information submitted</p>' +
            rows +
            '</div>'
        );
    }

    function renderPreregTrackCard(r) {
        const meta = preregStatusMeta(r.status);
        const st = String(r.status || 'submitted').toLowerCase();
        let foot =
            '<p class="ak-track-card-v3__msg" style="color:#64748b;">Submitted ' +
            escapeAkHtml(
                window.PortalDateTime && window.PortalDateTime.format
                    ? window.PortalDateTime.format(r.created_at) + ' IST'
                    : (r.created_at || '').slice(0, 16)
            ) +
            '</p>';
        if (meta.step >= 3) {
            foot +=
                '<p class="ak-track-card-v3__msg" style="color:#047857;font-weight:600;"><i class="fas fa-check-circle"></i> Pre-registration approved — complete <strong>main registration</strong> when the form opens.</p>';
        } else if (st === 'revision_required') {
            foot +=
                '<p class="ak-track-card-v3__msg" style="color:#6d28d9;font-weight:600;">Please update and resubmit your pre-registration.</p>' +
                '<div class="ak-track-card-v3__actions">' +
                '<button type="button" class="btn-warning" data-ak-prereg-edit="' +
                r.id +
                '">Edit &amp; resubmit</button></div>';
        } else if (st === 'rejected') {
            foot += '<p class="ak-track-card-v3__msg" style="color:#b91c1c;">Contact us if you need help.</p>';
        } else {
            foot += '<p class="ak-track-card-v3__msg">We will notify you when pre-registration is approved.</p>';
        }
        if (r.application_no) {
            foot +=
                '<div class="ak-track-card-v3__actions" style="margin-top:8px;">' +
                '<button type="button" class="btn-primary" style="background:#475569;" data-ak-prereg-dl="' +
                r.id +
                '"><i class="fas fa-file-pdf"></i> Download PDF</button></div>';
        }
        foot += preregSubmittedDetailsHtml(r);
        if (r.application_no) {
            foot +=
                '<div class="ak-barcode-inline"><img src="/api/qrcode/' +
                encodeURIComponent(r.application_no) +
                '" alt="Pre-reg QR" width="80" height="80"><div><strong style="font-size:0.82rem;color:#64748b;">Pre-registration tracking ID</strong><br><code style="font-size:1rem;letter-spacing:0.04em;">' +
                escapeAkHtml(r.application_no) +
                '</code></div></div>';
        }
        return renderAkTrackCardV3({
            modifier: 'prereg',
            typeLabel: 'Pre-registration',
            title: r.seminar_title || 'Event ' + r.seminar_id,
            code: r.application_no || '—',
            statusMeta: meta,
            steps: buildPreregStepDefs(r),
            footHtml: foot
        });
    }

    function renderAutismEventRegistrationCard(a) {
        const st = String(a.status || 'submitted').toLowerCase();
        const meta = eventRegStatusMeta(st);
        let steps = timelineToStepDefs(a.timeline || {});
        if (!steps.length) {
            steps = [
                { title: 'Application submitted', desc: 'Registration received.', icon: 'fa-clipboard-check', state: 'completed' },
                { title: 'Under review', desc: 'Team is verifying your application.', icon: 'fa-user-shield', state: 'active' },
                { title: 'Registration approved', desc: 'Approved for the programme.', icon: 'fa-circle-check', state: 'pending' },
                { title: 'E-ticket', desc: 'QR pass for event day.', icon: 'fa-qrcode', state: 'pending' }
            ];
        }
        const appIdx =
            typeof userApplications !== 'undefined'
                ? userApplications.findIndex((x) => Number(x.id) === Number(a.id))
                : -1;
        let foot = '';
        if (st === 'revision_required' || st === 'documents_requested') {
            foot +=
                '<div class="ak-revision-banner"><p style="margin:0 0 8px;font-weight:600;color:#9a3412;"><i class="fas fa-exclamation-triangle"></i> Documents need correction</p>' +
                '<button type="button" class="btn-warning" onclick="openSeminarDocumentResubmitById(' +
                Number(a.id) +
                ')">Re-upload documents</button></div>';
        }
        if (a.application_no) {
            foot +=
                '<div class="ak-barcode-inline"><img src="/api/qrcode/' +
                encodeURIComponent(a.application_no) +
                '" alt="Registration QR" width="80" height="80"><div><strong style="font-size:0.82rem;color:#64748b;">Main registration tracking ID</strong><br><code style="font-size:1rem;letter-spacing:0.04em;">' +
                escapeAkHtml(a.application_no) +
                '</code></div></div><div class="ak-track-card-v3__actions">' +
                (appIdx >= 0
                    ? '<button type="button" class="btn-primary" style="background:#475569;" onclick="downloadApplicationByIndex(' +
                      appIdx +
                      ')">Download PDF</button>'
                    : '') +
                '</div>';
        }
        return renderAkTrackCardV3({
            modifier: 'event',
            typeLabel: 'Main registration',
            title: a.seminar_title || 'Event registration',
            subtitle: a.portal_year ? 'Year ' + a.portal_year : '',
            code: a.application_no || '—',
            statusMeta: meta,
            steps: steps,
            footHtml: foot
        });
    }

    window.renderAutismEventRegistrationCard = renderAutismEventRegistrationCard;

    async function loadPreregList() {
        const uid = currentUserId();
        const box = preregListEl();
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/preregistrations/' + uid);
            if (!rows.length) {
                box.innerHTML = akTrackEmptyHtml(
                    'fa-clipboard-list',
                    'No pre-registrations yet. Choose an event above and submit the pre-registration form.'
                );
                return;
            }
            box.innerHTML = rows.map((r) => renderPreregTrackCard(r)).join('');
            const rowsById = {};
            rows.forEach((r) => {
                rowsById[r.id] = r;
            });
            box.querySelectorAll('[data-ak-prereg-edit]').forEach((btn) => {
                btn.addEventListener('click', () => beginPreregRevision(rowsById[parseInt(btn.dataset.akPreregEdit, 10)]));
            });
            box.querySelectorAll('[data-ak-prereg-dl]').forEach((btn) => {
                btn.addEventListener('click', () => downloadPreregPdf(rowsById[parseInt(btn.dataset.akPreregDl, 10)]));
            });
        } catch (e) {
            box.innerHTML = '<p style="color:#b91c1c;">' + (e.message || 'Load failed') + '</p>';
        }
    }

    function compStatusMeta(status) {
        const st = String(status || 'submitted').toLowerCase();
        const map = {
            draft: { label: 'Draft', color: '#64748b', bg: '#f1f5f9', step: 0 },
            submitted: { label: 'Submitted', color: '#d97706', bg: '#fef3c7', step: 1 },
            under_review: { label: 'Under review', color: '#2563eb', bg: '#dbeafe', step: 2 },
            approved: { label: 'Approved', color: '#047857', bg: '#d1fae5', step: 3 },
            rejected: { label: 'Not selected', color: '#b91c1c', bg: '#fee2e2', step: 2 }
        };
        return map[st] || map.submitted;
    }

    function renderCompTrackCard(r) {
        const meta = compStatusMeta(r.status);
        const code = r.application_no || 'COMP-' + r.id;
        let foot =
            '<p class="ak-track-card-v3__msg" style="color:#64748b;">' +
            (r.files || []).length +
            ' file(s) · ' +
            escapeAkHtml(r.category || 'general') +
            '</p>';
        if (r.admin_notes) {
            foot +=
                '<p class="ak-track-card-v3__msg"><strong>Office note:</strong> ' +
                escapeAkHtml(String(r.admin_notes)) +
                '</p>';
        }
        foot +=
            '<div class="ak-barcode-inline"><img src="/api/qrcode/' +
            encodeURIComponent(code) +
            '" alt="Entry QR" width="80" height="80"><div><strong style="font-size:0.82rem;color:#64748b;">Entry ID</strong><br><code>' +
            escapeAkHtml(code) +
            '</code></div></div>';
        return renderAkTrackCardV3({
            modifier: 'comp',
            typeLabel: 'Competition',
            title: r.title || 'Entry',
            subtitle: r.seminar_title || '',
            code: code,
            statusMeta: meta,
            steps: buildCompStepDefs(r),
            footHtml: foot
        });
    }

    async function submitCompetition(event) {
        event.preventDefault();
        const uid = currentUserId();
        if (!uid) return alert('Please sign in again.');
        const title = document.getElementById('comp-title')?.value?.trim();
        const category = document.getElementById('comp-category')?.value || '';
        const description = document.getElementById('comp-description')?.value || '';
        const seminarId = document.getElementById('comp-seminar-select')?.value || '';
        const files = document.getElementById('comp-files')?.files;
        if (!title) return alert('Enter a title.');
        if (!seminarId) return alert('Select the event for this competition entry.');
        if (!files || !files.length) return alert('Upload at least one file (photo, video, PPT, or PDF).');
        const compEv = competitionEvents.find((x) => String(x.id) === String(seminarId));
        if (compEv && compEv.windowState !== 'open') {
            return alert(
                compEv.windowState === 'upcoming'
                    ? 'Competition submissions are not open yet for this event.'
                    : compEv.windowState === 'unscheduled'
                      ? 'Competition schedule is not set yet for this event.'
                      : 'Competition submissions have closed for this event.'
            );
        }
        const fd = new FormData();
        fd.append('userId', uid);
        fd.append('title', title);
        fd.append('category', category);
        fd.append('description', description);
        if (seminarId) fd.append('seminarId', seminarId);
        for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
        const msg = document.getElementById('comp-status-msg');
        try {
            const r = await fetch('/api/competition-submissions/submit', { method: 'POST', body: fd });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || r.statusText);
            if (msg) {
                msg.textContent = data.message || 'Submitted successfully.';
                msg.style.color = '#047857';
            }
            document.getElementById('competition-form')?.reset();
            loadCompetitionList();
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Submit failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    async function loadCompetitionList() {
        const uid = currentUserId();
        const box = compListEl();
        if (!uid || !box) return;
        try {
            const rows = await fetchJson('/api/competition-submissions/' + uid);
            if (!rows.length) {
                box.innerHTML = akTrackEmptyHtml(
                    'fa-photo-video',
                    'No competition entries yet. Use <strong>Register Competition</strong> to upload your work.'
                );
                return;
            }
            box.innerHTML = rows.map((r) => renderCompTrackCard(r)).join('');
        } catch (e) {
            box.innerHTML = '<p style="color:#b91c1c;">' + (e.message || 'Load failed') + '</p>';
        }
    }

    function setupDashboardHub() {
        const dash = document.getElementById('tab-dashboard');
        if (!dash || dash.querySelector('.ak-hub-actions')) return;
        const quickCard = dash.querySelector('.card');
        const hub = document.createElement('div');
        hub.className = 'card ak-hub-card';
        hub.style.marginBottom = '16px';
        hub.innerHTML =
            '<h3 style="color:#0f766e;margin-bottom:14px;"><i class="fas fa-compass"></i> Registration hub</h3>' +
            '<div class="ak-hub-actions">' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="prereg-hub"><i class="fas fa-clipboard-list"></i><span>Pre-registration</span><small>Apply for events</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="prereg-track"><i class="fas fa-route"></i><span>Pre-reg tracking</span><small>Status &amp; tracking IDs</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="main-reg-hub"><i class="fas fa-file-signature"></i><span>Main registration</span><small>Complete registration</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="main-reg-track"><i class="fas fa-tasks"></i><span>Main reg tracking</span><small>Application status</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="comp-register"><i class="fas fa-cloud-upload-alt"></i><span>Register Competition</span><small>Upload entry files</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="comp-track"><i class="fas fa-photo-video"></i><span>Track Competition</span><small>Entry review status</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="case-register"><i class="fas fa-file-upload"></i><span>Case presentation</span><small>Apply when open</small></button>' +
            '<button type="button" class="ak-hub-tile" data-ak-hub="case-track"><i class="fas fa-route"></i><span>Track case apps</span><small>Submission status</small></button>' +
            '</div>';
        if (quickCard) dash.insertBefore(hub, quickCard);
        else dash.appendChild(hub);
        hub.querySelectorAll('[data-ak-hub]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const k = btn.dataset.akHub;
                if (k === 'prereg-hub' || k === 'event-register') showPreregHubView();
                else if (k === 'prereg-track') showPreregTrackView();
                else if (k === 'main-reg-hub' || k === 'event-main-register' || k === 'event-track') showMainRegHubView();
                else if (k === 'main-reg-track') showMainRegTrackView();
                else if (k === 'comp-register') showCompRegisterView();
                else if (k === 'comp-track') showCompTrackView();
                else if (k === 'case-register') showCaseRegisterView();
                else if (k === 'case-track') showCaseTrackView();
            });
        });
        const ql = dash.querySelector('.card h3');
        if (ql && ql.textContent.indexOf('Quick') >= 0) {
            const qlWrap = ql.closest('.card');
            if (qlWrap) {
                qlWrap.querySelectorAll('button').forEach((b) => {
                    const oc = b.getAttribute('onclick') || '';
                    if (oc.indexOf('tab-seminars') >= 0 || oc.indexOf('tab-orders') >= 0) b.remove();
                });
            }
        }
    }

    function wireAutismTabs() {
        const preregSel = document.getElementById('prereg-seminar-select');
        if (preregSel) {
            preregSel.addEventListener('change', () => {
                const sid = parseInt(preregSel.value, 10);
                loadPreregFormConfig(sid || null).then(() => {
                    renderPreregFields(document.getElementById('prereg-fields'));
                });
            });
        }
        document.getElementById('prereg-form')?.addEventListener('submit', submitPreregistration);
        document.getElementById('prereg-wizard-next')?.addEventListener('click', onPreregWizardNext);
        document.getElementById('prereg-wizard-back')?.addEventListener('click', onPreregWizardBack);
        document.getElementById('competition-form')?.addEventListener('submit', submitCompetition);
        document.getElementById('comp-seminar-select')?.addEventListener('change', renderCompetitionSchedulePanel);
    }

    window.loadPreregList = loadPreregList;
    window.loadCompetitionList = loadCompetitionList;

    function applyBranding() {
        document.title = "Dashboard | Autism Awareness Programme";
        const h2 = document.querySelector('.sidebar-header h2');
        if (h2) h2.textContent = 'My Dashboard';
        const sub = document.querySelector('.sidebar-header p');
        if (sub) sub.textContent = 'Autism Awareness Programme';
        const ht = document.querySelector('.header-title');
        if (ht) ht.textContent = 'Autism Awareness Programme — Dashboard';
        updateProfileDisplayName();
    }

    function mainRegStepSection(step, fallback) {
        const sections = window.__registrationStepSections || [];
        const n = parseInt(step, 10);
        const hit = sections.find((s) => s && parseInt(s.step, 10) === n);
        return (hit && hit.title) || fallback;
    }

    function ensureMainRegPanelHeading(panelId, title, subtitle) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        let h = panel.querySelector('.ak-form-step-heading');
        if (!h) {
            h = document.createElement('h4');
            h.className = 'ak-form-step-heading';
            h.style.cssText = 'color:#0f766e;margin:0 0 14px;font-size:1.05rem;';
            panel.insertBefore(h, panel.firstChild);
        }
        h.textContent = title;
        let sub = panel.querySelector('.ak-form-step-subheading');
        if (subtitle) {
            if (!sub) {
                sub = document.createElement('p');
                sub.className = 'ak-form-step-subheading';
                sub.style.cssText = 'color:#64748b;margin:-8px 0 14px;font-size:0.88rem;';
                h.insertAdjacentElement('afterend', sub);
            }
            sub.textContent = subtitle;
        } else if (sub) {
            sub.remove();
        }
    }

    window.__akApplyMainRegStepSections = function applyMainRegStepSections(sections) {
        if (!document.body.classList.contains('ak-portal-dash')) return;
        window.__registrationStepSections = Array.isArray(sections) ? sections : [];
        const secs = window.__registrationStepSections;
        const t1 = mainRegStepSection(1, 'Personal details');
        const t2 = mainRegStepSection(2, 'Address');
        const t3 = mainRegStepSection(3, 'Programme details');
        const ind1 = document.getElementById('ind-step-1');
        const ind2 = document.getElementById('ind-step-2');
        const ind3 = document.getElementById('ind-step-3');
        if (ind1) ind1.textContent = '1. ' + t1;
        if (ind2) ind2.textContent = '2. ' + t2;
        if (ind3) ind3.textContent = '3. ' + t3;
        const s1 = secs.find((s) => parseInt(s.step, 10) === 1);
        const s2 = secs.find((s) => parseInt(s.step, 10) === 2);
        const s3 = secs.find((s) => parseInt(s.step, 10) === 3);
        ensureMainRegPanelHeading('step-1', t1, s1 && s1.subtitle);
        ensureMainRegPanelHeading('step-2', t2, s2 && s2.subtitle);
        const extraWrap = document.getElementById('ak-main-reg-extra');
        if (extraWrap) {
            const intro = extraWrap.querySelector('p');
            if (intro) {
                intro.textContent =
                    (s3 && s3.subtitle) ||
                    'Complete programme-specific details for this event. Fields are configured by the admin team.';
            }
            let h = extraWrap.querySelector('.ak-form-step-heading');
            if (!h) {
                h = document.createElement('h4');
                h.className = 'ak-form-step-heading';
                h.style.cssText = 'color:#0f766e;margin:0 0 10px;font-size:1.05rem;';
                extraWrap.insertBefore(h, extraWrap.firstChild);
            }
            h.textContent = t3;
        }
    };

    function renderMainRegExtraFields() {
        const container = document.getElementById('reg-autism-extra-fields');
        if (!container) return;
        container.innerHTML = '';
        const fields =
            typeof getAutismMainRegExtraFields === 'function'
                ? getAutismMainRegExtraFields()
                : (window.__registrationFormFields || []).filter((f) => f && f.step >= 3);
        if (!fields.length) {
            container.innerHTML =
                '<p style="color:#64748b;font-size:0.88rem;">No extra fields configured. Continue to preview.</p>';
            return;
        }
        fields.forEach((f) => {
            if (!f || f.enabled === false) return;
            const fg = document.createElement('div');
            fg.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = (f.label || f.key) + (f.required !== false ? ' *' : '');
            fg.appendChild(label);
            let input;
            const t = String(f.type || 'text').toLowerCase();
            if (t === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else if (t === 'select') {
                input = document.createElement('select');
                const blank = document.createElement('option');
                blank.value = '';
                blank.textContent = 'Select';
                input.appendChild(blank);
                (f.options || []).forEach((o) => {
                    const opt = document.createElement('option');
                    opt.value = o.value != null ? o.value : o.label;
                    opt.textContent = o.label || o.value;
                    input.appendChild(opt);
                });
            } else if (t === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
            } else if (t === 'file') {
                input = document.createElement('input');
                input.type = 'file';
                input.accept = f.key === 'photo' ? 'image/*' : '*/*';
            } else {
                input = document.createElement('input');
                input.type = t === 'email' ? 'email' : t === 'tel' ? 'tel' : t === 'date' ? 'date' : 'text';
            }
            input.id = 'reg-field-' + f.key;
            input.dataset.fieldKey = f.key;
            if (f.required !== false && t !== 'boolean' && t !== 'file') input.required = true;
            if (f.defaultValue && t !== 'boolean' && t !== 'file') input.value = f.defaultValue;
            fg.appendChild(input);
            container.appendChild(fg);
        });
        if (window.__akPendingMainRegPrefill) {
            applyPreregPrefillToMainReg({ prefill: window.__akPendingMainRegPrefill });
            window.__akPendingMainRegPrefill = null;
        } else if (window.__akLastMainRegPrefillPayload) {
            reapplyStoredMainRegPrefill();
        }
    }

    window.renderAutismMainRegistrationFields = renderMainRegExtraFields;

    function patchNextStepForPreregPrefill() {
        if (typeof nextStep !== 'function' || nextStep.__akPrefillHook) return;
        const orig = nextStep;
        window.nextStep = async function (step) {
            await orig.apply(this, arguments);
            if (document.body.classList.contains('ak-portal-dash') && Number(step) === 1) {
                reapplyStoredMainRegPrefill();
            }
        };
        window.nextStep.__akPrefillHook = true;
    }

    function patchAutismRegistrationFlow() {
        if (typeof hideAutismRegistrationQualUi === 'function') hideAutismRegistrationQualUi();
        if (typeof nextStep !== 'function' || nextStep.__autismSkipQualHook) return;
        const origNext = nextStep;
        window.nextStep = function (step) {
            if (step === 4) step = 5;
            return origNext.call(this, step);
        };
        window.nextStep.__autismSkipQualHook = true;
    }

    function patchMainRegistrationOnEventTab() {
        if (typeof window.startRegistration !== 'function' || window.startRegistration.__akEventTabHook) return;
        const origStart = window.startRegistration;
        window.startRegistration = async function (seminarId, opts) {
            const onMainHub = !!document.getElementById('tab-main-reg-hub');
            if (onMainHub) {
                hidePreregFormPanel();
                hideMainRegPrefillBanner();
                hideMainRegPreregLookupPanel();
                if (typeof window.switchTab === 'function') window.switchTab('tab-main-reg-hub');
            }
            window.__akMainRegSeminarId = Number(seminarId);
            await origStart.call(this, seminarId, opts);
            if (onMainHub) {
                const form = mainRegFormPanelEl();
                if (form) form.classList.add('hidden');
                const title =
                    window.__activeSeminarTitle ||
                    (window.activeSeminars || []).find((x) => Number(x.id) === Number(seminarId))?.title ||
                    'Event';
                const nameEl = document.getElementById('registration-seminar-name');
                if (nameEl) nameEl.textContent = 'Main registration — ' + title;
                showMainRegFormPanel(title);
            }
        };
        window.startRegistration.__akEventTabHook = true;

        if (typeof window.cancelRegistration !== 'function' || window.cancelRegistration.__akEventTabHook) return;
        const origCancel = window.cancelRegistration;
        window.cancelRegistration = function () {
            origCancel.call(this);
            hideMainRegFormPanel();
        };
        window.cancelRegistration.__akEventTabHook = true;
    }

    function patchSwitchTabForHub() {
        if (typeof switchTab !== 'function' || switchTab.__akHubHook) return;
        const orig = switchTab;
        window.switchTab = function (tabId, menuEl) {
            orig.call(this, tabId, menuEl);
            if (tabId === 'tab-prereg-hub') {
                hideEventRegisterForms();
                loadPreregSeminars();
            } else if (tabId === 'tab-prereg-track') {
                loadPreregList();
            } else if (tabId === 'tab-main-reg-hub') {
                hideEventRegisterForms();
                loadMainRegEvents();
            } else if (tabId === 'tab-main-reg-track') {
                if (typeof loadApplications === 'function') loadApplications(true);
            } else if (tabId === 'tab-comp-register') {
                loadCompetitionEvents().then(() => renderCompetitionSchedulePanel());
            } else if (tabId === 'tab-comp-track') {
                loadCompetitionList();
            } else if (tabId === 'tab-abstract') {
                if (typeof loadCaseProgramsGrid === 'function') loadCaseProgramsGrid();
            } else if (tabId === 'tab-case-track') {
                if (typeof loadCaseApplicationsTracker === 'function') loadCaseApplicationsTracker();
            }
        };
        window.switchTab.__akHubHook = true;
    }

    function patchSubmitApplicationSuccessBanner() {
        if (typeof window.submitApplication !== 'function' || window.submitApplication.__akBannerHook) return;
        const orig = window.submitApplication;
        window.submitApplication = async function () {
            if (!document.body.classList.contains('ak-portal-dash')) {
                return orig.apply(this, arguments);
            }
            const nativeFetch = window.fetch;
            let captured = null;
            window.fetch = function (url, opts) {
                const resPromise = nativeFetch.apply(this, arguments);
                if (typeof url === 'string' && url.indexOf('/api/applications/submit') >= 0) {
                    return resPromise.then(async (res) => {
                        try {
                            captured = await res.clone().json();
                        } catch (_) {}
                        return res;
                    });
                }
                return resPromise;
            };
            try {
                await orig.apply(this, arguments);
            } finally {
                window.fetch = nativeFetch;
            }
        };
        window.submitApplication.__akBannerHook = true;
    }

    function patchLoadRegistrationFormConfig() {
        if (typeof loadRegistrationFormConfigAndApply !== 'function' || loadRegistrationFormConfigAndApply.__akMainRegHook) {
            return;
        }
        const orig = loadRegistrationFormConfigAndApply;
        window.loadRegistrationFormConfigAndApply = async function () {
            await orig.apply(this, arguments);
            if (typeof hideAutismRegistrationQualUi === 'function') hideAutismRegistrationQualUi();
            renderMainRegExtraFields();
        };
        window.loadRegistrationFormConfigAndApply.__akMainRegHook = true;
    }

    function patchLoadApplicationsForMainRegUi() {
        if (typeof loadApplications !== 'function' || loadApplications.__akMainRegUiHook) return;
        const orig = loadApplications;
        window.loadApplications = async function () {
            await orig.apply(this, arguments);
            syncMainRegStartCard();
        };
        window.loadApplications.__akMainRegUiHook = true;
    }

    function preregLookupStatus(msg, isError) {
        const el = document.getElementById('reg-prereg-lookup-status');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = isError ? '#b91c1c' : '#047857';
    }

    function resolveMainRegSeminarId() {
        const fromWindow = window.activeSeminarIdForReg != null ? Number(window.activeSeminarIdForReg) : null;
        if (fromWindow && Number.isFinite(fromWindow) && fromWindow > 0) return fromWindow;
        try {
            if (typeof activeSeminarIdForReg !== 'undefined' && activeSeminarIdForReg != null) {
                const sid = Number(activeSeminarIdForReg);
                if (Number.isFinite(sid) && sid > 0) return sid;
            }
        } catch (_) {}
        const cached = window.__akMainRegSeminarId != null ? Number(window.__akMainRegSeminarId) : null;
        if (cached && Number.isFinite(cached) && cached > 0) return cached;
        return null;
    }

    function normalizeRegDateValue(val) {
        if (val == null || String(val).trim() === '') return '';
        const s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoPrefix) return isoPrefix[1];
        const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (dmy) {
            return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
        }
        return s;
    }

    function parsePreregFormDataClient(raw) {
        if (raw == null || raw === '') return {};
        if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try {
                let parsed = JSON.parse(raw);
                if (typeof parsed === 'string') {
                    try {
                        parsed = JSON.parse(parsed);
                    } catch (_) {}
                }
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            } catch (_) {
                return {};
            }
        }
        return {};
    }

    const MAIN_REG_PREFILL_ALIASES = {
        dob: ['dob', 'parent_dob'],
        parent_dob: ['parent_dob', 'dob'],
        child_dob: ['child_dob'],
        parent_gender: ['parent_gender', 'gender'],
        gender: ['gender', 'parent_gender'],
        child_name: ['child_name'],
        child_gender: ['child_gender'],
        attendees_count: ['attendees_count'],
        child_health: ['child_health'],
        diet: ['diet'],
        financial_planning: ['financial_planning']
    };

    function clientMapPreregFormToMain(rawFormData) {
        const src = parsePreregFormDataClient(rawFormData);
        const direct = {
            address: 'address',
            pin: 'pin',
            pincode: 'pin',
            city: 'city',
            state: 'state',
            country: 'country',
            parent_dob: 'dob',
            child_name: 'child_name',
            child_dob: 'child_dob',
            child_gender: 'child_gender',
            parent_gender: 'parent_gender',
            attendees_count: 'attendees_count',
            child_health: 'child_health',
            diet: 'diet',
            financial_planning: 'financial_planning',
            contact_email: 'email',
            contact_phone: 'phone',
            email: 'email',
            phone: 'phone'
        };
        const hasVal = (k) => {
            if (!src || src[k] == null) return false;
            if (typeof src[k] === 'boolean') return true;
            if (typeof src[k] === 'number') return !Number.isNaN(src[k]);
            return String(src[k]).trim() !== '';
        };
        const out = {};
        Object.keys(src).forEach((k) => {
            if (k.startsWith('_')) return;
            if (!hasVal(k)) return;
            let val = src[k];
            if (String(k).endsWith('_dob') || k === 'dob') val = normalizeRegDateValue(val);
            else if (typeof val !== 'boolean' && typeof val !== 'number') val = String(val).trim();
            out[k] = val;
        });
        Object.keys(direct).forEach((fromKey) => {
            if (!hasVal(fromKey)) return;
            const toKey = direct[fromKey];
            let val = src[fromKey];
            if (String(fromKey).endsWith('_dob') || toKey === 'dob') val = normalizeRegDateValue(val);
            else if (typeof val !== 'boolean' && typeof val !== 'number') val = String(val).trim();
            out[toKey] = val;
            if (fromKey !== toKey) out[fromKey] = val;
        });
        if (hasVal('parent_name')) {
            const parts = String(src.parent_name).trim().split(/\s+/).filter(Boolean);
            if (parts.length) out.fname = parts[0];
            if (parts.length > 1) out.lname = parts.slice(1).join(' ');
            out.parent_name = String(src.parent_name).trim();
        }
        return out;
    }

    function mergePrefillObjects(a, b) {
        const out = Object.assign({}, a || {});
        [b, a].forEach((src) => {
            Object.keys(src || {}).forEach((k) => {
                const v = src[k];
                if (v == null) return;
                if (typeof v === 'boolean' || typeof v === 'number') {
                    out[k] = v;
                    return;
                }
                if (String(v).trim() !== '') out[k] = v;
            });
        });
        return out;
    }

    function enrichPrefillFromCachedPrereg(seminarId, prefill) {
        const sid = Number(seminarId);
        const row = window.__akPreregBySeminar && window.__akPreregBySeminar[sid];
        if (!row) return prefill || {};
        const local = clientMapPreregFormToMain(row.form_data);
        return mergePrefillObjects(local, prefill);
    }

    function reapplyStoredMainRegPrefill() {
        const payload = window.__akLastMainRegPrefillPayload;
        if (!payload || !payload.prefill) return;
        applyMainRegPrefillValues(payload.prefill, true);
    }

    function hideMainRegPrefillBanner() {
        document.getElementById('reg-prereg-prefill-banner')?.classList.add('hidden');
    }

    function showMainRegPrefillBanner(message) {
        hideMainRegPreregLookupPanel();
        const banner = document.getElementById('reg-prereg-prefill-banner');
        const text = document.getElementById('reg-prereg-prefill-banner-text');
        if (text && message) text.textContent = message;
        banner?.classList.remove('hidden');
    }

    function clearMainRegFieldValue(key) {
        const mapped = {
            fname: 'reg-fname',
            mname: 'reg-mname',
            lname: 'reg-lname',
            email: 'reg-email',
            phone: 'reg-phone',
            dob: 'reg-dob',
            address: 'reg-addr',
            pin: 'reg-pin',
            city: 'reg-city',
            state: 'reg-state',
            country: 'reg-country'
        };
        const id = mapped[key] || 'reg-field-' + key;
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = false;
        else if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
    }

    function clearMainRegFormForPreregPrefill() {
        const keys = new Set([
            'fname',
            'mname',
            'lname',
            'email',
            'phone',
            'dob',
            'address',
            'pin',
            'city',
            'state',
            'country'
        ]);
        const payload = window.__akLastMainRegPrefillPayload && window.__akLastMainRegPrefillPayload.prefill;
        if (payload) Object.keys(payload).forEach((k) => keys.add(k));
        keys.forEach(clearMainRegFieldValue);
        const extras =
            typeof getAutismMainRegExtraFields === 'function' ? getAutismMainRegExtraFields() : [];
        extras.forEach((f) => {
            if (f && f.key) keys.add(f.key);
        });
        keys.forEach(clearMainRegFieldValue);
    }

    function applyPreregPrefillToMainReg(data) {
        data = data || {};
        const sid = resolveMainRegSeminarId();
        const mergedPrefill = enrichPrefillFromCachedPrereg(sid, data.prefill || {});
        window.__akLastMainRegPrefillPayload = Object.assign({}, data, { prefill: mergedPrefill });
        clearMainRegFormForPreregPrefill();
        applyMainRegPrefillValues(mergedPrefill, true);
        const prefill = mergedPrefill;
        const u = window.currentUser;
        if (!prefill.email && u && u.email) setRegFieldValue('email', u.email, true);
        if (!prefill.phone && u && u.phone) setRegFieldValue('phone', u.phone, true);
        window.__mainRegPrefillFromPrereg = true;
        const msg =
            data.message ||
            'Fields you already submitted in pre-registration are filled in. Complete any remaining fields below.';
        showMainRegPrefillBanner(msg);
        requestAnimationFrame(reapplyStoredMainRegPrefill);
    }

    function applyMainRegPrefillFromCachedPrereg(seminarId) {
        const sid = Number(seminarId);
        const row = window.__akPreregBySeminar && window.__akPreregBySeminar[sid];
        if (!row || !row.form_data) return false;
        const prefill = clientMapPreregFormToMain(row.form_data);
        if (!Object.keys(prefill).length) return false;
        applyPreregPrefillToMainReg({
            prefill,
            applicationNo: row.application_no,
            status: row.status,
            message:
                'Details loaded from your pre-registration on this account. Review and complete any remaining fields below.'
        });
        return true;
    }

    function showMainRegPreregLookupPanel(seminarId) {
        const panel = document.getElementById('reg-prereg-lookup-panel');
        if (!panel) return;
        hideMainRegPrefillBanner();
        const seminar =
            (window.__akAllSeminars || []).find((x) => Number(x.id) === Number(seminarId)) ||
            (window.activeSeminars || []).find((x) => Number(x.id) === Number(seminarId));
        const flags = seminar ? seminarFlowFlags(seminar) : { preregistrationRequired: false };
        if (!flags.preregistrationRequired) {
            panel.classList.add('hidden');
            return;
        }
        const existing = window.__akPreregBySeminar && window.__akPreregBySeminar[Number(seminarId)];
        if (existing && existing.form_data) {
            panel.classList.add('hidden');
            preregLookupStatus('');
            return;
        }
        panel.classList.remove('hidden');
        preregLookupStatus('');
        const input = document.getElementById('reg-prereg-id-input');
        if (input && existing && existing.application_no && !input.value) {
            input.value = existing.application_no;
        }
    }

    async function autoLoadMainRegPrefillFromPrereg(seminarId) {
        const sid = Number(seminarId) || resolveMainRegSeminarId();
        const uid = currentUserId();
        if (!uid || !Number.isFinite(sid) || sid < 1) return null;
        window.__akMainRegSeminarId = sid;
        const seminar =
            (window.__akAllSeminars || []).find((x) => Number(x.id) === sid) ||
            (window.activeSeminars || []).find((x) => Number(x.id) === sid);
        const flags = seminar ? seminarFlowFlags(seminar) : { preregistrationRequired: false };
        if (!flags.preregistrationRequired) {
            hideMainRegPreregLookupPanel();
            hideMainRegPrefillBanner();
            return null;
        }
        try {
            const q =
                '/api/preregistrations/lookup-for-main-reg?userId=' +
                encodeURIComponent(uid) +
                '&seminarId=' +
                encodeURIComponent(sid);
            const data = await fetchJson(q);
            window.__akPendingMainRegPrefill = data.prefill || {};
            applyPreregPrefillToMainReg(data);
            window.__akPendingMainRegPrefill = null;
            return data;
        } catch (e) {
            if (applyMainRegPrefillFromCachedPrereg(sid)) return { fromCache: true };
            hideMainRegPrefillBanner();
            const cached = window.__akPreregBySeminar && window.__akPreregBySeminar[sid];
            if (cached) {
                hideMainRegPreregLookupPanel();
                return null;
            }
            showMainRegPreregLookupPanel(sid);
            preregLookupStatus(
                (e && e.message) || 'Could not load pre-registration automatically. Enter your ID below if you used the public form.',
                true
            );
            return null;
        }
    }

    function hideMainRegPreregLookupPanel() {
        document.getElementById('reg-prereg-lookup-panel')?.classList.add('hidden');
        preregLookupStatus('');
    }

    function setRegFieldValue(key, val, force) {
        if (val == null) return;
        const mapped = {
            fname: 'reg-fname',
            mname: 'reg-mname',
            lname: 'reg-lname',
            email: 'reg-email',
            phone: 'reg-phone',
            dob: 'reg-dob',
            address: 'reg-addr',
            pin: 'reg-pin',
            city: 'reg-city',
            state: 'reg-state',
            country: 'reg-country'
        };
        const id = mapped[key] || 'reg-field-' + key;
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked =
                val === true ||
                val === '1' ||
                val === 1 ||
                String(val).toLowerCase() === 'yes' ||
                String(val).toLowerCase() === 'true';
            return;
        }
        if (typeof val === 'number') {
            el.value = String(val);
            return;
        }
        if (typeof val === 'boolean') {
            if (el.type === 'checkbox') el.checked = val;
            return;
        }
        let v = String(val).trim();
        if (!v) return;
        if (el.type === 'date' || key === 'dob' || String(key).endsWith('_dob')) {
            v = normalizeRegDateValue(v);
        }
        if (!v) return;
        if (el.type === 'date' && force && v) {
            el.removeAttribute('min');
            el.removeAttribute('max');
        }
        if (el.tagName === 'SELECT') {
            if (![...el.options].some((o) => o.value === v)) {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                el.appendChild(opt);
            }
            el.value = v;
        } else if (force || String(el.value || '').trim() === '') {
            el.value = v;
        }
    }

    function applyMainRegPrefillValues(prefill, skipStore) {
        if (!prefill || typeof prefill !== 'object') return;
        Object.keys(prefill).forEach((k) => {
            const val = prefill[k];
            const targets = MAIN_REG_PREFILL_ALIASES[k] || [k];
            targets.forEach((tk) => setRegFieldValue(tk, val, true));
        });
        if (!skipStore) window.__akLastMainRegPrefillPayload = { prefill: prefill };
        window.__mainRegPrefillFromPrereg = true;
    }

    async function lookupPreregForMainReg() {
        const input = document.getElementById('reg-prereg-id-input');
        const applicationNo = String((input && input.value) || '').trim();
        const seminarId = resolveMainRegSeminarId();
        const uid = currentUserId();
        if (!uid) {
            preregLookupStatus('Sign in first to complete main registration.', true);
            return;
        }
        if (!seminarId) {
            preregLookupStatus('Open main registration for an event first, then load details.', true);
            return;
        }
        preregLookupStatus('Looking up…');
        const btn = document.getElementById('reg-prereg-lookup-btn');
        if (btn) btn.disabled = true;
        try {
            let q =
                '/api/preregistrations/lookup-for-main-reg?userId=' +
                encodeURIComponent(uid) +
                '&seminarId=' +
                encodeURIComponent(seminarId);
            if (applicationNo) q += '&applicationNo=' + encodeURIComponent(applicationNo);
            const data = await fetchJson(q);
            window.__akPendingMainRegPrefill = data.prefill || {};
            applyPreregPrefillToMainReg(data);
            window.__akPendingMainRegPrefill = null;
        } catch (e) {
            preregLookupStatus(e.message || 'Could not load pre-registration.', true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    window.lookupPreregForMainReg = lookupPreregForMainReg;

    function wireMainRegPreregLookup() {
        document.getElementById('reg-prereg-lookup-btn')?.addEventListener('click', lookupPreregForMainReg);
        document.getElementById('reg-prereg-id-input')?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                lookupPreregForMainReg();
            }
        });
        if (typeof window.cancelRegistration === 'function' && !window.cancelRegistration.__akPreregLookupHook) {
            const origCancel = window.cancelRegistration;
            window.cancelRegistration = function () {
                hideMainRegPreregLookupPanel();
                hideMainRegPrefillBanner();
                window.__akMainRegSeminarId = null;
                window.__akLastMainRegPrefillPayload = null;
                return origCancel.apply(this, arguments);
            };
            window.cancelRegistration.__akPreregLookupHook = true;
        }
    }

    function patchMainRegPreregLookupOnStart() {
        if (typeof window.startRegistration !== 'function' || window.startRegistration.__akPreregLookupHook) return;
        const orig = window.startRegistration;
        window.startRegistration = async function (seminarId, opts) {
            await orig.apply(this, arguments);
            if (document.body.classList.contains('ak-portal-dash')) {
                await autoLoadMainRegPrefillFromPrereg(seminarId);
            }
        };
        window.startRegistration.__akPreregLookupHook = true;
    }

    document.addEventListener('DOMContentLoaded', () => {
        hideAutismDisabledTabs();
        enableCasePresentationNav();
        separatePreregAndMainRegistration();
        wireRegisterModal();
        setupDashboardHub();
        patchSwitchTabForHub();
        patchAutismRegistrationFlow();
        patchNextStepForPreregPrefill();
        patchMainRegistrationOnEventTab();
        patchSubmitApplicationSuccessBanner();
        patchLoadRegistrationFormConfig();
        patchLoadApplicationsForMainRegUi();
        wireMainRegPreregLookup();
        patchMainRegPreregLookupOnStart();
        applyBranding();
        const accountFields = document.getElementById('profile-account-fields');
        if (accountFields) {
            accountFields.classList.remove('hidden');
            accountFields.style.display = 'grid';
        }
        wireAutismTabs();
        loadCompetitionEvents();
        if (typeof loadApplicantAnnouncements === 'function') loadApplicantAnnouncements();
        if (typeof loadApplications === 'function') {
            setTimeout(() => {
                loadApplications();
                if (typeof syncDoctorTrackingPolls === 'function') syncDoctorTrackingPolls();
            }, 800);
        }
        setTimeout(updateProfileDisplayName, 400);
        setTimeout(updateProfileDisplayName, 2500);
    });
})();
