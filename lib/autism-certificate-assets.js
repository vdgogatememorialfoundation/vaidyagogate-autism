const ASSETS = [
    {
        certType: 'participant',
        filePath: '/assets/certificates/participation-certificate.png',
        originalName: 'Expressions Programme — Participation Certificate'
    },
    {
        certType: 'volunteer',
        filePath: '/assets/certificates/volunteer-certificate.png',
        originalName: 'Expressions Programme — Volunteer Certificate'
    },
    {
        certType: 'competition',
        filePath: '/assets/certificates/competition-participation-certificate.jpeg',
        originalName: 'Expressions Programme — Competition Participation Certificate'
    }
];

function ensureAutismCertificateAssetTemplates(db, done) {
    db.all(`SELECT id FROM seminars WHERE is_active = 1`, [], (seminarErr, seminars) => {
        if (seminarErr) return done && done(seminarErr);
        const rows = Array.isArray(seminars) ? seminars : [];
        let index = 0;
        const nextSeminar = () => {
            if (index >= rows.length) return done && done(null);
            const seminarId = rows[index++].id;
            let assetIndex = 0;
            const nextAsset = () => {
                if (assetIndex >= ASSETS.length) return nextSeminar();
                const asset = ASSETS[assetIndex++];
                db.get(
                    `SELECT id FROM certificate_templates WHERE seminar_id = ? AND file_path = ? LIMIT 1`,
                    [seminarId, asset.filePath],
                    (findErr, existing) => {
                        if (findErr) return done && done(findErr);
                        const insertOrSync = () => {
                            if (existing) return syncAssignments(existing.id, asset, nextAsset);
                            db.run(
                            `INSERT INTO certificate_templates
                             (seminar_id, file_path, original_name, mime_type, uploaded_by, is_active, cert_type, config_json)
                             VALUES (?, ?, ?, ?, NULL, 1, ?, NULL)`,
                            [seminarId, asset.filePath, asset.originalName, asset.filePath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png', asset.certType],
                            (insertErr) => {
                                if (insertErr) return done && done(insertErr);
                                db.get(`SELECT id FROM certificate_templates WHERE seminar_id = ? AND file_path = ? LIMIT 1`, [seminarId, asset.filePath], (lookupErr, inserted) => {
                                    if (lookupErr) return done && done(lookupErr);
                                    syncAssignments(inserted && inserted.id, asset, nextAsset);
                                });
                            }
                        );
                        };
                        insertOrSync();
                    }
                );
                function syncAssignments(templateId, currentAsset, cb) {
                    if (!templateId || !['participant', 'volunteer'].includes(currentAsset.certType)) return cb();
                    const table = currentAsset.certType === 'volunteer' ? 'volunteer_certificates' : 'user_certificates';
                    db.run(`UPDATE ${table} SET template_id = ?, updated_at = CURRENT_TIMESTAMP WHERE seminar_id = ? AND enabled = 1`, [templateId, seminarId], () => cb());
                }

            };
            nextAsset();
        };
        nextSeminar();
    });
}

module.exports = { ASSETS, ensureAutismCertificateAssetTemplates };
