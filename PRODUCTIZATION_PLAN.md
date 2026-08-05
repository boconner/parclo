# Parclo Productization Plan

Goal: turn this copy of the Contento app into an out-of-the-box retail-execution
product for small CPG brands. Positioning: *"Repsly for brands that can't afford
Repsly, with a QR restock portal stores actually use."*

Decisions this plan assumes (revisit if either changes):

- **Single-tenant white-label first.** One deploy per customer, branding and
  products loaded from config/DB — not hardcoded. Multi-tenancy (Org model,
  Clerk Organizations, Stripe) comes only after a few paying customers; because
  all brand references go through one config object, that later migration is
  "move config into an Org row," not another full sweep.
- **v1 cuts:** invoice PDF generation, the Goody Goody scraper (returns later as
  a paid "retailer connector"), one-off Contento scripts. Everything else stays.

---

## Phase 0 — Delete Contento scar tissue

Straight deletions, no design work:

| Delete | Also touch |
|---|---|
| `backend/scripts/fix-colleyville.ts`, `fix-colleyville2.ts` | — |
| `backend/scripts/geocode-goody-goody.ts`, `rename-goody-goody.ts`, `seed-goody-goody.ts`, `seed-tastings.ts`, `migrate-supply-requests.ts` | `backend/package.json` script entries |
| `backend/src/jobs/goodyGoodyStock.ts`, `runGoodyGoodyStock.ts` | Remove import + `/retail-stock` + `/sync-goodygoody` endpoints in `backend/src/routes/inventory.ts` (lines ~4, 667–740); `sync:goodygoody` script; `contento-stock-sync` cron in `render.yaml`; the "Live bottles-on-shelf… goodygoody.com" card in `frontend/src/pages/Inventory.tsx` (~line 895) |
| `frontend/src/lib/exportInvoice.ts`, `frontend/src/components/CreateInvoiceModal.tsx` | Remove the "Create invoice" entry point in `frontend/src/pages/Orders.tsx` |
| Root clutter: `Contento_*.docx/pptx/xlsx/pdf`, `parclo-investor-deck (1).pptx`, `tethe thethe.pdf`, `image.png`, `~$ntento_Client_Brief.docx` | Move out of the repo, don't commit |

Keep (revised from the original triage): the supply-pipeline ledger
(`ProductionRun`, `WarehouseTransfer`, `FieldDeployment`, `SalesEntry`). It
feeds `useCasesOut`, the dashboard `SellThroughCard`, and visit flows
(`routes/visits.ts`) — cutting it ripples too far for v1. Revisit as a
feature flag ("Supply pipeline" on/off per customer) in Phase 3.

Keep `StockSync` (the model) — it's the audit trail any future retailer
connector writes to. Generalize its `source` default away from
`"goodygoody_api"` in Phase 2.

## Phase 1 — Brand config (the de-branding sweep)

One `OrgSettings` singleton row (pattern already exists: `InventorySettings`
with `id: "default"`) + an admin Settings page:

```
brandName, logoUrl, primaryColor, supportEmail, fromEmail,
portalHelpText, appUrl
```

Frontend reads it from `/api/me` (already called on boot); portal pages get it
from the existing token-resolve response so unauthenticated store staff see the
right brand too.

Files with hardcoded Contento branding, by kind:

**Emails (backend)**
- `backend/src/restockNotify.ts` — "Contento · Store Request" header, `#724fac`
  button, "Open in Contento", "Your Contento request" subject
- `backend/src/routes/supply-requests.ts` — "Contento · Supply Request" header,
  "Sent from Contento" footer

**App chrome (frontend)**
- `frontend/index.html` — `<title>`, `apple-mobile-web-app-title`
- `frontend/vite.config.ts` — PWA manifest name + `theme_color: '#724fac'`
- `frontend/tailwind.config.js` — `brand.DEFAULT: '#724fac'` → point at a CSS
  variable (`var(--brand)`) set at boot from OrgSettings, so color is runtime
  config, not a rebuild
- `frontend/src/assets/contento.png`, `frontend/public/` icons — logo becomes
  `OrgSettings.logoUrl` (uploaded file or URL); ship a neutral Parclo default
- `frontend/src/pages/Login.tsx`, `frontend/src/components/layout/AppLayout.tsx`,
  `frontend/src/components/ui/UpdateBanner.tsx`

**Portal copy (customer-facing — highest polish bar)**
- `frontend/src/components/portal/RestockForm.tsx` — "How's your Contento
  stock?", "ask your Contento rep", logo
- `frontend/src/components/portal/PortalQrCard.tsx`, `frontend/src/pages/ChainPortal.tsx`,
  `frontend/src/pages/StorePortal.tsx`

**Exports & reports**
- `frontend/src/lib/exportReports.ts`, `exportStores.ts` (+ its test) — report
  titles and `contento-*` filenames → brand slug
- `frontend/src/pages/Reports.tsx` — logo import for PDF header

**Deploy & data**
- `render.yaml` — `contento-db/api/frontend/stale-alerts` → parameterize per
  customer (this file becomes a per-customer template)
- `frontend/.env`, `.env.production` — `VITE_API_URL`
- `backend/src/seed.ts` — replace Contento reps/Goody Goody stores with a
  neutral demo dataset ("Acme Beverages"); demo mode doubles as the sales demo
- `docs/rep-training-guide.html` — genericize or regenerate per customer
- `CHANGELOG.txt`, `UPDATE_LOG_v1.0.2.txt` — retire; use git history

**Comments/tests** mentioning Goody Goody (`storeDisplayName.ts/.test.ts`,
`index.ts` "Contento account by design") — low priority, sweep last.

Definition of done for Phase 1: `grep -ri "contento\|goody" backend/src
frontend/src` returns nothing.

## Phase 2 — Product model (the structural change)

The app currently assumes exactly one SKU: `Store.onShelf/inProcess/
daysOfSupply/depletionRate` are single numbers, `SupplierOrders.tsx` hardcodes
a `PRODUCTS` array of four Contento SKUs, `StockSync.productSku` is free text.

Schema:

```prisma
model Product {
  id        String   @id @default(cuid())
  name      String
  sku       String?
  sizeLabel String?          // "750ml", "Case of 6"
  status    ProductStatus @default(active)  // active | archived
  ...
}

model StoreProduct {          // replaces Store.onShelf et al.
  storeId, productId  @@id
  onShelf, inProcess  Int
  daysOfSupply, depletionRate Float?
}
```

Migration: create one Product from existing data, copy each store's numbers
into a StoreProduct row. **Single-product brands keep today's exact UX** — when
`products.length === 1` every screen renders as it does now (no product picker,
aggregate numbers). Multi-product UI is additive, not a rewrite.

Touch points, in dependency order:
1. `backend/prisma/schema.prisma` + migration
2. `backend/src/routes/inventory.ts`, `stores.ts`, `dashboard.ts` — read/write
   StoreProduct; aggregate for dashboard cards
3. `backend/src/jobs/staleAlerts.ts` — no-movement/low-stock per product
4. `backend/src/routes/supplier-orders.ts` + `frontend/src/pages/SupplierOrders.tsx`
   — `PRODUCTS` array → `GET /api/products`
5. Portal `RestockForm` — optional product picker (single-product: unchanged)
6. `frontend/src/pages/Inventory.tsx`, `StoreDetails.tsx`, `Dashboard.tsx`,
   exports — per-product rows behind the single-product collapse
7. `InventorySettings` thresholds stay global in v1; per-product later

## Phase 3 — Out-of-the-box onboarding

Target: new customer live in under an hour, no engineer.

- First-run wizard: brand settings → add products → import stores CSV (the
  `routes/import.ts` + import UI already exist — promote them to the front
  door) → invite reps (Clerk invitations) → print QR cards (`PortalQrCard`
  already does this)
- Empty states on every page that point at the next setup step
- Feature flags in OrgSettings: supply pipeline, events, supplier orders,
  public locator API — so a lightweight customer sees a lightweight app
- `render.yaml` → documented per-customer deploy template (name prefix, env)

## Later (after first paying customers)

- **Retailer connectors** (premium tier): generalize the Goody Goody job into a
  per-chain config (endpoint, SKU mapping, store-number mapping) writing to
  StockSync. Each connector is bespoke work — price it that way.
- **Multi-tenancy**: Org model, `orgId` on every table, Clerk Organizations,
  Stripe billing, self-serve signup. OrgSettings becomes a row per org.
- Distributor mode (brand grouping on products) — only when a distributor asks.

## Rough sizing

| Phase | Size |
|---|---|
| 0 — deletions | half a day |
| 1 — brand config | 2–4 days (portal + email templates are the fiddly part) |
| 2 — product model | 1–2 weeks (touches every read path; migration needs care) |
| 3 — onboarding | ~1 week |
