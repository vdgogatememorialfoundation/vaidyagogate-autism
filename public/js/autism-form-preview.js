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

    let previewLogoUrl = null;

    async function resolvePreviewLogoUrl() {
        if (previewLogoUrl) return previewLogoUrl;
        if (window.__siteLogoPath) {
            previewLogoUrl = window.__siteLogoPath;
            return previewLogoUrl;
        }
        try {
            const res = await fetch('/api/branding/logo', { cache: 'no-store' });
            const data = await res.json();
            previewLogoUrl = (data && data.logoPath) || '/api/branding/logo/file';
        } catch (_) {
            previewLogoUrl = '/api/branding/logo/file';
        }
        return previewLogoUrl;
    }

    async function renderPreviewLogoWrap() {
        const wrap = document.getElementById('ak-preview-logo-wrap');
        if (!wrap) return;
        const url = await resolvePreviewLogoUrl();
        wrap.innerHTML =
            '<div class="ak-preview-logo-row">' +
            '<img src="' +
            esc(url) +
            '" alt="Logo">' +
            '<div class="ak-preview-logo-row__text"><strong>Vaidya Gogate Memorial Foundation</strong><br>Autism Awareness Programme</div></div>';
    }

    function openFormPreviewModal(opts) {
        const modal = document.getElementById('ak-form-preview-modal');
        const titleEl = document.getElementById('ak-preview-title');
        const bodyEl = document.getElementById('ak-preview-body');
        const barEl = document.getElementById('ak-preview-barcode');
        const confirmBtn = document.getElementById('ak-preview-confirm-btn');
        const downloadBtn = document.getElementById('ak-preview-download-btn');
        const sheet = modal && modal.querySelector('.ak-preview-sheet');
        if (!modal || !bodyEl) return;
        if (sheet) sheet.classList.add('ak-preview-sheet--v2');
        if (titleEl) titleEl.textContent = opts.title || 'Form preview';
        renderPreviewLogoWrap();
        if (barEl) barEl.innerHTML = barcodeHtml(opts.barcodeText, opts.barcodeNote);
        bodyEl.innerHTML =
            '<div class="ak-preview-draft-badge">Draft preview — not submitted</div>' + previewRowsHtml(opts.rows || []);
        previewConfirmHandler = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
        if (confirmBtn) {
            confirmBtn.style.display = previewConfirmHandler ? '' : 'none';
            confirmBtn.textContent = opts.confirmLabel || 'Confirm & submit';
            confirmBtn.onclick = function () {
                if (!previewConfirmHandler) return;
                previewConfirmHandler();
                if (opts.closeOnConfirm !== false) closeFormPreviewModal();
            };
        }
        if (downloadBtn) {
            if (typeof opts.onDownload === 'function') {
                downloadBtn.style.display = '';
                downloadBtn.onclick = function () {
                    opts.onDownload();
                };
            } else {
                downloadBtn.style.display = 'none';
                downloadBtn.onclick = null;
            }
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
        const sid =
            parseInt(document.getElementById('prereg-seminar-select')?.value, 10) ||
            Number(window.__akActivePreregSeminarId) ||
            0;
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
            onDownload:
                typeof window.downloadPreregDraftPdf === 'function'
                    ? function () {
                          window.downloadPreregDraftPdf();
                      }
                    : null,
            onConfirm: function () {
                document.getElementById('prereg-form')?.requestSubmit();
            },
            closeOnConfirm: false
        });
    };

    window.previewCompetitionEntry = function previewCompetitionEntry() {
        const semEl = document.getElementById('comp-seminar-select');
        const semLabel = semEl?.value ? semEl.selectedOptions?.[0]?.textContent || semEl.value : '—';
        const collected =
            typeof window.collectCompetitionFormData === 'function'
                ? window.collectCompetitionFormData()
                : { formData: {}, files: [] };
        const formData = collected.formData || {};
        const files = collected.files || [];
        const fileNames = files.length ? files.map((f) => f.name).join(', ') : '—';
        const rows = [['Event', semLabel]];
        document.querySelectorAll('#comp-dynamic-fields [data-comp-key]').forEach((el) => {
            if (el.dataset.compType === 'file') return;
            const key = el.dataset.compKey;
            const label =
                el.closest('.form-group')?.querySelector('label')?.textContent?.replace(/\s*\*$/, '') || key;
            let val = formData[key] || '—';
            if (el.dataset.compType === 'select' && el.selectedOptions?.length) {
                val = el.selectedOptions[0].textContent || val;
            }
            rows.push([label, val]);
        });
        if (files.length) rows.push(['Files', fileNames]);
        openFormPreviewModal({
            title: 'Competition entry preview',
            barcodeText: 'COMP-PREVIEW',
            barcodeNote: 'Entry barcode is assigned when you submit.',
            rows: rows,
            onConfirm: function () {
                document.getElementById('competition-form')?.requestSubmit();
            }
        });
    };

    window.closeFormPreviewModal = closeFormPreviewModal;
})();
