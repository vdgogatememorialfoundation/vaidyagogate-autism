/**
 * Homepage: promote public pre-registration events (no sign-in).
 */
(function () {
    'use strict';

    async function loadPublicPreregEvents() {
        const section = document.getElementById('ak-public-prereg-section');
        const list = document.getElementById('ak-public-prereg-events');
        const heroBtn = document.getElementById('ak-hero-public-prereg-btn');
        if (!section || !list) return;
        try {
            const r = await fetch('/api/public/preregistration/events');
            const data = await r.json().catch(() => ({}));
            const events = (data.events || []).filter((e) => e && (e.preregOpen || (e.upcoming && e.opensAt)));
            if (!events.length) {
                section.classList.add('hidden');
                if (heroBtn) heroBtn.classList.add('hidden');
                return;
            }
            section.classList.remove('hidden');
            if (heroBtn) {
                heroBtn.classList.remove('hidden');
                const target = events.find((e) => e.preregOpen) || events[0];
                heroBtn.onclick = function () {
                    window.location.href = '/preregister?event=' + encodeURIComponent(String(target.id));
                };
            }
            list.innerHTML = events
                .map((ev) => {
                    const openNow = !!ev.preregOpen;
                    const btnLabel = openNow ? 'Pre-register now' : 'View countdown';
                    const sub = openNow
                        ? 'No account needed — fill the form in a few minutes. We email you a tracking ID.'
                        : 'Pre-registration opens soon — see the live countdown and return when the form opens.';
                    return (
                        '<article class="ak-public-prereg-card">' +
                        '<h3>' +
                        escapeHtml(ev.title || 'Event') +
                        '</h3>' +
                        '<p>' +
                        sub +
                        '</p>' +
                        '<a class="ak-btn-v2 ak-btn-v2-primary" href="/preregister?event=' +
                        encodeURIComponent(String(ev.id)) +
                        '"><i class="fas fa-' +
                        (openNow ? 'clipboard-list' : 'hourglass-half') +
                        '" aria-hidden="true"></i> ' +
                        btnLabel +
                        '</a>' +
                        '</article>'
                    );
                })
                .join('');
        } catch (_) {
            section.classList.add('hidden');
            if (heroBtn) heroBtn.classList.add('hidden');
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function searchPublicPreregStatus() {
        const inputEl = document.getElementById('ak-public-prereg-search-input');
        const resultEl = document.getElementById('ak-public-prereg-search-result');
        if (!inputEl || !resultEl) return;
        
        const q = String(inputEl.value).trim();
        if (!q) {
            resultEl.style.display = 'block';
            resultEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem;margin:0;">Please enter a search term.</p>';
            return;
        }
        if (q.length < 3) {
            resultEl.style.display = 'block';
            resultEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem;margin:0;">Please enter at least 3 characters.</p>';
            return;
        }
        
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;margin:0;"><i class="fas fa-spinner fa-spin"></i> Searching...</p>';
        
        try {
            const res = await fetch('/api/public/preregistrations/search?q=' + encodeURIComponent(q));
            const data = await res.json();
            if (!res.ok) {
                resultEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem;margin:0;">Error: ' + escapeHtml(data.error || 'Search failed') + '</p>';
                return;
            }
            if (!data.length) {
                resultEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem;margin:0;">No pre-registration records found matching your query.</p>';
                return;
            }
            
            let html = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">';
            data.forEach(r => {
                const name = escapeHtml([r.first_name, r.last_name].filter(Boolean).join(' '));
                const statusColor = getStatusColor(r.status);
                html += `
                    <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:4px;color:#fff;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                            <strong>${name}</strong>
                            <span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;font-weight:600;background:${statusColor};color:#fff;">
                                ${escapeHtml(r.status.toUpperCase())}
                            </span>
                        </div>
                        <div style="font-size:0.8rem;color:#cbd5e1;">App ID: <strong>${escapeHtml(r.application_no)}</strong></div>
                        <div style="font-size:0.8rem;color:#cbd5e1;">Event: ${escapeHtml(r.seminar_title)}</div>
                        <div style="font-size:0.78rem;color:#94a3b8;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:4px;">
                            <span>Email: ${escapeHtml(r.email)}</span>
                            <span>Phone: ${escapeHtml(r.phone)}</span>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            resultEl.innerHTML = html;
        } catch (err) {
            console.error(err);
            resultEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem;margin:0;">Network error. Please try again.</p>';
        }
    }
    
    function getStatusColor(status) {
        const s = String(status || '').toLowerCase();
        switch (s) {
            case 'approved': return '#059669';
            case 'completed': return '#059669';
            case 'pending': return '#d97706';
            case 'submitted': return '#4f46e5';
            case 'revision': return '#7c3aed';
            case 'rejected': return '#dc2626';
            default: return '#4b5563';
        }
    }
    
    window.searchPublicPreregStatus = searchPublicPreregStatus;

    document.addEventListener('DOMContentLoaded', loadPublicPreregEvents);
})();
