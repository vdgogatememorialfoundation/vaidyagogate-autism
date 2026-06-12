/**
 * DATABASE_URL resolution and validation (Vercel / Neon).
 */
function normalizeDatabaseUrl(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
    }
    // Neon copy sometimes omits the scheme
    if (!/^postgres(ql)?:\/\//i.test(s) && /^[a-zA-Z0-9_.-]+:[^@\s]+@[^/\s]+/.test(s)) {
        s = 'postgresql://' + s;
    }
    return s;
}

function resolveDatabaseUrl() {
    const raw = process.env.DATABASE_URL;
    if (raw == null) return null;
    const normalized = normalizeDatabaseUrl(raw);
    return normalized || null;
}

/** Direct Neon host for DDL (migrations). Falls back to DATABASE_URL without -pooler. */
function resolveSchemaDatabaseUrl() {
    const direct = process.env.DATABASE_URL_DIRECT || process.env.POSTGRES_URL_NON_POOLING;
    if (direct) {
        const normalized = normalizeDatabaseUrl(direct);
        if (normalized) return normalized;
    }
    const pooled = resolveDatabaseUrl();
    if (!pooled) return null;
    if (/-pooler\./i.test(pooled)) {
        return pooled.replace(/-pooler\./i, '.');
    }
    return pooled;
}

function isPostgresConfigured() {
    return !!resolveDatabaseUrl();
}

function parsePgHostname(url) {
    try {
        const normalized = String(url || '')
            .trim()
            .replace(/^postgres:\/\//i, 'postgresql://');
        const u = new URL(normalized);
        return (u.hostname || '').toLowerCase();
    } catch (_) {
        const m = String(url || '').match(/@([^/?\s]+)/);
        return m ? m[1].toLowerCase() : '';
    }
}

/** Neon host must be copied from dashboard — not doc placeholders like ep-xxx or ….neon.tech */
function validateDatabaseHostname(url) {
    const host = parsePgHostname(url);
    if (!host) {
        return {
            ok: false,
            code: 'DATABASE_URL_INVALID',
            message: 'DATABASE_URL has no valid hostname'
        };
    }
    if (/\.\.\.\.|\.{4,}/.test(host) || host.includes('…')) {
        return {
            ok: false,
            code: 'DATABASE_URL_HOST_INVALID',
            message:
                'DATABASE_URL hostname contains "...." — that is a documentation placeholder, not a real Neon host. Copy the full connection string from Neon Console → Connect.'
        };
    }
    if (/^(host|localhost|db|database|postgres)$/i.test(host)) {
        return {
            ok: false,
            code: 'DATABASE_URL_PLACEHOLDER',
            message:
                'DATABASE_URL hostname is "' +
                host +
                '" — that is a documentation placeholder. Paste your real Neon or Render Postgres connection string in Render → Environment.'
        };
    }
    if (/ep-xxx|your-|example\.com/i.test(host)) {
        return {
            ok: false,
            code: 'DATABASE_URL_PLACEHOLDER',
            message: 'DATABASE_URL hostname looks like a placeholder (ep-xxx). Paste your real Neon connection string.'
        };
    }
    if (/neon\.tech/i.test(host)) {
        const validNeon =
            /^ep-[a-z0-9-]+(-pooler)?\.[a-z0-9-]+(\.[a-z0-9-]+)*\.aws\.neon\.tech$/i.test(host);
        if (!validNeon) {
            return {
                ok: false,
                code: 'DATABASE_URL_HOST_INVALID',
                message:
                    'DATABASE_URL Neon hostname is incomplete. It should look like: ep-name-12345678-pooler.us-east-2.aws.neon.tech (copy from Neon, do not type manually).'
            };
        }
    }
    return { ok: true, host };
}

function validateDatabaseUrl(url) {
    const resolved = url != null ? url : resolveDatabaseUrl();
    if (!resolved) {
        return {
            ok: false,
            code: 'DATABASE_URL_MISSING',
            message: 'DATABASE_URL is not set'
        };
    }
    if (!/^postgres(ql)?:\/\//i.test(resolved)) {
        return {
            ok: false,
            code: 'DATABASE_URL_INVALID',
            message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string'
        };
    }
    if (/USER:PASSWORD|your-password|your-neon/i.test(resolved)) {
        return {
            ok: false,
            code: 'DATABASE_URL_PLACEHOLDER',
            message: 'DATABASE_URL looks like a placeholder — paste your real Neon connection string'
        };
    }
    const hostCheck = validateDatabaseHostname(resolved);
    if (!hostCheck.ok) return hostCheck;
    return { ok: true, url: resolved, host: hostCheck.host };
}

function publicDatabaseHint(code) {
    switch (code) {
        case 'DATABASE_URL_MISSING':
            return 'Render → autism-portal → Environment → add DATABASE_URL (Neon pooler URL with ?sslmode=require), then Manual Deploy.';
        case 'DATABASE_URL_INVALID':
        case 'DATABASE_URL_PLACEHOLDER':
            return 'Neon Console → Connect → copy Pooled connection string. Paste as DATABASE_URL in Render Environment (not the @host placeholder from docs). Redeploy.';
        case 'DATABASE_URL_HOST_INVALID':
            return 'Neon Console → Connect → copy “Pooled connection” (host like ep-name-12345678-pooler.us-east-2.aws.neon.tech). Replace DATABASE_URL in Render entirely, then Redeploy.';
        case 'DB_CONNECT_FAILED':
            return 'Check Neon project is active, credentials are correct, and the URL uses the -pooler host with sslmode=require.';
        case 'DB_HOST_NOT_FOUND':
            return 'DNS cannot find your database host (ENOTFOUND). The hostname in DATABASE_URL is wrong or the Neon project was deleted. Copy a fresh pooled URL from Neon Console and Redeploy.';
        case 'DB_SSL_FAILED':
            return 'Neon SSL: use the pooled URL from Neon (…-pooler….neon.tech/neondb?sslmode=require). Redeploy after updating DATABASE_URL. Do not use verify-full in the URL.';
        default:
            return 'Open Vercel → Deployments → Functions logs for [bootstrap] and [pg-schema] lines.';
    }
}

function sanitizeDbError(err) {
    const msg = String((err && err.message) || err || 'unknown');
    return msg.replace(/postgres(ql)?:\/\/[^@\s]+@/gi, 'postgresql://***@');
}

/** Remove sslmode/ssl from URL — pg Pool uses explicit `ssl` option (avoids cert verify errors on Vercel). */
function stripSslQueryParams(url) {
    const s = String(url || '').trim();
    if (!s) return s;
    try {
        const normalized = s.replace(/^postgres:\/\//i, 'postgresql://');
        const u = new URL(normalized);
        u.searchParams.delete('sslmode');
        u.searchParams.delete('ssl');
        u.searchParams.delete('channel_binding');
        let out = u.toString();
        if (out.startsWith('postgres://')) out = 'postgresql://' + out.slice('postgres://'.length);
        return out;
    } catch (_) {
        return s
            .replace(/([?&])sslmode=[^&]*/gi, '$1')
            .replace(/([?&])ssl=[^&]*/gi, '$1')
            .replace(/([?&])channel_binding=[^&]*/gi, '$1')
            .replace(/\?&/g, '?')
            .replace(/[?&]$/g, '');
    }
}

function isLocalPostgresUrl(url) {
    return /localhost|127\.0\.0\.1/i.test(String(url || ''));
}

/** Neon / remote hosts: accept server cert (Neon uses public CAs; Vercel Node can still fail verify-full). */
function buildPgSslOption(url) {
    if (isLocalPostgresUrl(url)) return false;
    return { rejectUnauthorized: false };
}

function buildPgPoolOptions(url) {
    const connectionString = stripSslQueryParams(url);
    return {
        connectionString,
        ssl: buildPgSslOption(connectionString)
    };
}

function isSslOrCertError(err) {
    const msg = String((err && err.message) || err || '');
    return /certificate|self[- ]?signed|UNABLE_TO_VERIFY|SSL|TLS|EPROTO/i.test(msg);
}

function isHostNotFoundError(err) {
    const msg = String((err && err.message) || err || '');
    return /ENOTFOUND|getaddrinfo/i.test(msg);
}

function classifyDbConnectError(err) {
    if (isSslOrCertError(err)) return 'DB_SSL_FAILED';
    if (isHostNotFoundError(err)) return 'DB_HOST_NOT_FOUND';
    return 'DB_CONNECT_FAILED';
}

module.exports = {
    resolveDatabaseUrl,
    resolveSchemaDatabaseUrl,
    isPostgresConfigured,
    validateDatabaseUrl,
    validateDatabaseHostname,
    parsePgHostname,
    publicDatabaseHint,
    sanitizeDbError,
    stripSslQueryParams,
    buildPgSslOption,
    buildPgPoolOptions,
    isSslOrCertError,
    isHostNotFoundError,
    classifyDbConnectError
};
