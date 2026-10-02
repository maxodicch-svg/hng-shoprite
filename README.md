# Zedu Store — HNG Internship 15, Lesson 2

A shop with a real **checkout page**, orders **persisted in Postgres (Supabase)**,
**Resend** confirmation emails and **Google sign-in**.

**Live URL:** <https://adorable-raindrop-ea8591.netlify.app/>
**Repository:** <https://github.com/maxodicch-svg/hng-shoprite>

| | |
| --- | --- |
| Stack | Next.js 15 (App Router, TypeScript, server components) + Tailwind |
| Database | Supabase Postgres (`products`, `orders`, `order_items`, `profiles`) |
| Email | Resend HTTP API (`POST /api.resend.com/emails`) |
| Auth | Google OAuth — Google Cloud Console client → Supabase Auth provider |
| Tests | 48 tests in 3 suites, `node:test`, zero test dependencies |
| Deploy | Netlify — <https://adorable-raindrop-ea8591.netlify.app/> (see [SETUP.md](./SETUP.md)) |

---

## What the assignment asked for, and where it lives

| Requirement | Implementation |
| --- | --- |
| Build a website for a shop | `/` product grid, `/product/[slug]` detail pages, `/cart` — `src/app/page.tsx`, `src/app/product/[slug]/page.tsx` |
| Add a checkout page | `/checkout` (`src/app/checkout/page.tsx`) → `POST /api/checkout` |
| Persist everything in a database | `supabase/schema.sql`; writes in `src/lib/store.ts` (`createOrder`, `markOrderEmail`); reads `/orders`, `/order/[reference]` |
| Send confirmation emails (the brief named Mailgun) | `src/lib/email.ts` (`renderOrderConfirmation`, `sendEmail`) sends through **Resend** (`src/lib/email/resend.ts`), dispatched from the checkout route and resendable via `POST /api/orders/[reference]/email`. The Mailgun transport is also implemented and tested (`src/lib/email/mailgun.ts`) and can be switched on with `EMAIL_PROVIDER=mailgun` — see [SETUP.md](./SETUP.md#2-confirmation-emails--resend) |
| Google auth with Google Cloud Console | `src/lib/auth-client.ts`, `/auth/callback`, `src/middleware.ts`; Google OAuth client configured in Google Cloud Console (steps in [SETUP.md](./SETUP.md)) |
| Write tests for the endpoints and validate them | `tests/lib.test.mjs`, `tests/flow.test.mjs`, plus the manual endpoint checklist in [SETUP.md](./SETUP.md#4-verify-everything-5-minutes) |

---

## Run it locally

```bash
npm install
cp .env.example .env.local     # optional — the app runs without it in mock mode
npm run dev                    # http://localhost:3000
```

Without keys the app runs in **mock mode**: the entire shop → checkout →
confirmation flow works, orders are held in memory, and the "confirmation email"
is printed to the server log. The banner at the top of every page says so. Add
keys to go live — [SETUP.md](./SETUP.md).

```bash
npm test        # 48 tests: pricing, validation, emails, checkout flow
npm run check   # typecheck + tests
npm run build   # production build
```

> `npm test` runs each suite in-process. `node --test` (the child-process runner)
> is blocked on some hardened Windows setups by the sandbox's pipe policy, so the
> suites deliberately use the in-process form.

---

## How checkout works

```
cart (localStorage)                server (never trusts the browser)
──────────────────                 ──────────────────────────────────
[{slug, quantity}]  ──POST──▶  validateCustomer()      → 422 with per-field issues
                                     │
                                     ▼
                               priceCart(items)        ← prices come from the DB
                                     │                    catalog, not the payload
                                     ▼
                               createOrder()           → orders + order_items
                                     │
                                     ▼
                               sendEmail()             → Resend, or logged in mock mode
                                     │
                                     ▼
                               201 { reference }  ──▶  /order/ZS-XXXXXX?placed=1
```

Three deliberate choices:

1. **The server owns the price.** `priceCart()` rebuilds every line from the
   catalog, so editing `localStorage` (or the request body) cannot change what is
   charged. `tests/flow.test.mjs` proves it with a tampered payload.
2. **Email failure never loses an order.** The row is written first;
   `orders.email_status` records `sent` / `failed` / `skipped` plus the reason,
   and the customer can re-send from the confirmation page.
3. **Guest checkout works.** Google sign-in is optional; when present the order
   is linked to `orders.user_id` and appears under `/orders`. Order history is
   scoped to the verified token's user id.

---

## Project structure

```
src/app/
  page.tsx                          shop front (product grid)
  product/[slug]/page.tsx           product detail
  cart/page.tsx                     cart, quantities, totals
  checkout/page.tsx                 checkout form + Google sign-in
  order/[reference]/page.tsx        confirmation, email status, resend
  orders/page.tsx                   signed-in order history
  login/page.tsx                    sign-in / auth setup state
  api/checkout/route.ts             POST  → validate, price, persist, email
  api/orders/route.ts               GET   → the caller's own orders (Bearer token)
  api/orders/[reference]/email/     POST  → re-send the confirmation
  api/health/route.ts               GET   → which integrations are wired
  auth/callback/route.ts            Google → Supabase code exchange
src/lib/
  cart.ts            pure: validation, normalisation, pricing, references
  products.ts        catalog (mirrors the SQL seed) + shipping rules
  money.ts           integer minor units → display strings
  email.ts           Resend sender + confirmation template
  email/template.ts  pure renderer (subject, HTML, text)
  email/resend.ts    Resend transport
  email/mailgun.ts   Mailgun transport (optional alternative)
  supabase.ts        server/browser clients, mock-mode detection
  store.ts           data access: products, orders, order_items
  mock-store.ts      in-memory fallback used only in mock mode
  auth-client.ts     browser OAuth helpers
src/components/      header, cart context, add-to-cart, resend-email
supabase/schema.sql  tables, RLS policies, seed data
tests/               48 tests
```

---

## Endpoints

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Integration status (booleans only, no key material) | none |
| `POST` | `/api/checkout` | Validate → price → persist → email | optional Bearer |
| `GET` | `/api/orders` | The caller's orders | **Bearer required** |
| `POST` | `/api/orders/{reference}/email` | Re-send a confirmation | reference as capability |

```bash
curl http://localhost:3000/api/health

curl -X POST http://localhost:3000/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"slug":"aura-desk-lamp","quantity":1}],
       "customer":{"fullName":"Ada Lovelace","email":"ada@example.com",
                   "address":"12 Analytical Engine Way","city":"London","postalCode":"EC1A"}}'
# 201 {"ok":true,"reference":"ZS-7QK2M4","totalCents":9800,...}
```

Error paths: `400` non-JSON body · `422` invalid fields (with `issues[]`) or
empty cart · `502` persistence failure. `tests/flow.test.mjs` covers each.

---

## Database

`supabase/schema.sql` creates four tables and enables row level security:

| Table | Notes |
| --- | --- |
| `products` | Public read-only catalog, 6 seeded products, prices in integer cents |
| `orders` | One row per purchase: reference, customer, totals, `status`, `email_status` |
| `order_items` | Line items snapshot the name and unit price, so history survives catalog edits |
| `profiles` | One row per Google user (`auth.users` id) |

Orders are written by the server with the service role key, which bypasses RLS;
the policies in the schema are the safety net for any direct client access.
Money is stored as integer minor units — never floats.

---

## Deploy

Netlify is the deployment target, configured with zero framework config: its
OpenNext adapter provisions the SSR function, the Route Handlers and the Edge
Middleware on its own. Add the environment variables, then update the Supabase
and Google redirect URLs to include the live domain. Full walkthrough:
[SETUP.md](./SETUP.md).

---

## Accessibility & quality

- Every input has a real `<label>`; errors are wired with `aria-invalid` +
  `aria-describedby` and announced via `role="alert"`.
- Cart and email changes announce through `aria-live` regions.
- Full keyboard path, visible focus rings, `prefers-reduced-motion` respected.
- Every dynamic value in the email HTML is escaped (`escapeHTML` in
  `src/lib/email.ts`) — covered by an XSS test.
- No secret ever reaches the browser bundle: the service role key has no
  `NEXT_PUBLIC_` prefix and is only imported by server code.

## Licence

MIT
