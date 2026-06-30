/**
 * Per-seminar registration flow flags stored in registration_form_json.flow.
 */

function parseRegistrationFormConfig(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            return JSON.parse(raw);
        } catch (_) {
            return {};
        }
    }
    return {};
}

function parseRegistrationFormFlow(raw) {
    const parsed = parseRegistrationFormConfig(raw);
    return parsed && typeof parsed.flow === 'object' ? parsed.flow : {};
}

function flowFlagBool(flow, key, defaultValue) {
    if (!flow || typeof flow !== 'object') return defaultValue;
    if (!Object.prototype.hasOwnProperty.call(flow, key)) return defaultValue;
    return flow[key] === true;
}

function hasExplicitFlowFlags(flow) {
    if (!flow || typeof flow !== 'object') return false;
    return (
        Object.prototype.hasOwnProperty.call(flow, 'preregistrationRequired') ||
        Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationRequired') ||
        Object.prototype.hasOwnProperty.call(flow, 'publicPreregEnabled') ||
        Object.prototype.hasOwnProperty.call(flow, 'mainRegistrationOpen') ||
        Object.prototype.hasOwnProperty.call(flow, 'autoAcceptPreregistration') ||
        Object.prototype.hasOwnProperty.call(flow, 'autoAcceptRegistration') ||
        Object.prototype.hasOwnProperty.call(flow, 'publicPreregSearchEnabled')
    );
}

function seminarFlowFlagsFromFlowObject(flow) {
    if (!hasExplicitFlowFlags(flow)) {
        return {
            preregistrationRequired: true,
            mainRegistrationRequired: true,
            mainRegistrationOpen: true,
            autoAcceptPreregistration: false,
            autoAcceptRegistration: false,
            publicPreregEnabled: false,
            publicPreregSearchEnabled: false
        };
    }
    const flags = {
        preregistrationRequired: flowFlagBool(flow, 'preregistrationRequired', true),
        mainRegistrationRequired: flowFlagBool(flow, 'mainRegistrationRequired', true),
        autoAcceptPreregistration: flowFlagBool(flow, 'autoAcceptPreregistration', false),
        autoAcceptRegistration: flowFlagBool(flow, 'autoAcceptRegistration', false),
        publicPreregEnabled: flowFlagBool(flow, 'publicPreregEnabled', false),
        publicPreregSearchEnabled: flowFlagBool(flow, 'publicPreregSearchEnabled', false),
        publicPreregSearchStart: flow && flow.publicPreregSearchStart ? String(flow.publicPreregSearchStart).trim() : '',
        publicPreregSearchEnd: flow && flow.publicPreregSearchEnd ? String(flow.publicPreregSearchEnd).trim() : ''
    };
    flags.mainRegistrationOpen = resolveMainRegistrationOpen(flow, flags);
    return flags;
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
    return seminarFlowFlagsFromFlowObject(parseRegistrationFormFlow(raw));
}

function mergeSeminarFlowIntoRegistrationFormJson(registrationFormJson, seminarFlow) {
    if (!seminarFlow || typeof seminarFlow !== 'object') {
        return registrationFormJson != null && String(registrationFormJson).trim()
            ? String(registrationFormJson).trim()
            : null;
    }
    const cfg = parseRegistrationFormConfig(registrationFormJson);
    if (!cfg.flow || typeof cfg.flow !== 'object') cfg.flow = {};
    cfg.flow = Object.assign({}, cfg.flow, seminarFlow);
    return JSON.stringify(cfg);
}

function finalizeRegistrationFormJsonForStorage(existingRaw, incomingRaw, seminarFlow) {
    const merged = mergeRegistrationFormJsonForStorage(existingRaw, incomingRaw);
    return mergeSeminarFlowIntoRegistrationFormJson(merged, seminarFlow);
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
    const cfg = parseRegistrationFormConfig(registrationFormJson);
    if (!cfg.flow || typeof cfg.flow !== 'object') cfg.flow = {};
    cfg.flow.mainRegistrationOpen = open === true;
    return JSON.stringify(cfg);
}

function mergeRegistrationFormJsonForStorage(existingRaw, incomingRaw) {
    const existing = parseRegistrationFormConfig(existingRaw);
    if (!incomingRaw || (typeof incomingRaw === 'string' && !String(incomingRaw).trim())) {
        return existingRaw && String(existingRaw).trim() ? String(existingRaw).trim() : null;
    }
    const incoming = parseRegistrationFormConfig(incomingRaw);
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
    flowFlagBool,
    hasExplicitFlowFlags,
    seminarFlowFlagsFromFlowObject,
    hasSeminarScheduleDate,
    registrationScheduleWindowState,
    preregistrationWindowState,
    mainRegistrationWindowState,
    effectiveMainRegistrationWindowState,
    resolveMainRegistrationOpen,
    seminarFlowFlagsFromRegistrationFormJson,
    mergeMainRegistrationOpenIntoFormJson,
    mergeSeminarFlowIntoRegistrationFormJson,
    finalizeRegistrationFormJsonForStorage,
    mergeRegistrationFormJsonForStorage
};
