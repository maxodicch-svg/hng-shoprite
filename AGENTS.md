# AGENTS.md

Persistent context for any AI coding agent working in this repository.
Read this file before making changes. These rules are not suggestions.

---

## 1. Project

**Zedu Store** — a shop with a checkout page, built for the
**HNG Internship 15, Lesson 2** assignment.

| Item | Value |
| --- | --- |
| Live URL | _to be filled in after deploying to Netlify_ |
| Repository | _to be filled in after pushing to GitHub_ |
| Stack | Next.js 15 (App Router) + TypeScript + Tailwind, server components |
| Database | Supabase Postgres — `products`, `orders`, `order_items`, `profiles` |
| Email | Resend HTTP API (Mailgun transport retained but off by default) |
| Auth | Google OAuth via Google Cloud Console → Supabase Auth |
| Runtime | Node.js >= 20 |
| Deployment | Netlify — Next.js via the OpenNext adapter, zero config |

### Assignment requirements mapped to code

| Requirement | Where |
| --- | --- |
| Shop website | `src/app/page.tsx`, `src/app/product/[slug]/page.tsx`, `src/app/cart/page.tsx` |
| Checkout page | `src/app/checkout/page.tsx` → `src/app/api/checkout/route.ts` |
| Database persistence | `supabase/schema.sql`, `src/lib/store.ts` |
| Confirmation email | `src/lib/email.ts` + `src/lib/email/resend.ts`, resent at `src/app/api/orders/[reference]/email/route.ts` |
| Google auth | `src/lib/auth-client.ts`, `src/app/auth/callback/route.ts`, `src/middleware.ts` |
| Endpoint tests | `tests/lib.test.mjs`, `tests/flow.test.mjs`, `tests/email.test.mjs` |

---

## 2. Architecture rules

> **Pure logic in `src/lib`. The server owns prices. Secrets stay on the server.**

```
src/app/**            routes and pages; server components read via src/lib/store.ts
src/lib/cart.ts       PURE: validation, normalisation, pricing, references
src/lib/products.ts   the catalog + shipping rules (mirrors supabase/schema.sql seed)
src/lib/money.ts      integer minor units -> strings
src/lib/email.ts      provider selection + send; Resend is the active provider
src/lib/email/template.ts  PURE renderer: subject, HTML, text, esc()
src/lib/email/resend.ts    Resend transport
src/lib/email/mailgun.ts   Mailgun transport (alternative, off by default)
src/lib/supabase.ts   client factories + mock-mode detection
src/lib/store.ts      the ONLY module that queries Supabase
src/components/**     client components; no data fetching, no pricing
supabase/schema.sql   tables + RLS + seed
tests/**              node:test suites on the pure modules
```

### Non-negotiables

1. **The browser never sets a price.** Every total comes from `priceCart()` in
   `src/lib/cart.ts`, which reads the catalog. A price, discount or total sent by
   the client is ignored — `tests/flow.test.mjs` asserts this.
2. **`src/lib/cart.ts`, `products.ts`, `money.ts` and the render half of
   `email.ts` stay pure.** No `fetch`, no `process.env`, no Supabase import, no
   DOM. That is what makes them testable with `node:test` and no build step.
3. **Money is integer minor units.** Never a float, never a formatted string.
   `formatMoney()` is the only place that produces display text.
4. **Only `src/lib/store.ts` talks to the database.** It must degrade instead of
   throwing: catalog read failure falls back to the bundled catalog, missing
   service-role key falls back to `mock-store.ts`.
5. **`SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix and is imported by
   server code only.** Adding that prefix is a security regression.
6. **Email failure must never lose an order.** Persist first, then send, then
   record `orders.email_status` (`sent` / `failed` / `skipped`) with the reason.
7. **New persisted field** → add it to `supabase/schema.sql` (idempotent:
   `create table if not exists` / `drop policy if exists`), to `store.ts`, and to
   the README table.

### Rules for `src/app/api/**`

1. Validate before you write. Invalid input is `422` with `{ error, issues[] }`.
2. Never echo a raw database or email-provider error to the client; log it and
   return a generic message.
3. `export const dynamic = 'force-dynamic'` on anything that reads or writes
   order data.

---

## 3. Testing and validation rules

> "Write tests for all the endpoints that you create and always validate that
> these endpoints are working."

### Commands

```bash
npm test          # 48 tests, in-process
npm run check     # tsc --noEmit && npm test
npm run build     # production build
npm run dev       # http://localhost:3000
```

> The suites are run **in-process** (`node tests/lib.test.mjs`) rather than with
> `node --test tests/*.mjs`. The `--test` runner spawns a child per file over
> pipes, which hardened Windows sandbox policies block with `EPERM`. Do not
> switch the `test` script back to `--test` without verifying it on Windows.

### What must be tested

| Change | Required test |
| --- | --- |
| `cart.ts` / `money.ts` / `products.ts` change | Happy path + invalid input + boundary in `tests/lib.test.mjs` |
| Shipping or pricing rule | A boundary case at the threshold, plus tamper resistance |
| New validation rule | A `validateCustomer` case asserting the `field` name |
| Email template change | Rendered subject/body assertions **and** an escaping assertion |
| New API endpoint | Status codes, response shape and every error path, plus a row in the SETUP.md verification table |
| Bug fix | A regression test that fails before the fix and passes after |

### Quality gates before any commit

1. `npm run check` — 0 failures. A green run is required; do not commit red.
2. No secret in git: `.env.local` stays untracked, `.env.example` is the template.
3. No `console.log` in `src/lib` or `src/components` (server-side `console.warn`
   / `console.error` about a degraded integration is fine).
4. No `TODO`/`FIXME` without a linked issue number.
5. The app boots with **no** env vars (mock mode) and with full env vars (live).
6. Every dynamic value in email HTML goes through the `esc()` helper.

### Definition of done (feature)

- [ ] Pure logic in `src/lib`, tested
- [ ] `npm run check` green
- [ ] Works with keys absent (mock mode) **and** present
- [ ] `README.md` / `SETUP.md` updated if behaviour or setup changed
- [ ] Keyboard path intact; new inputs have labels and `aria-*` wiring

---

## 4. Code style

- **Language**: TypeScript, `strict`, ES modules, server components by default;
  `'use client'` only when state or event handlers are needed.
- Relative imports inside `src/lib` carry the `.ts` extension so the same files
  run under `node --experimental-strip-types` in tests as well as through Next's
  bundler (`allowImportingTsExtensions`). Keep that convention.
- **Quotes**: single in TS/JS, double in JSX attributes and HTML.
- **Indentation**: 2 spaces. Max line length ~100 characters.
- **Naming**: `camelCase` values, `UPPER_SNAKE_CASE` constants, `kebab-case`
  file names, PascalCase components.
- **Comments** explain *why*. Keep the JSDoc block on exported `src/lib`
  functions: parameters, return shape, edge cases.
- **CSS**: design tokens live in `:root` in `src/app/globals.css`; reuse
  `.btn`, `.card`, `.field`, `.banner`, `.lines`. Never hard-code a hex that
  already exists as a token.
- **Dependencies**: adding a runtime dependency needs a justification in the PR
  description. The current four (`next`, `react`, `react-dom`,
  `@supabase/supabase-js`, `@supabase/ssr`) are the intended set.

---

## 5. Accessibility requirements

- Every input has a real `<label for>`; errors use `aria-invalid` +
  `aria-describedby` + `role="alert"`.
- Async changes announce through `role="status" aria-live="polite"`.
- Icon-only controls carry `aria-label` or a `.sr-only` span.
- Focus is always visible (`:focus-visible` ring) and `prefers-reduced-motion`
  is respected.
- Never communicate state by colour alone.

---

## 6. Git conventions

- **Conventional Commits**: `feat:`, `fix:`, `test:`, `docs:`, `style:`,
  `refactor:`, `chore:`.
- One logical change per commit; tests ship with the code they cover.
- Never commit: `node_modules/`, `.next/`, `.env.local`, OS junk.
- Never commit the service role key, the Resend API key or the Google
  client secret — not even in a screenshot inside the README.

---

## 7. Deployment checklist

- [ ] `npm run check` green
- [ ] `AGENTS.md` present at the repository root (assignment requirement)
- [ ] `README.md` documents the live URL and how to run
- [ ] Pushed to GitHub
- [ ] Imported into Netlify with all env vars set (Production and Deploy Previews)
- [ ] `supabase/schema.sql` run against the production Supabase project
- [ ] Supabase + Google redirect URLs include the live domain
- [ ] Every row of the SETUP.md verification table checked against the live URL
- [ ] Live URL submitted through the official Zedu Lesson 2 form before the deadline
