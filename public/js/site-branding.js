/**
 * Loads site logo from /api/branding/logo into [data-site-logo] slots and syncs favicon.
 */
(function () {
    const DEFAULT_ICON = '🏥';

    function faviconHref(logoPath) {
        const lp = String(logoPath || '').trim();
        const m = lp.match(/[?&]v=(\d+)/);
        return m ? '/favicon.ico?v=' + m[1] : '/favicon.ico';
    }

    function upsertFaviconLink(rel, href, extra) {
        if (!href) return;
        let el = document.querySelector(`link[rel="${rel}"]`);
        if (!el) {
            el = document.createElement('link');
            el.setAttribute('rel', rel);
            document.head.appendChild(el);
        }
        el.setAttribute('href', href);
        if (extra) Object.keys(extra).forEach((k) => el.setAttribute(k, extra[k]));
    }

    function applySiteFavicon(logoPath) {
        const href = faviconHref(logoPath);
        upsertFaviconLink('icon', href, { type: 'image/png', sizes: '32x32' });
        upsertFaviconLink('shortcut icon', href);
        const touch = href.replace('/favicon.ico', '/apple-touch-icon.png');
        upsertFaviconLink('apple-touch-icon', touch.indexOf('?') >= 0 ? touch : touch + (href.indexOf('?') >= 0 ? href.slice(href.indexOf('?')) : ''));
        if (window.VgmfSiteSeo && typeof window.VgmfSiteSeo.applyFavicon === 'function') {
            window.VgmfSiteSeo.applyFavicon(href);
        }
    }

    function applyLogoToSlot(el, logoPath, isRetry) {
        if (!el) return;
        const fallbackMode = el.getAttribute('data-logo-fallback');
        let path = String(logoPath || '').trim();
        if (!path && fallbackMode === 'favicon') path = faviconHref('');
        if (!path) {
            if (fallbackMode === 'icon') {
                el.innerHTML =
                    '<span class="logo-icon-fallback" style="font-size:2rem;line-height:1;">' + DEFAULT_ICON + '</span>';
            }
            return;
        }
        const img = document.createElement('img');
        img.src = path;
        img.alt = 'Vaidya Gogate Memorial Foundation logo';
        img.className = 'site-logo-img';
        img.style.maxHeight = el.getAttribute('data-logo-height') || '56px';
        img.style.maxWidth = el.getAttribute('data-logo-width') || '160px';
        img.style.objectFit = 'contain';
        img.style.display = 'block';
        img.decoding = 'async';
        img.loading = 'eager';
        img.onerror = function onLogoError() {
            if (!isRetry && path !== faviconHref('')) {
                applyLogoToSlot(el, faviconHref(''), true);
            }
        };
        el.innerHTML = '';
        el.appendChild(img);
        el.classList.add('has-site-logo');
    }

    async function loadSiteBranding() {
        const onScanner =
            document.documentElement.classList.contains('scanner-native-shell') ||
            /\/scanner\.html$/i.test(window.location.pathname || '');
        if (onScanner && !document.querySelector('[data-site-logo]')) {
            applySiteFavicon('');
            return;
        }
        let logoPath = '';
        try {
            const res = await fetch('/api/branding/logo', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                logoPath = (data && data.logoPath) || '';
            }
        } catch (e) {
            console.warn('Site branding:', e.message || e);
        }
        window.__siteLogoPath = logoPath;
        applySiteFavicon(logoPath);
        document.querySelectorAll('[data-site-logo]').forEach((el) => applyLogoToSlot(el, logoPath));
        if (logoPath && !onScanner) {
            document.body.classList.add('has-logo-theme');
            document.body.style.setProperty('--site-logo-watermark', 'url("' + logoPath + '")');
        } else {
            document.body.classList.remove('has-logo-theme');
            document.body.style.removeProperty('--site-logo-watermark');
        }
        document.dispatchEvent(new CustomEvent('site-branding-loaded', { detail: { logoPath } }));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSiteBranding);
    } else {
        loadSiteBranding();
    }

    window.reloadSiteBranding = loadSiteBranding;
})();
