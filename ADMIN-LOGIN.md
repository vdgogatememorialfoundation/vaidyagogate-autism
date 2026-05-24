# Admin login — Autism portal

## Production (Vercel — autism.vaidyagogate.org/admin)

Admin accounts are **not stored in git**. They are created from **Vercel environment variables** when the server starts.

In **Vercel → Project → Settings → Environment Variables** (Production), set:

```text
ADMIN_EMAIL=admin@vaidyagogate.org
ADMIN_PASSWORD=Admin@2026
```

Then **Redeploy** once.

**If login shows “Database unavailable” or “certificate verification”:**  
1. Confirm `DATABASE_URL` is the full Neon **pooled** URL (`…-pooler….neon.tech/neondb?sslmode=require`).  
2. Redeploy after saving env vars.  
3. Open https://autism.vaidyagogate.org/api/health — `bootstrap.state` should be `ready`.  
4. Wait 10 seconds after a cold start and try admin login again.

| Field | Value |
|--------|--------|
| **URL** | https://autism.vaidyagogate.org/admin |
| **Email** | Same as `ADMIN_EMAIL` (e.g. `admin@vaidyagogate.org`) |
| **Password** | Same as `ADMIN_PASSWORD` (e.g. `Admin@2026`) |

Optional second super-admin:

```text
ADMIN_EMAIL_2=you@example.com
ADMIN_PASSWORD_2=YourSecurePassword
```

Optional co-admin:

```text
CO_ADMIN_EMAIL=coadmin@example.com
CO_ADMIN_PASSWORD=YourSecurePassword
```

After login, change the password under **Admin → Users** if you wish.

---

## Local development (D:\autism)

If `ADMIN_EMAIL` / `ADMIN_PASSWORD` are **not** set in `.env`, the app uses this default **only on your PC** (not on Vercel):

| Email | Password |
|--------|----------|
| `admin@vaidyagogate.org` | `Admin@2026` |

URL: http://localhost:3001/admin (or your `PORT`)

---

## Scanner staff login

| URL | https://autism.vaidyagogate.org/scan |
| Account | Create a user in Admin → Users with role **Scanner** |

---

## Participant (dashboard)

Participants sign up on the **main site** (https://autism.vaidyagogate.org/), then use **/dashboard** — not the admin login.
