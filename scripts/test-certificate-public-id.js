/**
 * Parser, sequence, and lookup checks for 12-digit certificate IDs. No database required.
 */
const assert = require('assert');
const certVerify = require('../lib/certificate-verify');

assert.strictEqual(certVerify.CERTIFICATE_SERIES_START, 200284);
assert.strictEqual(certVerify.formatPublicCertificateId(200284), '000000200284');
assert.strictEqual(certVerify.formatPublicCertificateId(200285), '000000200285');
assert.strictEqual(certVerify.formatPublicCertificateId('000000200284'), '000000200284');
assert.strictEqual(certVerify.formatPublicCertificateId(200283), '');

assert.deepStrictEqual(certVerify.parsePublicCertificateId('000000200284'), {
    numeric: '000000200284',
    kind: null,
    legacy: false
});
assert.strictEqual(certVerify.parsePublicCertificateId('200284').numeric, '000000200284');
assert.strictEqual(certVerify.parsePublicCertificateId('200283'), null);
assert.strictEqual(certVerify.parsePublicCertificateId('CERT-P-12-345').kind, 'participant');
assert.strictEqual(certVerify.parsePublicCertificateId('CERT-V-4-8').seminarId, 4);
assert.deepStrictEqual(certVerify.parsePublicCertificateId('CERT-9-2'), {
    kind: null,
    seminarId: 9,
    certId: 2,
    legacy: true
});
assert.strictEqual(certVerify.parsePublicCertificateId('not-an-id'), null);

function fakeDb(rows) {
    const state = { next: 200284, saved: {} };
    return {
        get(sql, params, cb) {
            if (/certificate_id_seq/.test(sql)) {
                state.next += 1;
                return cb(null, { next_no: state.next });
            }
            if (/SELECT public_certificate_no/.test(sql)) {
                const table = /volunteer_certificates/.test(sql) ? 'volunteer' : 'participant';
                return cb(null, { public_certificate_no: state.saved[table + ':' + params[0]] || null });
            }
            if (/public_certificate_no = \?/.test(sql)) {
                const volunteer = /volunteer_certificates/.test(sql);
                const key = (volunteer ? 'volunteer:' : 'participant:') + params[0];
                return cb(null, rows[key] || null);
            }
            const volunteer = /volunteer_certificates/.test(sql);
            const key = (volunteer ? 'volunteer' : 'participant') + ':' + params[1] + ':' + params[0];
            cb(null, rows[key] || null);
        },
        run(sql, params, cb) {
            if (typeof params === 'function') cb = params;
            if (/SET public_certificate_no/.test(sql)) {
                const table = /volunteer_certificates/.test(sql) ? 'volunteer' : 'participant';
                state.saved[table + ':' + params[1]] = params[0];
            }
            if (cb) cb(null);
        },
        state
    };
}

function lookup(db, id) {
    return new Promise((resolve, reject) => {
        certVerify.lookupCertificateByPublicId(db, id, (err, out) => (err ? reject(err) : resolve(out)));
    });
}

(async () => {
    const issued = await lookup(
        fakeDb({
            'participant:000000200284': {
                id: 345,
                seminar_id: 12,
                enabled: 1,
                public_certificate_no: '000000200284',
                display_name: 'Parent Name',
                form_data: JSON.stringify({ child_name: 'Aarav Sharma' }),
                application_no: 'APP100',
                user_id_string: 'PRN100',
                seminar_title: 'Autism Awareness Day',
                event_date: '2026-04-02',
                created_at: '2026-04-03T10:00:00.000Z'
            }
        }),
        '200284'
    );
    assert.strictEqual(issued.httpStatus, 200);
    assert.strictEqual(issued.body.valid, true);
    assert.strictEqual(issued.body.certificate.certificateId, '000000200284');
    assert.strictEqual(issued.body.certificate.holderName, 'Aarav Sharma');
    assert.strictEqual(issued.body.certificate.type, 'participant');
    assert.ok(!('email' in issued.body.certificate));

    const missing = await lookup(fakeDb({}), '000000200299');
    assert.strictEqual(missing.httpStatus, 404);
    assert.strictEqual(missing.body.code, 'NOT_FOUND');

    const draft = await lookup(
        fakeDb({
            'volunteer:000000200285': {
                id: 8,
                seminar_id: 4,
                enabled: 0,
                public_certificate_no: '000000200285',
                display_name: 'Hidden'
            }
        }),
        '000000200285'
    );
    assert.strictEqual(draft.body.code, 'NOT_ISSUED');
    assert.ok(!draft.body.certificate);

    const legacyDb = fakeDb({
        'participant:9:2': {
            id: 2,
            seminar_id: 9,
            enabled: 1,
            public_certificate_no: '000000200290',
            display_name: 'Only Participant',
            seminar_title: 'Event',
            event_date: '2026-01-01'
        }
    });
    const legacy = await lookup(legacyDb, 'CERT-9-2');
    assert.strictEqual(legacy.httpStatus, 200);
    assert.strictEqual(legacy.body.certificate.certificateId, '000000200290');

    const bad = await lookup(fakeDb({}), 'hello');
    assert.strictEqual(bad.httpStatus, 400);
    assert.strictEqual(bad.body.code, 'INVALID_ID');

    const allocDb = fakeDb({});
    const assigned = await new Promise((resolve, reject) => {
        allocDb.run = function (sql, params, cb) {
            if (typeof params === 'function') cb = params;
            if (/SET public_certificate_no/.test(sql)) this.saved = params[0];
            if (cb) cb(null);
        };
        allocDb.get = function (sql, params, cb) {
            if (/certificate_id_seq/.test(sql)) {
                this.next = (this.next || 200284) + 1;
                return cb(null, { next_no: this.next });
            }
            if (/SELECT public_certificate_no/.test(sql)) {
                return cb(null, { public_certificate_no: this.saved || null });
            }
            cb(null, null);
        };
        certVerify.ensurePublicCertificateNo(allocDb, 'participant', 7, (err, no) => (err ? reject(err) : resolve(no)));
    });
    assert.strictEqual(assigned, '000000200284');

    assert.strictEqual(certVerify.allowPublicCertificateVerify('test-ip-12', 2, 60000), true);
    assert.strictEqual(certVerify.allowPublicCertificateVerify('test-ip-12', 2, 60000), true);
    assert.strictEqual(certVerify.allowPublicCertificateVerify('test-ip-12', 2, 60000), false);

    console.log('[test-certificate-public-id] OK');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
