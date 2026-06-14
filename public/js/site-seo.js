/**
 * Apply SEO + favicon from public_site_cms.seo on public pages.
 */
(function () {
    function isPrivatePortalPath() {
        const p = String(window.location.pathname || '');
        return (
            /^\/(admin|applicant|doctor|scanner|judge|admin-live-scanner)(\.html)?$/i.test(p) ||
            p === '/dashboard' ||
            p.startsWith('/dashboard/') ||
            p.startsWith('/admin') ||
            p.startsWith('/scan')
        );
    }

    function upsertMeta(attr, key, content) {
        if (!content) return;
        let el = document.querySelector(`meta[${attr}="${key}"]`);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, key);
            document.head.appendChild(el);
        }
        el.setAttribute('content', content);
    }

    function upsertLink(rel, href, extra) {
        if (!href) return;
        let el = document.querySelector(`link[rel="${rel}"]`);
        if (!el) {
            el = document.createElement('link');
            el.setAttribute('rel', rel);
            document.head.appendChild(el);
        }
        el.setAttribute('href', href);
        if (extra) {
            Object.keys(extra).forEach((k) => el.setAttribute(k, extra[k]));
        }
    }

    function applyFavicon(href) {
        const url = href || '/favicon.ico';
        upsertLink('icon', url, { sizes: 'any' });
        upsertLink('shortcut icon', url);
        upsertLink('apple-touch-icon', url);
    }

    function applySeo(seo) {
        if (!seo || typeof seo !== 'object') seo = {};
        const privatePortal = isPrivatePortalPath();
        const title = seo.title || seo.siteName;
        if (title && !privatePortal) document.title = title;
        if (seo.description && !privatePortal) upsertMeta('name', 'description', seo.description);
        if (seo.keywords && !privatePortal) upsertMeta('name', 'keywords', seo.keywords);
        if (seo.googleSiteVerification) {
            upsertMeta('name', 'google-site-verification', seo.googleSiteVerification);
        }
        if (seo.bingSiteVerification) {
            upsertMeta('name', 'msvalidate.01', seo.bingSiteVerification);
        }
        const canon = seo.canonicalUrl || window.location.origin + '/';
        if (!privatePortal) upsertLink('canonical', canon);
        applyFavicon(seo.faviconUrl || '/favicon.ico');
        if (!privatePortal) {
            upsertMeta('property', 'og:title', title || '');
            upsertMeta('property', 'og:description', seo.description || '');
            upsertMeta('property', 'og:type', 'website');
            upsertMeta('property', 'og:url', canon);
            if (seo.ogImage) upsertMeta('property', 'og:image', seo.ogImage);
            upsertMeta('name', 'twitter:card', seo.twitterCard || 'summary_large_image');
            upsertMeta('name', 'twitter:title', title || '');
            upsertMeta('name', 'twitter:description', seo.description || '');
        }
        if (privatePortal || seo.robotsIndex === false) {
            upsertMeta('name', 'robots', 'noindex, nofollow');
        } else {
            upsertMeta('name', 'robots', 'index, follow');
        }
    }

    async function loadPublicSeo() {
        try {
            const res = await fetch('/api/public/site-cms?fresh=1&t=' + Date.now(), { cache: 'no-store' });
            const cms = await res.json();
            applySeo(cms.seo || {});
        } catch (_) {
            applySeo({});
        }
    }

    window.VgmfSiteSeo = { applySeo, applyFavicon, loadPublicSeo, isPrivatePortalPath };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPublicSeo);
    } else {
        loadPublicSeo();
    }
})();
