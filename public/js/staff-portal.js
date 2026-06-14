/**
 * Limited-access staff portal at /staff — co-admins and programme staff.
 * Reuses admin.html + admin.js with restricted modules and separate sign-in gate.
 */
(function () {
    'use strict';

    const path = String(window.location.pathname || '').replace(/\/$/, '');
    if (path !== '/staff' && path !== '/staff.html') return;

    window.PORTAL_IS_STAFF = true;

    /** Super-admin-only modules — never shown on the staff portal. */
    window.STAFF_PORTAL_SUPER_ADMIN_ONLY = new Set([
        'tab-staff-users',
        'tab-settings',
        'tab-system-platform',
        'tab-system-users',
        'tab-site-cms',
        'tab-notifications',
        'tab-reg-form',
        'tab-feedback-form',
        'tab-activity-logs',
        'tab-reports',
        'tab-analytics',
        'tab-case-mgmt',
        'tab-volunteers',
        'tab-volunteer-assignments',
        'tab-certificates',
        'tab-transfer',
        'tab-behalf-reg',
        'tab-email-compose'
    ]);

    function staffPortalAccountOk(user) {
        if (!user || user.id == null) return false;
        if (typeof UserRoles !== 'undefined' && UserRoles.isSuperAdminAccount && UserRoles.isSuperAdminAccount(user)) {
            return false;
        }
        if (typeof UserRoles !== 'undefined' && UserRoles.isStaffPortalAccount) {
            return UserRoles.isStaffPortalAccount(user);
        }
        const ur = String(user.user_role || '').toLowerCase();
        const r = String(user.role || '').toLowerCase();
        if (r === 'admin' && ur === 'co_admin') return true;
        return ['co_admin', 'scanner_dashboard_user', 'reviewer', 'scanner_portal_user'].includes(ur);
    }

    window.staffPortalAccountOk = staffPortalAccountOk;

    function applyStaffPortalBranding() {
        document.title = 'Staff portal | Autism Awareness Programme';
        document.body.classList.add('ak-portal-staff');

        const badge = document.querySelector('.ak-login-badge');
        if (badge) badge.innerHTML = '<i class="fas fa-users-gear" aria-hidden="true"></i> Programme staff';

        const heading = document.querySelector('.ak-login-header h1');
        if (heading) heading.textContent = 'Staff portal';

        const lead = document.querySelector('.ak-login-header p');
        if (lead) {
            lead.textContent =
                'Sign in with your co-admin or staff account to manage registrations, tracking, and check-in tools assigned to you.';
        }

        const sidebarTitle = document.querySelector('.sidebar-header h2');
        if (sidebarTitle) sidebarTitle.textContent = 'Staff portal';

        const sidebarLead = document.querySelector('.sidebar-header p');
        if (sidebarLead) sidebarLead.textContent = 'Limited programme access';

        const topTitle = document.querySelector('.top-header h2');
        if (topTitle) {
            const yearBadge = document.getElementById('admin-portal-year-badge');
            topTitle.textContent = 'Staff workspace ';
            if (yearBadge) topTitle.appendChild(yearBadge);
        }

        const footer = document.querySelector('.ak-login-footer');
        if (footer && !document.getElementById('ak-staff-admin-link')) {
            const link = document.createElement('a');
            link.id = 'ak-staff-admin-link';
            link.href = '/admin';
            link.style.cssText = 'display:block;margin-top:10px;color:#64748b;font-size:0.85rem;';
            link.innerHTML = '<i class="fas fa-user-shield" aria-hidden="true"></i> Super administrator? Sign in at admin console';
            footer.appendChild(link);
        }
    }

    function ensureStaffPortalLandingTab() {
        const items = Array.from(document.querySelectorAll('.menu-item[data-admin-module]')).filter(
            (el) => !el.classList.contains('hidden')
        );
        if (!items.length) return;
        if (document.querySelector('.menu-item.active:not(.hidden)')) return;
        const tabId = items[0].getAttribute('data-admin-module');
        if (!tabId || typeof window.switchTab !== 'function') return;
        window.switchTab(tabId);
        document.querySelectorAll('.menu-item').forEach((m) => m.classList.remove('active'));
        items[0].classList.add('active');
    }

    window.ensureStaffPortalLandingTab = ensureStaffPortalLandingTab;

    function guardStaffPortalSession() {
        if (!localStorage.getItem('admin_auth')) return;
        let user = null;
        try {
            user = JSON.parse(localStorage.getItem('admin_user') || 'null');
        } catch (_) {}
        if (!staffPortalAccountOk(user)) {
            localStorage.removeItem('admin_auth');
            localStorage.removeItem('admin_user');
            const err = document.getElementById('admin-login-error');
            if (err) {
                err.textContent =
                    'This account uses the admin console at /admin, not the staff portal. Sign in with a co-admin or staff account.';
                err.style.display = 'block';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        applyStaffPortalBranding();
        guardStaffPortalSession();
    });
})();
