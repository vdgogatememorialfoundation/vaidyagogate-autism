# Deploy on Render (replace Vercel)

## 1. Create Render service

1. [render.com](https://render.com) → **New** → **Blueprint** → connect this GitHub repo, or **Web Service** manually.
2. If using `render.yaml`: Render creates **autism-portal** web service + 3 cron jobs.
3. If manual:
   - **Build:** `npm install && npm run build`
   - **Start command:** `npm start` (or `node server.js`) — **not** `node index.js` unless `index.js` exists in repo
   - **Health check:** `/api/health`

> If you see `Cannot find module index.js`, set **Start Command** to `npm start` in Render → Settings, or pull latest `main` (includes `index.js` shim).

## 2. Environment variables

Copy keys from [`.env.render.example`](../.env.render.example) into **Render → autism-portal → Environment**.

### DATABASE_URL (required — most common deploy failure)

**Do not** use `postgresql://user:pass@host:5432/...` — that is a placeholder and causes `getaddrinfo ENOTFOUND host`.

**Option A — same Neon DB as Vercel (recommended)**

1. [console.neon.tech](https://console.neon.tech) → your project → **Connect**
2. Copy **Pooled connection** string (host like `ep-xxxx-pooler.us-east-2.aws.neon.tech`)
3. Render → **Environment** → `DATABASE_URL` = paste full string (must include `?sslmode=require`)
4. **Save** → **Manual Deploy**

**Option B — Render Postgres**

1. Render → **New** → **PostgreSQL** → create database
2. Copy **Internal Database URL** (or External if web service is in another region)
3. Set as `DATABASE_URL` on the web service

Minimum for production:

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | Real Neon/Render URL — **not** `@host` placeholder |
| `PUBLIC_BASE_URL` | `https://autism.vaidyagogate.org` |
| `APPLICANT_HOST` | `autism.vaidyagogate.org` |
| `ZEPTOMAIL_API_KEY` | From ZeptoMail console |
| `ZEPTO_FROM` | Verified sender email |
| `CRON_SECRET` | Random string (same on web + cron jobs) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin (optional if already in DB) |

Render sets `RENDER=true` and `RENDER_EXTERNAL_URL` automatically.

## 3. Database

Use **Neon**, **Render Postgres**, or any PostgreSQL. Run `lib/schema-postgres.sql` once if bootstrap logs show missing tables.

## 4. Custom domain (Wix DNS)

Point your domain to Render:

| Type | Name | Value |
|------|------|--------|
| CNAME | `autism` (or `@` via flatten) | Your Render hostname, e.g. `autism-portal.onrender.com` |

In Render → **Settings → Custom Domains** add `autism.vaidyagogate.org`.

Update env: `PUBLIC_BASE_URL`, `APPLICANT_HOST`, `MAIN_SITE_URL` to match.

## 5. Remove Vercel

1. Vercel dashboard → project **vaidyagogate-autism** → delete or disconnect.
2. Remove old DNS CNAME to `cname.vercel-dns.com`.
3. This repo no longer uses `vercel.json` or `vercel deploy`.

## 6. Verify

- `https://your-service.onrender.com/api/health` → `"ok": true`, `"render": true`
- `https://your-service.onrender.com/api/ping` → `"pong": true` (lightweight keep-alive)
- Homepage loads with NexGen AI theme
- Admin → Integrations → test email
- Forgot password email

## Keep alive (prevent free tier sleep)

Render **free** web services spin down after ~15 minutes with no traffic. Cold starts add 30–60+ seconds.

This repo includes **two** keep-alive mechanisms (use either or both):

| Method | How |
|--------|-----|
| **Render cron** | Blueprint job `autism-keep-alive` hits `/api/ping` every **10 minutes** (`render.yaml`) |
| **GitHub Actions** | Workflow `.github/workflows/keep-alive.yml` pings the same URL every **10 minutes** |

After pushing `main`, enable in Render dashboard if using Blueprint: **Cron Jobs → autism-keep-alive**.

### External uptime checker (optional)

Free services that work well:

- [UptimeRobot](https://uptimerobot.com) — monitor `https://autism.vaidyagogate.org/api/ping` every **5–10 min**
- [cron-job.org](https://cron-job.org) — HTTP GET every **10 min**
- [Better Stack](https://betterstack.com/uptime) — similar

Use **`/api/ping`** (fast, no database). Use `/api/health` only when you need a full DB check.

To change the GitHub Actions target URL, set repo variable **`KEEP_ALIVE_URL`** (Settings → Secrets and variables → Actions → Variables).

## Cron jobs

Blueprint cron jobs call:

- `GET /api/cron/process-notifications` (09:00 UTC)
- `GET /api/cron/pending-registration-reminders` (10:00 UTC)
- `GET /api/cron/event-starting-today` (03:30 UTC)

Header: `Authorization: Bearer <CRON_SECRET>`

On Render web service, **node-cron** also runs in-process (reminders + queue drain).
