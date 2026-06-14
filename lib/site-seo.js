/**
 * Public site SEO metadata, robots.txt, sitemap.xml, favicon helpers.
 */
const path = require('path');
const fs = require('fs');
const portalProduct = require('./portal-product');

const PUBLIC_INDEX_PATHS = ['/', '/verify-certificate.html', '/scanner-download.html'];

const DEFAULT_SEO = {
    siteName: portalProduct.FEATURES.foundationName || 'Vaidya Gogate Memorial Foundation',
    title:
        (portalProduct.FEATURES.eventLabel || 'Autism Awareness Programme') +
        ' | ' +
        (portalProduct.FEATURES.foundationName || 'Vaidya Gogate Memorial Foundation'),
    description:
        'Autism Awareness Programme — free registration, inclusive events, e-tickets, and certificates for families and schools.',
    keywords:
        'autism awareness, Vaidya Gogate Memorial Foundation, inclusive events, free registration, e-ticket, certificate verification, Pune',
    canonicalUrl: '',
    ogImage: '',
    twitterCard: 'summary_large_image',
    googleSiteVerification: '',
    bingSiteVerification: '',
    robotsIndex: true,
    faviconUrl: '/favicon.ico',
    sitemapExtraPaths: ['/verify-certificate.html', '/scanner-download.html']
};

function publicBaseUrl() {
    try {
        return require('./integration-settings').getPublicBaseUrl();
    } catch (_) {
        return (process.env.PUBLIC_BASE_URL || process.env.SITE_URL || 'https://autism.vaidyagogate.org').replace(
            /\/$/,
            ''
        );
    }
}

function normalizeSeo(seo) {
    const o = seo && typeof seo === 'object' ? seo : {};
    const base = publicBaseUrl();
    return {
        siteName: String(o.siteName || DEFAULT_SEO.siteName).trim() || DEFAULT_SEO.siteName,
        title: String(o.title || DEFAULT_SEO.title).trim() || DEFAULT_SEO.title,
        description: String(o.description || DEFAULT_SEO.description).trim() || DEFAULT_SEO.description,
        keywords: String(o.keywords || DEFAULT_SEO.keywords).trim(),
        canonicalUrl: String(o.canonicalUrl || base).trim() || base,
        ogImage: String(o.ogImage || '').trim(),
        twitterCard: String(o.twitterCard || DEFAULT_SEO.twitterCard).trim() || 'summary',
        googleSiteVerification: String(o.googleSiteVerification || '').trim(),
        bingSiteVerification: String(o.bingSiteVerification || '').trim(),
        robotsIndex: o.robotsIndex !== false && o.robotsIndex !== 0 && String(o.robotsIndex) !== 'false',
        faviconUrl: String(o.faviconUrl || DEFAULT_SEO.faviconUrl).trim() || DEFAULT_SEO.faviconUrl,
        sitemapExtraPaths: Array.isArray(o.sitemapExtraPaths)
            ? o.sitemapExtraPaths.filter((p) => typeof p === 'string' && p.startsWith('/'))
            : DEFAULT_SEO.sitemapExtraPaths.slice()
    };
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildRobotsTxt(seo) {
    const s = normalizeSeo(seo);
    const base = publicBaseUrl();
    if (!s.robotsIndex) {
        return 'User-agent: *\nDisallow: /\n';
    }
    const lines = [
        'User-agent: *',
        'Allow: /',
        'Allow: /verify-certificate.html',
        'Allow: /scanner-download.html',
        'Disallow: /api/',
        'Disallow: /admin',
        'Disallow: /admin.html',
        'Disallow: /admin-live-scanner.html',
        'Disallow: /judge.html',
        'Disallow: /scanner.html',
        'Disallow: /scan',
        'Disallow: /scanner',
        'Disallow: /dashboard',
        'Disallow: /doctor.html',
        'Disallow: /applicant.html',
        'Disallow: /pos',
        'Sitemap: ' + base + '/sitemap.xml'
    ];
    return lines.join('\n') + '\n';
}

function buildSitemapXml(seo, extraUrls) {
    const s = normalizeSeo(seo);
    const base = publicBaseUrl();
    const paths = new Set(PUBLIC_INDEX_PATHS);
    (s.sitemapExtraPaths || []).forEach((p) => paths.add(p));
    (extraUrls || []).forEach((p) => {
        if (p && String(p).startsWith('/')) paths.add(String(p));
    });
    const today = new Date().toISOString().slice(0, 10);
    const urls = [...paths]
        .map((pagePath) => {
            const loc = pagePath === '/' || pagePath === '/index.html' ? base + '/' : base + pagePath;
            return (
                '  <url>\n    <loc>' +
                escapeHtml(loc) +
                '</loc>\n    <lastmod>' +
                today +
                '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>' +
                (pagePath === '/' || pagePath === '/index.html' ? '1.0' : '0.8') +
                '</priority>\n  </url>'
            );
        })
        .join('\n');
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls +
        '\n</urlset>\n'
    );
}

function sendStaticFaviconSvg(res) {
    const fallback = path.join(__dirname, '..', 'public', 'favicon.svg');
    if (fs.existsSync(fallback)) {
        res.type('image/svg+xml');
        return res.sendFile(fallback);
    }
    return res.status(404).end();
}

/** Serve uploaded site logo as favicon, with SVG fallback when no logo is stored. */
function serveBrandingFavicon(db, res) {
    db.get(`SELECT value FROM global_settings WHERE key = 'site_logo_b64'`, [], (e, row) => {
        if (!e && row && row.value) {
            try {
                const payload = JSON.parse(row.value);
                if (payload && payload.data) {
                    const buf = Buffer.from(payload.data, 'base64');
                    res.setHeader('Content-Type', payload.mime || 'image/png');
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    return res.send(buf);
                }
            } catch (_) {
                /* fall through */
            }
        }
        sendStaticFaviconSvg(res);
    });
}

function registerSiteSeoRoutes(app, deps) {
    const { db, loadPublicSiteCms } = deps;

    app.get('/robots.txt', (req, res) => {
        loadPublicSiteCms((e, cms) => {
            const txt = buildRobotsTxt((cms && cms.seo) || DEFAULT_SEO);
            res.type('text/plain; charset=utf-8').send(txt);
        });
    });

    app.get('/sitemap.xml', (req, res) => {
        loadPublicSiteCms((e, cms) => {
            const xml = buildSitemapXml((cms && cms.seo) || DEFAULT_SEO, []);
            res.type('application/xml; charset=utf-8').send(xml);
        });
    });

    app.get('/favicon.ico', (req, res) => {
        serveBrandingFavicon(db, res);
    });

    app.get('/apple-touch-icon.png', (req, res) => {
        serveBrandingFavicon(db, res);
    });
}

module.exports = {
    DEFAULT_SEO,
    PUBLIC_INDEX_PATHS,
    normalizeSeo,
    buildRobotsTxt,
    buildSitemapXml,
    serveBrandingFavicon,
    registerSiteSeoRoutes,
    publicBaseUrl
};
