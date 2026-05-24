/**
 * Autism admin portal: hide judge/case/payment UI; participant-focused labels.
 */
(function () {
    'use strict';

    const HIDE_MODULES = [
        'tab-case-mgmt',
        'tab-admin-payments',
        'tab-pos'
    ];

    const HIDE_TEXT = [
        'judge',
        'case presentation',
        'case program',
        'payment gateway',
        'pos on-spot',
        'on-spot pos'
    ];

    function hideMenuItems() {
        HIDE_MODULES.forEach((mod) => {
            document.querySelectorAll(`[data-admin-module="${mod}"]`).forEach((el) => {
                el.classList.add('hidden');
                el.style.display = 'none';
            });
        });
        document.querySelectorAll('a, button, .menu-item').forEach((el) => {
            const t = (el.textContent || '').toLowerCase();
            if (HIDE_TEXT.some((k) => t.includes(k))) {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        });
        const priceRow = document.getElementById('seminar-price')?.closest('div');
        if (priceRow) {
            priceRow.style.display = 'none';
            const priceInput = document.getElementById('seminar-price');
            if (priceInput) priceInput.value = '0';
        }
    }

    function injectPreregFields() {
        const regStart = document.getElementById('seminar-reg-start');
        if (!regStart || document.getElementById('seminar-prereg-start')) return;
        const grid = regStart.closest('div[style*="grid"]');
        if (!grid || !grid.parentNode) return;
        const block = document.createElement('div');
        block.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:4px;';
        block.innerHTML =
            '<div><label>Pre-registration Start <span style="font-weight:normal;color:#64748b;">(IST)</span></label>' +
            '<input type="datetime-local" id="seminar-prereg-start"></div>' +
            '<div><label>Pre-registration End <span style="font-weight:normal;color:#64748b;">(IST)</span></label>' +
            '<input type="datetime-local" id="seminar-prereg-end"></div>';
        grid.parentNode.insertBefore(block, grid.nextSibling);
    }

    function patchSaveSeminar() {
        if (typeof window.saveSeminar !== 'function' || window.__autismSavePatched) return;
        const orig = window.saveSeminar;
        window.saveSeminar = function (ev) {
            const ps = document.getElementById('seminar-prereg-start');
            const pe = document.getElementById('seminar-prereg-end');
            if (ps && pe) {
                window.__autismPreregStart = ps.value;
                window.__autismPreregEnd = pe.value;
            }
            const price = document.getElementById('seminar-price');
            if (price) price.value = '0';
            return orig.call(this, ev);
        };
        window.__autismSavePatched = true;
    }

    function patchSeminarPayload() {
        if (window.__autismFetchPatched) return;
        const origFetch = window.fetch;
        window.fetch = function (url, opts) {
            if (
                typeof url === 'string' &&
                (url.includes('/api/admin/seminars') || url.match(/\/api\/admin\/seminars\/\d+/)) &&
                opts &&
                opts.method &&
                opts.method.toUpperCase() !== 'GET' &&
                opts.body
            ) {
                try {
                    const data = JSON.parse(opts.body);
                    data.price = 0;
                    if (window.__autismPreregStart != null) {
                        data.preregistration_start = window.PortalDateTime
                            ? window.PortalDateTime.fromDatetimeLocal(window.__autismPreregStart)
                            : window.__autismPreregStart;
                    }
                    if (window.__autismPreregEnd != null) {
                        data.preregistration_end = window.PortalDateTime
                            ? window.PortalDateTime.fromDatetimeLocal(window.__autismPreregEnd)
                            : window.__autismPreregEnd;
                    }
                    opts = { ...opts, body: JSON.stringify(data) };
                } catch (_) {}
            }
            return origFetch.call(this, url, opts);
        };
        window.__autismFetchPatched = true;
    }

    function applyAdminBranding() {
        document.title = (document.title || '').replace(/Seminar|Doctor/gi, 'Autism');
        const side = document.querySelector('.sidebar-header h2');
        if (side) side.textContent = 'Autism Admin';
        const sub = document.querySelector('.sidebar-header p');
        if (sub) sub.textContent = 'Programme management';
        const staffNote = document.querySelector('#tab-staff-users p');
        if (staffNote && /Doctors/i.test(staffNote.textContent)) {
            staffNote.innerHTML =
                'Judge, co-admin, scanner, and reviewer accounts appear here. Public sign-ups appear under <strong>Participants</strong>.';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        hideMenuItems();
        injectPreregFields();
        patchSaveSeminar();
        patchSeminarPayload();
        applyAdminBranding();
        if (window.AutismTerminology) window.AutismTerminology.applyAll();
    });
})();
