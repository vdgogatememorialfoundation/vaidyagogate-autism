/**
 * Autism portal URLs — autism.vaidyagogate.org (applicant + admin path + scanner subdomain).
 */
const integrationSettings = require('./integration-settings');

const DEFAULTS = {
    applicantHost: 'autism.vaidyagogate.org',
    scannerHost: 'scan.autism.vaidyagogate.org',
    mainSiteUrl: 'https://autism.vaidyagogate.org'
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
        applicant: (rt.seminar_host || hostFromEnv('APPLICANT_HOST', DEFAULTS.applicantHost)).toLowerCase(),
        scanner: (rt.scanner_host || hostFromEnv('SCANNER_HOST', DEFAULTS.scannerHost)).toLowerCase(),
        mainSite: rt.wix_site_url || process.env.MAIN_SITE_URL || DEFAULTS.mainSiteUrl
    };
}

function getPortalUrls() {
    const hosts = getHosts();
    const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    const applicantOrigin =
        integrationSettings.getPublicBaseUrl() || originForHost(hosts.applicant);
    const base = applicantOrigin.replace(/\/$/, '');
    const allowDemoAccounts = process.env.DISABLE_DEMO_ACCOUNTS !== '1';
    return {
        seminar: base,
        applicant: `${base}/applicant.html`,
        admin: `${base}/admin.html`,
        scanner: `${base}/scanner.html`,
        scannerHost: originForHost(hosts.scanner),
        mainSite: hosts.mainSite,
        hosts,
        production,
        allowDemoAccounts,
        /** @deprecated legacy keys for shared JS */
        doctor: `${base}/applicant.html`,
        judge: null,
        wix: hosts.mainSite
    };
}

function portalLoginUrl() {
    return getPortalUrls().applicant;
}

function hostMatches(req, hostKey) {
    const hosts = getHosts();
    const reqHost = String(req.hostname || (req.headers.host || '').split(':')[0]).toLowerCase();
    return reqHost === hosts[hostKey];
}

module.exports = {
    DEFAULTS,
    getHosts,
    getPortalUrls,
    portalLoginUrl,
    hostMatches
};
