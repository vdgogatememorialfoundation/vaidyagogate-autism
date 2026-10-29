# Certificate verification API

Use this API on the main website so a visitor can type the Certificate ID printed on a certificate and see whether that certificate was issued.

The portal assigns one ID whenever a participation or volunteer certificate is issued for an event. The same ID is printed on the certificate and included in the certificate email.

Base URL (production):

```text
https://autism.vaidyagogate.org
```

The browser on the main site can call this API directly. Cross-origin requests are allowed. Responses are not cached.

## Certificate ID

| Kind | ID printed on new certificates | Example |
|------|--------------------------------|---------|
| Participation | `CERT-P-{eventId}-{certificateId}` | `CERT-P-12-345` |
| Volunteer | `CERT-V-{eventId}-{certificateId}` | `CERT-V-4-8` |

Older certificates may show `CERT-{eventId}-{certificateId}` (for example `CERT-12-345`). That form still verifies. If it ever matches both a participation and a volunteer certificate, the API asks for the `CERT-P-` or `CERT-V-` form.

IDs are not case-sensitive. Spaces are ignored.

A certificate verifies only after it has been issued (enabled) for that person. A draft record does not count as valid, and the response does not include the holder’s name in that case.

## Check a certificate

```http
GET /api/public/certificates/verify?id=CERT-P-12-345
```

The same check is available at:

```http
GET /api/public/certificates/CERT-P-12-345
```

### Valid certificate — `200`

```json
{
  "ok": true,
  "valid": true,
  "certificate": {
    "certificateId": "CERT-P-12-345",
    "type": "participant",
    "typeLabel": "Participation",
    "holderName": "Aarav Sharma",
    "event": {
      "id": 12,
      "title": "Autism Awareness Day",
      "date": "2026-04-02"
    },
    "applicationNo": "APP100",
    "participantId": "PRN100",
    "status": "issued",
    "issuedAt": "2026-04-03T10:00:00.000Z",
    "issuer": "Vaidya Gogate Memorial Foundation",
    "verifyUrl": "https://autism.vaidyagogate.org/verify-certificate.html?id=CERT-P-12-345",
    "apiUrl": "https://autism.vaidyagogate.org/api/public/certificates/verify?id=CERT-P-12-345"
  }
}
```

`type` is `participant` or `volunteer`. `holderName` is the name printed on the certificate. `event.date` is `YYYY-MM-DD` when the event date is a calendar date.

The response does **not** include email, phone, or the private QR token.

### Not a certificate ID — `400`

```json
{
  "ok": false,
  "valid": false,
  "code": "INVALID_ID",
  "error": "Enter a certificate ID such as CERT-P-12-345 or CERT-V-12-345."
}
```

### No matching certificate — `404`

```json
{
  "ok": false,
  "valid": false,
  "code": "NOT_FOUND",
  "error": "No certificate was found for this ID."
}
```

### ID exists but is not issued — `404`

```json
{
  "ok": false,
  "valid": false,
  "code": "NOT_ISSUED",
  "error": "This certificate ID is on file but has not been issued yet."
}
```

### Older ID matches two certificates — `409`

```json
{
  "ok": false,
  "valid": false,
  "code": "AMBIGUOUS",
  "error": "This older certificate ID matches more than one certificate. Use the full ID printed as CERT-P-… or CERT-V-…."
}
```

### Too many checks — `429`

```json
{
  "ok": false,
  "valid": false,
  "code": "RATE_LIMITED",
  "error": "Too many verification attempts. Please wait a minute and try again."
}
```

Limit: 40 requests per minute per IP address.

### Portal unavailable — `500`

```json
{
  "ok": false,
  "valid": false,
  "code": "UNAVAILABLE",
  "error": "Verification is temporarily unavailable. Please try again later."
}
```

## Main-site example

```html
<form id="cert-check">
  <label for="cert-id">Certificate ID</label>
  <input id="cert-id" name="id" placeholder="CERT-P-12-345" required>
  <button type="submit">Verify</button>
  <p id="cert-result"></p>
</form>
<script>
  document.getElementById('cert-check').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('cert-id').value.trim();
    const result = document.getElementById('cert-result');
    result.textContent = 'Checking…';
    const response = await fetch(
      'https://autism.vaidyagogate.org/api/public/certificates/verify?id=' + encodeURIComponent(id)
    );
    const data = await response.json();
    if (data.valid && data.certificate) {
      const cert = data.certificate;
      result.textContent =
        'Valid ' + cert.typeLabel + ' certificate for ' + cert.holderName +
        ' — ' + cert.event.title + ' (' + cert.certificateId + ').';
      return;
    }
    result.textContent = data.error || 'This certificate could not be verified.';
  });
</script>
```

Show `holderName`, `typeLabel`, `event.title`, `event.date`, and `certificateId` on a valid result. Show `error` when `valid` is false. Treat any non-JSON response as unavailable.

A person can also open the human check page:

```text
https://autism.vaidyagogate.org/verify-certificate.html?id=CERT-P-12-345
```

That page calls this same API.

## cURL

```bash
curl -sS "https://autism.vaidyagogate.org/api/public/certificates/verify?id=CERT-P-12-345"
```
