/**
 * Fail CI / vercel-build if critical server or portal modules have a syntax error.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const files = [
    'server.js',
    path.join('lib', 'extended-schema-pg.js'),
    path.join('lib', 'portal-tracking.js'),
    path.join('lib', 'notification-engine.js'),
    path.join('lib', 'autism-portal.js'),
    path.join('lib', 'otp.js'),
    path.join('public', 'js', 'applicant.js'),
    path.join('public', 'js', 'applicant-autism.js'),
    path.join('public', 'js', 'admin.js'),
    path.join('public', 'js', 'autism-applicant-live.js')
];

let failed = false;
for (const rel of files) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
        console.error('[validate-syntax] missing', rel);
        failed = true;
        continue;
    }
    try {
        execSync(`node --check "${abs}"`, { stdio: 'pipe' });
    } catch (e) {
        console.error('[validate-syntax] syntax error in', rel);
        failed = true;
    }
}

if (failed) process.exit(1);
console.log('[validate-syntax] OK', files.length, 'files');
