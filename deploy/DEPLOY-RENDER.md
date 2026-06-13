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
- Homepage loads with NexGen AI theme
- Admin → Integrations → test email
- Forgot password email

## Cron jobs

Blueprint cron jobs call:

- `GET /api/cron/process-notifications` (09:00 UTC)
- `GET /api/cron/pending-registration-reminders` (10:00 UTC)
- `GET /api/cron/event-starting-today` (03:30 UTC)

Header: `Authorization: Bearer <CRON_SECRET>`

On Render web service, **node-cron** also runs in-process (reminders + queue drain).

## 7. Prevent free-tier spin-down (keep server warm)

**Your setup:** full-stack Node app on **Render** — static site + Express API + admin + Postgres (Neon). One web service serves everything.

Render **free** web services sleep after ~15 minutes with no traffic. The first visit after sleep can take 30–60 seconds (cold start).

### Recommended: external ping every 10–14 minutes (free)

Use a free uptime checker — **no code changes required** beyond the built-in ping URL:

| Setting | Value |
|---------|--------|
| URL | `https://autism.vaidyagogate.org/api/ping` |
| Interval | Every **10–14 minutes** |
| Expected response | `{"ok":true,"pong":true}` |

**Cron-job.org**

1. Create account at [cron-job.org](https://cron-job.org)
2. **Create cronjob** → URL: `https://autism.vaidyagogate.org/api/ping`
3. Schedule: every **10 minutes** (or `*/10 * * * *`)
4. Save — no auth header needed for `/api/ping`

**UptimeRobot** (alternative): add HTTP monitor, 5-minute interval on free tier.

> Use `/api/ping` (instant, no database) — not `/api/health` (checks Postgres and is slower).

### Other options

| Option | Notes |
|--------|--------|
| **Render Starter plan** | `render.yaml` uses `plan: starter` — paid tier stays awake 24/7 |
| **Render cron keepalive** | Possible but cron jobs are billed separately; external ping is simpler on free tier |
| **Split frontend/backend** | Not needed — this repo is one Node app; splitting adds complexity |

### Loading screen (already on site)

If the server was sleeping, the homepage preloader shows **“Waking up the portal…”** while `/api/ping` completes.
