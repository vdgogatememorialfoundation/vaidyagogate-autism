/** Deployment host detection — Render runs as persistent Node; Vercel is serverless. */
function isVercel() {
    return !!process.env.VERCEL;
}

function isRender() {
    return !!process.env.RENDER;
}

/** True when the app can run background cron + large uploads (Render, local, VPS). */
function isPersistentNode() {
    return !isVercel();
}

function publicUrlFromHostEnv() {
    const u =
        process.env.PUBLIC_BASE_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.MAIN_SITE_URL ||
        process.env.SITE_URL;
    if (u) return String(u).replace(/\/$/, '');
    if (process.env.VERCEL_URL) return `https://${String(process.env.VERCEL_URL).replace(/\/$/, '')}`;
    return '';
}

module.exports = { isVercel, isRender, isPersistentNode, publicUrlFromHostEnv };
