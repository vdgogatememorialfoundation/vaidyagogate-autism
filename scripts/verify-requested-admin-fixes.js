'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { registerLiveScannerRoutes } = require('../lib/routes-live-scanner');
const exportReports = require('../lib/export-reports');
const { normalizePreregAccountEmailRows } = require('../lib/autism-portal');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function verifyMobileMenu() {
    const html = read('public/admin.html');
    const js = read('public/js/admin.js');
    const css = read('public/css/responsive-portals.css');
    assert.match(html, /id="admin-menu-toggle"/);
    assert.match(html, /class="fas fa-bars"/);
    assert.match(html, /id="admin-nav-backdrop"/);
    assert.match(html, /id="admin-sidebar"/);
    assert.match(js, /function initAdminMobileNav\(/);
    assert.match(js, /classList\.add\('mobile-open'\)/);
    assert.match(css, /\.admin-menu-toggle/);
    assert.match(css, /body\.admin-nav-open/);
}

function verifyCheckinDateAndAttendanceUi() {
    const html = read('public/admin-live-scanner.html');
    const js = read('public/js/admin-live-scanner.js');
    const css = read('public/css/admin-live-scanner.css');
    assert.match(html, /id="live-attendance-list"/);
    assert.match(html, /portal-datetime\.js/);
    assert.match(js, /seminar\.checkin_date \|\| seminar\.event_date/);
    assert.match(js, /Check-in date:/);
    assert.match(js, /\/api\/admin\/live-scanner\/attendance/);
    assert.match(css, /\.kiosk-board-layout/);
    assert.match(css, /\.kiosk-attendance-panel/);
}

function verifyAttendanceRoute() {
    const routes = new Map();
    const app = {
        get(route, handler) {
            routes.set(route, handler);
        }
    };
    let captured = null;
    const db = {
        all(sql, params, cb) {
            captured = { sql, params };
            cb(null, [
                {
                    registration_id: 9,
                    first_name: 'Test',
                    last_name: 'Attendee',
                    application_no: 'APP-9',
                    scan_time: null
                }
            ]);
        },
        get() {
            throw new Error('Unexpected db.get in attendance route test');
        }
    };
    registerLiveScannerRoutes(app, {
        db,
        requireAdminActor(req, res, next) {
            next();
        }
    });
    const handler = routes.get('/api/admin/live-scanner/attendance');
    assert.equal(typeof handler, 'function');
    let payload = null;
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            payload = value;
            return value;
        }
    };
    handler({ query: { seminarId: '22' } }, res);
    assert.deepStrictEqual(captured.params, [22]);
    assert.match(captured.sql, /r\.seminar_id = \?/);
    assert.match(captured.sql, /LOWER\(r\.status\) = 'checked_in'/);
    assert.equal(payload.attendees.length, 1);
}

function verifyPosVisibility() {
    const adminHtml = read('public/admin.html');
    const adminAutism = read('public/js/admin-autism.js');
    const terminology = read('public/js/autism-terminology.js');
    const adminJs = read('public/js/admin.js');
    assert.match(adminHtml, /data-admin-module="tab-pos"/);
    assert.doesNotMatch(adminAutism, /HIDE_MODULES\s*=\s*\[[^\]]*tab-pos/);
    assert.doesNotMatch(terminology, /hideModules\s*=\s*\[[^\]]*tab-pos/);
    assert.match(adminJs, /autismPortalTabs[\s\S]*?'tab-pos'/);
}

function verifyMainRegistrationExport() {
    const spec = exportReports.REPORT_QUERIES.main_registrations;
    assert.ok(spec);
    assert.equal(spec.title, 'Main registration list');
    assert.match(spec.sql, /FROM registrations r/);
    assert.match(spec.sql, /r\.form_data/);
    assert.doesNotMatch(spec.sql, /JOIN orders/);
    assert.doesNotMatch(spec.sql, /JOIN tickets/);
    assert.doesNotMatch(spec.sql, /payment_date|ticket_id_string|is_scanned/);
}

function verifyStaffPreregSchemaFix() {
    const source = read('lib/autism-portal.js');
    const start = source.indexOf("app.post('/api/admin/preregistrations/send-all-account-emails'");
    const end = source.indexOf("app.post('/api/admin/preregistrations/import-tsv'", start);
    assert.ok(start >= 0 && end > start);
    const handler = source.slice(start, end);
    assert.doesNotMatch(handler, /p\.(email|first_name|last_name|phone)/);
    assert.match(handler, /p\.form_data/);
    assert.match(handler, /u\.email AS user_email/);
    assert.match(handler, /normalizePreregAccountEmailRows\(rows\)/);
    assert.match(handler, /CURRENT_TIMESTAMP/);

    const normalized = normalizePreregAccountEmailRows([
        {
            id: 1,
            user_email: '',
            user_first_name: '',
            user_last_name: '',
            user_phone: '',
            form_data: JSON.stringify({
                parent_name: 'Asha Patel',
                contact_email: 'ASHA@EXAMPLE.COM',
                contact_phone: '9876543210'
            })
        },
        { id: 2, user_email: '', form_data: '{}' }
    ]);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].email, 'asha@example.com');
    assert.equal(normalized[0].first_name, 'Asha');
    assert.equal(normalized[0].last_name, 'Patel');
    assert.equal(normalized[0].phone, '9876543210');
}

verifyMobileMenu();
verifyCheckinDateAndAttendanceUi();
verifyAttendanceRoute();
verifyPosVisibility();
verifyMainRegistrationExport();
verifyStaffPreregSchemaFix();

console.log('Requested admin/staff fixes verified successfully.');
