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

    window.autismAdminFetch = async function autismAdminFetch(url, opts) {
        const o = Object.assign({ credentials: 'same-origin' }, opts || {});
        const fullUrl = withActingAdminUrl(url);
        if (o.body && typeof o.body === 'string' && o.headers && String(o.headers['Content-Type'] || '').includes('json')) {
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
        const r = await fetch(fullUrl, o);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        return data;
    };
})();
