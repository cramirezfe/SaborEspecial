# Developer Quickstart — Sabor Especial

This guide gets a new developer from zero to a running local environment with a real Supabase backend. It covers what to set up, how to verify each piece works, and what still needs manual testing before going to production.

---

## Prerequisites

| Tool | Min version | Notes |
|------|-------------|-------|
| Node.js | 18+ | For running API functions and test scripts |
| Python 3 | any | Only needed for the local static file server |
| Vercel CLI | latest | `npm i -g vercel` |
| Git | any | |

You also need accounts on:
- **Supabase** — [supabase.com](https://supabase.com) (free tier works)
- **Vercel** — [vercel.com](https://vercel.com) (free tier works)

---

## 1. Clone and install

```bash
git clone https://github.com/viniesqui/saborespecial.git
cd saborespecial
npm install
```

There is no build step. The frontend is plain HTML/CSS/JS.

---

## 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Note down:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public key** (Settings → API → Project API keys)
   - **service_role key** (Settings → API → Project API keys — keep this secret)

---

## 3. Run database migrations

All schema lives in `/supabase/migrations/`. Run them in order against your project:

```bash
# Option A — Supabase CLI (recommended)
npx supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"

# Option B — paste each file manually in the Supabase SQL editor
# Files: 001_multi_tenant_schema.sql → 015_plug_and_play_onboarding.sql
```

After migration you should see these tables in the Table Editor:
`cafeterias`, `cafeteria_users`, `settings`, `menus`, `orders`, `delivery_events`, `credits`, `meal_packages`, `error_logs`.

---

## 4. Seed a test cafeteria

The onboarding trigger (migration 015) creates a cafeteria row and default settings automatically when you call `POST /api/onboard`. But for local testing you can also seed one directly in SQL:

```sql
-- Run in Supabase SQL editor
SELECT onboard_cafeteria('mi-soda', 'Mi Soda de Prueba', 'admin@example.com');
```

This returns a `cafeteria_id` UUID — keep it handy for the env vars below.

---

## 5. Configure environment variables

### Backend (Vercel / local `vercel dev`)

Create a `.env.local` file at the project root (never commit it):

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
CAFETERIA_ID=uuid-from-step-4
APP_BASE_URL=http://localhost:3000
ADMIN_SECRET=any-local-secret
ORDERS_PASSWORD=any-local-password
CORS_ORIGIN=*
# Optional — leave blank to skip email sending locally
RESEND_API_KEY=
```

### Frontend (`config.js`)

Open `config.js` and replace the two placeholder strings:

```js
supabaseUrl:     "https://xxxxxxxxxxxx.supabase.co",
supabaseAnonKey: "your-anon-key"
```

> The anon key is safe to expose in the browser. All sensitive operations go through the backend using the service_role key.

---

## 6. Run locally

### Start the API (Vercel dev server)

```bash
vercel dev
# API available at http://localhost:3000/api/*
# Static files served from project root
```

### Or run just the frontend (no API)

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

---

## 7. Verify the stack is working

Hit these endpoints to confirm the backend is up:

```bash
# Health check
curl http://localhost:3000/api/health

# Dashboard for your test cafeteria slug
curl "http://localhost:3000/api/dashboard?slug=mi-soda"

# List today's menu
curl "http://localhost:3000/api/menu?slug=mi-soda"
```

Expected: all return JSON without errors. If `dashboard` returns `cafeteria not found`, re-check the slug matches what you seeded in step 4.

---

## 8. Walk through the app pages

| URL | What it does | Auth required |
|-----|-------------|---------------|
| `/s/mi-soda` | Customer order form | None |
| `/management.html?slug=mi-soda` | Admin panel (menu, orders, export) | `ADMIN_SECRET` |
| `/deliveries.html?slug=mi-soda` | Kitchen delivery list | `ORDERS_PASSWORD` |
| `/track.html?slug=mi-soda` | Public order tracking by name | None |

Login credentials are whatever you set in `.env.local`. The admin panel and deliveries page each have a password prompt on first load.

---

## 9. Place a test order end-to-end

1. Open `/s/mi-soda` in the browser.
2. If the menu is empty, go to the **management panel** first and create a menu entry for today.
3. Enter a buyer name and select a payment method.
4. Submit — you should see a confirmation and the available-meal counter drop by 1.
5. Open `/deliveries.html?slug=mi-soda` and verify the order appears.
6. Mark it as **Entregado** (delivered) and confirm the status persists on reload.

---

## 10. Run the automated test suite

The test suite validates six critical areas: midnight reset, race conditions, multi-tenant isolation, high-latency resilience, input validation, and offline cache behaviour.

```bash
# Minimal run (most tests run with just a deployed API URL)
API_BASE_URL=http://localhost:3000 node scripts/test-integrity.js

# Full run with multi-tenant isolation tests
API_BASE_URL=http://localhost:3000 \
CAFETERIA_A_TOKEN=<supabase-jwt-for-tenant-a> \
CAFETERIA_B_ID=<uuid-of-tenant-b> \
node scripts/test-integrity.js
```

Tests that need env vars they don't have will **skip gracefully** — they won't fail the run. A clean baseline looks like:

```
✅ Suite 1 — Midnight Reset Logic
✅ Suite 2 — Concurrency & Race Conditions  
✅ Suite 3 — Multi-Tenant Isolation (skipped — tokens not set)
✅ Suite 4 — High-Latency Resilience
✅ Suite 5 — Input Validation
✅ Suite 6 — Offline-First PWA
```

---

## 11. What still needs manual testing

These areas have no automated coverage and should be checked by hand before going live:

| Area | How to test |
|------|-------------|
| **SINPE payment flow** | Place an order with SINPE method; verify the confirmation message shows the correct phone number |
| **Credits / meal packages** | Buy a package via `/packages`, spend a credit on an order, verify balance updates |
| **Excel export** | Use the `Exportar Excel` button in the management panel; open the downloaded CSV and confirm columns and data are correct |
| **Email notifications** | Set a real `RESEND_API_KEY`, place an order with a buyer email, confirm delivery |
| **Service Worker offline fallback** | Load the app, go offline in DevTools (Network → Offline), reload — the last known snapshot should appear |
| **Slow 3G resilience** | In DevTools → Network throttle to Slow 3G; submit an order and confirm no duplicate submission on double-click |
| **Midnight UTC-6 rollover** | Around midnight Costa Rica time (06:00 UTC), verify the available-meal counter resets to the daily max without a deploy |
| **Multi-tenant isolation** | Create two cafeterias; confirm orders from one are invisible in the other's admin panel |

See `PRODUCTION_CHECKLIST.md` for the full pre-launch validation checklist.

---

## 12. Project structure reference

```
/
├── index.html            # Login / landing page
├── customer-app.html     # Customer order form
├── management.html       # Admin panel
├── deliveries.html       # Kitchen delivery list
├── track.html            # Public order tracker
├── config.js             # Frontend config (supabase URL, slug resolution)
├── supabase-client.js    # Browser Supabase client init
├── app.js / management.js / deliveries.js / track.js / login.js
│
├── api/                  # Vercel serverless functions
│   ├── health.js
│   ├── dashboard.js
│   ├── menu.js
│   ├── orders.js
│   ├── deliveries.js
│   ├── onboard.js
│   ├── credits.js
│   ├── packages.js
│   ├── accounting.js
│   └── ...
│
├── lib/                  # Shared backend utilities (auth, email, logging)
├── data/                 # Repository layer (all DB queries)
├── supabase/migrations/  # 15 SQL migrations (run in order)
├── scripts/
│   └── test-integrity.js # Automated test suite
└── shared/               # Shared browser utilities
```

---

## Common issues

**`cafeteria not found` on all API calls**
→ The `slug` query param doesn't match any row in the `cafeterias` table. Re-run the seed SQL in step 4 and double-check the slug in the URL.

**`invalid API key` from Supabase**
→ You may have swapped anon key and service_role key. The backend uses `SUPABASE_SERVICE_ROLE_KEY`; the frontend uses `supabaseAnonKey` in `config.js`.

**Order count doesn't reset at midnight**
→ The reset is timezone-aware (`America/Costa_Rica`, UTC-6). Make sure your Supabase project is not filtering by UTC dates. The `getDayKey()` function in `app.js` handles the conversion.

**`vercel dev` can't find env vars**
→ Vercel CLI reads `.env.local` automatically. If variables are missing, run `vercel env pull .env.local` after linking the project with `vercel link`.

**Service Worker serving stale pages after a deploy**
→ Update the cache version constant in `sw.js` and redeploy. Clients will pick up the new version on next load.
