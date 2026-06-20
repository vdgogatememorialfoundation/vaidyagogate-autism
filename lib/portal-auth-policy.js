/**
 * Public portal auth & OTP policy (global_settings.portal_auth_config).
 * Env overrides: REQUIRE_SIGNUP_OTP / REQUIRE_LOGIN_OTP = '0' | '1'
 */
const KEY = 'portal_auth_config';
const portalProduct = require('./portal-product');

/** Public website main navigation (data-nav-section / data-menu-key on index.html). */
const WEBSITE_MENU_PAGE_DEFS = [
    ['home', 'Home'],
    ['about', 'Foundation'],
    ['schedule', 'Agenda'],
    ['verify', 'Delegates (participant search)'],
    ['certificate', 'Certificate verification'],
    ['contact', 'Contact']
];

const DEFAULTS = {
    showSignup: true,
    showLogin: true,
    requireSignupOtp: true,
    requireLoginOtp: true,
    signupOtpWhatsapp: true,
    signupOtpEmail: false,
    passwordlessLogin: true,
    loginOtpWhatsapp: true,
    loginOtpEmail: false,
    requireEmailVerification: false,
    requireAdminOtpForSensitive: false,
    requireBehalfApplicantOtp: true,
    adminEnabledPages: {},
    websiteMenuPages: {}
};

/** Staff portals never use email/phone login OTP (password only). */
const STAFF_LOGIN_PORTALS = new Set(['admin', 'staff', 'judge', 'scanner']);

/** CRM staff account roles (not doctor portal delegates). */
const STAFF_USER_ROLES = new Set([
    'co_admin',
    'judge_user',
    'scanner_portal_user',
    'scanner_dashboard_user',
    'reviewer'
]);

let cache = { ...DEFAULTS };
let portalAuthConfigLoaded = false;

function isAutismApplicantPortal() {
    return !!(portalProduct.FEATURES && portalProduct.FEATURES.applicantPortal);
}

function merge(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const pages =
        o.adminEnabledPages && typeof o.adminEnabledPages === 'object' && !Array.isArray(o.adminEnabledPages)
            ? o.adminEnabledPages
            : {};
    const menuPages =
        o.websiteMenuPages && typeof o.websiteMenuPages === 'object' && !Array.isArray(o.websiteMenuPages)
            ? o.websiteMenuPages
            : {};
    const autism = isAutismApplicantPortal();
    return {
        showSignup: o.showSignup !== false,
        showLogin: o.showLogin !== false,
        requireSignupOtp: o.requireSignupOtp !== false,
        requireLoginOtp: o.requireLoginOtp !== false,
        signupOtpWhatsapp: o.signupOtpWhatsapp !== false,
        signupOtpEmail: autism ? false : o.signupOtpEmail === true,
        passwordlessLogin:
            o.passwordlessLogin === true || (o.passwordlessLogin === undefined && autism && o.requireLoginOtp !== false),
        loginOtpWhatsapp: o.loginOtpWhatsapp !== false,
        loginOtpEmail: autism ? false : o.loginOtpEmail === true,
        requireEmailVerification: !!o.requireEmailVerification,
        requireAdminOtpForSensitive: !!o.requireAdminOtpForSensitive,
        requireBehalfApplicantOtp: o.requireBehalfApplicantOtp !== false,
        adminEnabledPages: pages,
        websiteMenuPages: menuPages
    };
}

/** If any admin page is explicitly enabled, only those tabs show; empty config = all tabs. */
function adminTabGloballyEnabled(tabId) {
    const pages = cache.adminEnabledPages || {};
    const keys = Object.keys(pages);
    if (!keys.length) return true;
    const anyOn = keys.some((k) => pages[k] === true);
    if (!anyOn) return true;
    return pages[tabId] === true;
}

function loadPortalAuthConfig(db, cb) {
    if (portalAuthConfigLoaded) {
        return cb && cb(null, cache);
    }
    if (!db) {
        cache = { ...DEFAULTS };
        portalAuthConfigLoaded = true;
        return cb && cb(null, cache);
    }
    db.get(`SELECT value FROM global_settings WHERE key = ?`, [KEY], (err, row) => {
        if (err) {
            cache = { ...DEFAULTS };
            portalAuthConfigLoaded = true;
            return cb && cb(err, cache);
        }
        let parsed = {};
        if (row && row.value) {
            try {
                parsed = JSON.parse(row.value) || {};
            } catch (_) {
                parsed = {};
            }
        }
        cache = merge(parsed);
        portalAuthConfigLoaded = true;
        cb && cb(null, cache);
    });
}

function getPortalAuthConfig() {
    return { ...cache };
}

function normalizeLoginPortal(portal) {
    const p = String(portal || '')
        .trim()
        .toLowerCase();
    if (STAFF_LOGIN_PORTALS.has(p)) return p;
    if (p === 'doctor' || p === 'public' || p === 'homepage' || p === 'main') return 'public';
    return 'public';
}

function isStaffPortal(portal) {
    return STAFF_LOGIN_PORTALS.has(normalizeLoginPortal(portal));
}

function isStaffUserRole(userRole) {
    const ur = String(userRole || '')
        .trim()
        .toLowerCase();
    if (!ur || ur === 'doctor') return false;
    return STAFF_USER_ROLES.has(ur) || ur === 'admin';
}

/** True for co-admin, judge, scanner, reviewer, and super-admin accounts. */
function isStaffPortalAccount(row) {
    if (!row) return false;
    const ur = String(row.user_role || '')
        .trim()
        .toLowerCase();
    if (ur && ur !== 'doctor') return true;
    return String(row.role || '')
        .trim()
        .toLowerCase() === 'admin';
}

function signupOtpRequired() {
    if (process.env.REQUIRE_SIGNUP_OTP === '0') return false;
    if (process.env.REQUIRE_SIGNUP_OTP === '1') return true;
    return cache.requireSignupOtp !== false;
}

function loginOtpRequired() {
    if (process.env.REQUIRE_LOGIN_OTP === '0') return false;
    if (process.env.REQUIRE_LOGIN_OTP === '1') return true;
    return cache.requireLoginOtp !== false;
}

function passwordlessLoginEnabled() {
    return cache.passwordlessLogin === true;
}

function signupOtpChannels() {
    if (!signupOtpRequired()) {
        return { whatsapp: false, email: false };
    }
    const whatsapp = cache.signupOtpWhatsapp !== false;
    let email = cache.signupOtpEmail === true;
    if (isAutismApplicantPortal()) email = false;
    if (!whatsapp && !email) {
        return { whatsapp: true, email: false };
    }
    return { whatsapp, email };
}

function loginOtpChannels() {
    const whatsapp = cache.loginOtpWhatsapp !== false;
    let email = cache.loginOtpEmail === true;
    if (isAutismApplicantPortal()) email = false;
    if (!whatsapp && !email) {
        return { whatsapp: true, email: false };
    }
    return { whatsapp, email };
}

function applicantLoginOtpRequired(portal) {
    if (isStaffPortal(portal)) return false;
    if (passwordlessLoginEnabled()) return true;
    return loginOtpRequired();
}

function behalfApplicantOtpRequired() {
    return cache.requireBehalfApplicantOtp !== false;
}

function loginOtpRequiredForPortal(portal) {
    if (isStaffPortal(portal)) return false;
    return applicantLoginOtpRequired(portal);
}

function websiteMenuPageEnabled(key) {
    const pages = cache.websiteMenuPages || {};
    const keys = Object.keys(pages);
    if (!keys.length) return true;
    const anyOn = keys.some((k) => pages[k] === true);
    if (!anyOn) return true;
    return pages[key] === true;
}

function publicPortalAuthPayload() {
    const c = getPortalAuthConfig();
    const signupChannels = signupOtpChannels();
    const loginChannels = loginOtpChannels();
    return {
        showSignup: !!c.showSignup,
        showLogin: !!c.showLogin,
        requireSignupOtp: signupOtpRequired(),
        requireLoginOtp: loginOtpRequired(),
        signupOtpWhatsapp: signupChannels.whatsapp,
        signupOtpEmail: signupChannels.email,
        passwordlessLogin: passwordlessLoginEnabled(),
        loginOtpWhatsapp: loginChannels.whatsapp,
        loginOtpEmail: loginChannels.email,
        applicantLoginOtpRequired: applicantLoginOtpRequired('public'),
        requireEmailVerification: !!c.requireEmailVerification,
        staffLoginOtp: false,
        websiteMenuPages: c.websiteMenuPages || {},
        websiteMenuPageDefs: WEBSITE_MENU_PAGE_DEFS
    };
}

function invalidatePortalAuthConfigCache() {
    portalAuthConfigLoaded = false;
}

module.exports = {
    KEY,
    DEFAULTS,
    WEBSITE_MENU_PAGE_DEFS,
    STAFF_LOGIN_PORTALS,
    STAFF_USER_ROLES,
    loadPortalAuthConfig,
    invalidatePortalAuthConfigCache,
    getPortalAuthConfig,
    normalizeLoginPortal,
    isStaffPortal,
    isStaffUserRole,
    isStaffPortalAccount,
    signupOtpRequired,
    loginOtpRequired,
    passwordlessLoginEnabled,
    signupOtpChannels,
    loginOtpChannels,
    applicantLoginOtpRequired,
    loginOtpRequiredForPortal,
    behalfApplicantOtpRequired,
    publicPortalAuthPayload,
    adminTabGloballyEnabled,
    websiteMenuPageEnabled,
    merge
};
