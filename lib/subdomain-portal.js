/**
 * Serve the correct HTML shell per host (applicant site / admin path / scanner).
 */
const path = require('path');
const { getHosts, getPortalUrls } = require('./portal-urls');

const SKIP_PREFIXES = ['/api', '/uploads', '/css', '/js', '/scanner', '/scanner-manifest.json'];

function shouldSkip(pathname) {
    return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function subdomainPortalMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const pathname = req.path || '/';
    if (shouldSkip(pathname)) return next();

    const hosts = getHosts();
    const reqHost = String(req.hostname || (req.headers.host || '').split(':')[0]).toLowerCase();
    const urls = getPortalUrls();
    const publicDir = path.join(__dirname, '..', 'public');

    const send = (file) => res.sendFile(path.join(publicDir, file));

    if (reqHost === hosts.scanner) {
        if (pathname === '/' || pathname === '/index.html' || pathname === '/scanner.html' || pathname === '/scanner') {
            return send('scanner.html');
        }
        if (pathname === '/admin.html' || pathname === '/admin') return res.redirect(302, urls.admin);
        if (pathname === '/applicant.html' || pathname === '/doctor.html') return res.redirect(302, urls.applicant);
    }

    if (reqHost === hosts.applicant) {
        if (pathname === '/' || pathname === '/index.html') return send('index.html');
        if (pathname === '/admin' || pathname === '/admin/') return res.redirect(302, urls.admin);
        if (pathname === '/doctor.html') return res.redirect(302, urls.applicant);
    }

    return next();
}

module.exports = { subdomainPortalMiddleware };
