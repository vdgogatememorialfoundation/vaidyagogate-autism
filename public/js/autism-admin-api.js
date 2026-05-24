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
            throw new Error('actingAdminId is required. Sign in to admin again.');
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
        } else if (o.body && typeof o.body === 'object' && !(o.body instanceof FormData)) {
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
                try {
                    localStorage.removeItem('admin_auth');
                    localStorage.removeItem('admin_user');
                } catch (_) {
                    /* ignore */
                }
                throw new Error(msg + ' Open /admin and sign in again.');
            }
            throw new Error(msg);
        }
        return data;
    };
})();
