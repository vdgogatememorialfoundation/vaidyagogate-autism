/**
 * Autism portal: replace "doctor" wording with participant/applicant language in the UI.
 * Does not change API roles, element IDs, or backend field names.
 */
(function (global) {
    'use strict';

    const SKIP_PARENT =
        'SCRIPT,STYLE,CODE,PRE,INPUT,TEXTAREA,SELECT,OPTION,NOSCRIPT,SVG,MATH';

    /** Longest phrases first */
    const REPLACEMENTS = [
        [/Registered doctors/gi, 'Registered participants'],
        [/Create doctor/gi, 'Create participant'],
        [/Search doctors/gi, 'Search participants'],
        [/Non-doctor accounts/gi, 'Staff & other accounts'],
        [/Doctor applications \(admin\)/gi, 'Register participant (admin)'],
        [/Doctor seminar applications/gi, 'Participant registrations'],
        [/Doctor Support Tickets/gi, 'Participant support tickets'],
        [/Doctor portal updates/gi, 'Dashboard updates'],
        [/Doctor portal/gi, 'Participant dashboard'],
        [/doctor portal/gi, 'participant dashboard'],
        [/Doctor access/gi, 'Participant access'],
        [/Website & doctor updates/gi, 'Website & dashboard updates'],
        [/User & doctor activity/gi, 'User activity'],
        [/Look up doctor/gi, 'Look up participant'],
        [/for a doctor/gi, 'for a participant'],
        [/to the doctor/gi, 'to the participant'],
        [/the doctor in/gi, 'the participant in'],
        [/another doctor account/gi, 'another participant account'],
        [/Doctor account/gi, 'Participant account'],
        [/Doctor \(ID/gi, 'Participant (ID'],
        [/Doctor ID/gi, 'Participant ID'],
        [/Doctor Name/gi, 'Name'],
        [/Doctor Name/gi, 'Name'],
        [/All doctors/gi, 'All participants'],
        [/all doctors/gi, 'all participants'],
        [/doctor delegate/gi, 'participant'],
        [/doctor@example\.com/gi, 'participant@example.com'],
        [/doctor@email\.com/gi, 'participant@email.com'],
        [/Hi, Doctor/gi, 'Hi there'],
        [/doctor accounts/gi, 'participant accounts'],
        [/doctor account/gi, 'participant account'],
        [/disabled doctor/gi, 'disabled participant'],
        [/banned\/disabled doctor/gi, 'banned/disabled participant'],
        [/Select doctor/gi, 'Select participant'],
        [/Select a doctor/gi, 'Select a participant'],
        [/shown to doctor/gi, 'shown to participant'],
        [/for doctors/gi, 'for participants'],
        [/Doctors see/gi, 'Participants see'],
        [/Doctors enter/gi, 'Participants enter'],
        [/Doctors and/gi, 'Participants and'],
        [/under the <strong>Doctors<\/strong>/gi, 'under <strong>Participants</strong>'],
        [/\bDoctors\b/g, 'Participants'],
        [/\bDoctor\b/g, 'Participant'],
        [/\bdoctors\b/g, 'participants'],
        [/\bdoctor\b/g, 'participant']
    ];

    function shouldSkipNode(node) {
        let p = node.parentElement;
        while (p) {
            if (SKIP_PARENT.split(',').some((tag) => p.tagName === tag)) return true;
            if (p.getAttribute && p.getAttribute('data-ak-no-relabel') === '1') return true;
            p = p.parentElement;
        }
        return false;
    }

    function replaceText(s) {
        if (!s || !/doctor/i.test(s)) return s;
        let out = s;
        for (const [re, rep] of REPLACEMENTS) {
            out = out.replace(re, rep);
        }
        return out;
    }

    function walkText(root) {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
                if (!/doctor/i.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((n) => {
            const next = replaceText(n.nodeValue);
            if (next !== n.nodeValue) n.nodeValue = next;
        });
    }

    function replaceAttributes(root) {
        if (!root) return;
        root.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
            if (el.closest('script,style')) return;
            ['placeholder', 'title', 'aria-label'].forEach((attr) => {
                const v = el.getAttribute(attr);
                if (v && /doctor/i.test(v)) {
                    el.setAttribute(attr, replaceText(v));
                }
            });
        });
    }

    function relabelAdminMenu() {
        const doctorsTab = document.querySelector('[data-admin-module="tab-doctors"]');
        if (doctorsTab) {
            doctorsTab.innerHTML = '<i class="fas fa-users" aria-hidden="true"></i> Participants';
        }
        const hideModules = [
            'tab-admin-payments',
            'tab-pos',
            'tab-case-mgmt'
        ];
        hideModules.forEach((mod) => {
            document.querySelectorAll(`[data-admin-module="${mod}"]`).forEach((el) => {
                el.classList.add('hidden');
                el.style.display = 'none';
            });
        });
        const h2 = document.querySelector('#tab-doctors h2');
        if (h2) h2.textContent = 'Participants';
    }

    function relabelApplicantDashboard() {
        const banner = document.getElementById('profile-complete-banner');
        if (banner) {
            banner.innerHTML =
                '<i class="fas fa-info-circle"></i> Complete your profile before registering for events.';
        }
        const dashIntro = document.querySelector('#tab-dashboard p');
        if (dashIntro) {
            dashIntro.innerHTML =
                'Overview of your programme activity. Use the menu for pre-registration, registration, competitions, and tickets.';
        }
        document.querySelectorAll('.menu-item').forEach((btn) => {
            const t = btn.textContent || '';
            if (/Available Seminars/i.test(t)) btn.innerHTML = '<i class="fas fa-calendar-check"></i> Events';
            if (/Seminar feedback/i.test(t)) btn.innerHTML = '<i class="fas fa-star"></i> Event feedback';
        });
        const statPaid = document.querySelector('#stat-paid')?.closest('.stat-card')?.querySelector('p');
        if (statPaid) statPaid.textContent = 'Confirmed';
        const statReg = document.querySelector('#stat-registered')?.closest('.stat-card')?.querySelector('p');
        if (statReg) statReg.textContent = 'Events joined';
        const caseStat = document.getElementById('stat-abstracts')?.closest('.stat-card');
        if (caseStat) caseStat.classList.add('hidden');
    }

    function applyAll() {
        walkText(document.body);
        replaceAttributes(document.body);
        if (document.body.classList.contains('ak-portal-admin')) relabelAdminMenu();
        if (document.body.classList.contains('ak-portal-dash')) relabelApplicantDashboard();
    }

    let debounce;
    function schedule() {
        clearTimeout(debounce);
        debounce = setTimeout(applyAll, 120);
    }

    function init() {
        applyAll();
        const obs = new MutationObserver(schedule);
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        setTimeout(applyAll, 600);
        setTimeout(applyAll, 2000);
        setTimeout(applyAll, 5000);
    }

    global.AutismTerminology = { applyAll, replaceText };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
