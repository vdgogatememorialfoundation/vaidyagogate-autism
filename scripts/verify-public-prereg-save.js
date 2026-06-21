/**
 * Verifies public pre-reg flow flag survives client merge + server storage merge.
 * Run: node scripts/verify-public-prereg-save.js
 */
const flow = require('../lib/seminar-registration-flow');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

const existing = JSON.stringify({
    version: 1,
    fields: [{ key: 'parent_name', label: 'Name', enabled: true }],
    flow: {
        preregistrationRequired: true,
        mainRegistrationRequired: true,
        publicPreregEnabled: false
    }
});

const incomingFromClient = JSON.stringify({
    version: 1,
    fields: [{ key: 'parent_name', label: 'Name', enabled: true }],
    flow: {
        preregistrationRequired: true,
        mainRegistrationRequired: true,
        mainRegistrationOpen: false,
        autoAcceptPreregistration: false,
        autoAcceptRegistration: false,
        publicPreregEnabled: true
    }
});

const stored = flow.mergeRegistrationFormJsonForStorage(existing, incomingFromClient);
const flags = flow.seminarFlowFlagsFromRegistrationFormJson(stored);
assert(flags.publicPreregEnabled === true, 'publicPreregEnabled should persist after PUT merge');

const roundTrip = flow.seminarFlowFlagsFromRegistrationFormJson(JSON.parse(stored));
assert(roundTrip.publicPreregEnabled === true, 'reload should read publicPreregEnabled true');

const objectInput = JSON.parse(stored);
assert(
    flow.seminarFlowFlagsFromRegistrationFormJson(objectInput).publicPreregEnabled === true,
    'object-shaped registration_form_json should parse'
);

console.log('OK: public pre-reg flow flag save/load verified');
