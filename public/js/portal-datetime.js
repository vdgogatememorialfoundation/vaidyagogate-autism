/** Seminar / portal datetimes: stored and shown in India Standard Time (IST). */
(function (global) {
    const PORTAL_DISPLAY_TZ = 'Asia/Kolkata';
    const IST_OFFSET = '+05:30';

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function normalizeIstHour(hour) {
        const h = parseInt(hour, 10);
        if (!Number.isFinite(h)) return 0;
        if (h === 24) return 0;
        return Math.max(0, Math.min(23, h));
    }

    function formatIstIso(y, mo, d, h, mi, sec) {
        return y + '-' + pad2(mo) + '-' + pad2(d) + 'T' + pad2(normalizeIstHour(h)) + ':' + pad2(mi) + ':' + pad2(sec) + IST_OFFSET;
    }

    function parsePortalDateTime(iso) {
        if (!iso) return null;
        if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso;
        const s = String(iso).trim();
        if (!s) return null;
        if (/Z$|[+-]\d{2}(:?\d{2})?$/i.test(s)) return new Date(s);
        let norm = s.includes('T') ? s : s.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(norm)) norm += ':00';
        // Naive = IST wall clock (no Z — avoids shifting 9:45 AM to midnight/wrong hour).
        return new Date(norm + IST_OFFSET);
    }

    function partsInIst(d) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: PORTAL_DISPLAY_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(d);
        const get = (t) => {
            let v = (parts.find((p) => p.type === t) || {}).value || '00';
            if (t === 'hour') v = pad2(normalizeIstHour(v));
            return v;
        };
        return get;
    }

    function fromDatetimeLocal(localStr) {
        if (!localStr) return null;
        const s = String(localStr).trim();
        if (!s) return null;
        if (/Z$|[+-]\d{2}/i.test(s)) return s;
        const norm = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s + ':00' : s;
        return norm + IST_OFFSET;
    }

    /** Registration / pre-registration close: inclusive through end minute (e.g. 21:32 → 21:32:59 IST). */
    function fromRegistrationEndLocal(localStr) {
        if (!localStr) return null;
        const s = String(localStr).trim();
        if (!s) return null;
        const bare = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (bare) {
            return formatIstIso(bare[1], bare[2], bare[3], bare[4], bare[5], 59);
        }
        const base = fromDatetimeLocal(localStr);
        if (!base) return null;
        const iso = base.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+05:30$/);
        if (iso) {
            return formatIstIso(iso[1], iso[2], iso[3], iso[4], iso[5], 59);
        }
        const d = parsePortalDateTime(base);
        if (!d || Number.isNaN(d.getTime())) return base.replace(/:00\+05:30$/, ':59+05:30');
        const g = partsInIst(d);
        return formatIstIso(g('year'), g('month'), g('day'), g('hour'), g('minute'), 59);
    }

    function formatStored(iso, opts) {
        if (!iso) return '';
        if (window.PortalDateTime && window.PortalDateTime.format) {
            return window.PortalDateTime.format(iso, opts);
        }
        const d = parsePortalDateTime(iso);
        if (!d || Number.isNaN(d.getTime())) return String(iso).trim();
        return formatPortalDateTime(iso, opts);
    }

    function toDatetimeLocal(stored) {
        const d = parsePortalDateTime(stored);
        if (!d || Number.isNaN(d.getTime())) return '';
        const g = partsInIst(d);
        return g('year') + '-' + g('month') + '-' + g('day') + 'T' + g('hour') + ':' + g('minute');
    }

    function formatPortalDateTime(iso, opts) {
        const d = parsePortalDateTime(iso);
        if (!d || Number.isNaN(d.getTime())) return iso ? String(iso) : '';
        const base = {
            timeZone: PORTAL_DISPLAY_TZ,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        return d.toLocaleString('en-IN', Object.assign(base, opts || {}));
    }

    function formatPortalDateTimeLong(iso) {
        const d = parsePortalDateTime(iso);
        if (!d || Number.isNaN(d.getTime())) return iso ? String(iso) : '';
        return d.toLocaleString('en-IN', {
            timeZone: PORTAL_DISPLAY_TZ,
            weekday: 'long',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    /** Admin lists / tickets: IST wall clock; date-only for midnight & common UTC artifacts. */
    /** Check-in scan_time from DB: UTC naive legacy rows or IST ISO (+05:30). */
    function parseScanDateTime(iso) {
        if (!iso) return null;
        const s = String(iso).trim();
        if (!s) return null;
        if (/Z$|[+-]\d{2}(:?\d{2})?$/i.test(s)) return parsePortalDateTime(s);
        let norm = s.includes('T') ? s : s.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(norm)) norm += ':00';
        const d = new Date(norm + 'Z');
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatScanDateTime(iso) {
        const d = parseScanDateTime(iso);
        if (!d || Number.isNaN(d.getTime())) return iso ? String(iso) : '';
        return d.toLocaleString('en-IN', {
            timeZone: PORTAL_DISPLAY_TZ,
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

    function formatEventDisplay(iso) {
        const local = toDatetimeLocal(iso);
        if (!local) return iso ? String(iso).trim() : '';
        const parts = local.split('T');
        const datePart = parts[0];
        const timePart = parts[1] || '00:00';
        const anchor = parsePortalDateTime(datePart + 'T12:00:00' + IST_OFFSET);
        const dateLine = anchor
            ? anchor.toLocaleDateString('en-IN', {
                  timeZone: PORTAL_DISPLAY_TZ,
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
              })
            : datePart;
        const hm = timePart.split(':');
        const hh = parseInt(hm[0], 10) || 0;
        const mm = parseInt(hm[1], 10) || 0;
        if (hh === 0 && mm === 0) return dateLine;
        const raw = String(iso).trim();
        const storedAsUtc = /Z$/i.test(raw) || /[+-]00:00$/i.test(raw);
        if (storedAsUtc && hh > 0 && hh < 3) return dateLine;
        const h12 = hh % 12 || 12;
        const ampm = hh >= 12 ? 'pm' : 'am';
        return dateLine + ', ' + h12 + ':' + String(mm).padStart(2, '0') + ' ' + ampm;
    }

    function parseMs(iso) {
        const d = parsePortalDateTime(iso);
        return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
    }

    function parseRegistrationEndMs(iso) {
        const d = parsePortalDateTime(iso);
        if (!d || Number.isNaN(d.getTime())) return null;
        const g = partsInIst(d);
        const sec = parseInt(g('second'), 10) || 0;
        if (sec === 0) {
            const inclusive = parsePortalDateTime(
                formatIstIso(g('year'), g('month'), g('day'), g('hour'), g('minute'), 59)
            );
            return inclusive && !Number.isNaN(inclusive.getTime()) ? inclusive.getTime() : d.getTime();
        }
        return d.getTime();
    }

    function parseDbDateTime(iso) {
        if (!iso) return null;
        if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso;
        const s = String(iso).trim();
        if (!s) return null;
        if (/Z$|[+-]\d{2}(:?\d{2})?$/i.test(s)) return new Date(s);
        let norm = s.includes('T') ? s : s.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(norm)) norm += ':00';
        const d = new Date(norm + 'Z');
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatDbDateTime(iso, opts) {
        const d = parseDbDateTime(iso);
        if (!d || Number.isNaN(d.getTime())) return iso ? String(iso) : '';
        const base = {
            timeZone: PORTAL_DISPLAY_TZ,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        return d.toLocaleString('en-IN', Object.assign(base, opts || {}));
    }

    global.PortalDateTime = {
        TZ: PORTAL_DISPLAY_TZ,
        IST_OFFSET,
        parse: parsePortalDateTime,
        parseMs,
        parseRegistrationEndMs,
        fromDatetimeLocal,
        fromRegistrationEndLocal,
        toDatetimeLocal,
        format: formatPortalDateTime,
        formatStored,
        formatLong: formatPortalDateTimeLong,
        formatEvent: formatEventDisplay,
        formatScan: formatScanDateTime,
        parseDb: parseDbDateTime,
        formatDb: formatDbDateTime
    };
})(typeof window !== 'undefined' ? window : global);
