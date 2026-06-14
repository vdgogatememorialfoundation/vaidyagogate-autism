/**
 * Favicon PNG generation from uploaded site logo (AVIF/WebP/PNG/JPEG → browser-safe PNG).
 */
const sharp = require('sharp');

const FAVICON_32_KEY = 'site_favicon_32_b64';
const FAVICON_180_KEY = 'site_favicon_180_b64';
const LOGO_B64_KEY = 'site_logo_b64';

function upsertGlobalSetting(db, key, value, cb) {
    db.run(`UPDATE global_settings SET value = ? WHERE key = ?`, [value, key], function (uerr) {
        if (uerr) return cb(uerr);
        if (this.changes > 0) return cb();
        db.run(`INSERT INTO global_settings (key, value) VALUES (?, ?)`, [key, value], cb);
    });
}

function parseLogoBuffer(raw) {
    if (!raw) return null;
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (_) {
        const plain = String(raw).trim();
        if (plain.startsWith('data:')) {
            const m = plain.match(/^data:([^;]+);base64,(.+)$/);
            if (m) return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
        }
        if (plain.length > 40) return { mime: 'image/png', buf: Buffer.from(plain, 'base64') };
        return null;
    }
    if (!payload || !payload.data) return null;
    return {
        mime: payload.mime || 'image/png',
        buf: Buffer.from(payload.data, 'base64')
    };
}

function parseStoredPng(raw) {
    if (!raw) return null;
    try {
        const payload = JSON.parse(raw);
        if (payload && payload.data) {
            return Buffer.from(payload.data, 'base64');
        }
    } catch (_) {
        /* ignore */
    }
    return null;
}

function storePngSetting(db, key, buf, cb) {
    const payload = JSON.stringify({ mime: 'image/png', data: buf.toString('base64') });
    upsertGlobalSetting(db, key, payload, cb);
}

async function pngFromLogoBuffer(logoBuf, size) {
    return sharp(logoBuf)
        .rotate()
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
}

async function buildDefaultFaviconPng(size) {
    return sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 15, g: 118, b: 110, alpha: 1 }
        }
    })
        .png()
        .toBuffer();
}

function loadLogoBuffer(db) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT value FROM global_settings WHERE key = ?`, [LOGO_B64_KEY], (e, row) => {
            if (e) return reject(e);
            resolve(parseLogoBuffer(row && row.value));
        });
    });
}

function loadStoredFavicon(db, key) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT value FROM global_settings WHERE key = ?`, [key], (e, row) => {
            if (e) return reject(e);
            resolve(parseStoredPng(row && row.value));
        });
    });
}

/** Regenerate PNG favicons after logo upload (call from admin branding route). */
async function regenerateFaviconPngs(db) {
    const logo = await loadLogoBuffer(db);
    if (!logo || !logo.buf || !logo.buf.length) {
        return { ok: false, reason: 'no_logo' };
    }
    const [png32, png180] = await Promise.all([
        pngFromLogoBuffer(logo.buf, 32),
        pngFromLogoBuffer(logo.buf, 180)
    ]);
    await new Promise((resolve, reject) => {
        storePngSetting(db, FAVICON_32_KEY, png32, (e1) => {
            if (e1) return reject(e1);
            storePngSetting(db, FAVICON_180_KEY, png180, (e2) => (e2 ? reject(e2) : resolve()));
        });
    });
    return { ok: true };
}

function regenerateFaviconPngsCb(db, cb) {
    regenerateFaviconPngs(db)
        .then((r) => cb && cb(null, r))
        .catch((e) => {
            console.warn('[favicon] regenerate:', e.message);
            cb && cb(e);
        });
}

async function getFaviconPng(db, size) {
    const key = size >= 128 ? FAVICON_180_KEY : FAVICON_32_KEY;
    let buf = await loadStoredFavicon(db, key);
    if (buf && buf.length) return buf;

    const logo = await loadLogoBuffer(db);
    if (logo && logo.buf && logo.buf.length) {
        try {
            buf = await pngFromLogoBuffer(logo.buf, size >= 128 ? 180 : 32);
            await new Promise((resolve, reject) => {
                storePngSetting(db, key, buf, (e) => (e ? reject(e) : resolve()));
            });
            return buf;
        } catch (e) {
            console.warn('[favicon] convert logo:', e.message);
        }
    }

    return buildDefaultFaviconPng(size >= 128 ? 180 : 32);
}

function serveFaviconPng(db, res, size) {
    getFaviconPng(db, size)
        .then((buf) => {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.send(buf);
        })
        .catch((e) => {
            console.warn('[favicon] serve:', e.message);
            buildDefaultFaviconPng(32)
                .then((buf) => {
                    res.setHeader('Content-Type', 'image/png');
                    res.send(buf);
                })
                .catch(() => res.status(500).end());
        });
}

module.exports = {
    FAVICON_32_KEY,
    FAVICON_180_KEY,
    regenerateFaviconPngs,
    regenerateFaviconPngsCb,
    serveFaviconPng,
    getFaviconPng
};
