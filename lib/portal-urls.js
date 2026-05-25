/**
 * Autism portal URLs — single host, path-based routes (no scanner subdomain).
 */
const integrationSettings = require('./integration-settings');

const DEFAULTS = {
    siteHost: 'autism.vaidyagogate.org',
    mainSiteUrl: 'https://autism.vaidyagogate.org'
};

const PATHS = {
    dashboard: '/dashboard',
    admin: '/admin',
    scanner: '/scan'
};

function hostFromEnv(key, fallback) {
    const v = process.env[key];
    return v && String(v).trim() ? String(v).trim().toLowerCase() : fallback;
}

function scheme() {
    return process.env.PORTAL_SCHEME === 'http' ? 'http' : 'https';
}

function originForHost(host) {
    return `${scheme()}://${host}`;
}

function getHosts() {
    const rt = integrationSettings.getRuntimeIntegrations();
    return {
        site: (rt.seminar_host || hostFromEnv('APPLICANT_HOST', DEFAULTS.siteHost)).toLowerCase()
    };
}

function getPortalUrls() {
    const rt = integrationSettings.getRuntimeIntegrations();
    const hosts = getHosts();
    const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    const siteOrigin = integrationSettings.getPublicBaseUrl() || originForHost(hosts.site);
    const base = siteOrigin.replace(/\/$/, '');
    const allowDemoAccounts = process.env.DISABLE_DEMO_ACCOUNTS !== '1';
    return {
        seminar: base,
        site: base,
        dashboard: `${base}${PATHS.dashboard}`,
        admin: `${base}${PATHS.admin}`,
        scanner: `${base}${PATHS.scanner}`,
        applicant: `${base}${PATHS.dashboard}`,
        doctor: `${base}${PATHS.dashboard}`,
        judge: null,
        wix: hosts.site ? originForHost(hosts.site) : DEFAULTS.mainSiteUrl,
        mainSite: rt.wix_site_url || process.env.MAIN_SITE_URL || DEFAULTS.mainSiteUrl,
        hosts,
        paths: PATHS,
        production,
        allowDemoAccounts
    };
}

function portalLoginUrl() {
    return getPortalUrls().dashboard;
}

function hostMatches(req, hostKey) {
    const hosts = getHosts();
    const reqHost = String(req.hostname || (req.headers.host || '').split(':')[0]).toLowerCase();
    if (hostKey === 'site' || hostKey === 'applicant' || hostKey === 'seminar') {
        return reqHost === hosts.site;
    }
    return reqHost === hosts[hostKey];
}

module.exports = {
    DEFAULTS,
    PATHS,
    getHosts,
    getPortalUrls,
    portalLoginUrl,
    hostMatches
};
