/**
 * Loads site logo from /api/branding/logo into [data-site-logo] slots and syncs favicon.
 */
(function () {
    const DEFAULT_ICON = '🏥';
    const FALLBACK_LOGO = '/favicon.ico';

    function upsertFaviconLink(rel, href) {
        if (!href) return;
        let el = document.querySelector(`link[rel="${rel}"]`);
        if (!el) {
            el = document.createElement('link');
            el.setAttribute('rel', rel);
            document.head.appendChild(el);
        }
        el.setAttribute('href', href);
    }

    function applySiteFavicon(logoPath) {
        const href = logoPath || '/favicon.ico';
        upsertFaviconLink('icon', href);
        upsertFaviconLink('shortcut icon', href);
        upsertFaviconLink('apple-touch-icon', href);
        if (window.VgmfSiteSeo && typeof window.VgmfSiteSeo.applyFavicon === 'function') {
            window.VgmfSiteSeo.applyFavicon(href);
        }
    }

    function applyLogoToSlot(el, logoPath, isRetry) {
        if (!el) return;
        const fallbackMode = el.getAttribute('data-logo-fallback');
        let path = String(logoPath || '').trim();
        if (!path && fallbackMode === 'favicon') path = FALLBACK_LOGO;
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
            if (!isRetry && path !== FALLBACK_LOGO) {
                applyLogoToSlot(el, FALLBACK_LOGO, true);
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
            applySiteFavicon('/favicon.ico');
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
        applySiteFavicon(logoPath || '/favicon.ico');
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
