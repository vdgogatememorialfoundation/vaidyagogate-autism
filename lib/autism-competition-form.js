/**
 * Per-seminar competition form config (stored in seminars.registration_form_json.competitionForm).
 */
const DEFAULT_COMPETITION_FORM_CONFIG = {
    version: 1,
    fields: [
        { key: 'title', label: 'Entry title', type: 'text', enabled: true, required: true },
        {
            key: 'category',
            label: 'Category',
            type: 'select',
            enabled: true,
            required: true,
            options: [
                { value: 'child_drawing', label: 'Child: Drawing' },
                { value: 'child_singing', label: 'Child: Singing' },
                { value: 'child_writing', label: 'Child: Writing' },
                { value: 'parent_essay', label: 'Parent: Essay / "मनोगत"' }
            ]
        },
        { key: 'description', label: 'Description', type: 'textarea', enabled: true, required: false },
        {
            key: 'files',
            label: 'Upload files (images, video, PPT, PDF)',
            type: 'file',
            enabled: true,
            required: true
        }
    ]
};

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

function normalizeCompetitionForm(raw) {
    const base = DEFAULT_COMPETITION_FORM_CONFIG;
    if (!raw || typeof raw !== 'object') {
        return { version: base.version, fields: base.fields.slice() };
    }
    const fields = Array.isArray(raw.fields) ? raw.fields : base.fields;
    return {
        version: raw.version || base.version,
        fields: fields.map((f) => ({
            key: String(f.key || '').trim(),
            label: String(f.label || f.key || '').trim(),
            type: String(f.type || 'text').toLowerCase(),
            enabled: f.enabled !== false,
            required: f.required === true,
            options: Array.isArray(f.options) ? f.options : undefined
        })).filter((f) => f.key)
    };
}

function competitionFormFromSeminarJson(registrationFormJson) {
    const cfg = parseRegistrationFormConfig(registrationFormJson);
    return normalizeCompetitionForm(cfg.competitionForm);
}

function enabledCompetitionFields(formConfig) {
    const cfg = normalizeCompetitionForm(formConfig);
    return (cfg.fields || []).filter((f) => f.enabled !== false && f.type !== 'file');
}

function competitionFormRequiresFiles(formConfig) {
    const cfg = normalizeCompetitionForm(formConfig);
    return (cfg.fields || []).some((f) => f.enabled !== false && f.type === 'file' && f.required !== false);
}

function validateCompetitionFormData(formConfig, formData) {
    const data = formData && typeof formData === 'object' ? formData : {};
    const errors = [];
    enabledCompetitionFields(formConfig).forEach((f) => {
        const val = data[f.key];
        const empty = val == null || String(val).trim() === '';
        if (f.required && empty) {
            errors.push((f.label || f.key) + ' is required.');
        }
    });
    return errors;
}

function extractCompetitionSubmissionColumns(formConfig, formData) {
    const data = formData && typeof formData === 'object' ? formData : {};
    const title = String(data.title || data.entry_title || '').trim();
    const category = String(data.category || '').trim();
    const description =
        data.description != null
            ? String(data.description).trim()
            : JSON.stringify(
                  Object.fromEntries(
                      enabledCompetitionFields(formConfig)
                          .filter((f) => !['title', 'category', 'description'].includes(f.key))
                          .map((f) => [f.key, data[f.key] != null ? data[f.key] : ''])
                  )
              );
    return { title, category, description, formData: data };
}

function mergeCompetitionFormIntoRegistrationJson(existingJson, competitionForm) {
    const cfg = parseRegistrationFormConfig(existingJson);
    cfg.competitionForm = normalizeCompetitionForm(competitionForm);
    return JSON.stringify(cfg);
}

module.exports = {
    DEFAULT_COMPETITION_FORM_CONFIG,
    parseRegistrationFormConfig,
    normalizeCompetitionForm,
    competitionFormFromSeminarJson,
    enabledCompetitionFields,
    competitionFormRequiresFiles,
    validateCompetitionFormData,
    extractCompetitionSubmissionColumns,
    mergeCompetitionFormIntoRegistrationJson
};
