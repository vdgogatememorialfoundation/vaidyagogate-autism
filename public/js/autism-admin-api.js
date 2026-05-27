/**
 * Admin API helper — attach actingAdminId from signed-in admin session.
 */
(function () {
    'use strict';

    function getActingAdminId() {
        try {
            const u = JSON.parse(localStorage.getItem('admin_user') || 'null');
            if (u && u.id != null) {
                const n = Number(u.id);
                if (Number.isInteger(n) && n > 0) return n;
            }
        } catch (_) {
            /* ignore */
        }
        try {
            const u2 = JSON.parse(sessionStorage.getItem('admin_user') || 'null');
            if (u2 && u2.id != null) {
                const n2 = Number(u2.id);
                if (Number.isInteger(n2) && n2 > 0) return n2;
            }
        } catch (_) {
            /* ignore */
        }
        try {
            if (typeof window.getStoredAdminUser === 'function') {
                const u3 = window.getStoredAdminUser();
                if (u3 && u3.id != null) {
                    const n3 = Number(u3.id);
                    if (Number.isInteger(n3) && n3 > 0) return n3;
                }
            }
        } catch (_) {
            /* ignore */
        }
        return null;
    }

    window.withActingAdminUrl = function withActingAdminUrl(url) {
        const id = getActingAdminId();
        if (!id) return url;
        const sep = String(url || '').includes('?') ? '&' : '?';
        return url + sep + 'actingAdminId=' + encodeURIComponent(id);
    };

    window.withActingAdminBody = function withActingAdminBody(body) {
        const id = getActingAdminId();
        const out = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
        if (id) out.actingAdminId = id;
        return out;
    };

    function requireActingAdminId() {
        const id = getActingAdminId();
        if (!id) {
            throw new Error('Admin session expired. Please sign in again in /admin.');
        }
        return id;
    }

    window.autismAdminFetch = async function autismAdminFetch(url, opts) {
        requireActingAdminId();
        const o = Object.assign({ credentials: 'same-origin' }, opts || {});
        const fullUrl = withActingAdminUrl(url);
        const isJsonBody =
            (o.body && typeof o.body === 'object' && !(o.body instanceof FormData)) ||
            (o.body &&
                typeof o.body === 'string' &&
                (!o.headers || String(o.headers['Content-Type'] || 'application/json').includes('json')));
        if (o.body && typeof o.body === 'string' && isJsonBody) {
            try {
                const parsed = JSON.parse(o.body);
                o.body = JSON.stringify(withActingAdminBody(parsed));
            } catch (_) {
                /* leave body as-is */
            }
        } else if (o.body instanceof FormData) {
            const id = getActingAdminId();
            if (id && !o.body.has('actingAdminId')) o.body.append('actingAdminId', String(id));
        } else if (o.body && typeof o.body === 'object') {
            o.body = withActingAdminBody(o.body);
            if (!o.headers) o.headers = {};
            if (!o.headers['Content-Type']) o.headers['Content-Type'] = 'application/json';
            o.body = JSON.stringify(o.body);
        }
        if (!o.headers) o.headers = {};
        const r = await fetch(fullUrl, o);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            const msg = data.error || r.statusText;
            if (/actingAdminId is required/i.test(String(msg))) {
                throw new Error('Admin session expired. Please sign in again in /admin.');
            }
            throw new Error(msg);
        }
        return data;
    };
})();
