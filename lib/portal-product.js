/**
 * Autism portal product configuration (separate from doctor / VGMF seminar portal).
 * This codebase is dedicated to autism.vaidyagogate.org only.
 */
const PRODUCT_ID = 'autism';

/**
 * Paid events are an admin toggle (Razorpay configured in Site configuration). When off, every event is free
 * (legacy behaviour). When on, events with price > 0 collect payment through the configured gateway and
 * events with price 0 remain free.
 */
const PAYMENTS_SETTING_KEY = 'autism_payments_enabled';
const paymentsState = {
    enabled: String(process.env.AUTISM_PAYMENTS_ENABLED || '').trim() === '1'
};

function paymentsEnabled() {
    return paymentsState.enabled === true;
}

function setPaymentsEnabled(v) {
    paymentsState.enabled = v === true || v === 1 || v === '1' || v === 'true';
    return paymentsState.enabled;
}

function loadPaymentsEnabled(db, cb) {
    db.get(`SELECT value FROM global_settings WHERE key = ?`, [PAYMENTS_SETTING_KEY], (err, row) => {
        if (err) return cb && cb(err, paymentsState.enabled);
        if (row && row.value != null) setPaymentsEnabled(String(row.value).trim() === '1' || String(row.value).trim() === 'true');
        cb && cb(null, paymentsState.enabled);
    });
}

function savePaymentsEnabled(db, enabled, cb) {
    const val = enabled ? '1' : '0';
    db.run(`UPDATE global_settings SET value = ? WHERE key = ?`, [val, PAYMENTS_SETTING_KEY], function (uerr) {
        if (uerr) return cb && cb(uerr);
        if (this && this.changes > 0) {
            setPaymentsEnabled(enabled);
            return cb && cb(null, paymentsState.enabled);
        }
        db.run(`INSERT INTO global_settings (key, value) VALUES (?, ?)`, [PAYMENTS_SETTING_KEY, val], (ierr) => {
            if (ierr) return cb && cb(ierr);
            setPaymentsEnabled(enabled);
            cb && cb(null, paymentsState.enabled);
        });
    });
}

/** Event needs a payment step only when paid events are on and the event has a positive price. */
function seminarRequiresPayment(row) {
    if (!paymentsEnabled()) return false;
    const p = row && row.price != null ? Number(row.price) : NaN;
    return Number.isFinite(p) && p > 0;
}

const FEATURES = {
    productId: PRODUCT_ID,
    applicantPortal: true,
    adminPortal: true,
    scannerPortal: true,
    hasJudgePortal: false,
    hasCasePresentation: false,
    get hasPayments() {
        return paymentsEnabled();
    },
    hasPreregistration: true,
    hasCompetitionUploads: true,
    get noFees() {
        return !paymentsEnabled();
    },
    userRoleLabel: 'applicant',
    portalTitle: 'Autism Awareness Portal',
    foundationName: 'Vaidya Gogate Memorial Foundation',
    eventLabel: 'Autism Awareness Programme'
};

const stepSections = require('./form-step-sections');

const DEFAULT_PREREG_FORM_CONFIG = {
    version: 3,
    stepSections: stepSections.DEFAULT_PREREG_STEP_SECTIONS.slice(),
    fields: [
        { key: 'parent_name', label: 'Full Name (Parents)', type: 'text', step: 1, enabled: true, required: true },
        {
            key: 'parent_gender',
            label: 'Gender',
            type: 'select',
            step: 1,
            enabled: true,
            required: true,
            options: [
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' }
            ]
        },
        { key: 'parent_dob', label: 'Date of Birth', type: 'date', step: 1, enabled: true, required: true },
        { key: 'child_name', label: "Child's Name", type: 'text', step: 2, enabled: true, required: true },
        {
            key: 'child_gender',
            label: 'Gender',
            type: 'select',
            step: 2,
            enabled: true,
            required: true,
            options: [
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' }
            ]
        },
        { key: 'child_dob', label: 'Date of Birth', type: 'date', step: 2, enabled: true, required: true },
        { key: 'address', label: 'Full Address', type: 'textarea', step: 3, enabled: true, required: true },
        { key: 'pin', label: 'Pincode', type: 'text', step: 3, enabled: true, required: true },
        { key: 'city', label: 'City', type: 'text', step: 3, enabled: true, required: true },
        { key: 'state', label: 'State', type: 'text', step: 3, enabled: true, required: true },
        {
            key: 'country',
            label: 'Country',
            type: 'text',
            step: 3,
            enabled: true,
            required: true,
            defaultValue: 'India'
        },
        {
            key: 'attendees_count',
            label: 'Number of People Attending',
            type: 'number',
            step: 4,
            enabled: true,
            required: true
        },
        { key: 'child_health', label: "Child's Health", type: 'textarea', step: 4, enabled: true, required: false },
        { key: 'diet', label: 'Diet', type: 'textarea', step: 4, enabled: true, required: false },
        {
            key: 'financial_planning',
            label: 'Financial Planning',
            type: 'textarea',
            step: 4,
            enabled: true,
            required: false
        }
    ]
};

const DEFAULT_REGISTRATION_FORM_CONFIG = {
    version: 1,
    stepSections: stepSections.DEFAULT_MAIN_REG_STEP_SECTIONS.slice(),
    fields: [
        { key: 'fname', label: 'First name', type: 'text', step: 1, enabled: true, required: true },
        { key: 'mname', label: 'Middle name', type: 'text', step: 1, enabled: true, required: false },
        { key: 'lname', label: 'Last name', type: 'text', step: 1, enabled: true, required: true },
        { key: 'email', label: 'Email', type: 'email', step: 1, enabled: true, required: true, verifyOtp: false },
        { key: 'phone', label: 'Phone', type: 'tel', step: 1, enabled: true, required: true, verifyOtp: false },
        { key: 'dob', label: 'Date of birth', type: 'date', step: 1, enabled: true, required: true },
        { key: 'address', label: 'Address', type: 'textarea', step: 2, enabled: true, required: true },
        { key: 'pin', label: 'Pincode', type: 'text', step: 2, enabled: true, required: true },
        { key: 'city', label: 'City', type: 'text', step: 2, enabled: true, required: true },
        { key: 'state', label: 'State', type: 'text', step: 2, enabled: true, required: true },
        { key: 'country', label: 'Country', type: 'text', step: 2, enabled: true, required: true, defaultValue: 'India' },
        {
            key: 'participant_type',
            label: 'Participant type',
            type: 'select',
            step: 3,
            enabled: true,
            required: true,
            options: [
                { value: 'student', label: 'Student' },
                { value: 'parent', label: 'Parent / Guardian' },
                { value: 'professional', label: 'Professional / Therapist' },
                { value: 'volunteer', label: 'Volunteer' },
                { value: 'other', label: 'Other' }
            ]
        },
        {
            key: 'competition_category',
            label: 'Competition category',
            type: 'select',
            step: 3,
            enabled: true,
            required: true,
            options: [
                { value: 'art', label: 'Art & Drawing' },
                { value: 'essay', label: 'Essay / Creative Writing' },
                { value: 'video', label: 'Short Video' },
                { value: 'presentation', label: 'Presentation (PPT)' },
                { value: 'none', label: 'Participation only (no competition)' }
            ]
        },
        {
            key: 'agree_terms',
            label: 'I confirm the information is accurate and consent to programme terms',
            type: 'boolean',
            step: 4,
            enabled: true,
            required: true
        }
    ]
};

function publicConfig() {
    return {
        productId: FEATURES.productId,
        features: { ...FEATURES },
        urls: require('./portal-urls').getPortalUrls()
    };
}

module.exports = {
    FEATURES,
    PAYMENTS_SETTING_KEY,
    paymentsEnabled,
    setPaymentsEnabled,
    loadPaymentsEnabled,
    savePaymentsEnabled,
    seminarRequiresPayment,
    DEFAULT_PREREG_FORM_CONFIG,
    DEFAULT_REGISTRATION_FORM_CONFIG,
    publicConfig
};
