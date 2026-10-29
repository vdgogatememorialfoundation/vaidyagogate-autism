/**
 * Compose the Expressions Programme certificate artwork into a PNG.
 * The name, date, and 12-digit certificate ID are drawn on the printed underlines.
 * Fonts are the bundled Liberation faces (SIL Open Font License 1.1).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts', 'liberation');

const ARTWORK = {
    participant: path.join(PUBLIC_DIR, 'assets', 'certificates', 'participation-certificate.png'),
    volunteer: path.join(PUBLIC_DIR, 'assets', 'certificates', 'volunteer-certificate.png'),
    competition: path.join(PUBLIC_DIR, 'assets', 'certificates', 'competition-participation-certificate.jpeg')
};

/** Underline boxes measured on the 1536×1024 artwork, stored as fractions of width and height. */
const LAYOUTS = {
    participant: {
        name: { x0: 322 / 1536, x1: 1233 / 1536, lineY: 690 / 1024 },
        date: { x0: 330 / 1536, x1: 499 / 1536, lineY: 871 / 1024 },
        id: { x0: 690 / 1536, x1: 895 / 1536, lineY: 906 / 1024 }
    },
    volunteer: {
        name: { x0: 324 / 1536, x1: 1218 / 1536, lineY: 685 / 1024 },
        date: { x0: 328 / 1536, x1: 490 / 1536, lineY: 876 / 1024 },
        id: { x0: 681 / 1536, x1: 893 / 1536, lineY: 905 / 1024 }
    },
    competition: {
        name: { x0: 394 / 1536, x1: 1141 / 1536, lineY: 680 / 1024 },
        date: { x0: 390 / 1536, x1: 553 / 1536, lineY: 856 / 1024 },
        id: { x0: 752 / 1536, x1: 927 / 1536, lineY: 856 / 1024 }
    }
};

const INK = '#0e0951';
const NAME_FONT = path.join(FONT_DIR, 'LiberationSerif-BoldItalic.ttf');
const DATE_FONT = path.join(FONT_DIR, 'LiberationSerif-Bold.ttf');
const ID_FONT = path.join(FONT_DIR, 'LiberationMono-Bold.ttf');

function escXml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function plainText(value) {
    return String(value == null ? '' : value)
        .replace(/\s+/g, ' ')
        .trim();
}

function fileUrl(filePath) {
    return 'file://' + filePath.split(path.sep).map(encodeURIComponent).join('/');
}

function resolveKind(templatePath, certType) {
    const filePath = String(templatePath || '').toLowerCase();
    const type = String(certType || '').toLowerCase();
    if (type === 'volunteer' || filePath.includes('volunteer')) return 'volunteer';
    if (type === 'competition' || filePath.includes('competition')) return 'competition';
    return 'participant';
}

function resolveArtwork(kind, templatePath) {
    const official = ARTWORK[kind] || ARTWORK.participant;
    const raw = String(templatePath || '').trim();
    if (!raw || raw.startsWith('__builtin')) return official;
    const lower = raw.toLowerCase();
    if (
        lower.includes('participation-certificate') ||
        lower.includes('volunteer-certificate') ||
        lower.includes('competition-participation')
    ) {
        return official;
    }
    const candidates = [];
    if (path.isAbsolute(raw)) candidates.push(raw);
    const rel = raw.replace(/^\/+/, '');
    candidates.push(path.join(PUBLIC_DIR, rel));
    candidates.push(path.join(PUBLIC_DIR, 'uploads', path.basename(rel)));
    for (const candidate of candidates) {
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
        if (/\.(png|jpe?g|webp|gif|tif|tiff)$/i.test(candidate)) return candidate;
    }
    return official;
}

/** Fit a font size so estimated advance width stays inside the underline. */
function fitFontSize(text, boxWidth, ratio, maxSize) {
    const length = Math.max(Array.from(String(text)).length, 1);
    const fitted = Math.floor(boxWidth / (length * ratio));
    return Math.max(8, Math.min(maxSize, fitted));
}

function fieldSvg(text, box, width, height, fontFamily, fontSize, extra, lift) {
    const x0 = box.x0 * width;
    const x1 = box.x1 * width;
    const lineY = box.lineY * height;
    const center = (x0 + x1) / 2;
    const baseline = lineY - (lift == null ? Math.max(4, Math.round(fontSize * 0.16)) : lift);
    const attrs = extra || '';
    return `<text x="${center.toFixed(2)}" y="${baseline.toFixed(2)}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}" fill="${INK}"${attrs}>${escXml(text)}</text>`;
}

function buildOverlaySvg({ width, height, layout, name, date, certificateId }) {
    const parts = [];
    if (name) {
        const boxWidth = (layout.name.x1 - layout.name.x0) * width - 24;
        const size = fitFontSize(name, boxWidth, 0.52, 48);
        parts.push(fieldSvg(name, layout.name, width, height, 'CertName', size));
    }
    if (date) {
        const boxWidth = (layout.date.x1 - layout.date.x0) * width - 10;
        const size = fitFontSize(date, boxWidth, 0.52, 20);
        parts.push(fieldSvg(date, layout.date, width, height, 'CertDate', size));
    }
    if (certificateId) {
        const boxWidth = (layout.id.x1 - layout.id.x0) * width - 8;
        const size = fitFontSize(certificateId, boxWidth, 0.64, 18);
        const natural = Array.from(String(certificateId)).length * size * 0.6;
        const tracking = Math.max(0, Math.min((boxWidth * 0.92 - natural) / Math.max(certificateId.length - 1, 1), size * 0.28));
        const spacing = tracking > 0.4 ? ` letter-spacing="${tracking.toFixed(2)}"` : '';
        parts.push(fieldSvg(certificateId, layout.id, width, height, 'CertId', size, spacing, 1));
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<style>
@font-face { font-family: 'CertName'; src: url('${fileUrl(NAME_FONT)}'); font-weight: 700; font-style: italic; }
@font-face { font-family: 'CertDate'; src: url('${fileUrl(DATE_FONT)}'); font-weight: 700; }
@font-face { font-family: 'CertId'; src: url('${fileUrl(ID_FONT)}'); font-weight: 700; }
</style>
${parts.join('\n')}
</svg>`;
}

async function renderCertificatePng({ kind, templatePath, name, date, certificateId }) {
    const resolvedKind = resolveKind(templatePath, kind);
    const artwork = resolveArtwork(resolvedKind, templatePath);
    let image = sharp(artwork, { failOn: 'none' }).rotate();
    const meta = await image.metadata();
    const width = meta.width;
    const height = meta.height;
    if (!width || !height) throw new Error('Certificate artwork could not be read');
    const layout = LAYOUTS[resolvedKind] || LAYOUTS.participant;
    const svg = buildOverlaySvg({
        width,
        height,
        layout,
        name: plainText(name),
        date: plainText(date),
        certificateId: plainText(certificateId)
    });
    return image
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png({ compressionLevel: 8 })
        .toBuffer();
}

function previewShellHtml(pngBuffer) {
    const src = 'data:image/png;base64,' + pngBuffer.toString('base64');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificate preview</title>
<style>
  html, body { margin: 0; background: #f6f3ee; }
  body { min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px; }
  img { width: min(1100px, 100%); height: auto; background: #fff; box-shadow: 0 16px 40px rgba(20, 14, 34, 0.16); }
</style>
</head>
<body>
<img alt="Certificate" src="${src}">
</body>
</html>`;
}

module.exports = {
    ARTWORK,
    LAYOUTS,
    resolveKind,
    resolveArtwork,
    renderCertificatePng,
    previewShellHtml,
    buildOverlaySvg
};
