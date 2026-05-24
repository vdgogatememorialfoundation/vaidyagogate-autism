#!/usr/bin/env node
/**
 * Scan public/images/autism and write manifest.json for the homepage.
 * Run after adding/replacing files: npm run sync-images
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'images', 'autism');
const IMG_EXT = /\.(jpe?g|png|webp|avif)$/i;
const SKIP = new Set(['manifest.json', 'children-group.svg', 'hero-illustration.svg']);

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

if (!fs.existsSync(DIR)) {
    console.error('Missing folder:', DIR);
    process.exit(1);
}

const files = fs.readdirSync(DIR).filter((f) => IMG_EXT.test(f) && !SKIP.has(f)).sort(sortImageName);

const manifest = {
    updatedAt: new Date().toISOString(),
    note: 'Auto-generated. Commit this file + images, then push to deploy. Or use Admin → Website CMS → Site photos upload for instant live updates.',
    images: files.map((f) => ({ src: '/images/autism/' + f, name: f }))
};

fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Wrote manifest with', files.length, 'image(s):', files.join(', '));
