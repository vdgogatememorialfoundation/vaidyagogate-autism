/**
 * Parser and lookup checks for the public certificate ID API. No database required.
 */
const assert = require('assert');
const certVerify = require('../lib/certificate-verify');

assert.strictEqual(certVerify.formatPublicCertificateId(12, 345, 'participant'), 'CERT-P-12-345');
assert.strictEqual(certVerify.formatPublicCertificateId(4, 8, 'volunteer'), 'CERT-V-4-8');
assert.strictEqual(certVerify.formatPublicCertificateId(0, 1, 'participant'), '');

const parsed = certVerify.parsePublicCertificateId(' cert-p-12-345 ');
assert.deepStrictEqual(parsed, { kind: 'participant', seminarId: 12, certId: 345, legacy: false });
assert.strictEqual(certVerify.parsePublicCertificateId('CERT-V-4-8').kind, 'volunteer');
assert.deepStrictEqual(certVerify.parsePublicCertificateId('CERT-9-2'), {
    kind: null,
    seminarId: 9,
    certId: 2,
    legacy: true
});
assert.strictEqual(certVerify.parsePublicCertificateId('not-an-id'), null);

function fakeDb(rows) {
    return {
        get(sql, params, cb) {
            const volunteer = /volunteer_certificates/.test(sql);
            const key = (volunteer ? 'volunteer' : 'participant') + ':' + params[1] + ':' + params[0];
            cb(null, rows[key] || null);
        }
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
            'participant:12:345': {
                id: 345,
                seminar_id: 12,
                enabled: 1,
                display_name: 'Parent Name',
                form_data: JSON.stringify({ child_name: 'Aarav Sharma' }),
                application_no: 'APP100',
                user_id_string: 'PRN100',
                seminar_title: 'Autism Awareness Day',
                event_date: '2026-04-02',
                created_at: '2026-04-03T10:00:00.000Z'
            }
        }),
        'CERT-P-12-345'
    );
    assert.strictEqual(issued.httpStatus, 200);
    assert.strictEqual(issued.body.valid, true);
    assert.strictEqual(issued.body.certificate.certificateId, 'CERT-P-12-345');
    assert.strictEqual(issued.body.certificate.holderName, 'Aarav Sharma');
    assert.strictEqual(issued.body.certificate.type, 'participant');
    assert.strictEqual(issued.body.certificate.event.title, 'Autism Awareness Day');
    assert.ok(!('email' in issued.body.certificate));

    const missing = await lookup(fakeDb({}), 'CERT-P-1-1');
    assert.strictEqual(missing.httpStatus, 404);
    assert.strictEqual(missing.body.code, 'NOT_FOUND');
    assert.strictEqual(missing.body.valid, false);

    const draft = await lookup(
        fakeDb({
            'volunteer:4:8': { id: 8, seminar_id: 4, enabled: 0, display_name: 'Hidden' }
        }),
        'CERT-V-4-8'
    );
    assert.strictEqual(draft.body.code, 'NOT_ISSUED');
    assert.ok(!draft.body.certificate);

    const ambiguous = await lookup(
        fakeDb({
            'participant:9:2': { id: 2, seminar_id: 9, enabled: 1, display_name: 'A' },
            'volunteer:9:2': { id: 2, seminar_id: 9, enabled: 1, display_name: 'B' }
        }),
        'CERT-9-2'
    );
    assert.strictEqual(ambiguous.httpStatus, 409);
    assert.strictEqual(ambiguous.body.code, 'AMBIGUOUS');

    const legacy = await lookup(
        fakeDb({
            'participant:9:2': {
                id: 2,
                seminar_id: 9,
                enabled: 1,
                display_name: 'Only Participant',
                seminar_title: 'Event',
                event_date: '2026-01-01'
            }
        }),
        'CERT-9-2'
    );
    assert.strictEqual(legacy.httpStatus, 200);
    assert.strictEqual(legacy.body.certificate.certificateId, 'CERT-P-9-2');

    const bad = await lookup(fakeDb({}), 'hello');
    assert.strictEqual(bad.httpStatus, 400);
    assert.strictEqual(bad.body.code, 'INVALID_ID');

    assert.strictEqual(certVerify.allowPublicCertificateVerify('test-ip', 2, 60000), true);
    assert.strictEqual(certVerify.allowPublicCertificateVerify('test-ip', 2, 60000), true);
    assert.strictEqual(certVerify.allowPublicCertificateVerify('test-ip', 2, 60000), false);

    console.log('[test-certificate-public-id] OK');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
