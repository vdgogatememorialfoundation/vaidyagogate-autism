(function () {
    'use strict';
    var token = decodeURIComponent((location.pathname.match(/\/onspot\/([^/?#]+)/) || [])[1] || '');
    var qs = function (id) { return document.getElementById(id); };
    var CORE_KEYS = ['fname', 'first_name', 'mname', 'middle_name', 'lname', 'last_name', 'email', 'phone', 'mobile', 'whatsapp', 'attendees_count'];

    function showError(msg) {
        var el = qs('os-error');
        el.textContent = msg;
        el.classList.remove('hidden');
        qs('os-form').classList.add('hidden');
        qs('os-title').textContent = 'Link unavailable';
    }

    function fmtDate(v) {
        if (!v) return '';
        var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return String(v);
        var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function buildInput(f) {
        var input;
        if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else if (f.type === 'select') {
            input = document.createElement('select');
            var o0 = document.createElement('option');
            o0.value = '';
            o0.textContent = 'Select';
            input.appendChild(o0);
            (f.options || []).forEach(function (o) {
                var opt = document.createElement('option');
                opt.value = typeof o === 'object' ? o.value : o;
                opt.textContent = typeof o === 'object' ? o.label || o.value : o;
                input.appendChild(opt);
            });
        } else if (f.type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
        } else {
            input = document.createElement('input');
            input.type = ['email', 'tel', 'date', 'number'].indexOf(f.type) >= 0 ? f.type : 'text';
        }
        input.id = 'os-f-' + f.key;
        input.dataset.key = f.key;
        input.dataset.type = f.type || 'text';
        if (f.required && f.type !== 'boolean') input.required = true;
        return input;
    }

    function renderFields(fields) {
        var wrap = qs('os-fields');
        var shown = 0;
        (fields || []).forEach(function (f) {
            if (!f || !f.key || CORE_KEYS.indexOf(f.key) >= 0) return;
            if (f.type === 'file' || f.hidden) return;
            var fg = document.createElement('div');
            fg.className = 'os-field' + (f.type === 'textarea' ? ' os-full' : '');
            var input = buildInput(f);
            if (f.type === 'boolean') {
                var row = document.createElement('label');
                row.className = 'os-check-row';
                row.appendChild(input);
                row.appendChild(document.createTextNode(f.label || f.key));
                fg.appendChild(row);
            } else {
                var label = document.createElement('label');
                label.setAttribute('for', input.id);
                label.textContent = (f.label || f.key) + (f.required ? ' *' : '');
                fg.appendChild(label);
                fg.appendChild(input);
            }
            wrap.appendChild(fg);
            shown++;
        });
        if (shown) qs('os-fields-wrap').classList.remove('hidden');
    }

    function collectFields() {
        var out = {};
        qs('os-fields').querySelectorAll('[data-key]').forEach(function (el) {
            out[el.dataset.key] = el.dataset.type === 'boolean' ? (el.checked ? 'yes' : 'no') : String(el.value || '').trim();
        });
        return out;
    }

    function load() {
        if (!token) return showError('This on-spot link is not valid.');
        fetch('/api/public/onspot/' + encodeURIComponent(token))
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok) return showError(res.d.error || 'Link unavailable.');
                var s = res.d.seminar || {};
                qs('os-title').textContent = s.title || 'Event registration';
                qs('os-sub').textContent = (s.date ? fmtDate(s.date) + ' · ' : '') + (s.isFree ? 'Free entry' : 'Fees payable at the desk');
                if (res.d.expiresAt) qs('os-expiry').textContent = 'Link valid until ' + new Date(res.d.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                renderFields(res.d.fields);
                qs('os-form').classList.remove('hidden');
            })
            .catch(function () { showError('Could not load this link. Check your connection and try again.'); });
    }

    qs('os-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var status = qs('os-status');
        var btn = qs('os-submit');
        var form = qs('os-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        status.className = 'os-status';
        status.textContent = 'Sending…';
        btn.disabled = true;
        fetch('/api/public/onspot/' + encodeURIComponent(token) + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: qs('os-fname').value,
                middleName: qs('os-mname').value,
                lastName: qs('os-lname').value,
                phone: qs('os-phone').value,
                email: qs('os-email').value,
                attendeesCount: qs('os-attendees').value,
                formData: collectFields()
            })
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error(res.d.error || 'Submission failed.');
                form.classList.add('hidden');
                qs('os-done-msg').textContent = res.d.message || 'Submitted.';
                qs('os-ref').textContent = res.d.reference || '';
                qs('os-done').classList.remove('hidden');
            })
            .catch(function (e) {
                status.className = 'os-status err';
                status.textContent = e.message;
            })
            .then(function () { btn.disabled = false; });
    });

    load();
})();
