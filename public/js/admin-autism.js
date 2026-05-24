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

    function patchApplicationsMenu() {
        document.querySelectorAll('[data-admin-module="tab-applications"]').forEach((el) => {
            if (el.querySelector('i')) el.innerHTML = '<i class="fas fa-folder-open"></i> Final registration';
        });
    }

    function hideGalleryCmsBlocks() {
        document.querySelectorAll('#cms-gallery-years').forEach((el) => {
            const card = el.closest('.card') || el.parentElement;
            if (card) card.style.display = 'none';
        });
        const semGal = document.getElementById('seminar-gallery');
        if (semGal) {
            const wrap = semGal.closest('div')?.parentElement;
            if (wrap) wrap.style.display = 'none';
        }
    }

    function applyAdminBranding() {
        document.title = (document.title || '').replace(/Seminar|Doctor/gi, 'Autism');
        const side = document.querySelector('.sidebar-header h2');
        if (side) side.textContent = 'Autism Admin';
        const sub = document.querySelector('.sidebar-header p');
        if (sub) sub.textContent = 'Programme management';
        patchApplicationsMenu();
        const staffNote = document.querySelector('#tab-staff-users p');
        if (staffNote && /Doctors/i.test(staffNote.textContent)) {
            staffNote.innerHTML =
                'Judge, co-admin, scanner, and reviewer accounts appear here. Public sign-ups appear under <strong>Participants</strong>.';
        }
    }

    function hideMedicalQualOptions() {
        const qualHost = document.getElementById('admin-global-qual-options');
        if (qualHost) {
            const block = qualHost.closest('div[style*="f0fdf4"]') || qualHost.parentElement;
            if (block) block.style.display = 'none';
        }
        document.querySelectorAll('#admin-reg-fields-tbody tr').forEach((tr) => {
            const keyCell = tr.querySelector('td');
            if (keyCell && String(keyCell.textContent || '').trim().toLowerCase() === 'qual') {
                tr.style.display = 'none';
            }
        });
    }

    const PREREG_STATUSES = ['submitted', 'approved', 'rejected', 'revision_required'];

    function preregStatusOptionsHtml(current) {
        const cur = String(current || 'submitted').toLowerCase();
        return PREREG_STATUSES.map(
            (s) =>
                `<option value="${s}"${cur === s ? ' selected' : ''}>${s.replace(/_/g, ' ')}</option>`
        ).join('');
    }

    function injectApplicationsStatusFilter() {
        const search = document.getElementById('applications-search');
        if (!search || document.getElementById('applications-queue-filter')) return;
        const wrap = search.closest('div');
        if (!wrap) return;
        const row = document.createElement('div');
        row.style.cssText = 'margin-top:10px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;';
        row.innerHTML =
            '<label style="font-weight:600;font-size:0.9rem;">Show</label>' +
            '<select id="applications-queue-filter" onchange="adminFilterApplicationsList()" style="padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;">' +
            '<option value="all">All (pre-reg + final)</option>' +
            '<option value="pending">Pending pre-reg only</option>' +
            '<option value="prereg">All pre-registrations</option>' +
            '<option value="final">Final registration only</option>' +
            '</select>';
        wrap.appendChild(row);
    }

    function patchAdminApplicationsQueue() {
        if (window.__autismAppsPatched || typeof window.loadApplications !== 'function') return;
        const origLoad = window.loadApplications;
        window.loadApplications = async function () {
            try {
                const [regsRes, preRes] = await Promise.all([
                    fetch('/api/admin/applications'),
                    fetch('/api/admin/preregistrations')
                ]);
                const regs = await regsRes.json();
                const pregs = await preRes.json();
                const preRows = (Array.isArray(pregs) ? pregs : []).map((p) => {
                    let formData = {};
                    try {
                        formData = JSON.parse(p.form_data || '{}');
                    } catch (_) {}
                    const candidateName = formData.fname
                        ? [formData.fname, formData.mname, formData.lname].filter(Boolean).join(' ')
                        : [p.first_name, p.last_name].filter(Boolean).join(' ');
                    return {
                        id: 'prereg-' + p.id,
                        prereg_id: p.id,
                        application_no: p.application_no,
                        status: p.status || 'submitted',
                        form_data: p.form_data,
                        first_name: p.first_name,
                        last_name: p.last_name,
                        user_id_string: p.user_id_string || '',
                        created_at: p.created_at,
                        seminar_title: p.seminar_title,
                        _kind: 'prereg',
                        _candidateName: candidateName,
                        _hasFinalReg: !!p.registration_id
                    };
                });
                const merged = [
                    ...preRows,
                    ...(Array.isArray(regs) ? regs.map((r) => ({ ...r, _kind: 'registration' })) : [])
                ];
                if (typeof window.__setGlobalAdminApps === 'function') {
                    window.__setGlobalAdminApps(merged);
                }
                if (typeof window.renderApplicationsTable === 'function') window.renderApplicationsTable();
            } catch (e) {
                console.error(e);
                return origLoad();
            }
        };

        const origRender = window.renderApplicationsTable;
        window.renderApplicationsTable = function () {
            const tbody = document.getElementById('applications-list');
            if (!tbody) return origRender ? origRender() : undefined;
            const filterEl = document.getElementById('applications-queue-filter');
            const filter = filterEl ? String(filterEl.value || 'all') : 'all';
            const q = String((document.getElementById('applications-search') || {}).value || '')
                .trim()
                .toLowerCase();
            const apps =
                typeof window.__getGlobalAdminApps === 'function' ? window.__getGlobalAdminApps() : [];
            if (filter === 'pending') {
                apps = apps.filter(
                    (a) =>
                        a._kind === 'prereg' &&
                        !a._hasFinalReg &&
                        ['submitted', 'revision_required'].includes(String(a.status || '').toLowerCase())
                );
            } else if (filter === 'prereg') {
                apps = apps.filter((a) => a._kind === 'prereg');
            } else if (filter === 'final') {
                apps = apps.filter((a) => a._kind !== 'prereg');
            }
            const filtered = q
                ? apps.filter((a) =>
                      typeof adminApplicationSearchBlob === 'function'
                          ? adminApplicationSearchBlob(a).includes(q)
                          : true
                  )
                : apps;
            const countEl = document.getElementById('applications-search-count');
            if (countEl) {
                const total =
                    typeof window.__getGlobalAdminApps === 'function'
                        ? window.__getGlobalAdminApps().length
                        : apps.length;
                countEl.textContent = q
                    ? `${filtered.length} of ${apps.length} shown (${total} total)`
                    : `${filtered.length} item${filtered.length === 1 ? '' : 's'} (${filter})`;
            }
            tbody.innerHTML = '';
            if (!filtered.length) {
                tbody.innerHTML =
                    '<tr><td colspan="5" style="text-align:center;">No applications match this view.</td></tr>';
                return;
            }
            const esc =
                typeof escAdmin === 'function'
                    ? escAdmin
                    : (s) =>
                          String(s == null ? '' : s)
                              .replace(/&/g, '&amp;')
                              .replace(/</g, '&lt;');
            filtered.forEach((a) => {
                const allApps =
                    typeof window.__getGlobalAdminApps === 'function' ? window.__getGlobalAdminApps() : [];
                const index = allApps.indexOf(a);
                let formData = {};
                try {
                    formData = JSON.parse(a.form_data || '{}');
                } catch (_) {}
                const candidateName =
                    a._candidateName ||
                    (formData.fname
                        ? [formData.fname, formData.mname, formData.lname].filter(Boolean).join(' ')
                        : [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(' '));
                const kindBadge =
                    a._kind === 'prereg'
                        ? '<span style="font-size:0.72rem;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;margin-left:6px;">Pre-reg</span>'
                        : '';
                const seminarNote = a.seminar_title
                    ? `<div style="font-size:0.78rem;color:#64748b;">${esc(a.seminar_title)}</div>`
                    : '';
                let statusCell;
                if (a._kind === 'prereg') {
                    statusCell = `<select onchange="updateAutismPreregStatus(${a.prereg_id}, this.value)" style="width:auto;min-width:200px;">${preregStatusOptionsHtml(a.status)}</select>`;
                } else {
                    statusCell = `<select onchange="updateAppStatus(${a.id}, this.value)" style="width:auto;min-width:200px;">${
                        typeof adminRegistrationStatusOptionsHtml === 'function'
                            ? adminRegistrationStatusOptionsHtml(a.status)
                            : esc(a.status)
                    }</select>`;
                }
                const actions =
                    a._kind === 'prereg'
                        ? `<button type="button" class="btn-primary" onclick="switchTab('tab-prereg-tracking')">Open pre-reg tab</button>`
                        : `<button class="btn-primary" onclick="viewFullApplication(${index})">View</button>
                        <button type="button" class="btn-primary" style="margin-left:6px;background:#b91c1c;padding:4px 8px;font-size:0.8rem;" onclick="deleteAdminRegistration(${a.id}, '${String(a.application_no || '').replace(/'/g, "\\'")}')">Delete</button>`;
                tbody.innerHTML += `
                <tr>
                    <td><strong>${esc(a.application_no)}</strong>${kindBadge}${seminarNote}</td>
                    <td>${esc(a.user_id_string || '—')}</td>
                    <td>${esc(candidateName)}</td>
                    <td>${statusCell}</td>
                    <td>${actions}</td>
                </tr>`;
            });
        };

        window.updateAutismPreregStatus = async function (preregistrationId, status) {
            try {
                const r = await fetch('/api/admin/preregistrations/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preregistrationId, status })
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data.error || r.statusText);
                if (typeof window.loadApplications === 'function') window.loadApplications();
                if (typeof window.AkAdminPrereg !== 'undefined' && window.AkAdminPrereg.reload) {
                    window.AkAdminPrereg.reload();
                }
            } catch (e) {
                alert(e.message || 'Could not update pre-registration status.');
            }
        };

        window.__autismAppsPatched = true;
    }

    function injectMainSeminarMessaging() {
        const tab = document.getElementById('tab-announcements');
        if (!tab || document.getElementById('ak-main-seminar-messaging')) return;
        const card = document.createElement('div');
        card.id = 'ak-main-seminar-messaging';
        card.className = 'card';
        card.style.cssText = 'margin-bottom:20px;border-left:4px solid #7c3aed;';
        card.innerHTML =
            '<h3 style="margin:0 0 8px;">Main programme — email &amp; WhatsApp</h3>' +
            '<p style="color:#64748b;font-size:0.88rem;margin:0 0 14px;">Configure Zoho SMTP and Meta WhatsApp API keys for OTP and participant messages. Set the WhatsApp group link for your main event.</p>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:720px;margin-bottom:12px;">' +
            '<div><label style="font-size:0.82rem;font-weight:700;">Main event</label><select id="ak-main-seminar-select" style="width:100%;padding:8px;"></select></div>' +
            '<div><label style="font-size:0.82rem;font-weight:700;">WhatsApp group / invite URL</label><input type="url" id="ak-main-seminar-wa" placeholder="https://chat.whatsapp.com/…" style="width:100%;padding:8px;"></div>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
            '<button type="button" class="btn-primary" id="ak-save-main-seminar-wa">Save event WhatsApp link</button>' +
            '<button type="button" class="btn-primary" style="background:#0d9488;" onclick="switchTab(\'tab-settings\'); if(typeof loadIntegrationSettings===\'function\') loadIntegrationSettings();">Email &amp; WhatsApp API keys</button>' +
            '<button type="button" class="btn-primary" style="background:#2563eb;" onclick="switchTab(\'tab-notifications\'); if(typeof initAdminNotificationsTab===\'function\') initAdminNotificationsTab();">Notification templates</button>' +
            '</div>' +
            '<p id="ak-main-seminar-msg" style="margin:10px 0 0;font-size:0.85rem;"></p>';
        tab.insertBefore(card, tab.querySelector('.card'));
        loadMainSeminarMessaging();
        document.getElementById('ak-save-main-seminar-wa')?.addEventListener('click', saveMainSeminarWhatsapp);
        document.getElementById('ak-main-seminar-select')?.addEventListener('change', loadMainSeminarWhatsappField);
    }

    let cachedSeminars = [];

    async function loadMainSeminarMessaging() {
        const sel = document.getElementById('ak-main-seminar-select');
        if (!sel) return;
        try {
            const list = await fetch('/api/admin/seminars', { credentials: 'same-origin' }).then((r) => r.json());
            cachedSeminars = Array.isArray(list) ? list : list.seminars || [];
            sel.innerHTML = '';
            cachedSeminars.forEach((s) => {
                const o = document.createElement('option');
                o.value = s.id;
                o.textContent = s.title || 'Event ' + s.id;
                sel.appendChild(o);
            });
            if (cachedSeminars.length) loadMainSeminarWhatsappField();
        } catch (_) {}
    }

    function loadMainSeminarWhatsappField() {
        const sel = document.getElementById('ak-main-seminar-select');
        const wa = document.getElementById('ak-main-seminar-wa');
        if (!sel || !wa || !sel.value) return;
        const s = cachedSeminars.find((x) => String(x.id) === String(sel.value));
        wa.value = (s && (s.whatsapp_group_url || s.whatsapp)) || '';
    }

    async function saveMainSeminarWhatsapp() {
        const sel = document.getElementById('ak-main-seminar-select');
        const wa = document.getElementById('ak-main-seminar-wa');
        const msg = document.getElementById('ak-main-seminar-msg');
        if (!sel || !sel.value) return;
        const seminar = cachedSeminars.find((x) => String(x.id) === String(sel.value));
        if (!seminar) return;
        try {
            const payload = Object.assign({}, seminar, {
                whatsapp_group_url: wa ? wa.value.trim() : ''
            });
            const r = await fetch('/api/admin/seminars/' + encodeURIComponent(sel.value), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || r.statusText);
            seminar.whatsapp_group_url = payload.whatsapp_group_url;
            if (msg) {
                msg.textContent = 'WhatsApp group link saved for this event.';
                msg.style.color = '#047857';
            }
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Save failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    function wireSiteImageUpload() {
        const btn = document.getElementById('ak-site-images-upload-btn');
        const input = document.getElementById('ak-site-images-files');
        const status = document.getElementById('ak-site-images-status');
        if (!btn || !input) return;
        btn.addEventListener('click', async () => {
            const files = input.files;
            if (!files || !files.length) {
                if (status) {
                    status.textContent = 'Choose one or more images first.';
                    status.style.color = '#b91c1c';
                }
                return;
            }
            const fd = new FormData();
            for (let i = 0; i < files.length; i++) fd.append('images', files[i]);
            if (status) {
                status.textContent = 'Uploading…';
                status.style.color = '#64748b';
            }
            try {
                const r = await fetch('/api/admin/autism-site-images/upload', {
                    method: 'POST',
                    body: fd,
                    credentials: 'same-origin'
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data.error || r.statusText);
                if (status) {
                    status.textContent =
                        'Uploaded ' + (data.added || files.length) + ' image(s). Live on homepage now (IST ' +
                        new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) +
                        ').';
                    status.style.color = '#047857';
                }
                input.value = '';
            } catch (e) {
                if (status) {
                    status.textContent = e.message || 'Upload failed';
                    status.style.color = '#b91c1c';
                }
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        hideMenuItems();
        injectPreregFields();
        patchSaveSeminar();
        patchSeminarPayload();
        applyAdminBranding();
        wireSiteImageUpload();
        hideGalleryCmsBlocks();
        hideMedicalQualOptions();
        injectApplicationsStatusFilter();
        patchAdminApplicationsQueue();
        injectMainSeminarMessaging();
        if (window.AutismTerminology) window.AutismTerminology.applyAll();
    });
})();
