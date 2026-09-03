/**
 * Staff module access: which admin console tabs a staff account may use,
 * and which /api/admin/* paths belong to each tab.
 */
const userRoles = require('./user-roles');

/** Tabs that are always available to a signed-in staff account. */
const ALWAYS_ALLOWED_TABS = new Set(['tab-dashboard', 'tab-seminars', 'tab-seminar-details']);

/** First path segment after /api/admin/ -> admin tabs that use it (any match grants access). */
const API_PREFIX_TABS = {
    reports: ['tab-reports'],
    analytics: ['tab-analytics'],
    users: ['tab-staff-users', 'tab-users', 'tab-doctors'],
    'user-roles': ['tab-staff-users', 'tab-users'],
    'activity-logs': ['tab-activity-logs'],
    preregistrations: ['tab-prereg-tracking'],
    'preregistration-form-config': ['tab-prereg-tracking', 'tab-reg-form'],
    'final-registrations': ['tab-final-tracking'],
    applications: ['tab-final-tracking', 'tab-applications'],
    registrations: ['tab-final-tracking', 'tab-applications', 'tab-behalf-reg'],
    'registration-overrides': ['tab-reports'],
    'registration-form-config': ['tab-reg-form'],
    'cancellation-requests': ['tab-applications', 'tab-final-tracking'],
    'competition-submissions': ['tab-competition-tracking'],
    competition: ['tab-competition-tracking'],
    'judge-communications': ['tab-competition-tracking'],
    'applicant-announcements': ['tab-announcements'],
    notices: ['tab-announcements', 'tab-site-cms'],
    'broadcast-venue-update': ['tab-announcements', 'tab-notifications'],
    payments: ['tab-admin-payments'],
    'supplemental-payments': ['tab-admin-payments'],
    orders: ['tab-admin-payments'],
    payment_gateways: ['tab-settings'],
    certificates: ['tab-certificates'],
    volunteers: ['tab-volunteers'],
    'volunteer-assignments': ['tab-volunteer-assignments'],
    case: ['tab-case-mgmt'],
    'support-ticket': ['tab-support-tickets'],
    'support-tickets': ['tab-support-tickets'],
    'support-ticket-config': ['tab-support-tickets'],
    'contact-inquiries': ['tab-contact-inquiries'],
    feedback: ['tab-feedback'],
    'feedback-form': ['tab-feedback-form'],
    email: ['tab-email-compose'],
    'e-tickets': ['tab-etickets', 'tab-final-tracking'],
    tickets: ['tab-etickets', 'tab-final-tracking'],
    scanner: ['tab-scanner-logs', 'tab-admin-checkin'],
    'live-scanner': ['tab-live-scanner', 'tab-admin-checkin'],
    pos: ['tab-pos'],
    'site-cms': ['tab-site-cms'],
    'homepage-banners': ['tab-site-cms'],
    'site-popup': ['tab-site-cms'],
    'autism-site-images': ['tab-site-cms'],
    branding: ['tab-site-cms'],
    'portal-themes': ['tab-site-cms'],
    'upload-asset': ['tab-site-cms', 'tab-announcements'],
    'upload-assets': ['tab-site-cms', 'tab-announcements'],
    'event-schedules': ['tab-seminars'],
    notifications: ['tab-notifications'],
    'notification-templates': ['tab-notifications'],
    'notification-queue': ['tab-notifications'],
    'notification-logs': ['tab-notifications'],
    'notification-events': ['tab-notifications'],
    'notification-delivery-config': ['tab-notifications'],
    'designated-notify-config': ['tab-notifications'],
    'pending-registration-reminder-config': ['tab-notifications'],
    'portal-auth-config': ['tab-portal-auth'],
    integrations: ['tab-settings'],
    global_settings: ['tab-settings'],
    'maintenance-settings': ['tab-settings'],
    'system-health': ['tab-system-platform', 'tab-system-users']
};

function parseModules(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const o = JSON.parse(String(raw));
        return o && typeof o === 'object' ? o : {};
    } catch (_) {
        return {};
    }
}

/** True when this account's tabs are limited by admin_modules. */
function hasModuleRestrictions(row) {
    if (!row || userRoles.isSuperAdminAccount(row)) return false;
    if (!userRoles.isStaffPortalAccount(row)) return false;
    const mods = parseModules(row.admin_modules);
    return Object.keys(mods).length > 0;
}

function canAccessTab(row, tabId) {
    if (!hasModuleRestrictions(row)) return true;
    let id = String(tabId || '');
    if (id === 'tab-seminar-details') id = 'tab-seminars';
    if (id === 'tab-users') id = 'tab-staff-users';
    if (ALWAYS_ALLOWED_TABS.has(id)) return true;
    return parseModules(row.admin_modules)[id] === true;
}

/** Tabs (if any) that govern an /api/admin/... path; empty = shared resource. */
function tabsForApiPath(pathname) {
    const m = /^\/api\/admin\/([^/?]+)/.exec(String(pathname || ''));
    if (!m) return [];
    return API_PREFIX_TABS[m[1]] || [];
}

function canAccessApiPath(row, pathname) {
    if (!hasModuleRestrictions(row)) return true;
    const tabs = tabsForApiPath(pathname);
    if (!tabs.length) return true;
    return tabs.some((t) => canAccessTab(row, t));
}

function actingAdminIdFromRequest(req) {
    const q = req.query || {};
    const b = req.body || {};
    const raw =
        q.actingAdminId != null
            ? q.actingAdminId
            : q.adminUserId != null
              ? q.adminUserId
              : q.adminId != null
                ? q.adminId
                : b.actingAdminId != null
                  ? b.actingAdminId
                  : b.adminUserId != null
                    ? b.adminUserId
                    : b.adminId != null
                      ? b.adminId
                      : req.get('x-acting-admin-id');
    const id = parseInt(raw, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Express middleware for /api/admin/*: when the acting staff account has
 * configured modules, block API paths that belong to tabs it cannot access.
 */
function createModuleAccessMiddleware(db) {
    return function adminModuleAccess(req, res, next) {
        const fullPath = String(req.baseUrl || '') + String(req.path || '');
        if (fullPath === '/api/admin/my-modules') return next();
        const tabs = tabsForApiPath(fullPath);
        if (!tabs.length) return next();
        const actorId = actingAdminIdFromRequest(req);
        if (!actorId) return next();
        db.get(
            `SELECT id, role, user_role, admin_modules FROM users WHERE id = ?`,
            [actorId],
            (err, row) => {
                if (err || !row) return next();
                if (canAccessApiPath(row, fullPath)) return next();
                res.status(403).json({
                    error: 'You do not have access to this module. Ask the super administrator to enable it under Staff users → Modules.',
                    moduleDenied: true
                });
            }
        );
    };
}

module.exports = {
    ALWAYS_ALLOWED_TABS,
    API_PREFIX_TABS,
    parseModules,
    hasModuleRestrictions,
    canAccessTab,
    tabsForApiPath,
    canAccessApiPath,
    actingAdminIdFromRequest,
    createModuleAccessMiddleware
};
