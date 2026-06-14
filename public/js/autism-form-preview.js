/**
 * Applicant: form preview modal, prereg/competition barcodes.
 */
(function () {
    'use strict';

    let previewConfirmHandler = null;

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function barcodeHtml(code, note) {
        const c = String(code || '').trim();
        if (!c) return '<p style="color:#64748b;">Barcode appears after you submit.</p>';
        return (
            '<div class="ak-preview-barcode-card">' +
            '<img src="/api/qrcode/' +
            encodeURIComponent(c) +
            '" alt="Barcode" width="120" height="120">' +
            '<div><code>' +
            esc(c) +
            '</code>' +
            (note ? '<small>' + esc(note) + '</small>' : '') +
            '</div></div>'
        );
    }

    function previewRowsHtml(rows) {
        if (!rows || !rows.length) {
            return '<p style="color:#64748b;">No fields to preview.</p>';
        }
        return (
            '<div class="ak-preview-fields">' +
            rows
                .map(
                    ([k, v]) =>
                        '<div class="ak-preview-field">' +
                        '<span class="ak-preview-field__label">' +
                        esc(k) +
                        '</span>' +
                        '<span class="ak-preview-field__value">' +
                        esc(v == null || v === '' ? '—' : v) +
                        '</span></div>'
                )
                .join('') +
            '</div>'
        );
    }

    function openFormPreviewModal(opts) {
        const modal = document.getElementById('ak-form-preview-modal');
        const titleEl = document.getElementById('ak-preview-title');
        const bodyEl = document.getElementById('ak-preview-body');
        const barEl = document.getElementById('ak-preview-barcode');
        const confirmBtn = document.getElementById('ak-preview-confirm-btn');
        const sheet = modal && modal.querySelector('.ak-preview-sheet');
        if (!modal || !bodyEl) return;
        if (sheet) sheet.classList.add('ak-preview-sheet--v2');
        if (titleEl) titleEl.textContent = opts.title || 'Form preview';
        if (barEl) barEl.innerHTML = barcodeHtml(opts.barcodeText, opts.barcodeNote);
        bodyEl.innerHTML =
            '<div class="ak-preview-draft-badge">Draft preview — not submitted</div>' + previewRowsHtml(opts.rows || []);
        previewConfirmHandler = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
        if (confirmBtn) {
            confirmBtn.style.display = previewConfirmHandler ? '' : 'none';
            confirmBtn.textContent = opts.confirmLabel || 'Confirm & submit';
            confirmBtn.onclick = function () {
                if (previewConfirmHandler) previewConfirmHandler();
                closeFormPreviewModal();
            };
        }
        modal.classList.remove('hidden');
    }

    function closeFormPreviewModal() {
        document.getElementById('ak-form-preview-modal')?.classList.add('hidden');
        previewConfirmHandler = null;
    }

    function collectPreregFormData() {
        const formData = {};
        (window.__akPreregFields || []).forEach((f) => {
            if (!f || f.enabled === false) return;
            const el = document.getElementById('prereg-field-' + f.key);
            if (!el) return;
            formData[f.label || f.key] = f.type === 'boolean' ? (el.checked ? 'Yes' : 'No') : el.value;
        });
        return formData;
    }

    function validatePreregPreview() {
        const fields = window.__akPreregFields || [];
        const byStep = {};
        fields.forEach((f) => {
            if (!f || f.enabled === false) return;
            const step = Number(f.step) || 1;
            if (!byStep[step]) byStep[step] = [];
            byStep[step].push(f);
        });
        for (const step of Object.keys(byStep).sort((a, b) => a - b)) {
            const missing = [];
            byStep[step].forEach((f) => {
                if (!f.required) return;
                const el = document.getElementById('prereg-field-' + f.key);
                if (!el) return;
                const v = f.type === 'boolean' ? el.checked : String(el.value || '').trim();
                if (f.type === 'boolean' ? !v : v === '') missing.push(f.label);
            });
            if (missing.length) {
                alert('Please complete step ' + step + ': ' + missing.join(', '));
                return false;
            }
        }
        return true;
    }

    window.previewPreregistration = function previewPreregistration() {
        const sid = parseInt(document.getElementById('prereg-seminar-select')?.value, 10);
        if (!sid) return alert('Select an event first.');
        if (!validatePreregPreview()) return;
        const sel = document.getElementById('prereg-seminar-select');
        const semTitle = sel?.selectedOptions?.[0]?.textContent || 'Event';
        const rows = [['Event', semTitle], ...Object.entries(collectPreregFormData())];
        openFormPreviewModal({
            title: 'Pre-registration preview',
            barcodeText: 'PREREG-PREVIEW',
            barcodeNote: 'Your unique barcode is issued immediately after submit.',
            rows,
            onConfirm: function () {
                document.getElementById('prereg-form')?.requestSubmit();
            }
        });
    };

    window.previewCompetitionEntry = function previewCompetitionEntry() {
        const title = document.getElementById('comp-title')?.value?.trim();
        if (!title) return alert('Enter an entry title first.');
        const catEl = document.getElementById('comp-category');
        const catLabel = catEl?.selectedOptions?.[0]?.textContent || catEl?.value || '';
        const semEl = document.getElementById('comp-seminar-select');
        const semLabel = semEl?.value ? semEl.selectedOptions?.[0]?.textContent || semEl.value : '—';
        const files = document.getElementById('comp-files')?.files;
        const fileNames = files && files.length ? Array.from(files).map((f) => f.name).join(', ') : '—';
        openFormPreviewModal({
            title: 'Competition entry preview',
            barcodeText: 'COMP-PREVIEW',
            barcodeNote: 'Entry barcode is assigned when you submit.',
            rows: [
                ['Event', semLabel],
                ['Title', title],
                ['Category', catLabel],
                ['Description', document.getElementById('comp-description')?.value || '—'],
                ['Files', fileNames]
            ],
            onConfirm: function () {
                document.getElementById('competition-form')?.requestSubmit();
            }
        });
    };

    window.closeFormPreviewModal = closeFormPreviewModal;
})();
