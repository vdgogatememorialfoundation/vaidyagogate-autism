/**
 * Upload persistence: Cloudflare R2 via S3Client.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

// Cloudflare R2 setup
const r2Config = process.env.R2_ACCOUNT_ID ? {
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
} : null;

const s3Client = r2Config ? new S3Client(r2Config) : null;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'autism';

function useBlobStore() {
    return true; // We now always want memory storage in Multer to pipe to R2
}

function makeStorageKey(originalname) {
    return Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(originalname || '');
}

function assignFilenames(req) {
    const list = req.files || (req.file ? [req.file] : []);
    list.forEach((f) => {
        if (!f.filename) f.filename = makeStorageKey(f.originalname);
    });
}

function ensureSchema(db, cb) {
    // Schema is managed by build-pg-schema.js, and file_blobs is bypassed by R2.
    if (cb) cb();
}

function publicPath(storageKey) {
    // If it's a full URL, return as is
    if (/^https?:\/\//i.test(storageKey)) return storageKey;
    return '/uploads/' + storageKey;
}

function publicFileUrl(storedPath) {
    let p = String(storedPath || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith('/uploads/api/assets/')) {
        p = '/api/assets/' + p.slice('/uploads/api/assets/'.length);
    }
    if (p.startsWith('/')) return p;
    return publicPath(p);
}

async function uploadToR2(storageKey, buffer, mime) {
    if (!s3Client) throw new Error("R2 is not configured");
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: storageKey,
        Body: buffer,
        ContentType: mime || 'application/octet-stream',
    });
    await s3Client.send(command);
    return storageKey;
}

function persistMulterFile(db, file, uploadsDir, cb) {
    if (!file) return cb(null, null);
    const storageKey = file.filename || makeStorageKey(file.originalname);
    if (!file.filename) file.filename = storageKey;

    const buffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
    
    if (!buffer || !buffer.length) {
        return cb(new Error('Upload file data missing'));
    }

    if (s3Client) {
        uploadToR2(storageKey, buffer, file.mimetype)
            .then((key) => cb(null, publicPath(key)))
            .catch(cb);
    } else {
        // Fallback to local if R2 missing for dev
        try {
            fs.mkdirSync(uploadsDir, { recursive: true });
            fs.writeFileSync(path.join(uploadsDir, storageKey), buffer);
            cb(null, publicPath(storageKey));
        } catch (e) {
            cb(e);
        }
    }
}

function persistMulterFiles(db, files, uploadsDir, cb) {
    const list = files || [];
    if (!list.length) return cb(null, []);
    const paths = [];
    let i = 0;
    const next = () => {
        if (i >= list.length) return cb(null, paths);
        persistMulterFile(db, list[i], uploadsDir, (err, p) => {
            if (err) return cb(err);
            paths.push(p);
            i++;
            next();
        });
    };
    next();
}

function wrapMulter(multerInstance) {
    return {
        single(field) {
            return (req, res, next) => {
                multerInstance.single(field)(req, res, (err) => {
                    if (err) return next(err);
                    assignFilenames(req);
                    next();
                });
            };
        },
        array(field, max) {
            return (req, res, next) => {
                multerInstance.array(field, max)(req, res, (err) => {
                    if (err) return next(err);
                    assignFilenames(req);
                    next();
                });
            };
        }
    };
}

function createUploadHandler(diskUpload, memoryUpload) {
    return wrapMulter(memoryUpload);
}

function persistToGlobalAsset(db, upsertGlobalSetting, file, prefix, cb) {
    if (!file) return cb(null, null);
    if (!file.filename) file.filename = makeStorageKey(file.originalname);
    const key = (prefix || 'upload_asset_') + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    const buffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);

    if (s3Client && buffer && buffer.length) {
        uploadToR2(key, buffer, file.mimetype)
            .then(() => cb(null, '/api/assets/' + encodeURIComponent(key)))
            .catch(cb);
        return;
    }
    
    // Fallback logic
    if (buffer && buffer.length && upsertGlobalSetting) {
        const payload = JSON.stringify({
            mime: file.mimetype || 'application/octet-stream',
            data: buffer.toString('base64'),
            name: file.originalname || 'file'
        });
        return upsertGlobalSetting(key, payload, (err) => {
            if (err) return cb(err);
            cb(null, '/api/assets/' + encodeURIComponent(key));
        });
    }
    cb(null, null);
}

function isAllowedAssetKey(key) {
    return /^(upload_asset_|cert_|file_|regfld_)[a-z0-9_]+$/i.test(key);
}

function streamFromR2(key, res, fallbackCb) {
    if (!s3Client) return fallbackCb();
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
    });
    s3Client.send(command).then((data) => {
        if (data.ContentType) res.setHeader('Content-Type', data.ContentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        // Node 18+ data.Body is an async iterable / readable stream
        data.Body.pipe(res);
    }).catch((err) => {
        fallbackCb();
    });
}

function serveUploadHandler(db, uploadsDir) {
    return function serveUpload(req, res) {
        const raw = String(req.params.filename || req.params[0] || '');
        if (raw.startsWith('api/assets/') || raw.startsWith('api%2Fassets%2F')) {
            const key = decodeURIComponent(raw.replace(/^api\/assets\//i, '').replace(/^api%2Fassets%2F/i, ''));
            if (isAllowedAssetKey(key)) {
                req.params = { key };
                return serveAssetHandler(db)(req, res);
            }
        }
        const name = path.basename(raw);
        if (!name || name.includes('..')) return res.status(400).end();

        streamFromR2(name, res, () => {
            const diskPath = path.join(uploadsDir, name);
            if (fs.existsSync(diskPath)) {
                return res.sendFile(diskPath);
            }
            // Final fallback to DB (just in case migration missed something)
            db.get(`SELECT mime_type, data FROM file_blobs WHERE storage_key = ?`, [name], (e, row) => {
                if (e || !row || row.data == null) return res.status(404).end();
                let buf = row.data;
                if (typeof buf === 'string') buf = Buffer.from(buf, 'base64');
                if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
                res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                res.send(buf);
            });
        });
    };
}

function serveAssetHandler(db) {
    return function serveAsset(req, res) {
        const key = decodeURIComponent(String(req.params.key || ''));
        if (!isAllowedAssetKey(key)) return res.status(400).json({ error: 'Invalid asset key' });

        streamFromR2(key, res, () => {
            // Fallback to global settings if R2 misses
            db.get(`SELECT value FROM global_settings WHERE key = ?`, [key], (e, row) => {
                if (e || !row || !row.value) {
                    // Try file_blobs fallback
                    return db.get(`SELECT mime_type, data, original_name FROM file_blobs WHERE storage_key = ?`, [key], (eBlob, blobRow) => {
                        if (eBlob || !blobRow || blobRow.data == null) return res.status(404).end();
                        let buf = blobRow.data;
                        if (typeof buf === 'string') buf = Buffer.from(buf, 'base64');
                        if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
                        res.setHeader('Content-Type', blobRow.mime_type || 'application/octet-stream');
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        return res.send(buf);
                    });
                }
                try {
                    const payload = JSON.parse(row.value);
                    const buf = Buffer.from(payload.data, 'base64');
                    res.setHeader('Content-Type', payload.mime || 'application/octet-stream');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    res.send(buf);
                } catch (_) {
                    return res.status(404).end();
                }
            });
        });
    };
}

module.exports = {
    useBlobStore,
    makeStorageKey,
    assignFilenames,
    ensureSchema,
    publicPath,
    publicFileUrl,
    persistMulterFile,
    persistMulterFiles,
    wrapMulter,
    createUploadHandler,
    persistToGlobalAsset,
    serveUploadHandler,
    serveAssetHandler,
    isAllowedAssetKey
};
