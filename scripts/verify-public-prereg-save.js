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

const seminarFlow = {
    preregistrationRequired: true,
    mainRegistrationRequired: true,
    mainRegistrationOpen: false,
    autoAcceptPreregistration: false,
    autoAcceptRegistration: false,
    publicPreregEnabled: true
};

const stored = flow.finalizeRegistrationFormJsonForStorage(existing, incomingFromClient, seminarFlow);
const flags = flow.seminarFlowFlagsFromRegistrationFormJson(stored);
assert(flags.publicPreregEnabled === true, 'publicPreregEnabled should persist after PUT merge');

const fieldsOnly = JSON.stringify({ version: 1, fields: [{ key: 'parent_name', enabled: true }] });
const storedFromBodyFlow = flow.finalizeRegistrationFormJsonForStorage(existing, fieldsOnly, seminarFlow);
assert(
    flow.seminarFlowFlagsFromRegistrationFormJson(storedFromBodyFlow).publicPreregEnabled === true,
    'seminar_flow body should persist even when registration_form_json has no flow'
);

const publicOnlyFlow = JSON.stringify({ flow: { publicPreregEnabled: true } });
const publicOnlyFlags = flow.seminarFlowFlagsFromRegistrationFormJson(publicOnlyFlow);
assert(publicOnlyFlags.publicPreregEnabled === true, 'publicPreregEnabled alone should be read');
assert(publicOnlyFlags.preregistrationRequired === true, 'missing preregistrationRequired should default true');

console.log('OK: public pre-reg flow flag save/load verified');
