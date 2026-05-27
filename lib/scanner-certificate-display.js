/**
 * Scanner kiosk: show participant certificate after required venue scans,
 * respecting scheduled certificate go-live (certificate_verify_go_live_at).
 */
const certVerify = require('./certificate-verify');

function formatOpenAtIst(isoOrMs) {
    const t = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(String(isoOrMs || ''));
    if (Number.isNaN(t)) return '';
    try {
        return new Date(t).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (_) {
        return new Date(t).toLocaleString();
    }
}

/** Certificate may be shown on scanner when go-live time has passed (if scheduled). */
function isScannerCertificateOpen(sem) {
    const goLive = certVerify.parseGoLiveAt(sem && sem.certificate_verify_go_live_at);
    if (goLive == null) return { open: true };
    if (Date.now() >= goLive) return { open: true };
    return { open: false, openAt: goLive, openAtLabel: formatOpenAtIst(goLive) };
}

function resolveScannerCertificateDisplay(db, userId, seminarId, cb) {
    const uid = parseInt(userId, 10);
    const sid = parseInt(seminarId, 10);
    if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(sid) || sid < 1) {
        return cb(null, { show: false, reason: 'invalid_ids' });
    }

    db.get(
        `SELECT id, title, certificate_verify_go_live_at, event_date
         FROM seminars WHERE id = ?`,
        [sid],
        (eSem, sem) => {
            if (eSem) return cb(eSem);
            if (!sem) return cb(null, { show: false, reason: 'seminar_not_found' });

            const schedule = isScannerCertificateOpen(sem);
            if (!schedule.open) {
                return cb(null, {
                    show: false,
                    scheduled: true,
                    openAt: new Date(schedule.openAt).toISOString(),
                    openAtLabel: schedule.openAtLabel,
                    message:
                        'Certificate is scheduled for ' +
                        schedule.openAtLabel +
                        ' (IST). Participant can collect it after that time.'
                });
            }

            db.get(
                `SELECT uc.id, uc.enabled, uc.scan_verified, uc.display_name,
                        ct.file_path AS template_path
                 FROM user_certificates uc
                 LEFT JOIN certificate_templates ct ON ct.id = uc.template_id AND COALESCE(ct.is_active, 1) = 1
                 WHERE uc.user_id = ? AND uc.seminar_id = ?`,
                [uid, sid],
                (eCert, cert) => {
                    if (eCert) return cb(eCert);
                    if (!cert) {
                        return cb(null, {
                            show: false,
                            reason: 'no_certificate',
                            message: 'Certificate record not created yet.'
                        });
                    }
                    if (!Number(cert.scan_verified)) {
                        return cb(null, {
                            show: false,
                            reason: 'awaiting_scans',
                            message: 'Complete required entry/exit scans before the certificate can be shown.'
                        });
                    }
                    if (!Number(cert.enabled)) {
                        return cb(null, {
                            show: false,
                            reason: 'awaiting_approval',
                            message: 'Attendance recorded. Certificate is awaiting admin approval.'
                        });
                    }
                    if (!cert.template_path) {
                        return cb(null, {
                            show: false,
                            reason: 'template_pending',
                            message: 'Certificate is approved but the design is not ready yet.'
                        });
                    }

                    const viewUrl = '/certificate/view?uc=' + encodeURIComponent(String(cert.id)) + '&uid=' + encodeURIComponent(String(uid));
                    cb(null, {
                        show: true,
                        viewUrl,
                        certId: cert.id,
                        displayName: cert.display_name || '',
                        seminarTitle: sem.title || '',
                        message: 'Show this certificate to the participant.'
                    });
                }
            );
        }
    );
}

module.exports = {
    formatOpenAtIst,
    isScannerCertificateOpen,
    resolveScannerCertificateDisplay
};
