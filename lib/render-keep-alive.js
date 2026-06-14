/**
 * Self-referencing HTTP ping so Render free tier stays warm while the process is running.
 * External cron (/api/ping every 10 min) still recommended to wake a spun-down instance.
 */
const axios = require('axios');

function resolvePingUrl() {
    const explicit = String(process.env.KEEP_ALIVE_URL || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const base = String(
        process.env.RENDER_EXTERNAL_URL ||
            process.env.PUBLIC_BASE_URL ||
            process.env.MAIN_SITE_URL ||
            ''
    )
        .trim()
        .replace(/\/$/, '');

    if (base) return `${base}/api/ping`;

    const port = process.env.PORT || 3000;
    return `http://127.0.0.1:${port}/api/ping`;
}

function shouldStartSelfPing() {
    if (process.env.VERCEL) return false;
    if (process.env.KEEP_ALIVE_SELF_PING === '0' || process.env.KEEP_ALIVE_SELF_PING === 'false') {
        return false;
    }
    if (process.env.KEEP_ALIVE_SELF_PING === '1' || process.env.KEEP_ALIVE_SELF_PING === 'true') {
        return true;
    }
    return !!process.env.RENDER;
}

function startSelfPing() {
    if (!shouldStartSelfPing()) return null;

    const url = resolvePingUrl();
    const intervalMs = Math.max(
        15000,
        parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '30000', 10) || 30000
    );

    const reloadWebsite = () => {
        axios
            .get(url, { timeout: 15000, validateStatus: () => true })
            .then((response) => {
                console.log(
                    `[keep-alive] ${new Date().toISOString()} ${url} → ${response.status}`
                );
            })
            .catch((error) => {
                console.warn(
                    `[keep-alive] ${new Date().toISOString()} ${url} failed:`,
                    error.message
                );
            });
    };

    reloadWebsite();
    const timer = setInterval(reloadWebsite, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();

    console.log(`[keep-alive] Self-ping every ${intervalMs / 1000}s → ${url}`);
    return timer;
}

module.exports = { startSelfPing, resolvePingUrl, shouldStartSelfPing };
