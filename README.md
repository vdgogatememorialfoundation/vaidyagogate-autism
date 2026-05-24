# Autism Awareness Portal

Separate portal from the VGMF doctor/seminar system (`D:\SeminarSystem`).  
**Do not modify the doctor portal** when working on this project.

## Domains

| Surface | URL |
|---------|-----|
| Public site & applicant signup | `https://autism.vaidyagogate.org` |
| Applicant dashboard | `https://autism.vaidyagogate.org/applicant.html` |
| Admin | `https://autism.vaidyagogate.org/admin.html` |
| Scanner (separate subdomain) | `https://scan.autism.vaidyagogate.org` |

## Applicant flow

1. Create account / sign in (same login ID process as doctor portal)
2. Dashboard
3. **Pre-registration** form (scheduled window per event)
4. **Main registration** form
5. Admin approves → **e-ticket issued automatically** (no payment)
6. **Competition uploads** — photos, videos, PPT, PDF from dashboard

## Included modules

- E-tickets & scanner
- Certificates, feedback, support tickets, volunteers
- Admin registration scheduling (pre-reg + main reg dates)
- Media / competition submissions

## Excluded (vs doctor portal)

- Judge portal
- Case presentation
- Payments / fees / receipts / orders

## Local development

```bash
cd D:\autism
npm install
set PORT=3001
set PORTAL_SCHEME=http
set APPLICANT_HOST=localhost
npm start
```

Open:

- http://localhost:3001/ — public site
- http://localhost:3001/applicant.html — applicant portal
- http://localhost:3001/admin.html — admin
- http://localhost:3001/scanner.html — scanner

## Production environment

```env
NODE_ENV=production
PORT=3001
PORTAL_SCHEME=https
APPLICANT_HOST=autism.vaidyagogate.org
SCANNER_HOST=scan.autism.vaidyagogate.org
DATABASE_URL=postgresql://...
```

Use a **separate database** from the doctor portal so data stays isolated.

## Deployment notes

- Point DNS `autism.vaidyagogate.org` and `scan.autism.vaidyagogate.org` to this app’s server.
- Run this app as its own Node process (different port/service from `SeminarSystem`).
- Configure reverse proxy: `/admin` → `admin.html`, root → public `index.html`.
