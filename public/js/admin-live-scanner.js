(function () {
    const pollMs = 1000;
    let lastEventId = 0;
    let pollTimer = null;
    let clockTimer = null;
    let actor = null;
    let soundEnabled = true;
    let audioCtx = null;

    function ensureAudio() {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audioCtx = new Ctx();
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    }

    function playTone(freq, duration, type, gain) {
        if (!soundEnabled || !audioCtx) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        const vol = gain != null ? gain : 0.12;
        g.gain.setValueAtTime(vol, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + duration);
    }

    function playScanSound(outcome) {
        ensureAudio();
        const o = String(outcome || 'failed');
        if (o === 'success') {
            playTone(523, 0.1, 'sine', 0.14);
            setTimeout(() => playTone(784, 0.12, 'sine', 0.12), 90);
            setTimeout(() => playTone(1046, 0.14, 'sine', 0.1), 180);
        } else if (o === 'duplicate') {
            playTone(440, 0.08, 'triangle', 0.1);
            setTimeout(() => playTone(440, 0.08, 'triangle', 0.1), 120);
        } else {
            playTone(180, 0.22, 'sawtooth', 0.08);
            setTimeout(() => playTone(140, 0.28, 'sawtooth', 0.07), 160);
        }
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getActor() {
        try {
            const raw =
                localStorage.getItem('admin_user') ||
                sessionStorage.getItem('admin_user') ||
                sessionStorage.getItem('adminUser');
            if (!raw) return null;
            const u = JSON.parse(raw);
            return u && u.id ? u : null;
        } catch (_) {
            return null;
        }
    }

    async function api(path) {
        const aid = actor && actor.id;
        const sep = path.includes('?') ? '&' : '?';
        const res = await fetch(path + sep + 'actingAdminId=' + encodeURIComponent(aid), { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        return data;
    }

    function cardClass(outcome) {
        const o = String(outcome || 'failed');
        if (o === 'success') return 'success';
        if (o === 'duplicate') return 'duplicate';
        if (
            [
                'not_found',
                'unpaid',
                'invalid',
                'wrong_seminar',
                'wrong_date',
                'checkin_disabled',
                'account_blocked'
            ].includes(o)
        ) {
            return o;
        }
        return 'failed';
    }

    function initials(name) {
        const parts = String(name || 'Guest')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function parseFeedTime(iso) {
        if (!iso) return null;
        const s = String(iso).trim();
        if (!s) return null;
        if (/Z$|[+-]\d{2}(:?\d{2})?$/i.test(s)) return new Date(s);
        let norm = s.includes('T') ? s : s.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(norm)) norm += ':00';
        const d = new Date(norm + 'Z');
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatCardTime(iso) {
        const d = parseFeedTime(iso);
        if (!d) return iso ? String(iso) : '';
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }

    function outcomeTitle(outcome) {
        if (outcome === 'success') return 'Checked in';
        if (outcome === 'duplicate') return 'Already scanned';
        return String(outcome || 'failed').replace(/_/g, ' ');
    }

    function setLiveState(active, label) {
        const pill = document.getElementById('kiosk-live-pill');
        const lbl = document.getElementById('kiosk-live-label');
        if (pill) pill.classList.toggle('is-live', !!active);
        if (lbl) lbl.textContent = label || (active ? 'Live' : 'Paused');
    }

    function updateEmptyState() {
        const grid = document.getElementById('live-scan-grid');
        const empty = document.getElementById('live-scan-empty');
        if (!empty) return;
        const hasEvent = !!(document.getElementById('live-scanner-seminar') || {}).value;
        const hasCards = grid && grid.children.length > 0;
        empty.classList.toggle('hidden', !hasEvent || hasCards);
    }

    function formatEventDate(value) {
        if (!value) return 'Not set';
        if (window.PortalDateTime && typeof window.PortalDateTime.formatEvent === 'function') {
            return window.PortalDateTime.formatEvent(value);
        }
        const raw = String(value).trim();
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return raw;
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    function selectedCheckinDate(seminar) {
        if (!seminar) return '';
        return seminar.checkin_date || seminar.event_date || '';
    }

    function setAttendanceEvent(seminar) {
        const title = document.getElementById('live-attendance-title');
        const date = document.getElementById('live-attendance-date');
        if (title) title.textContent = seminar ? seminar.title || 'Attendance list' : 'Attendance list';
        if (date) {
            date.textContent = seminar
                ? 'Check-in date: ' + formatEventDate(selectedCheckinDate(seminar))
                : 'Choose an event to view its check-in date.';
        }
    }

    function renderAttendance(attendees, emptyMessage) {
        const list = document.getElementById('live-attendance-list');
        const count = document.getElementById('live-attendance-count');
        if (!list) return;
        const rows = Array.isArray(attendees) ? attendees : [];
        if (count) count.textContent = String(rows.length);
        if (!rows.length) {
            list.innerHTML =
                '<p class="kiosk-attendance-empty">' +
                esc(emptyMessage || 'No attendees have checked in for this event yet.') +
                '</p>';
            return;
        }
        list.innerHTML = rows
            .map((person) => {
                const name =
                    [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' ') || 'Attendee';
                const identifier = person.application_no || person.ticket_id_string || person.user_id_string || '—';
                return (
                    '<div class="kiosk-attendance-item">' +
                    '<span class="kiosk-attendance-avatar" aria-hidden="true">' +
                    esc(initials(name)) +
                    '</span>' +
                    '<div><strong class="kiosk-attendance-name">' +
                    esc(name) +
                    '</strong><span class="kiosk-attendance-meta">' +
                    esc(identifier) +
                    (person.scan_time ? ' · ' + esc(formatCardTime(person.scan_time)) : '') +
                    '</span></div></div>'
                );
            })
            .join('');
    }

    async function refreshAttendance() {
        const sid = document.getElementById('live-scanner-seminar').value;
        if (!sid) return;
        const data = await api('/api/admin/live-scanner/attendance?seminarId=' + encodeURIComponent(sid));
        renderAttendance(data.attendees);
    }

    function tickClock() {
        const el = document.getElementById('kiosk-clock');
        if (!el) return;
        el.textContent = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function prependCard(ev) {
        const grid = document.getElementById('live-scan-grid');
        if (!grid) return;
        const el = document.createElement('article');
        el.className = 'scan-card is-new ' + cardClass(ev.outcome);
        el.dataset.id = String(ev.id);
        const outcomeLabel = String(ev.outcome || 'failed').replace(/_/g, ' ');
        const name = ev.doctorName || 'Guest';
        el.innerHTML =
            '<div class="scan-card-head">' +
            '<span class="scan-card-avatar" aria-hidden="true">' +
            esc(initials(name)) +
            '</span>' +
            '<div class="scan-card-head-main">' +
            '<span class="scan-outcome-badge">' +
            esc(outcomeLabel) +
            '</span>' +
            '<h4>' +
            esc(outcomeTitle(ev.outcome)) +
            '</h4>' +
            '<div class="meta"><strong>' +
            esc(name) +
            '</strong></div>' +
            '</div>' +
            '<span class="scan-card-time">' +
            esc(formatCardTime(ev.createdAt)) +
            '</span></div>' +
            '<div class="scan-card-ids">' +
            '<div><span class="lbl">E-ticket</span><code>' +
            esc(ev.ticketId || '—') +
            '</code></div>' +
            '<div><span class="lbl">Application</span><code>' +
            esc(ev.applicationNo || '—') +
            '</code></div></div>' +
            (ev.message ? '<div class="reason">' + esc(ev.message) + '</div>' : '') +
            (ev.scannerName
                ? '<div class="scan-card-scanner"><i class="fas fa-user-check"></i> ' + esc(ev.scannerName) + '</div>'
                : '');
        grid.prepend(el);
        while (grid.children.length > 80) grid.removeChild(grid.lastChild);
        updateEmptyState();
    }

    async function refreshStats() {
        const sid = document.getElementById('live-scanner-seminar').value;
        if (!sid) return;
        const stats = await api('/api/admin/live-scanner/stats?seminarId=' + encodeURIComponent(sid));
        document.getElementById('ls-stat-ok').textContent = stats.successCount || 0;
        document.getElementById('ls-stat-dup').textContent = stats.duplicateCount || 0;
        document.getElementById('ls-stat-fail').textContent = stats.failedCount || 0;
        document.getElementById('ls-stat-tix').textContent = stats.ticketsScanned || 0;
        if (stats.lastEventId > lastEventId) lastEventId = stats.lastEventId;
    }

    async function pollEvents() {
        const sid = document.getElementById('live-scanner-seminar').value;
        if (!sid || !actor) return;
        try {
            const data = await api(
                '/api/admin/live-scanner/events?seminarId=' +
                    encodeURIComponent(sid) +
                    '&sinceId=' +
                    encodeURIComponent(lastEventId)
            );
            (data.events || []).forEach((ev) => {
                if (ev.id > lastEventId) {
                    lastEventId = ev.id;
                    prependCard(ev);
                    playScanSound(ev.outcome);
                }
            });
            await Promise.all([refreshStats(), refreshAttendance()]);
            setLiveState(true, 'Live · updating');
        } catch (e) {
            console.warn('[live-scanner]', e.message);
            setLiveState(false, 'Connection issue');
        }
    }

    function stopPoll() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        setLiveState(false, 'Select event');
    }

    function startPoll() {
        stopPoll();
        lastEventId = 0;
        const grid = document.getElementById('live-scan-grid');
        if (grid) grid.innerHTML = '';
        renderAttendance([]);
        updateEmptyState();
        setLiveState(true, 'Connecting…');
        pollEvents();
        pollTimer = setInterval(pollEvents, pollMs);
    }

    async function init() {
        actor = getActor();
        if (!actor || !actor.id) {
            window.location.href = '/admin.html';
            return;
        }
        tickClock();
        clockTimer = setInterval(tickClock, 1000);
        const seminars = await api('/api/admin/live-scanner/seminars');
        const sel = document.getElementById('live-scanner-seminar');
        sel.innerHTML = '<option value="">Choose event…</option>';
        (seminars || []).forEach((s) => {
            const o = document.createElement('option');
            o.value = s.id;
            const checkinDate = selectedCheckinDate(s);
            o.textContent =
                (s.title || 'Event') + (checkinDate ? ' · Check-in ' + formatEventDate(checkinDate) : '');
            sel.appendChild(o);
        });
        if ((seminars || []).length === 1) {
            sel.value = String(seminars[0].id);
            setAttendanceEvent(seminars[0]);
            startPoll();
        }
        sel.addEventListener('change', () => {
            ensureAudio();
            const seminar = (seminars || []).find((s) => String(s.id) === sel.value) || null;
            setAttendanceEvent(seminar);
            if (sel.value) startPoll();
            else {
                stopPoll();
                renderAttendance([], 'Choose an event to view checked-in attendees.');
            }
            updateEmptyState();
        });
        const soundBtn = document.getElementById('kiosk-sound-toggle');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                soundEnabled = !soundEnabled;
                soundBtn.classList.toggle('is-on', soundEnabled);
                soundBtn.innerHTML = soundEnabled
                    ? '<i class="fas fa-volume-high"></i> Sounds on'
                    : '<i class="fas fa-volume-xmark"></i> Sounds off';
                if (soundEnabled) ensureAudio();
            });
        }
        document.getElementById('live-scanner-back').addEventListener('click', () => {
            window.location.href = '/admin.html';
        });
        updateEmptyState();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
