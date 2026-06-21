/**
 * Admin: competition submissions review + file previews.
 */
(function () {
    'use strict';

    let compRows = [];
    let compSeminars = [];
    let compSettingsSeminar = null;

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function badge(status) {
        const st = String(status || 'submitted').toLowerCase();
        return '<span class="ak-badge ak-badge-' + esc(st) + '">' + esc(st.replace(/_/g, ' ')) + '</span>';
    }

    async function api(path, opts) {
        if (typeof window.autismAdminFetch === 'function') {
            return window.autismAdminFetch(path, opts);
        }
        const r = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts || {}));
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        return data;
    }

    function fileHref(stored) {
        const p = String(stored || '').trim();
        if (!p) return '';
        if (/^https?:\/\//i.test(p)) return p;
        if (typeof window.publicFileHref === 'function') return window.publicFileHref(p);
        if (p.startsWith('/uploads/api/assets/')) return '/api/assets/' + p.slice('/uploads/api/assets/'.length);
        if (p.startsWith('/')) return p;
        return '/uploads/' + p;
    }

    function fileLinks(files) {
        const list = Array.isArray(files) ? files : [];
        if (!list.length) return '<span style="color:#94a3b8;">No files</span>';
        return list
            .map((f) => {
                const href = fileHref(f.file_path);
                const name = f.original_name || (href && href.split('/').pop()) || 'file';
                if (!href) {
                    return (
                        '<span style="display:block;font-size:0.82rem;margin-bottom:4px;color:#94a3b8;">' +
                        '<i class="fas fa-paperclip"></i> ' +
                        esc(name) +
                        ' (no file path)</span>'
                    );
                }
                return (
                    '<a href="' +
                    esc(href) +
                    '" target="_blank" rel="noopener" style="display:block;font-size:0.82rem;margin-bottom:4px;">' +
                    '<i class="fas fa-paperclip"></i> ' +
                    esc(name) +
                    '</a>'
                );
            })
            .join('');
    }

    function parseCompetitionFlow(registrationFormJson) {
        let flow = {};
        try {
            const cfg =
                typeof registrationFormJson === 'string'
                    ? JSON.parse(registrationFormJson)
                    : registrationFormJson || {};
            flow = cfg && typeof cfg.flow === 'object' ? cfg.flow : {};
        } catch (_) {}
        return {
            competitionEnabled: flow.competitionEnabled === true,
            competitionStart: flow.competitionStart || '',
            competitionEnd: flow.competitionEnd || '',
            competitionInstructions: flow.competitionInstructions || ''
        };
    }

    function toDtLocal(val) {
        if (!val) return '';
        if (window.PortalDateTime && window.PortalDateTime.toDatetimeLocal) {
            return window.PortalDateTime.toDatetimeLocal(val);
        }
        return String(val).slice(0, 16);
    }

    function toEndLocal(val) {
        if (!val) return '';
        if (window.PortalDateTime && window.PortalDateTime.toRegistrationEndLocal) {
            return window.PortalDateTime.toRegistrationEndLocal(val);
        }
        return toDtLocal(val);
    }

    function syncCompSettingsUi() {
        const on = document.getElementById('ak-comp-enabled')?.checked === true;
        const wrap = document.getElementById('ak-comp-details-wrap');
        if (wrap) wrap.style.display = on ? '' : 'none';
    }

    function applyCompSettingsToForm(sem) {
        compSettingsSeminar = sem || null;
        const comp = parseCompetitionFlow(sem && sem.registration_form_json);
        const chk = document.getElementById('ak-comp-enabled');
        const start = document.getElementById('ak-comp-start');
        const end = document.getElementById('ak-comp-end');
        const instr = document.getElementById('ak-comp-instructions');
        if (chk) chk.checked = comp.competitionEnabled;
        if (start) start.value = toDtLocal(comp.competitionStart);
        if (end) end.value = toEndLocal(comp.competitionEnd);
        if (instr) instr.value = comp.competitionInstructions || '';
        syncCompSettingsUi();
    }

    async function loadCompetitionSeminars() {
        const sel = document.getElementById('ak-comp-event-select');
        if (!sel) return;
        try {
            const rows = await api('/api/admin/seminars/all');
            compSeminars = Array.isArray(rows) ? rows : [];
            sel.innerHTML = '<option value="">— Select event —</option>';
            compSeminars.forEach((s) => {
                const comp = parseCompetitionFlow(s.registration_form_json);
                const tag = comp.competitionEnabled ? ' · competition on' : '';
                sel.innerHTML +=
                    '<option value="' +
                    s.id +
                    '">' +
                    esc(s.title || 'Event #' + s.id) +
                    tag +
                    '</option>';
            });
            if (sel.value) {
                const sem = compSeminars.find((x) => String(x.id) === String(sel.value));
                applyCompSettingsToForm(sem);
            }
        } catch (e) {
            sel.innerHTML = '<option value="">Could not load events</option>';
        }
    }

    async function saveCompetitionSettings() {
        const sid = parseInt((document.getElementById('ak-comp-event-select') || {}).value, 10);
        const msg = document.getElementById('ak-comp-settings-msg');
        if (!sid) {
            if (msg) {
                msg.textContent = 'Select an event first.';
                msg.style.color = '#b91c1c';
            }
            return;
        }
        let sem = compSeminars.find((x) => Number(x.id) === sid);
        if (!sem) {
            try {
                const rows = await api('/api/admin/seminars/all');
                compSeminars = Array.isArray(rows) ? rows : [];
                sem = compSeminars.find((x) => Number(x.id) === sid);
            } catch (e) {
                if (msg) {
                    msg.textContent = e.message || 'Could not load event.';
                    msg.style.color = '#b91c1c';
                }
                return;
            }
        }
        if (!sem) {
            if (msg) {
                msg.textContent = 'Event not found.';
                msg.style.color = '#b91c1c';
            }
            return;
        }
        const on = document.getElementById('ak-comp-enabled')?.checked === true;
        let cfg = {};
        try {
            cfg = sem.registration_form_json ? JSON.parse(sem.registration_form_json) : {};
        } catch (_) {
            cfg = {};
        }
        if (!cfg.flow || typeof cfg.flow !== 'object') cfg.flow = {};
        cfg.flow.competitionEnabled = on;
        if (on) {
            const startEl = document.getElementById('ak-comp-start');
            const endEl = document.getElementById('ak-comp-end');
            cfg.flow.competitionStart =
                startEl && startEl.value
                    ? window.PortalDateTime
                        ? window.PortalDateTime.fromDatetimeLocal(startEl.value)
                        : startEl.value
                    : null;
            cfg.flow.competitionEnd =
                endEl && endEl.value
                    ? window.PortalDateTime
                        ? window.PortalDateTime.fromRegistrationEndLocal(endEl.value)
                        : endEl.value
                    : null;
            cfg.flow.competitionInstructions = String(
                (document.getElementById('ak-comp-instructions') || {}).value || ''
            ).trim();
        } else {
            cfg.flow.competitionStart = null;
            cfg.flow.competitionEnd = null;
            cfg.flow.competitionInstructions = '';
        }
        const payload = Object.assign({}, sem, {
            id: sem.id,
            registration_form_json: JSON.stringify(cfg),
            seminar_flow: cfg.flow,
            __akCompetitionSettingsOnly: true
        });
        if (msg) {
            msg.textContent = 'Saving…';
            msg.style.color = '#475569';
        }
        try {
            const res = await fetch('/api/admin/seminars/' + sid, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            if (msg) {
                msg.textContent = on
                    ? 'Competition enabled and saved for this event.'
                    : 'Competition turned off — only registration forms apply for this event.';
                msg.style.color = '#047857';
            }
            await loadCompetitionSeminars();
            const sel = document.getElementById('ak-comp-event-select');
            if (sel) sel.value = String(sid);
            applyCompSettingsToForm(compSeminars.find((x) => Number(x.id) === sid));
            await refresh();
        } catch (e) {
            if (msg) {
                msg.textContent = e.message || 'Save failed';
                msg.style.color = '#b91c1c';
            }
        }
    }

    function filteredRows() {
        const q = (document.getElementById('ak-comp-search')?.value || '').trim().toLowerCase();
        const st = (document.getElementById('ak-comp-status-filter')?.value || 'all').toLowerCase();
        return compRows.filter((r) => {
            if (st !== 'all' && String(r.status || '').toLowerCase() !== st) return false;
            if (!q) return true;
            const code = r.application_no || 'COMP-' + r.id;
            return [code, r.title, r.first_name, r.last_name, r.email, r.category, r.seminar_title, r.description]
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    }

    function renderStats() {
        const el = document.getElementById('ak-comp-stats');
        if (!el) return;
        const total = compRows.length;
        const submitted = compRows.filter((r) => String(r.status || '').toLowerCase() === 'submitted').length;
        const approved = compRows.filter((r) => String(r.status || '').toLowerCase() === 'approved').length;
        el.textContent = total
            ? total + ' entries · ' + submitted + ' submitted · ' + approved + ' approved'
            : 'No competition entries yet.';
    }

    function renderTable() {
        const tbody = document.getElementById('ak-comp-tbody');
        if (!tbody) return;
        renderStats();
        const rows = filteredRows();
        if (!rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">No competition entries match.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map((r) => {
                const code = r.application_no || 'COMP-' + r.id;
                const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
                const desc = r.description ? '<br><small style="color:#64748b;">' + esc(r.description) + '</small>' : '';
                return (
                    '<tr>' +
                    '<td><img src="/api/qrcode/' +
                    encodeURIComponent(code) +
                    '" alt="" width="48" height="48" style="display:block;margin-bottom:4px;background:#fff;border-radius:6px;padding:2px;"><code style="font-size:0.78rem;">' +
                    esc(code) +
                    '</code></td>' +
                    '<td><strong>' +
                    esc(r.title || '—') +
                    '</strong><br><small style="color:#64748b;">' +
                    esc(r.category || '') +
                    '</small>' +
                    desc +
                    '</td>' +
                    '<td>' +
                    esc(name) +
                    '<br><small style="color:#64748b;">' +
                    esc(r.email || '') +
                    '</small></td>' +
                    '<td>' +
                    esc(r.seminar_title || '—') +
                    '</td>' +
                    '<td>' +
                    fileLinks(r.files) +
                    '</td>' +
                    '<td>' +
                    badge(r.status) +
                    '</td>' +
                    '<td>' +
                    esc((r.created_at || '').slice(0, 16)) +
                    '</td>' +
                    '<td><select data-comp-id="' +
                    r.id +
                    '" class="ak-comp-status-select" style="min-width:140px;">' +
                    ['submitted', 'under_review', 'approved', 'rejected']
                        .map(
                            (s) =>
                                '<option value="' +
                                s +
                                '"' +
                                (String(r.status || '').toLowerCase() === s ? ' selected' : '') +
                                '>' +
                                s.replace(/_/g, ' ') +
                                '</option>'
                        )
                        .join('') +
                    '</select></td>' +
                    '</tr>'
                );
            })
            .join('');
        tbody.querySelectorAll('.ak-comp-status-select').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const id = parseInt(sel.dataset.compId, 10);
                const status = sel.value;
                const msg = document.getElementById('ak-comp-action-msg');
                try {
                    await api('/api/admin/competition-submissions/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ submissionId: id, status })
                    });
                    if (msg) {
                        msg.textContent = 'Status updated.';
                        msg.style.color = '#047857';
                    }
                    await refresh();
                } catch (e) {
                    if (msg) {
                        msg.textContent = e.message || 'Update failed';
                        msg.style.color = '#b91c1c';
                    }
                }
            });
        });
    }

    async function refresh() {
        const tbody = document.getElementById('ak-comp-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading…</td></tr>';
        try {
            compRows = await api('/api/admin/competition-submissions');
            if (!Array.isArray(compRows)) compRows = [];
            renderTable();
        } catch (e) {
            if (tbody) {
                tbody.innerHTML =
                    '<tr><td colspan="8" style="color:#b91c1c;text-align:center;">' + esc(e.message) + '</td></tr>';
            }
            renderStats();
        }
    }

    window.initAdminCompetitionTracking = function initAdminCompetitionTracking() {
        if (window.__akCompInit) {
            loadCompetitionSeminars();
            refresh();
            return;
        }
        window.__akCompInit = true;
        document.getElementById('ak-comp-refresh')?.addEventListener('click', refresh);
        document.getElementById('ak-comp-search')?.addEventListener('input', renderTable);
        document.getElementById('ak-comp-status-filter')?.addEventListener('change', renderTable);
        document.getElementById('ak-comp-enabled')?.addEventListener('change', syncCompSettingsUi);
        document.getElementById('ak-comp-event-select')?.addEventListener('change', () => {
            const sid = (document.getElementById('ak-comp-event-select') || {}).value;
            const sem = compSeminars.find((x) => String(x.id) === String(sid));
            applyCompSettingsToForm(sem);
        });
        document.getElementById('ak-comp-save-settings')?.addEventListener('click', saveCompetitionSettings);
        loadCompetitionSeminars();
        refresh();
    };

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akCompHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            if (tabId === 'tab-competition-tracking' && typeof initAdminCompetitionTracking === 'function') {
                initAdminCompetitionTracking();
            }
        };
        window.switchTab.__akCompHook = true;
    }
})();
