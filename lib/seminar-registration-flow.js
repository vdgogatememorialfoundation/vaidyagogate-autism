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

function hasSeminarScheduleDate(val) {
    return val != null && String(val).trim() !== '';
}

function registrationScheduleWindowState(seminar, startKey, endKey, parseStartMs, parseEndMs) {
    const startRaw = seminar && seminar[startKey];
    const endRaw = seminar && seminar[endKey];
    if (!hasSeminarScheduleDate(startRaw) || !hasSeminarScheduleDate(endRaw)) {
        return { state: 'unscheduled', open: false, reason: 'schedule_not_set' };
    }
    const startMs = parseStartMs(startRaw);
    const endMs = parseEndMs(endRaw);
    if (startMs == null || Number.isNaN(startMs) || endMs == null || Number.isNaN(endMs)) {
        return { state: 'unscheduled', open: false, reason: 'schedule_not_set' };
    }
    const now = Date.now();
    if (now < startMs) {
        return { state: 'upcoming', open: false, reason: 'not_started', opensAt: startMs };
    }
    if (now > endMs) {
        return { state: 'closed', open: false, reason: 'closed' };
    }
    return { state: 'open', open: true };
}

function preregistrationWindowState(seminar, seminarDt) {
    return registrationScheduleWindowState(
        seminar,
        'preregistration_start',
        'preregistration_end',
        seminarDt.parseSeminarMs,
        seminarDt.parseRegistrationEndMs
    );
}

function mainRegistrationWindowState(seminar, seminarDt) {
    return registrationScheduleWindowState(
        seminar,
        'registration_start',
        'registration_end',
        seminarDt.parseSeminarMs,
        seminarDt.parseRegistrationEndMs
    );
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
    hasSeminarScheduleDate,
    registrationScheduleWindowState,
    preregistrationWindowState,
    mainRegistrationWindowState,
    resolveMainRegistrationOpen,
    seminarFlowFlagsFromRegistrationFormJson,
    mergeMainRegistrationOpenIntoFormJson
};
