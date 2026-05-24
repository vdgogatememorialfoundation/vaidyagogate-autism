# Vercel environment variables (autism portal)

Required for **Production** (or the site will crash with `FUNCTION_INVOCATION_FAILED`):

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | Neon **pooled** URL: `postgresql://...@ep-xxx-pooler....neon.tech/neondb?sslmode=require` |
| `APPLICANT_HOST` | `autism.vaidyagogate.org` |
| `PORTAL_SCHEME` | `https` |
| `NODE_ENV` | `production` |

Optional: `CRON_SECRET`, SMTP keys, R2 keys.

**Do not set** `SCANNER_HOST` — scanner is at `/scan` on the same domain.

After adding variables: **Redeploy** the project (Deployments → … → Redeploy).

Health check: `https://autism.vaidyagogate.org/api/health`

## URLs

| Page | Path |
|------|------|
| Public site (signup / login) | `/` |
| Applicant dashboard | `/dashboard` |
| Admin | `/admin` |
| Scanner | `/scan` |
