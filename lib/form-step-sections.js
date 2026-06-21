/**
 * Step section titles/subtitles for multi-step registration and pre-registration forms.
 */
const DEFAULT_PREREG_STEP_SECTIONS = [
    { step: 1, title: 'Parent', subtitle: '' },
    { step: 2, title: 'Child', subtitle: '' },
    { step: 3, title: 'Address', subtitle: '' },
    { step: 4, title: 'Questions', subtitle: '' }
];

const DEFAULT_MAIN_REG_STEP_SECTIONS = [
    { step: 1, title: 'Personal details', subtitle: '' },
    { step: 2, title: 'Address', subtitle: '' },
    { step: 3, title: 'Programme details', subtitle: '' },
    { step: 4, title: 'Terms & confirmation', subtitle: '' }
];

function normalizeStepSections(raw, fallback) {
    const fb = Array.isArray(fallback) && fallback.length ? fallback : [];
    const src = Array.isArray(raw) && raw.length ? raw : fb;
    const byStep = {};
    fb.forEach((s) => {
        if (!s || s.step == null) return;
        const n = parseInt(s.step, 10);
        if (Number.isNaN(n) || n < 1) return;
        byStep[n] = {
            step: n,
            title: String(s.title || `Step ${n}`).trim() || `Step ${n}`,
            subtitle: String(s.subtitle || '').trim()
        };
    });
    src.forEach((s) => {
        if (!s || s.step == null) return;
        const n = parseInt(s.step, 10);
        if (Number.isNaN(n) || n < 1) return;
        const prev = byStep[n] || { step: n, title: `Step ${n}`, subtitle: '' };
        byStep[n] = {
            step: n,
            title: s.title != null && String(s.title).trim() ? String(s.title).trim() : prev.title,
            subtitle: s.subtitle != null ? String(s.subtitle).trim() : prev.subtitle
        };
    });
    return Object.keys(byStep)
        .map((k) => byStep[parseInt(k, 10)])
        .sort((a, b) => a.step - b.step);
}

function mergeStepSections(globalSections, overrideSections) {
    const global = normalizeStepSections(globalSections, []);
    if (!Array.isArray(overrideSections) || !overrideSections.length) return global;
    const ovByStep = {};
    overrideSections.forEach((s) => {
        if (!s || s.step == null) return;
        const n = parseInt(s.step, 10);
        if (!Number.isNaN(n)) ovByStep[n] = s;
    });
    const merged = global.map((g) => {
        const ov = ovByStep[g.step];
        if (!ov) return { ...g };
        return {
            step: g.step,
            title: ov.title != null && String(ov.title).trim() ? String(ov.title).trim() : g.title,
            subtitle: ov.subtitle != null ? String(ov.subtitle).trim() : g.subtitle
        };
    });
    overrideSections.forEach((s) => {
        if (!s || s.step == null) return;
        const n = parseInt(s.step, 10);
        if (Number.isNaN(n) || n < 1) return;
        if (!merged.some((m) => m.step === n)) {
            merged.push({
                step: n,
                title: s.title != null && String(s.title).trim() ? String(s.title).trim() : `Step ${n}`,
                subtitle: s.subtitle != null ? String(s.subtitle).trim() : ''
            });
        }
    });
    return merged.sort((a, b) => a.step - b.step);
}

function stepSectionDiff(globalSections, uiSections, fallback) {
    const g = normalizeStepSections(globalSections, fallback);
    const u = normalizeStepSections(uiSections, g);
    const diff = [];
    u.forEach((sec) => {
        const base = g.find((x) => x.step === sec.step);
        if (!base) {
            diff.push(sec);
            return;
        }
        if (sec.title !== base.title || sec.subtitle !== base.subtitle) diff.push(sec);
    });
    return diff.length ? diff : null;
}

function stepSectionTitle(sections, step, fallback) {
    const n = parseInt(step, 10);
    const hit = (sections || []).find((s) => s && parseInt(s.step, 10) === n);
    if (hit && hit.title) return hit.title;
    return fallback || `Step ${n}`;
}

module.exports = {
    DEFAULT_PREREG_STEP_SECTIONS,
    DEFAULT_MAIN_REG_STEP_SECTIONS,
    normalizeStepSections,
    mergeStepSections,
    stepSectionDiff,
    stepSectionTitle
};
