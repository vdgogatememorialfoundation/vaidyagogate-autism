/**
 * Autism homepage images: scan public/images/autism + optional DB uploads (no redeploy for uploads).
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const fileStore = require('./file-store');

const IMG_EXT = /\.(jpe?g|png|webp|avif)$/i;
const SKIP = new Set(['manifest.json', 'children-group.svg', 'hero-illustration.svg']);
const AUTISM_IMG_DIR = path.join(__dirname, '..', 'public', 'images', 'autism');
const MANIFEST_KEY = 'autism_site_images_uploads';
let cachedPublicPayload = null;
let cachedPublicPayloadExpiry = 0;

function listFolderImages() {
    try {
        if (!fs.existsSync(AUTISM_IMG_DIR)) return [];
        return fs
            .readdirSync(AUTISM_IMG_DIR)
            .filter((f) => IMG_EXT.test(f) && !SKIP.has(f))
            .sort((a, b) => sortImageName(a, b))
            .map((f) => ({
                src: '/images/autism/' + f.split('/').map(encodeURIComponent).join('/'),
                name: f,
                source: 'folder'
            }));
    } catch (e) {
        console.warn('[autism-images] scan failed:', e.message);
        return [];
    }
}

function sortImageName(a, b) {
    const rank = (n) => {
        if (/^hero-main/i.test(n)) return 0;
        if (/^hero-/i.test(n)) return 1;
        if (/^gallery-/i.test(n)) return 2;
        return 3;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
}

function readUploadManifest(db, cb) {
    db.get(`SELECT value FROM global_settings WHERE key = ?`, [MANIFEST_KEY], (err, row) => {
        if (err) return cb(err);
        let list = [];
        if (row && row.value) {
            try {
                const parsed = JSON.parse(row.value);
                list = Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                list = [];
            }
        }
        cb(null, list);
    });
}

function writeUploadManifest(db, list, cb) {
    const payload = JSON.stringify(list);
    db.run(`UPDATE global_settings SET value = ? WHERE key = ?`, [payload, MANIFEST_KEY], function (uErr) {
        if (!uErr && this.changes) return cb();
        db.run(
            `INSERT INTO global_settings (key, value) VALUES (?, ?)`,
            [MANIFEST_KEY, payload],
            (iErr) => cb(iErr || null)
        );
    });
}

function buildPayload(folderList, uploads) {
    const seen = new Set();
    const images = [];
    [...(uploads || []), ...(folderList || [])].forEach((item) => {
        const src = item.src || item.url;
        if (!src || seen.has(src)) return;
        seen.add(src);
        images.push({
            src,
            name: item.name || path.basename(src),
            source: item.source || 'upload'
        });
    });
    const hero = images.filter((i) => /^hero-/i.test(i.name) || /hero/i.test(i.name)).slice(0, 4);
    const gallery = images.filter((i) => !hero.includes(i)).slice(0, 12);
    const pickHero = hero.length ? hero : images.slice(0, 4);
    const pickGallery = gallery.length ? gallery : images.slice(4, 10);
    return {
        images,
        hero: pickHero,
        gallery: pickGallery,
        updatedAt: new Date().toISOString()
    };
}

function registerAutismSiteImageRoutes(app, db, assertAdminPortalActor) {
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (_) {}

    const upload = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadsDir),
            filename: (req, file, cb) => {
                const base = String(file.originalname || 'image.jpg')
                    .replace(/[^a-zA-Z0-9._-]/g, '_')
                    .slice(0, 80);
                cb(null, 'autism-' + Date.now() + '-' + base);
            }
        }),
        limits: { fileSize: 8 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (IMG_EXT.test(file.originalname || '')) cb(null, true);
            else cb(new Error('Only JPG, PNG, WebP, or AVIF images.'));
        }
    });

    app.get('/api/public/autism-site-images', (req, res) => {
        if (cachedPublicPayload && cachedPublicPayloadExpiry > Date.now()) {
            res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=60');
            return res.json(cachedPublicPayload);
        }
        const folder = listFolderImages();
        readUploadManifest(db, (err, uploads) => {
            if (err) return res.status(500).json({ error: err.message });
            const payload = buildPayload(folder, uploads);
            cachedPublicPayload = payload;
            cachedPublicPayloadExpiry = Date.now() + 120000;
            res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=60');
            res.json(payload);
        });
    });

    app.post('/api/admin/autism-site-images/upload', assertAdminPortalActor, upload.array('images', 12), (req, res) => {
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'No images uploaded.' });

        const persistOne = (file, done) => {
            fileStore.persistMulterFile(db, file, uploadsDir, (pErr, relPath) => {
                if (pErr) return done(pErr);
                done(null, {
                    src: relPath || '/uploads/' + file.filename,
                    name: file.originalname || file.filename,
                    source: 'upload',
                    uploadedAt: new Date().toISOString()
                });
            });
        };

        let pending = files.length;
        const added = [];
        let firstErr = null;
        files.forEach((file) => {
            persistOne(file, (err, entry) => {
                if (err && !firstErr) firstErr = err;
                if (entry) added.push(entry);
                pending -= 1;
                if (pending > 0) return;
                if (firstErr && !added.length) return res.status(500).json({ error: firstErr.message });
                readUploadManifest(db, (rErr, list) => {
                    if (rErr) return res.status(500).json({ error: rErr.message });
                    const merged = [...added, ...list];
                    writeUploadManifest(db, merged, (wErr) => {
                        if (wErr) return res.status(500).json({ error: wErr.message });
                        cachedPublicPayload = null;
                        cachedPublicPayloadExpiry = 0;
                        res.json({ success: true, added: added.length, images: buildPayload(listFolderImages(), merged) });
                    });
                });
            });
        });
    });

    console.log('[autism] Site image routes registered');
}

module.exports = {
    listFolderImages,
    buildPayload,
    registerAutismSiteImageRoutes,
    AUTISM_IMG_DIR
};
