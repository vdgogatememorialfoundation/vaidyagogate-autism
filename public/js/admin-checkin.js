/**
 * Admin manual check-in module
 */

let __adminCheckinParticipants = [];

async function initAdminCheckinTab() {
    await fillAdminSeminarSelect('ak-admin-checkin-seminar', false);
    loadAdminCheckinList();
}

async function loadAdminCheckinList() {
    const tbody = document.getElementById('ak-admin-checkin-tbody');
    if (!tbody) return;
    
    const seminarId = document.getElementById('ak-admin-checkin-seminar')?.value;
    if (!seminarId) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;">Select an event to load registrations.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading registrations...</td></tr>';
    
    try {
        const res = await fetch(`/api/admin/applications?seminarId=${seminarId}`);
        const data = await res.json();
        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#b91c1c;">Error: ${data.error || 'Failed to load'}</td></tr>`;
            return;
        }
        __adminCheckinParticipants = data || [];
        renderAdminCheckinTable();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#b91c1c;">Network error while loading registrations.</td></tr>';
    }
}

function renderAdminCheckinTable() {
    const tbody = document.getElementById('ak-admin-checkin-tbody');
    if (!tbody) return;
    
    const searchVal = String(document.getElementById('ak-admin-checkin-search')?.value || '').trim().toLowerCase();
    
    let filtered = __adminCheckinParticipants;
    if (searchVal) {
        filtered = filtered.filter(p => {
            const name = `${p.first_name || ''} ${p.middle_name || ''} ${p.last_name || ''}`.toLowerCase();
            const email = String(p.email || '').toLowerCase();
            const phone = String(p.phone || '').toLowerCase();
            const appNo = String(p.application_no || '').toLowerCase();
            const applicationId = String(p.application_id || p.registration_id || p.id || '').toLowerCase();
            const userId = String(p.user_id_string || '').toLowerCase();
            const applicantId = String(p.applicant_id || p.user_id || '').toLowerCase();
            const ticketId = String(p.ticket_id_string || p.ticket_id || p.ticket_db_id || '').toLowerCase();
            return [name, email, phone, appNo, applicationId, userId, applicantId, ticketId].some((value) => value.includes(searchVal));
        });
    }
    
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;">No matching participants found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    filtered.forEach(p => {
        const name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
        const applicantId = Number(p.applicant_id || p.user_id || 0);
        const isCheckedIn = p.is_scanned === 1 || p.status === 'checked_in';
        
        let checkinTimeStr = '—';
        if (isCheckedIn && p.scan_time) {
            try {
                checkinTimeStr = window.PortalDateTime ? window.PortalDateTime.format(p.scan_time) : p.scan_time;
            } catch (_) {
                checkinTimeStr = p.scan_time;
            }
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${escAdmin(name)}</strong><br>
                <span style="font-size:0.8rem;color:#64748b;">Application ID: ${escAdmin(p.application_no || p.registration_id || p.id)} | Applicant ID: ${escAdmin(p.id)} | User ID: ${escAdmin(p.user_id_string)}${p.ticket_id_string ? ` | Ticket ID: ${escAdmin(p.ticket_id_string)}` : ''}</span>
            </td>
            <td>
                <span style="font-size:0.85rem;">Email: ${escAdmin(p.email)}</span><br>
                <span style="font-size:0.85rem;">Phone: ${escAdmin(p.phone)}</span>
            </td>
            <td>
                <span class="status-badge" style="padding:4px 8px;border-radius:4px;font-size:0.8rem;font-weight:600;background:${getStatusColor(p.status)};color:#fff;">
                    ${escAdmin(p.status.toUpperCase())}
                </span>
            </td>
            <td>
                <span style="font-size:0.85rem;color:${isCheckedIn ? '#166534' : '#64748b'};font-weight:${isCheckedIn ? '600' : 'normal'};">
                    ${isCheckedIn ? `Yes (${checkinTimeStr})` : 'No'}
                </span>
            </td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button type="button" class="btn-primary" data-registration-id="${escAdmin(p.id)}" style="padding:4px 10px;font-size:0.8rem;background:${isCheckedIn ? '#991b1b' : '#166534'};" onclick="toggleAdminCheckin(${p.id}, ${isCheckedIn ? 0 : 1}, this)">
                        ${isCheckedIn ? 'Undo Check-in' : 'Check in'}
                    </button>
                    <button type="button" class="btn-primary" style="padding:4px 10px;font-size:0.8rem;background:#0284c7;" onclick="adminOpenCheckinUserDetail(${applicantId})" ${applicantId > 0 ? '' : 'disabled title="Applicant account ID unavailable"'}>
                        Applicant details
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function toggleAdminCheckin(registrationId, checkinFlag, button) {
    const rid = Number(registrationId);
    if (!Number.isInteger(rid) || rid < 1) {
        alert('Check-in failed: invalid registration ID. Refresh the event list and try again.');
        return;
    }
    if (button) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = 'Saving…';
    }
    try {
        const res = await fetch(`/api/admin/registrations/${encodeURIComponent(rid)}/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isScanned: Number(checkinFlag) === 1 })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            alert('Check-in failed: ' + (data.error || `Request failed (${res.status})`));
            return;
        }
        await loadAdminCheckinList();
    } catch (err) {
        console.error(err);
        alert('Check-in failed: network error while updating registration.');
    } finally {
        if (button) {
            button.disabled = false;
            if (button.dataset.originalText) button.textContent = button.dataset.originalText;
        }
    }
}

function adminOpenCheckinUserDetail(userId) {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid < 1) {
        alert('Applicant account ID is unavailable. Refresh the event list and try again.');
        return;
    }
    if (typeof openAdminUserDetail === 'function') {
        openAdminUserDetail(uid);
    } else {
        alert('Error: openAdminUserDetail function not found. User ID: ' + uid);
    }
}

function getStatusColor(status) {
    const s = String(status || '').toLowerCase();
    switch (s) {
        case 'checked_in': return '#166534';
        case 'completed': return '#15803d';
        case 'e_ticket_issued': return '#0369a1';
        case 'approved_pending_payment': return '#d97706';
        case 'pending_approval': return '#4f46e5';
        case 'submitted': return '#7c3aed';
        case 'rejected': return '#991b1b';
        case 'cancelled': return '#475569';
        default: return '#64748b';
    }
}
