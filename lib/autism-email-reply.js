/**
 * Default Reply-To addresses and dashboard reply copy for autism portal emails.
 */
const DEFAULT_REPLY_TO = [
    'care@vaidyagogate.org',
    'vd.gogatememorialfoundation@gmail.com'
];

function parseReplyToEnv() {
    const raw = String(process.env.AUTISM_REPLY_TO || '').trim();
    if (!raw) return null;
    const list = raw
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    return list.length ? list : null;
}

/** Reply-To header addresses for all outbound autism emails. */
function autismReplyToAddresses(extra) {
    const base = parseReplyToEnv() || DEFAULT_REPLY_TO.slice();
    const out = base.slice();
    if (extra == null || extra === '') return out;
    const arr = Array.isArray(extra) ? extra : [extra];
    arr.forEach((a) => {
        const v = String(a || '').trim();
        if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
    });
    return out;
}

function dashboardReplyNote(portalUrl) {
    const url = String(portalUrl || '').trim();
    return (
        '\n\n—\nPlease reply in your dashboard' +
        (url ? ' (' + url + ')' : '') +
        '. Do not reply to this email — replies here are not monitored.'
    );
}

module.exports = {
    DEFAULT_REPLY_TO,
    autismReplyToAddresses,
    dashboardReplyNote
};
