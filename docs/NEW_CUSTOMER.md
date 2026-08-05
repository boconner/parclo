# Spinning up a new customer

One customer = one isolated deployment: their own database, API, frontend, and
Clerk application. Nothing is shared between customers. Budget about an hour
the first time, ~30 minutes once practiced.

Throughout, replace `acme` with the customer's short name.

## 1. Render

Deploy this repo as a new [Render Blueprint](https://render.com/docs/blueprint-spec).
Service names must be unique per Render account, so either:

- **Separate Render team per customer** (recommended — also separates billing), or
- Copy `render.yaml`, prefixing every `name:` with the customer (`acme-api`,
  `acme-db`, `acme-frontend`, `acme-stale-alerts`).

Four resources come up: Postgres, the API (web), the frontend (static site),
and the nightly stale-store cron. The API's start command runs
`prisma db push`, which creates the full schema on first boot — no manual
migration step.

## 2. Clerk

1. Create a **new Clerk application** at dashboard.clerk.com (one per customer;
   the free tier covers 10k MAU).
2. Copy its keys into Render:
   - API service → `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`
   - Frontend → `VITE_CLERK_PUBLISHABLE_KEY`
3. Create the founder/admin's user (or have them sign up), then in Clerk →
   Users → their user → **Public metadata**, set:

   ```json
   { "role": "admin" }
   ```

   That unlocks the Configuration pages. Everyone else is invited later from
   Configuration → Reps, which sends Clerk invitations.

## 3. Remaining environment variables

API service:

| Var | Value |
|---|---|
| `RESEND_API_KEY` | Resend key (theirs, or yours sending on their behalf) |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `notifications@acmebev.com` |
| `SUPPLY_REQUEST_EMAILS` | Comma-separated internal recipients for requests |
| `MAPBOX_TOKEN` | Public token — geocodes addresses during store import |
| `LOCATOR_API_KEY` | Only if they want the public website store locator |
| `FRONTEND_URL` | The app URL — used as the redirect for Clerk invitations |

Frontend:

| Var | Value |
|---|---|
| `VITE_API_URL` | The API service URL |
| `VITE_MAPBOX_TOKEN` | Public Mapbox token (store map) |

## 4. First boot

- **Do not run the seed** (`npm run seed`) — it loads fictional demo data
  (Vine Valley et al.) and is for sales demos only.
- Sign in as the admin. The dashboard shows a **"Finish setting up"** banner
  linking to **Configuration → Getting Started** — a checklist that tracks
  itself as data lands:
  1. **Branding** — name, logo URL, accent color, from/support email, app URL.
     The whole app (portals, QR cards, emails, reports) re-themes immediately.
     This page also has the **feature toggles** (events calendar, supply
     pipeline) — turn off what the customer doesn't need.
  2. **Products** — their SKUs.
  3. **Stores** — CSV import (regions and chains are created on the fly).
  4. **Reps** — email invitations via Clerk; link each user to a Rep record.
  5. **QR codes** — print per-store cards (and chain cards for HQ buyers).

## 5. Domain

Point their domain (e.g. `app.acmebev.com`) at the Render frontend and set the
same URL in Branding → App URL (email links) and `FRONTEND_URL` on the API.

**Do this before printing QR cards** — the printed codes embed the domain, and
rotating tokens later invalidates every card already on a counter.

## 6. Handoff checklist

- [ ] Admin can sign in; Getting Started shows 5/5
- [ ] Test restock request from a printed QR code → email arrives, styled with
      their brand, from their from-address
- [ ] Report PDF export shows their logo/name
- [ ] Reps invited and linked (Configuration → Reps shows no unlinked users)
- [ ] Custom domain serving the app over HTTPS
