/**
 * Per-seminar registration flow flags stored in registration_form_json.flow.
 */

function parseRegistrationFormFlow(raw) {
    try {
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed.flow === 'object' ? parsed.flow : {};
    } catch (_) {
        return {};
    }
}

function hasExplicitFlowFlags(flow) {
    return (
        Object.prototype.hasOwnProperty.call(flow, 'preregistrationRequired') ||
        Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationRequired')
    );
}

function resolveMainRegistrationOpen(flow, flags) {
    if (!flags.mainRegistrationRequired) return false;
    if (!flags.preregistrationRequired) return true;
    if (Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationOpen')) {
        return flow.mainRegistrationOpen === true;
    }
    return true;
}

function seminarFlowFlagsFromRegistrationFormJson(raw) {
    const flow = parseRegistrationFormFlow(raw);
    const hasFlow = hasExplicitFlowFlags(flow);
    if (!hasFlow) {
        return {
            preregistrationRequired: true,
            mainRegistrationRequired: true,
            mainRegistrationOpen: true,
            autoAcceptPreregistration: false,
            autoAcceptRegistration: false
        };
    }
    const flags = {
        preregistrationRequired: flow.preregistrationRequired === true,
        mainRegistrationRequired: flow.mainRegistrationRequired === true,
        autoAcceptPreregistration: flow.autoAcceptPreregistration === true,
        autoAcceptRegistration: flow.autoAcceptRegistration === true
    };
    flags.mainRegistrationOpen = resolveMainRegistrationOpen(flow, flags);
    return flags;
}

function mergeMainRegistrationOpenIntoFormJson(registrationFormJson, open) {
    let cfg = {};
    try {
        cfg = registrationFormJson ? JSON.parse(registrationFormJson) : {};
    } catch (_) {
        cfg = {};
    }
    if (!cfg.flow || typeof cfg.flow !== 'object') cfg.flow = {};
    cfg.flow.mainRegistrationOpen = open === true;
    return JSON.stringify(cfg);
}

module.exports = {
    parseRegistrationFormFlow,
    hasExplicitFlowFlags,
    resolveMainRegistrationOpen,
    seminarFlowFlagsFromRegistrationFormJson,
    mergeMainRegistrationOpenIntoFormJson
};
