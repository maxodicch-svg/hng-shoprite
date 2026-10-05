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
        cookies │                     │ PKCE + deep-link return
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

### Why this app is pinned to Expo SDK 54

Deliberate decision, recorded here because it looks like an oversight otherwise.

SDK 57 exists (it is npm's `latest`), and the app was upgraded to it and then put
back. The reason is purely the development machine: SDK 57's dependency tree is
large, and on a connection that resets part-way (`ECONNRESET`) the install never
completed, so the app could never be launched at all. SDK 54's tree installed
successfully and its tarballs are already in the local npm cache, which makes it
the **fastest working path** to a running app.

It is also the safer choice for this specific demo: Expo Go for SDK 54 is the
build currently on the App Store and Play Store, whereas the SDK 57 Expo Go had
not cleared store review. On SDK 54 the phone's Expo Go matches the project.

Nothing in the app's code is SDK-specific — it uses only `expo-router`,
`expo-web-browser`, `expo-linking` and Supabase, all of which exist in both. If
the SDK 57 install is ever completed, the upgrade is one command from a working
tree: `npx expo install expo@latest --fix`.

### 1. Install

```bash
cd apps/mobile
npm install
npx expo install --check    # confirms the versions match SDK 54; apply any it flags
npx expo-doctor             # optional but quick: sanity-checks the whole config
```

This app targets **Expo SDK 54** (React Native 0.81.5, React 19.1).

> On this machine `npm install` has needed the flags recorded in SETUP.md §5
> (`--maxsockets=1 --fetch-retries=12`) because the connection resets part-way.
> Re-running the same command is the fix — the npm cache resumes where it stopped.

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
   URLs. The value depends on where the app runs, and **both forms are needed if
   you demo in Expo Go and also build**:

   | Running in | Return URL to register |
   | --- | --- |
   | **Expo Go** (what this README describes) | `exp://<the host Expo prints>:8081/--/auth/callback`, e.g. `exp://192.168.43.67:8081/--/auth/callback` |
   | dev build / standalone | `zedustore://auth/callback` |

   > **Expo Go cannot receive `zedustore://`.** It registers its own `exp://`
   > scheme, so a custom-scheme redirect is never delivered: the sign-in tab
   > opens, Google succeeds, and the app waits forever — a second tap then throws
   > *"the auth session is in an invalid state with a redirect handler set when it
   > should not be"*. `lib/redirect.ts` therefore resolves the URL at runtime with
   > `Linking.createURL()`, which yields `exp://…` in Expo Go and
   > `zedustore://auth/callback` in a build.

   Without the matching entry, Supabase refuses the redirect and Google sign-in
   either lands on the website or returns `redirect_uri_mismatch`.
2. **Realtime publication.** Run `supabase/schema.sql` (idempotent, safe to
   re-run). It adds `carts` and `cart_items` to `supabase_realtime`. Without it
   the app still works, but only pull-to-refresh updates the cart.

### 4. Start

```bash
npx expo start          # scan the QR code with Expo Go
npx expo start --tunnel # if phone and computer are not on the same Wi-Fi
```

Requirements: the **Expo Go** app on the phone. An APK is not needed.

> **Expo Go must match the SDK.** This project is SDK 54, so use a normal
> up-to-date **Expo Go** from the App Store / Play Store — that build is SDK 54
> and will load it directly. (This is a real advantage of staying on 54: the
> SDK 57 Expo Go had not cleared store review.)
>
> If Expo Go reports *"project is incompatible with this version of Expo Go"*, the
> installed Expo Go is on a different SDK than the project. Check what it supports
> with `npx expo-doctor`, and either update Expo Go or, if you deliberately want to
> move the project forward, run `npx expo install expo@latest --fix`.

### 5. Building an APK to submit

`eas.json` ships a `preview` profile that produces an **installable release APK**
(signed by EAS, no Metro needed at runtime):

```bash
cd apps/mobile
npx eas-cli@latest login          # one-time, interactive
npx eas-cli@latest build --platform android --profile preview
```

Four things about that profile are load-bearing:

- **`developmentClient: false`.** The project lists `expo-dev-client` as an
  optional dependency. Without this flag EAS would build a *development* client
  that sits on a launcher screen waiting for a dev server; with it, EAS produces a
  standalone build ([docs](https://docs.expo.dev/versions/latest/sdk/dev-client/)).
- **The `EXPO_PUBLIC_*` values live in the profile's `env` block**, because
  `.env` is gitignored and is therefore never uploaded to EAS — a build without
  them shows the yellow "missing variable" banner. The anon key is publishable and
  ships inside every client bundle anyway; the **service role key must never
  appear there**.
- **The OAuth return URL changes to `zedustore://auth/callback`** in a standalone
  build (`lib/redirect.ts` resolves it), so that entry must stay in the Supabase
  redirect allow-list alongside the Expo Go one.
- **EAS uploads the project from git**, so commit before building or the build
  will not contain the change you just made.

The finished build appears at <https://expo.dev/accounts/[account]/projects/zedu-store/builds>
with a download button; that file is what goes to Google Drive for submission.

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
| 3 | Redirect URL registered | the URL for your shell — `exp://<host>:8081/--/auth/callback` in Expo Go, `zedustore://auth/callback` in a build — is in Authentication → URL Configuration |
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
