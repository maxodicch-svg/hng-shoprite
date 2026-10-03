# Zedu Store mobile app

Expo / React Native client for the shop. It signs in with the **same Google
account** as the website and reads the **same cart**, because both talk to the
same Supabase project and the same `/api/cart` endpoint.

This is the deliverable for the mobile half of Task 3.

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

- **The server prices everything.** The app sends only `{ slug, quantity }` and
  displays the `subtotalCents` / `shippingCents` / `totalCents` the API returns.
  It cannot show a price the server would not charge.
- **Sync is two-tier.** A Supabase **Realtime** subscription on `carts` and
  `cart_items` pushes another device's change in immediately — the "instant
  synchronization" tier. **Refetch-on-focus** and pull-to-refresh stay underneath
  as the fallback, so the cart is still correct if Realtime is unavailable.

---

## Run it on a real phone

### 0. First: the website must be deployed

The app talks to the **deployed** API (`EXPO_PUBLIC_API_BASE_URL`). The
`/api/cart` and `/api/products` routes only exist once the current commit is
pushed and Netlify has redeployed. Verify before touching the phone:

```bash
curl -i https://adorable-raindrop-ea8591.netlify.app/api/cart
# want: HTTP 401  {"error":"Sign in to use your cart."}
# if you get 404, the new routes are not deployed yet — push and wait for Netlify
```

### Preferred: install in GitHub Codespaces

The SDK 57 dependency tree is ~250 packages of native modules, and installing it
over a flaky or inspected connection fails part-way with `ECONNRESET`, leaving
`node_modules` half-built. Codespaces removes that variable entirely, and the
lesson guide explicitly allows it.

A `.devcontainer/devcontainer.json` is committed at the repository root, so the
environment is preconfigured: Node 22, the Metro ports forwarded, and
`npm install && npx expo install --fix` run automatically on creation.

1. **Push first** — Codespaces builds from GitHub, so local-only commits are not
   there:
   ```bash
   cd C:\Users\USER\Documents\HNG\hng-shop
   git push origin main
   ```
2. Open <https://github.com/maxodicch-svg/hng-shoprite> → **Code** → **Codespaces**
   → **Create codespace on main**. Wait for the post-create install to finish.
3. In the Codespaces terminal:
   ```bash
   cd apps/mobile
   cp .env.example .env      # fill in the Supabase anon key
   npx expo start --tunnel
   ```
   `--tunnel` is **required** here: Codespaces is not on your Wi-Fi, so the
   phone reaches Metro through Expo's relay instead of the LAN.
4. Scan the QR code with Expo Go on the phone.

Then do the Supabase steps below (redirect URL + Realtime publication) exactly as
written — they are the same regardless of where Metro runs.

> The generated `apps/mobile/package-lock.json` and any `node_modules` stay in the
> codespace. If you want the lockfile back, commit it there and pull it locally
> afterwards.

### Or: install locally

Use this if the network is healthy enough to pull ~250 packages without a reset.

### 1. Install

```bash
cd apps/mobile
npm install

# REQUIRED: aligns every Expo package with the installed SDK. Expo SDKs pin
# native module versions exactly, and a mismatch is the usual cause of a red
# screen on first launch. This is also the official SDK 57 upgrade path.
npx expo install --fix
npx expo-doctor          # optional but quick: sanity-checks the whole config
```

This app targets **Expo SDK 57** (React Native 0.86.3, React 19.2). The
`package.json` versions were set from Expo's own SDK metadata, but `--fix` is the
authority — let it correct anything it flags.

### 2. Configure

`apps/mobile/.env` must exist (it is gitignored):

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `https://adorable-raindrop-ea8591.netlify.app` |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://mhikydmbjbajrkzbxdnz.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon public` |

Copy `.env.example` if the file is missing. The app shows a yellow banner naming
any missing variable.

> **Never put `SUPABASE_SERVICE_ROLE_KEY` in this app.** It bypasses row level
> security. Only the anon key belongs in a mobile bundle.

### 3. Two one-time Supabase settings

Both are required, and both fail in a confusing way if skipped.

1. **Redirect URL.** Supabase → Authentication → URL Configuration → Redirect
   URLs → add `zedustore://auth/callback`. Without it, Google sign-in returns
   `redirect_uri_mismatch`.
2. **Realtime publication.** Run `supabase/schema.sql` (idempotent, safe to
   re-run). It adds `carts` and `cart_items` to `supabase_realtime`. Without it
   the app still works, but only pull-to-refresh updates the cart.

### 4. Start

```bash
npx expo start          # scan the QR code with Expo Go
npx expo start --tunnel # if phone and computer are not on the same Wi-Fi
```

Requirements: the **Expo Go** app on the phone. An APK is not needed.

> **SDK 57 and Expo Go — read this before recording.** Expo SDK 57 shipped on
> 30 June 2026, and per the release notes the Expo Go build for it *had not yet
> been approved* for the App Store / Play Store. What that means in practice:
>
> - **Android:** an up-to-date Play Store Expo Go supports SDK 57, and the CLI can
>   also install the matching Expo Go onto a connected device.
> - **iOS:** the SDK 57 Expo Go is installed with `eas go`, or onto a simulator
>   through the CLI — not from the App Store.
>
> If Expo Go reports *"project is incompatible with this version of Expo Go"*,
> that is this issue rather than a bug in the app. Install the matching client:
>
> ```bash
> npx eas go               # iOS device: installs the SDK 57 Expo Go build
> # or build a development client, which also gives you a real launcher icon:
> npx expo run:android
> ```
>
> `expo-dev-client` is already an optional dependency, so `npx expo run:android`
> needs nothing extra.

---

## The screens

| Route | What it does |
| --- | --- |
| `app/index.tsx` | Shop — product grid from `GET /api/products`, with Add to cart |
| `app/cart.tsx` | The shared cart: lines, totals, refresh-on-focus, sign-in/out |
| `app/auth/callback.tsx` | Deep-link landing for the Google redirect |

## The app icon

`assets/icon.png`, `adaptive-icon.png`, `splash.png` and `favicon.png` are
generated — real PNGs, not placeholders:

```bash
node tools/make-mobile-icons.mjs     # from the repository root
```

The generator uses only Node's built-in `zlib`, so it needs no image tooling.
The icon appears as the app tile inside Expo Go. A launcher icon on the home
screen requires a development build (`expo-dev-client`, listed as an optional
dependency) or an EAS build — Expo Go shows its own icon.

---

## Demonstrating the requirement

### Pre-flight — all five must be true before you record

| # | Check | How |
| --- | --- | --- |
| 1 | Schema applied | Supabase Table Editor lists `carts` + `cart_items` |
| 2 | Realtime enabled | Database → Publications → `supabase_realtime` lists both tables |
| 3 | Redirect URL registered | `zedustore://auth/callback` is in Authentication → URL Configuration |
| 4 | API routes deployed | `curl -i .../api/cart` returns **401**, not 404 |
| 5 | Phone ready | Expo Go installed, signed into the same Wi-Fi (or use `--tunnel`) |

### The shot

1. On the website, sign in with Google and add a product to the cart.
2. Open the app, sign in with **the same** account.
3. The Cart tab shows the item already there — fetched from `/api/cart`.
   **Hold on this shot; it is what is graded.**
4. Add a second product in the app, leaving the laptop in frame: with Realtime
   on, the website cart updates by itself, with no reload.
5. Pull to refresh in the app so the fallback mechanism is on camera too.

### One thing to know before you demo checkout

Checking out **does not empty the shared cart**. That is deliberate and matches
how the website behaves — `createOrder` persists an order, it does not touch
`carts`. So if you place an order on camera, the items stay in both carts
afterwards. Either leave checkout out of the recording, or say so on camera;
do not let it look like the order failed.

---

## Why this app does not import `src/lib` from the website

It was the obvious thing to do, and it was rejected on evidence: this repo's
`src/lib` uses relative imports with explicit `.ts` extensions, which Metro does
not resolve without a custom resolver, and the website's `tsconfig.json`
`include` globs the whole tree — so sharing the files would have meant either a
Metro workaround or breaking the web build. The mobile app therefore mirrors the
small amount of pure display logic it needs (`lib/cart.ts`, `lib/money.ts`,
`lib/catalog.ts`) and keeps the website untouched.

The duplication is display-only, and it is tested: `npm run check` at the repo
root also runs `apps/mobile/tests/mobile.test.mjs`, which asserts that the mobile
catalog and prices match the website's rules.

The rules that decide money are enforced once, on the server.
