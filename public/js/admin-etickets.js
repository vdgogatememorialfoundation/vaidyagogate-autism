/**
 * Admin e-ticket desk: lookup, event filter, match picker, QR preview.
 */
(function () {
    'use strict';

    let selection = null;
    let lastResults = [];

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function adm() {
        return typeof getStoredAdminUser === 'function' ? getStoredAdminUser() : null;
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

    async function loadSeminarFilter() {
        const sel = document.getElementById('eticket-seminar-filter');
        if (!sel || sel.dataset.loaded) return;
        try {
            const list = await api('/api/admin/seminars');
            const seminars = Array.isArray(list) ? list : list.seminars || [];
            sel.innerHTML = '<option value="">All events</option>';
            seminars.forEach((s) => {
                const o = document.createElement('option');
                o.value = s.id;
                o.textContent = s.title || 'Event ' + s.id;
                sel.appendChild(o);
            });
            sel.dataset.loaded = '1';
        } catch (_) {}
    }

    function setStatus(text, color) {
        const st = document.getElementById('eticket-lookup-status');
        if (!st) return;
        st.textContent = text || '';
        st.style.color = color || '#64748b';
    }

    function hideResults() {
        document.getElementById('eticket-results-wrap')?.classList.add('hidden');
        document.getElementById('eticket-match-list')?.classList.add('hidden');
        selection = null;
        lastResults = [];
    }

    function renderMatchList(rows, selected) {
        const box = document.getElementById('eticket-match-list');
        const grid = document.getElementById('eticket-match-grid');
        if (!box || !grid) return;
        if (rows.length <= 1) {
            box.classList.add('hidden');
            return;
        }
        box.classList.remove('hidden');
        grid.innerHTML = rows
            .map((row) => {
                const sel =
                    selected && Number(selected.registrationId) === Number(row.registrationId)
                        ? ' is-selected'
                        : '';
                const ticket = row.ticketIdString
                    ? 'Ticket ' + esc(row.ticketIdString)
                    : 'No ticket yet';
                return (
                    '<button type="button" class="ak-eticket-match-card' +
                    sel +
                    '" data-reg-id="' +
                    esc(String(row.registrationId)) +
                    '">' +
                    '<div class="event">' +
                    esc(row.seminarTitle || 'Event') +
                    '</div>' +
                    '<div class="name">' +
                    esc(row.doctorName || 'Participant') +
                    '</div>' +
                    '<div class="meta"><code>' +
                    esc(row.applicationNo) +
                    '</code> · ' +
                    ticket +
                    '</div></button>'
                );
            })
            .join('');
        grid.querySelectorAll('.ak-eticket-match-card').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-reg-id'), 10);
                const row = rows.find((r) => Number(r.registrationId) === id);
                if (row) selectRow(row, false);
            });
        });
    }

    function selectRow(row, fromAuto) {
        selection = row;
        const wrap = document.getElementById('eticket-results-wrap');
        const detail = document.getElementById('eticket-detail-panel');
        const preview = document.getElementById('eticket-preview-link');
        const actSt = document.getElementById('eticket-action-status');
        if (!wrap || !detail) return;
        wrap.classList.remove('hidden');
        if (actSt) actSt.textContent = '';
        renderMatchList(lastResults, row);

        const pay =
            String(row.paymentStatus || '').toLowerCase() === 'success'
                ? 'Paid'
                : row.paymentStatus || '—';
        let scanHtml = '<span class="ak-eticket-scan-pill warn">Not scanned</span>';
        if (row.isScanned) {
            scanHtml =
                '<span class="ak-eticket-scan-pill ok">Scanned' +
                (row.scanTime ? ' · ' + esc(row.scanTime) : '') +
                (row.scanCount > 0 ? ' (' + row.scanCount + '×)' : '') +
                '</span>';
        } else if (row.ticketIdString && row.isValid === false) {
            scanHtml = '<span class="ak-eticket-scan-pill bad">Invalid</span>';
        }

        const qrCol = row.qrImageUrl
            ? '<img src="' + esc(row.qrImageUrl) + '" alt="E-ticket QR" width="180" height="180">'
            : '<div class="no-qr">Generate ticket<br>to show QR</div>';

        detail.innerHTML =
            '<div class="ak-eticket-panel">' +
            '<div class="ak-eticket-qr-col">' +
            qrCol +
            '</div>' +
            '<div class="ak-eticket-detail">' +
            '<span class="ak-eticket-event-badge">' +
            esc(row.seminarTitle || 'Event') +
            '</span>' +
            '<h3>' +
            esc(row.doctorName || 'Participant') +
            '</h3>' +
            '<dl class="ak-eticket-kv">' +
            '<dt>Application</dt><dd><code>' +
            esc(row.applicationNo) +
            '</code></dd>' +
            '<dt>Email</dt><dd>' +
            esc(row.email) +
            '</dd>' +
            '<dt>Phone</dt><dd>' +
            esc(row.phone) +
            '</dd>' +
            '<dt>Registration</dt><dd>' +
            esc(row.registrationStatus) +
            '</dd>' +
            '<dt>Payment</dt><dd>' +
            esc(pay) +
            (row.orderIdString ? ' · <code>' + esc(row.orderIdString) + '</code>' : '') +
            '</dd>' +
            '<dt>E-ticket ID</dt><dd>' +
            (row.ticketIdString
                ? '<code>' + esc(row.ticketIdString) + '</code>'
                : '<span style="color:#b45309;">Not generated</span>') +
            '</dd>' +
            '<dt>Entry scan</dt><dd>' +
            scanHtml +
            '</dd>' +
            (row.attendeesCount != null
                ? '<dt>Entry pass size</dt><dd><strong>' +
                  esc(row.attendeesLabel || 'Valid for ' + row.attendeesCount + ' people') +
                  '</strong></dd>'
                : '') +
            '</dl>' +
            (row.attendeesCount != null
                ? '<div class="ak-eticket-attendees-edit" style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0;">' +
                  '<label for="eticket-attendees-count" style="display:block;font-size:0.82rem;font-weight:700;color:#475569;margin-bottom:6px;">People on this ticket (admin only)</label>' +
                  '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
                  '<input type="number" id="eticket-attendees-count" min="1" max="20" step="1" value="' +
                  esc(String(row.attendeesCount)) +
                  '" style="width:72px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;">' +
                  '<button type="button" class="btn-primary" style="padding:8px 14px;font-size:0.88rem;" onclick="adminEticketSaveAttendeesCount()">Save count</button>' +
                  '</div>' +
                  '<p style="margin:8px 0 0;font-size:0.78rem;color:#64748b;">Shown on the applicant e-ticket only — not on the scanner app.</p>' +
                  '</div>'
                : '') +
            '</div></div>';

        if (preview) {
            if (row.ticketPreviewUrl) {
                preview.href = row.ticketPreviewUrl;
                preview.classList.remove('hidden');
            } else {
                preview.href = '#';
                preview.classList.add('hidden');
            }
        }

        if (!fromAuto && lastResults.length > 1) {
            setStatus('Showing: ' + (row.seminarTitle || 'event') + ' — pick another match above if needed.', '#2563eb');
        }
    }

    window.initAdminEticketsTab = async function initAdminEticketsTab() {
        setStatus('', '#64748b');
        hideResults();
        const q = document.getElementById('eticket-search-q');
        if (q && !q.dataset.enterBound) {
            q.dataset.enterBound = '1';
            q.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') window.adminEticketLookup();
            });
        }
        await loadSeminarFilter();
    };

    window.adminEticketLookup = async function adminEticketLookup() {
        const user = adm();
        if (!user || !user.id) return alert('Not logged in.');
        const q = String((document.getElementById('eticket-search-q') || {}).value || '').trim();
        const seminarId = (document.getElementById('eticket-seminar-filter') || {}).value || '';
        if (!q) return alert('Enter a ticket ID, application ID, email, or phone.');
        setStatus('Searching…', '#64748b');
        hideResults();
        try {
            let url =
                '/api/admin/e-tickets/lookup?q=' +
                encodeURIComponent(q) +
                '&actingAdminId=' +
                encodeURIComponent(user.id);
            if (seminarId) url += '&seminarId=' + encodeURIComponent(seminarId);
            const data = await api(url);
            const rows = data.results || [];
            lastResults = rows;
            if (!rows.length) {
                setStatus('No matching registration or ticket for this search' + (seminarId ? ' in the selected event.' : '.'), '#b45309');
                return;
            }
            if (rows.length === 1 || data.autoSelect) {
                setStatus(
                    rows.length === 1 ? '1 match — ' + (rows[0].seminarTitle || 'event') + '.' : 'Best match selected (' + (rows[0].seminarTitle || 'event') + ').',
                    '#059669'
                );
                selectRow(rows[0], true);
                return;
            }
            setStatus(
                rows.length + ' registrations found across events — select the correct event below.',
                '#d97706'
            );
            renderMatchList(rows, null);
            document.getElementById('eticket-results-wrap')?.classList.remove('hidden');
            document.getElementById('eticket-detail-panel').innerHTML =
                '<p style="color:#64748b;margin:0;">Choose a match above to view QR, payment, and send actions.</p>';
            document.getElementById('eticket-preview-link')?.classList.add('hidden');
        } catch (e) {
            console.error(e);
            setStatus(e.message || 'Lookup failed.', '#b91c1c');
        }
    };

    window.adminEticketSaveAttendeesCount = async function adminEticketSaveAttendeesCount() {
        const user = adm();
        if (!user || !user.id) return alert('Not logged in.');
        const row = selection;
        if (!row || !row.registrationId) return alert('Select a registration first.');
        const input = document.getElementById('eticket-attendees-count');
        const count = parseInt(input && input.value, 10);
        if (!Number.isInteger(count) || count < 1 || count > 20) {
            return alert('Enter the number of people (1–20).');
        }
        const actSt = document.getElementById('eticket-action-status');
        if (actSt) {
            actSt.style.color = '#64748b';
            actSt.textContent = 'Saving entry pass size…';
        }
        try {
            const data = await api('/api/admin/registrations/' + row.registrationId + '/attendees-count', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actingAdminId: user.id, attendeesCount: count })
            });
            row.attendeesCount = data.attendeesCount;
            row.attendeesLabel = data.attendeesLabel;
            if (actSt) {
                actSt.style.color = '#059669';
                actSt.textContent = data.attendeesLabel || 'Entry pass size updated.';
            }
            selectRow(row, true);
        } catch (e) {
            if (actSt) {
                actSt.style.color = '#b91c1c';
                actSt.textContent = e.message || 'Could not save entry pass size.';
            }
        }
    };

    window.adminEticketGenerate = async function adminEticketGenerate() {
        const user = adm();
        if (!user || !user.id) return alert('Not logged in.');
        const row = selection;
        if (!row || !row.registrationId) return alert('Select a registration first.');
        const actSt = document.getElementById('eticket-action-status');
        if (actSt) {
            actSt.style.color = '#64748b';
            actSt.textContent = 'Generating…';
        }
        try {
            const data = await api('/api/admin/e-tickets/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registrationId: row.registrationId, actingAdminId: user.id })
            });
            if (actSt) {
                actSt.style.color = '#059669';
                actSt.textContent = data.message || 'Ticket ready.';
            }
            if (data.ticketId) {
                document.getElementById('eticket-search-q').value = data.ticketId;
            }
            await window.adminEticketLookup();
        } catch (e) {
            if (actSt) {
                actSt.style.color = '#b91c1c';
                actSt.textContent = e.message || 'Could not generate ticket.';
            }
        }
    };

    window.adminEticketDelete = async function adminEticketDelete() {
        const user = adm();
        if (!user || !user.id) return alert('Not logged in.');
        const row = selection;
        if (!row || !row.ticketRowId) return alert('Select a generated ticket first.');
        if (
            !confirm(
                'Delete this e-ticket now?\n\nTicket QR will be removed, but registration/payment records stay.'
            )
        )
            return;
        const actSt = document.getElementById('eticket-action-status');
        if (actSt) {
            actSt.style.color = '#64748b';
            actSt.textContent = 'Deleting…';
        }
        try {
            await api(
                '/api/admin/tickets/' +
                    encodeURIComponent(String(row.ticketRowId)) +
                    '?actingAdminId=' +
                    encodeURIComponent(user.id),
                { method: 'DELETE' }
            );
            if (actSt) {
                actSt.style.color = '#047857';
                actSt.textContent = 'Ticket deleted.';
            }
            selection = null;
            hideResults();
            setStatus('Ticket deleted. Search again if needed.', '#047857');
        } catch (e) {
            if (actSt) {
                actSt.style.color = '#b91c1c';
                actSt.textContent = e.message || 'Delete failed';
            } else {
                alert(e.message || 'Delete failed');
            }
        }
    };

    window.adminEticketSend = async function adminEticketSend(sendEmail, sendWhatsapp) {
        const user = adm();
        if (!user || !user.id) return alert('Not logged in.');
        const row = selection;
        if (!row || !row.registrationId) return alert('Select a registration first.');
        if (!row.ticketIdString) {
            return alert('No e-ticket on file. Click Generate / refresh ticket first.');
        }
        const actSt = document.getElementById('eticket-action-status');
        if (actSt) {
            actSt.style.color = '#64748b';
            actSt.textContent = 'Sending…';
        }
        try {
            const data = await api('/api/admin/e-tickets/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    registrationId: row.registrationId,
                    ticketIdString: row.ticketIdString,
                    sendEmail: !!sendEmail,
                    sendWhatsapp: !!sendWhatsapp,
                    actingAdminId: user.id
                })
            });
            if (actSt) {
                actSt.style.color = '#059669';
                actSt.textContent = data.message || 'Sent.';
            }
        } catch (e) {
            if (actSt) {
                actSt.style.color = '#b91c1c';
                actSt.textContent = e.message || 'Send failed.';
            }
        }
    };

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch.__akEticketHook) {
        window.switchTab = function (tabId) {
            origSwitch.apply(this, arguments);
            if (tabId === 'tab-etickets' && typeof window.initAdminEticketsTab === 'function') {
                window.initAdminEticketsTab();
            }
        };
        window.switchTab.__akEticketHook = true;
    }
})();
