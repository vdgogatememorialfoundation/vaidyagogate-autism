/**
 * Autism portal product configuration (separate from doctor / VGMF seminar portal).
 * This codebase is dedicated to autism.vaidyagogate.org only.
 */
const PRODUCT_ID = 'autism';

const FEATURES = {
    productId: PRODUCT_ID,
    applicantPortal: true,
    adminPortal: true,
    scannerPortal: true,
    hasJudgePortal: false,
    hasCasePresentation: false,
    hasPayments: false,
    hasPreregistration: true,
    hasCompetitionUploads: true,
    noFees: true,
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
    DEFAULT_PREREG_FORM_CONFIG,
    DEFAULT_REGISTRATION_FORM_CONFIG,
    publicConfig
};
