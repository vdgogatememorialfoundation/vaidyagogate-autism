# Certificate verification API

Use this API on the main website so a visitor can type the Certificate ID printed on a certificate and see whether that certificate was issued.

Every participation and volunteer certificate gets one numeric ID from a single series. The first number is 200284. Each later certificate adds 1. The value is always shown as 12 digits, so the first ID is `000000200284` and the next is `000000200285`. The same ID is printed on the certificate and included in the certificate email.

Base URL (production):

```text
https://autism.vaidyagogate.org
```

The browser on the main site can call this API directly. Cross-origin requests are allowed. Responses are not cached.

## Certificate ID

| | |
|--|--|
| Format | 12 digits, numbers only |
| Series start | 200284 |
| First ID | `000000200284` |
| Next ID | `000000200285` |

Leading zeros are part of the ID. `200284` and `000000200284` verify as the same certificate. Older IDs printed as `CERT-P-…` or `CERT-V-…` still verify and return the 12-digit ID.

A certificate verifies only after it has been issued (enabled) for that person. A draft record does not count as valid, and the response does not include the holder’s name in that case.

## Check a certificate

```http
GET /api/public/certificates/verify?id=000000200284
```

The same check is available at:

```http
GET /api/public/certificates/000000200284
```

### Valid certificate — `200`

```json
{
  "ok": true,
  "valid": true,
  "certificate": {
    "certificateId": "000000200284",
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
    "verifyUrl": "https://autism.vaidyagogate.org/verify-certificate.html?id=000000200284",
    "apiUrl": "https://autism.vaidyagogate.org/api/public/certificates/verify?id=000000200284"
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
  "error": "Enter the 12-digit certificate ID, for example 000000200284."
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
  <input id="cert-id" name="id" placeholder="000000200284" inputmode="numeric" maxlength="12" required>
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
https://autism.vaidyagogate.org/verify-certificate.html?id=000000200284
```

That page calls this same API.

## cURL

```bash
curl -sS "https://autism.vaidyagogate.org/api/public/certificates/verify?id=000000200284"
```
