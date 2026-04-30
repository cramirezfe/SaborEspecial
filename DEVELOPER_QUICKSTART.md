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

---

## Going to production — checklist for a real cafeteria

Everything above runs on `localhost`. This section covers what it takes to hand a live URL to a cafeteria and have them run their lunch service from day one.

### Step 1 — Deploy the backend to Vercel

```bash
# Link the repo and follow the prompts
vercel link

# Set every required env var (do this once; values persist across deploys)
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SUPABASE_ANON_KEY
vercel env add CAFETERIA_ID        # UUID from the onboarding step below
vercel env add APP_BASE_URL        # e.g. https://mi-soda.vercel.app
vercel env add ADMIN_SECRET        # strong random string — share only with the admin
vercel env add ORDERS_PASSWORD     # share only with kitchen staff
vercel env add RESEND_API_KEY      # see Step 4
vercel env add CORS_ORIGIN         # exact frontend origin, e.g. https://mi-soda.vercel.app

# Deploy
vercel --prod
```

The API is now live at `https://<your-project>.vercel.app/api`.

> Set `CORS_ORIGIN` to the exact frontend domain. Leaving it as `*` is fine for testing but not for production.

---

### Step 2 — Update `config.js` for production

`config.js` ships with placeholder values. Replace them before the final deploy:

```js
supabaseUrl:     "https://xxxxxxxxxxxx.supabase.co",   // your real project URL
supabaseAnonKey: "eyJ..."                               // your real anon key
```

The `apiBaseUrl` is derived from `window.location.origin` at runtime, so it automatically matches whatever domain you deploy to — no change needed.

Commit this file and redeploy:

```bash
git add config.js
git commit -m "config: set production Supabase credentials"
vercel --prod
```

---

### Step 3 — Onboard the cafeteria as a tenant

Every cafeteria needs a row in the `cafeterias` table. The onboarding endpoint handles this:

```bash
curl -X POST https://<your-project>.vercel.app/api/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "mi-soda",
    "name": "Mi Soda",
    "adminEmail": "admin@mi-soda.com"
  }'
```

This returns a `cafeteria_id` UUID. Copy it into the `CAFETERIA_ID` env var in Vercel (`vercel env add CAFETERIA_ID`) and redeploy.

The onboarding trigger also creates default `settings` (max 15 meals, sales window 10:00–12:00 CR, timezone `America/Costa_Rica`). The admin can adjust these from the management panel after launch.

---

### Step 4 — Set up email (Resend)

Order confirmations and payment notifications go through [Resend](https://resend.com).

1. Create a free account at resend.com.
2. Add and verify your sender domain (e.g. `notificaciones@mi-soda.com`).
3. Create an API key and set it as `RESEND_API_KEY` in Vercel.
4. Test: place a test order with a real email address and confirm the confirmation email arrives.

If you skip this step, orders still work — email calls fail silently and are logged to the `error_logs` table.

---

### Step 5 — (Optional) Set a custom domain

A cafeteria will share the URL with customers. `mi-soda.vercel.app` works but a custom domain looks more professional.

In the Vercel dashboard → your project → **Settings → Domains** → add your domain and follow the DNS instructions. The app needs no code changes — `config.js` resolves `apiBaseUrl` from `window.location.origin` automatically.

---

### Step 6 — Harden Supabase for production

| Setting | Where | Recommended value |
|---------|-------|------------------|
| Row Level Security | Supabase → Authentication → Policies | Enabled on all tables (migration 014 applies this) |
| JWT expiry | Supabase → Authentication → Settings | 1 hour (default) |
| Service role key exposure | — | Never in `config.js` or any client-side file |
| Database connection pooler | Supabase → Settings → Database | Use the pooler URL for high concurrency |

Migration `014_security_hardening.sql` already enables RLS policies. Confirm they are active:

```sql
-- Run in Supabase SQL editor
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- rowsecurity should be 't' for every table
```

---

### Step 7 — Share URLs with staff

Once deployed, the cafeteria team needs exactly three URLs:

| Who | URL | Password needed |
|-----|-----|----------------|
| Customers | `https://your-domain.com/s/mi-soda` | None |
| Admin / owner | `https://your-domain.com/management.html?slug=mi-soda` | `ADMIN_SECRET` |
| Kitchen staff | `https://your-domain.com/deliveries.html?slug=mi-soda` | `ORDERS_PASSWORD` |

Save these as bookmarks or a shared note. The customer URL is safe to post publicly (WhatsApp group, notice board, etc.).

---

### Step 8 — Run the pre-launch checklist

Before the first real lunch service, work through `PRODUCTION_CHECKLIST.md` from top to bottom. The eight checks take about 30 minutes and cover the scenarios most likely to fail in a real cafeteria rush:

- Service Worker installation and offline fallback
- SINPE payment state transitions
- Double-click / high-latency guard
- Multi-tenant data isolation
- Midnight counter reset (UTC-6 boundary)
- Cache version bump protocol
- Post-launch monitoring thresholds

```bash
# Run the automated suite one final time against the live URL
API_BASE_URL=https://your-domain.com node scripts/test-integrity.js
```

---

### Step 9 — First day monitoring

Watch these four signals during the first lunch rush (10:00–12:00 CR):

| Signal | Where to check | Action if wrong |
|--------|---------------|-----------------|
| `availableMeals` goes negative | Supabase → `orders` table row count vs `settings.max_meals` | Check `place_order_atomic` function is deployed |
| Orders not appearing in kitchen view | Deliveries page auto-refreshes every 30 s — check the network tab | Confirm `ORDERS_PASSWORD` is set correctly |
| Duplicate orders (same name, same minute) | Supabase → `orders` table | The `isSubmitting` guard in `app.js` should prevent this; check browser console for JS errors |
| Email confirmations not arriving | Resend dashboard → logs | Verify `RESEND_API_KEY` and sender domain are confirmed |

Supabase logs are at **Dashboard → Logs → API** and give a real-time view of every request and error.

---

### Production readiness summary

| # | Item | Done when… |
|---|------|------------|
| 1 | Vercel deployment with all env vars | `GET /api/health` returns 200 |
| 2 | `config.js` has real Supabase credentials | Login works in production URL |
| 3 | Cafeteria onboarded via `/api/onboard` | `CAFETERIA_ID` env var is set |
| 4 | Email configured (Resend) | Test order sends a confirmation email |
| 5 | RLS enabled on all tables | SQL check returns `rowsecurity = t` for all |
| 6 | Staff URLs documented and shared | Admin, kitchen, and customer links bookmarked |
| 7 | `PRODUCTION_CHECKLIST.md` fully green | All 8 checks marked DONE |
| 8 | First 30-minute monitoring done | No errors in Supabase logs or Vercel logs |
