/**
 * Path-based portal routes on autism.vaidyagogate.org (no subdomains).
 */
const path = require('path');
const { getPortalUrls, PATHS } = require('./portal-urls');

const SKIP_PREFIXES = [
    '/api',
    '/uploads',
    '/css',
    '/js',
    '/scanner-manifest.json'
];

function shouldSkip(pathname) {
    return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function pathPortalMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const raw = req.path || '/';
    const pathname = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
    if (shouldSkip(pathname)) return next();

    const urls = getPortalUrls();
    const publicDir = path.join(__dirname, '..', 'public');
    const send = (file) => res.sendFile(path.join(publicDir, file));

    if (pathname === PATHS.dashboard || pathname === '/applicant.html') {
        if (pathname === '/applicant.html') return res.redirect(302, urls.dashboard);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return send('applicant.html');
    }
    if (pathname === PATHS.admin || pathname === '/admin.html') {
        if (pathname === '/admin.html') return res.redirect(302, urls.admin);
        return send('admin.html');
    }
    if (pathname === PATHS.staff || pathname === '/staff.html') {
        if (pathname === '/staff.html') return res.redirect(302, urls.staff);
        return send('admin.html');
    }
    if (pathname === PATHS.scanner || pathname === '/scanner.html' || pathname === '/scanner') {
        if (pathname === '/scanner.html' || pathname === '/scanner') {
            return res.redirect(302, urls.scanner);
        }
        return send('scanner.html');
    }
    if (pathname === '/doctor.html') {
        const q = String(req.url || '').includes('?') ? String(req.url).slice(String(req.url).indexOf('?')) : '';
        return res.redirect(302, urls.dashboard + q);
    }
    if (pathname === PATHS.preregister || pathname === '/preregister.html') {
        if (pathname === '/preregister.html') return res.redirect(302, urls.preregister || PATHS.preregister);
        return send('preregister.html');
    }
    if (pathname === '/preregister/track' || pathname === '/preregister-track.html') {
        if (pathname === '/preregister-track.html') return res.redirect(302, '/preregister/track');
        return send('preregister-track.html');
    }
    if (pathname === '/preregister/search' || pathname === '/preregister-search.html') {
        if (pathname === '/preregister-search.html') return res.redirect(302, '/preregister/search');
        return send('preregister-search.html');
    }
    if (pathname === '/judge.html') return res.redirect(302, urls.site);
    if (pathname === '/' || pathname === '/index.html') return send('index.html');
    if (pathname === '/verify-certificate.html') return send('verify-certificate.html');
    if (pathname === '/admin-live-scanner.html') return send('admin-live-scanner.html');

    return next();
}

module.exports = { subdomainPortalMiddleware: pathPortalMiddleware, pathPortalMiddleware };
