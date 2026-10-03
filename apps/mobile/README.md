# Zedu Store mobile app

Expo / React Native client for the shop. It signs in with the **same Google
account** as the website and reads the **same cart**, because both talk to the
same Supabase project and the same `/api/cart` endpoint.

This is the deliverable for the mobile half of Task 3. It creates no orders of
its own beyond what the shared API supports — the point being demonstrated is
that a product added to the cart on the website is already in the app.

---

## How the cart is shared

```
website (Next.js)                     mobile app (Expo)
──────────────────                    ─────────────────
Google sign-in ─┐                     ┌─ Google sign-in
                ▼                     ▼
        Supabase Auth (same project, same user id)
                │                     │
        cookies │                     │ PKCE + zedustore:// deep link
                ▼                     ▼
             GET / PUT / DELETE  /api/cart   (Bearer <access_token>)
                          │
                          ▼
              public.carts + public.cart_items   ← one cart per user
```

Two decisions worth knowing:

- **The server prices everything.** The app sends only `{ slug, quantity }` and
  displays the `subtotalCents` / `shippingCents` / `totalCents` the API returns.
  It cannot show a price the server would not charge.
- **Sync is two-tier.** A Supabase **Realtime** subscription on `carts` and
  `cart_items` pushes another device's change into the app immediately — that is
  the "instant synchronization" tier. **Refetch-on-focus** (and pull-to-refresh)
  stays underneath it as the fallback, so the cart is still correct if Realtime
  is unavailable. Step 3 below enables Realtime; without it the app still works,
  just without the push.

---

## Run it on a real phone

You need the **Expo Go** app (Android/iOS) on your phone and your phone on the
same network as your computer.

```bash
cd apps/mobile
npm install
cp .env.example .env          # then fill in the anon key
npx expo start                # scan the QR code with Expo Go
```

The app reads its config from `.env`:

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | The deployed shop, e.g. `https://adorable-raindrop-ea8591.netlify.app`. Use `http://<your-lan-ip>:3000` to test against `npm run dev`. |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://mhikydmbjbajrkzbxdnz.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon public` |

> **Never put `SUPABASE_SERVICE_ROLE_KEY` in this app.** It bypasses row level
> security. Only the anon key belongs in a mobile bundle.

### One-time Supabase setting

`zedustore://auth/callback` must be registered or Google sign-in fails:

**Supabase → Authentication → URL Configuration → Redirect URLs** →
add `zedustore://auth/callback` (or `zedustore://**`).

Do this *before* recording the demo.

### Instant sync needs the Realtime publication

`supabase/schema.sql` adds `carts` and `cart_items` to the `supabase_realtime`
publication (with `replica identity full`, so DELETEs still identify their cart).
That is part of the schema script — if you have already run it, re-run it; the
statement is guarded and safe to repeat.

Confirm in **Database → Publications → `supabase_realtime`** that both tables are
listed. Realtime enforces the same RLS policies, so a subscriber only ever
receives events for their own cart.

---

## Screens

| Route | What it does |
| --- | --- |
| `app/index.tsx` | Shop — product grid from `GET /api/products`, with Add to cart |
| `app/cart.tsx` | The shared cart: lines, totals, refresh-on-focus, sign-in/out |
| `app/auth/callback.tsx` | Deep-link landing for the Google redirect |

## The app icon

`assets/icon.png`, `adaptive-icon.png`, `splash.png` and `favicon.png` are
generated — they are real PNGs, not placeholders:

```bash
node tools/make-mobile-icons.mjs     # from the repository root
```

The generator uses only Node's built-in `zlib`, so it needs no image tooling.
The icon shows up as the app tile inside Expo Go; a standalone icon in the
launcher requires a development build or a store/EAS build.

---

## Demonstrating the requirement

1. On the website, sign in with Google and add a product to the cart.
2. Open the app, sign in with **the same** account.
3. The Cart tab shows the item already there — the app fetched it from
   `/api/cart`.
4. Pull to refresh (or switch tabs and back) to make the sync explicit on camera.

---

## Why this app does not import `src/lib` from the website

It was the obvious thing to do, and it was rejected on evidence: this repo's
`src/lib` uses relative imports with explicit `.ts` extensions, which Metro does
not resolve without a custom resolver, and the website's `tsconfig.json`
`include` globs the whole tree — so sharing the files would have meant either a
Metro workaround or typing the web build. The mobile app therefore mirrors the
small amount of pure logic it needs (`lib/cart.ts`, `lib/money.ts`,
`lib/catalog.ts`) and keeps the website untouched.

The duplication is display-only. The rules that decide money are enforced once,
on the server.
