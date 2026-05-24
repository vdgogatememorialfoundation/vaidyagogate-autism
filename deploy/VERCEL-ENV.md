# Vercel environment variables (autism portal)

Required for **Production** (or the site will crash / admin login will fail):

| Variable | What to set |
|----------|-------------|
| `DATABASE_URL` | **Full** Neon **pooled** connection string from the Neon dashboard (see below) |
| `ADMIN_EMAIL` | Admin login email (e.g. `admin@vaidyagogate.org`) |
| `ADMIN_PASSWORD` | Admin login password (e.g. `Admin@2026`) |
| `APPLICANT_HOST` | `autism.vaidyagogate.org` |
| `PORTAL_SCHEME` | `https` |
| `NODE_ENV` | `production` |

Optional: `DATABASE_URL_DIRECT` (non-pooler URL for migrations), `CRON_SECRET`, SMTP, R2.

**Do not set** `SCANNER_HOST` — scanner is at `/scan` on the same domain.

After any change: **Deployments → Redeploy** (required).

Health check: `https://autism.vaidyagogate.org/api/health`  
Expect: `"ok": true`, `"bootstrap": { "state": "ready" }`.

---

## How to copy the correct `DATABASE_URL` from Neon

1. Open [https://console.neon.tech](https://console.neon.tech) → your project (e.g. `misty-meadow`).
2. Click **Connect** (or **Connection details**).
3. Choose **Connection string** → **Pooled connection** (hostname contains `-pooler`).
4. Copy the entire string. It must look like this shape (your values will differ):

```text
postgresql://neondb_owner:YOUR_PASSWORD@ep-misty-meadow-aphijqi6-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Important**

- The host must include the **region**, e.g. `us-east-2.aws.neon.tech` — **not** `....neon.tech`.
- Do **not** copy examples from docs that use `ep-xxx` or `....` — those are placeholders.
- Paste into Vercel **without** extra quotes or spaces.
- Password special characters are OK in the URL (Neon encodes them).

5. Vercel → Project → **Settings** → **Environment Variables** → edit `DATABASE_URL` → paste → **Save**.
6. **Redeploy** production.

### If health shows `ENOTFOUND` or `....neon.tech`

Your `DATABASE_URL` hostname is wrong. Replace it with a fresh copy from Neon (step 1–6 above).

---

## URLs

| Page | Path |
|------|------|
| Public site | `/` |
| Applicant dashboard | `/dashboard` |
| Admin | `/admin` |
| Scanner | `/scan` |
