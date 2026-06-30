/**
 * Public pre-registration search page logic.
 * Checks if search is enabled, then allows users to search by name/email/phone/app ID.
 */
(function () {
    'use strict';

    const formWrap = () => document.getElementById('pub-search-form-wrap');
    const unavailableEl = () => document.getElementById('pub-search-unavailable');
    const loadingEl = () => document.getElementById('pub-search-loading');
    const inputEl = () => document.getElementById('pub-search-input');
    const resultEl = () => document.getElementById('pub-search-results');
    const errorEl = () => document.getElementById('pub-search-error');

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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

    async function checkSearchEnabled() {
        const loading = loadingEl();
        const form = formWrap();
        const unavailable = unavailableEl();
        try {
            const res = await fetch('/api/public/preregistrations/search/enabled');
            const data = await res.json().catch(() => ({}));
            if (loading) loading.classList.add('hidden');
            if (data.enabled) {
                if (form) form.classList.remove('hidden');
                const inp = inputEl();
                if (inp) inp.focus();
                // Show schedule info if scheduled but not yet active
                if (data.scheduled && !data.inSchedule) {
                    const scheduleInfo = document.getElementById('pub-search-schedule-info');
                    if (scheduleInfo) {
                        scheduleInfo.classList.remove('hidden');
                        let msg = 'Search will be available ';
                        if (data.searchStart) {
                            const startDate = new Date(data.searchStart);
                            msg += 'from ' + startDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
                        }
                        if (data.searchEnd) {
                            const endDate = new Date(data.searchEnd);
                            msg += ' until ' + endDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
                        }
                        scheduleInfo.textContent = msg + '.';
                    }
                    // Hide form since not yet active
                    if (form) form.classList.add('hidden');
                }
            } else {
                if (unavailable) unavailable.classList.remove('hidden');
            }
        } catch (_) {
            if (loading) loading.classList.add('hidden');
            if (unavailable) unavailable.classList.remove('hidden');
        }
    }

    async function doSearch() {
        const input = inputEl();
        const results = resultEl();
        const error = errorEl();
        if (!input || !results) return;

        if (error) { error.classList.add('hidden'); error.textContent = ''; }

        const q = String(input.value).trim();
        if (!q) {
            showError('Please enter a search term.');
            return;
        }
        if (q.length < 3) {
            showError('Please enter at least 3 characters.');
            return;
        }

        results.innerHTML =
            '<div class="ak-pub-search-loading"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';

        try {
            const res = await fetch('/api/public/preregistrations/search?q=' + encodeURIComponent(q));
            const data = await res.json();
            if (!res.ok) {
                results.innerHTML = '';
                showError(data.error || 'Search failed. Please try again.');
                return;
            }
            if (!data.length) {
                results.innerHTML =
                    '<div class="ak-pub-search-empty">' +
                    '<i class="fas fa-search"></i>' +
                    'No pre-registration records found matching your search.' +
                    '</div>';
                return;
            }
            renderResults(data);
        } catch (err) {
            console.error(err);
            results.innerHTML = '';
            showError('Network error. Please check your connection and try again.');
        }
    }

    function showError(msg) {
        const error = errorEl();
        if (!error) return;
        error.textContent = msg;
        error.classList.remove('hidden');
    }

    function renderResults(data) {
        const results = resultEl();
        if (!results) return;
        let html = '<p class="ak-pub-search-count"><i class="fas fa-check-circle"></i> Found <strong>' + data.length + '</strong> result' + (data.length !== 1 ? 's' : '') + '</p>';
        data.forEach(function (r) {
            const name = escapeHtml([r.first_name, r.last_name].filter(Boolean).join(' '));
            const statusColor = getStatusColor(r.status);
            const statusLabel = formatStatus(r.status);
            html +=
                '<div class="ak-pub-search-result-item">' +
                '<div class="ak-pub-search-result-head">' +
                '<span class="ak-pub-search-result-name"><i class="fas fa-user" style="margin-right:8px;color:var(--ak-teal);"></i>' + name + '</span>' +
                '<span class="ak-pub-search-result-status" style="background:' + statusColor + ';">' +
                statusLabel + '</span>' +
                '</div>' +
                '<div class="ak-pub-search-result-body">' +
                '<div class="ak-pub-search-result-row"><i class="fas fa-id-badge" style="margin-right:6px;color:#94a3b8;"></i>App ID: <strong>' + escapeHtml(r.application_no) + '</strong></div>' +
                '<div class="ak-pub-search-result-row"><i class="fas fa-calendar-event" style="margin-right:6px;color:#94a3b8;"></i>Event: <strong>' + escapeHtml(r.seminar_title || 'N/A') + '</strong></div>' +
                '</div>' +
                '<div class="ak-pub-search-result-meta">' +
                '<span><i class="fas fa-envelope"></i>' + escapeHtml(r.email || '') + '</span>' +
                '<span><i class="fas fa-phone"></i>' + escapeHtml(r.phone || '') + '</span>' +
                '</div>' +
                '</div>';
        });
        results.innerHTML = html;
    }
    
    function formatStatus(status) {
        const s = String(status || '').toLowerCase();
        const labels = {
            'approved': 'Approved',
            'completed': 'Completed',
            'pending': 'Pending',
            'submitted': 'Submitted',
            'revision': 'Revision Needed',
            'revision_required': 'Revision Needed',
            'rejected': 'Rejected',
            'under_review': 'Under Review'
        };
        return labels[s] || String(status || '').toUpperCase();
    }

    document.addEventListener('DOMContentLoaded', function () {
        checkSearchEnabled();

        const form = document.getElementById('pub-search-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                doSearch();
            });
        }
    });
})();
