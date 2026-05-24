/**
 * Autism portal: replace "doctor" with applicant language in the UI.
 */
(function (global) {
    'use strict';

    const SKIP_PARENT =
        'SCRIPT,STYLE,CODE,PRE,INPUT,TEXTAREA,SELECT,OPTION,NOSCRIPT,SVG,MATH';

    /** Longest phrases first */
    const REPLACEMENTS = [
        [/Registered doctors/gi, 'Registered applicants'],
        [/Create doctor/gi, 'Create applicant'],
        [/Search doctors/gi, 'Search applicants'],
        [/Non-doctor accounts/gi, 'Staff & other accounts'],
        [/Doctor applications \(admin\)/gi, 'Register applicant (admin)'],
        [/Doctor seminar applications/gi, 'Applicant registrations'],
        [/Doctor Support Tickets/gi, 'Applicant support tickets'],
        [/Doctor portal updates/gi, 'Applicant dashboard updates'],
        [/Applicant portal updates/gi, 'Applicant dashboard updates'],
        [/Doctor portal/gi, 'Applicant dashboard'],
        [/doctor portal/gi, 'applicant dashboard'],
        [/Participant dashboard/gi, 'Applicant dashboard'],
        [/participant dashboard/gi, 'applicant dashboard'],
        [/Doctor access/gi, 'Applicant access'],
        [/Website & doctor updates/gi, 'Website & dashboard updates'],
        [/User & doctor activity/gi, 'User activity'],
        [/Look up doctor/gi, 'Look up applicant'],
        [/for a doctor/gi, 'for an applicant'],
        [/to the doctor/gi, 'to the applicant'],
        [/the doctor in/gi, 'the applicant in'],
        [/another doctor account/gi, 'another applicant account'],
        [/Doctor account/gi, 'Applicant account'],
        [/Doctor \(ID/gi, 'Applicant (ID'],
        [/Doctor ID/gi, 'Applicant ID'],
        [/Doctor Name/gi, 'Name'],
        [/All doctors/gi, 'All applicants'],
        [/all doctors/gi, 'all applicants'],
        [/doctor delegate/gi, 'applicant'],
        [/doctor@example\.com/gi, 'applicant@example.com'],
        [/doctor@email\.com/gi, 'applicant@email.com'],
        [/Hi, Doctor/gi, 'Hi there'],
        [/doctor accounts/gi, 'applicant accounts'],
        [/doctor account/gi, 'applicant account'],
        [/disabled doctor/gi, 'disabled applicant'],
        [/banned\/disabled doctor/gi, 'banned/disabled applicant'],
        [/Select doctor/gi, 'Select applicant'],
        [/Select a doctor/gi, 'Select an applicant'],
        [/shown to doctor/gi, 'shown to applicant'],
        [/for doctors/gi, 'for applicants'],
        [/Doctors see/gi, 'Applicants see'],
        [/Doctors enter/gi, 'Applicants enter'],
        [/Doctors and/gi, 'Applicants and'],
        [/under the <strong>Doctors<\/strong>/gi, 'under <strong>Applicants</strong>'],
        [/Participants/gi, 'Applicants'],
        [/participants/gi, 'applicants'],
        [/Participant/gi, 'Applicant'],
        [/participant/gi, 'applicant'],
        [/\bDoctors\b/g, 'Applicants'],
        [/\bDoctor\b/g, 'Applicant'],
        [/\bdoctors\b/g, 'applicants'],
        [/\bdoctor\b/g, 'applicant']
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
        if (!s || !/doctor|participant/i.test(s)) return s;
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
                if (!/doctor|participant/i.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
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
                if (v && /doctor|participant/i.test(v)) {
                    el.setAttribute(attr, replaceText(v));
                }
            });
        });
    }

    function relabelAdminMenu() {
        document.querySelectorAll('[data-admin-module="tab-doctors"]').forEach((el) => {
            el.innerHTML = '<i class="fas fa-users" aria-hidden="true"></i> Applicants';
        });
        const hideModules = ['tab-admin-payments', 'tab-pos', 'tab-case-mgmt'];
        hideModules.forEach((mod) => {
            document.querySelectorAll(`[data-admin-module="${mod}"]`).forEach((el) => {
                el.classList.add('hidden');
                el.style.display = 'none';
            });
        });
        const h2 = document.querySelector('#tab-doctors h2');
        if (h2) h2.textContent = 'Applicants';
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
        const authTitle = document.getElementById('doctor-auth-title');
        if (authTitle) authTitle.textContent = 'Welcome! Applicant sign in';
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
})(typeof window !== 'undefined' ? window : global);
