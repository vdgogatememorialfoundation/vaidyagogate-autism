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
    return false;
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

function effectiveMainRegistrationWindowState(seminar, seminarDt, flowFlags) {
    const flags = flowFlags || seminarFlowFlagsFromRegistrationFormJson(seminar && seminar.registration_form_json);
    if (flags.preregistrationRequired && flags.mainRegistrationRequired && !flags.mainRegistrationOpen) {
        return { state: 'admin_closed', open: false, reason: 'main_not_open' };
    }
    return mainRegistrationWindowState(seminar, seminarDt);
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

function mergeRegistrationFormJsonForStorage(existingRaw, incomingRaw) {
    let existing = {};
    let incoming = {};
    try {
        existing = existingRaw && String(existingRaw).trim() ? JSON.parse(existingRaw) : {};
    } catch (_) {
        existing = {};
    }
    if (!incomingRaw || !String(incomingRaw).trim()) {
        return existingRaw && String(existingRaw).trim() ? String(existingRaw).trim() : null;
    }
    try {
        incoming = JSON.parse(incomingRaw);
    } catch (_) {
        incoming = {};
    }
    const merged = Object.assign({}, existing, incoming);
    if (Array.isArray(incoming.fields)) merged.fields = incoming.fields;
    else if (Array.isArray(existing.fields)) merged.fields = existing.fields;
    if (incoming.birthYearMin != null) merged.birthYearMin = incoming.birthYearMin;
    else if (existing.birthYearMin != null) merged.birthYearMin = existing.birthYearMin;
    if (incoming.birthYearMax != null) merged.birthYearMax = incoming.birthYearMax;
    else if (existing.birthYearMax != null) merged.birthYearMax = existing.birthYearMax;
    if (incoming.flow || existing.flow) {
        merged.flow = Object.assign({}, existing.flow || {}, incoming.flow || {});
    }
    return JSON.stringify(merged);
}

module.exports = {
    parseRegistrationFormFlow,
    hasExplicitFlowFlags,
    hasSeminarScheduleDate,
    registrationScheduleWindowState,
    preregistrationWindowState,
    mainRegistrationWindowState,
    effectiveMainRegistrationWindowState,
    resolveMainRegistrationOpen,
    seminarFlowFlagsFromRegistrationFormJson,
    mergeMainRegistrationOpenIntoFormJson,
    mergeRegistrationFormJsonForStorage
};
