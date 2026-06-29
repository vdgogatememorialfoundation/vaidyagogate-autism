/**
 * Seminar analytics — aggregated in JS for SQLite + PostgreSQL compatibility.
 */
const { parseFormData } = require('./parse-form-data');
const { needsAdvancedQualDocs, parseDocReview } = require('./application-document-verify');
const { isConfirmedParticipant } = require('./confirmed-participants');

function inc(map, key, n) {
    const k = key && String(key).trim() ? String(key).trim() : '(blank)';
    map[k] = (map[k] || 0) + (n || 1);
}

function topEntries(map, limit) {
    return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit || 25)
        .map(([name, count]) => ({ name, count }));
}

function computeSeminarAnalytics(rows, orders, preregs) {
    const byState = {};
    const byCity = {};
    const byPin = {};
    const byQual = {};
    const byCollege = {};
    let registered = 0;
    let confirmed = 0;
    let paid = 0;
    let scanned = 0;
    let verificationPending = 0;
    let paymentPending = 0;
    let noShow = 0;

    const preregStats = {
        total: 0,
        submitted: 0,
        approved: 0,
        rejected: 0,
        revision_required: 0
    };

    (preregs || []).forEach((p) => {
        preregStats.total++;
        const st = String(p.status || 'submitted').toLowerCase();
        if (preregStats[st] !== undefined) {
            preregStats[st]++;
        } else if (st === 'revision') {
            preregStats.revision_required++;
        }
    });

    const orderByReg = {};
    (orders || []).forEach((o) => {
        if (!orderByReg[o.registration_id]) orderByReg[o.registration_id] = [];
        orderByReg[o.registration_id].push(o);
    });

    const mainRegUserIds = new Set();

    (rows || []).forEach((r) => {
        const st = String(r.status || '').toLowerCase();
        if (st === 'cancelled' || st === 'rejected') return;

        registered++;
        if (r.user_id) mainRegUserIds.add(r.user_id);

        const fd = parseFormData(r.form_data);
        inc(byState, fd.state);
        inc(byCity, fd.city);
        inc(byPin, fd.pin);
        inc(byQual, fd.qual);
        inc(byCollege, fd.college);

        const regOrders = orderByReg[r.id] || [];
        const successOrder = regOrders.find((o) => o.status === 'success');
        const pendingOrder = regOrders.find((o) => o.status === 'pending');

        if (successOrder) paid++;
        if (pendingOrder && !successOrder && ['approved_pending_payment', 'submitted', 'pending_approval'].includes(st)) {
            paymentPending++;
        }

        if (['submitted', 'pending_approval', 'revision_required'].includes(st)) {
            verificationPending++;
        } else if (needsAdvancedQualDocs(fd)) {
            const review = parseDocReview(r.doc_review_json);
            if (!review || review.decision !== 'approve') {
                if (st !== 'completed' && st !== 'checked_in') verificationPending++;
            }
        }

        const rowForConfirm = {
            ...r,
            order_status: successOrder ? 'success' : null
        };
        if (isConfirmedParticipant(rowForConfirm)) confirmed++;

        if (Number(r.is_scanned) === 1) scanned++;
        else if (successOrder && ['completed', 'checked_in', 'e_ticket_issued'].includes(st)) noShow++;
    });

    (preregs || []).forEach((p) => {
        if (p.user_id && mainRegUserIds.has(p.user_id)) return;
        const fd = parseFormData(p.form_data);
        inc(byState, fd.state);
        inc(byCity, fd.city);
        inc(byPin, fd.pin);
        inc(byQual, fd.qual);
        inc(byCollege, fd.college);
    });

    let totalRevenue = 0;
    let pendingRevenue = 0;
    (orders || []).forEach((o) => {
        if (o.status === 'success') totalRevenue += Number(o.amount) || 0;
        if (o.status === 'pending') pendingRevenue += Number(o.amount) || 0;
    });

    return {
        registered,
        confirmed,
        paid,
        scanned,
        noShow,
        attendanceRate: paid ? Math.round((scanned / paid) * 1000) / 10 : 0,
        verificationPending,
        paymentPending,
        revenue: { collected: totalRevenue, pendingOrders: pendingRevenue },
        byState: topEntries(byState),
        byCity: topEntries(byCity),
        byPin: topEntries(byPin, 30),
        byQual: topEntries(byQual),
        byCollege: topEntries(byCollege, 30),
        preregStats
    };
}

function loadSeminarAnalytics(db, seminarId, cb) {
    const sid = parseInt(seminarId, 10);
    if (!Number.isInteger(sid) || sid < 1) return cb(new Error('Invalid seminar id'));

    db.all(
        `SELECT r.id, r.status, r.form_data, r.doc_review_json, t.is_scanned, t.scan_time, r.user_id
         FROM registrations r
         LEFT JOIN orders o ON o.registration_id = r.id AND o.status = 'success'
         LEFT JOIN tickets t ON t.order_id = o.id
         WHERE r.seminar_id = ?`,
        [sid],
        (e, rows) => {
            if (e) return cb(e);

            db.all(
                `SELECT id, status, form_data, user_id FROM preregistrations WHERE seminar_id = ?`,
                [sid],
                (e3, preregs) => {
                    if (e3) preregs = [];

                    db.all(
                        `SELECT o.registration_id, o.status, o.amount
                         FROM orders o
                         JOIN registrations r ON r.id = o.registration_id
                         WHERE r.seminar_id = ?`,
                        [sid],
                        (e2, orders) => {
                            if (e2) return cb(e2);
                            cb(null, computeSeminarAnalytics(rows, orders, preregs));
                        }
                    );
                }
            );
        }
    );
}

module.exports = {
    computeSeminarAnalytics,
    loadSeminarAnalytics
};
