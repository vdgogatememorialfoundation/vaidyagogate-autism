/**
 * Certificate kinds: participant (check-in based), volunteer (approved volunteers),
 * competition (competition entry records). One certificate row per kind per user per seminar,
 * so an account can hold e.g. a participant + a competition certificate for the same event.
 */
const KINDS = ['participant', 'volunteer', 'competition'];

const TABLES = {
    participant: 'user_certificates',
    volunteer: 'volunteer_certificates',
    competition: 'competition_certificates'
};

const LABELS = {
    participant: 'Participation',
    volunteer: 'Volunteer',
    competition: 'Competition'
};

/** Query-string key used by /certificate/view for each kind. */
const VIEW_PARAM = {
    participant: 'uc',
    volunteer: 'vc',
    competition: 'cc'
};

function normalizeCertKind(val) {
    const k = String(val || 'participant').toLowerCase().trim();
    return KINDS.includes(k) ? k : 'participant';
}

function certTable(kind) {
    return TABLES[normalizeCertKind(kind)];
}

function certKindLabel(kind) {
    return LABELS[normalizeCertKind(kind)];
}

function certViewParam(kind) {
    return VIEW_PARAM[normalizeCertKind(kind)];
}

const COMPETITION_CATEGORY_LABELS = {
    child_drawing: 'Drawing',
    child_singing: 'Singing',
    child_writing: 'Writing',
    child_dance: 'Dance',
    parent_essay: 'Parent Essay'
};

function competitionCategoryLabel(category) {
    const c = String(category || '').trim();
    if (!c) return 'Competition';
    if (COMPETITION_CATEGORY_LABELS[c]) return COMPETITION_CATEGORY_LABELS[c];
    return c
        .replace(/^child_|^parent_/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Recipient name for a competition certificate: child's name for child categories when recorded. */
function competitionRecipientName(formData, category, fallback) {
    let fd = {};
    try {
        fd = typeof formData === 'string' ? JSON.parse(formData) : formData || {};
    } catch (_) {
        fd = {};
    }
    const isChild = /^child_/i.test(String(category || ''));
    const child = String(fd.child_name || fd.childName || fd.participant_name || '').trim();
    if (isChild && child) return child;
    if (!isChild && child && !String(fallback || '').trim()) return child;
    return String(fallback || '').trim() || child || 'Participant';
}

/** Competition entry statuses that can receive a certificate. */
function competitionStatusEligible(status) {
    const st = String(status || 'submitted').toLowerCase();
    return st !== 'rejected' && st !== 'draft' && st !== 'cancelled';
}

module.exports = {
    KINDS,
    normalizeCertKind,
    certTable,
    certKindLabel,
    certViewParam,
    competitionCategoryLabel,
    competitionRecipientName,
    competitionStatusEligible
};
