# SETUP — wiring the three integrations

The app runs immediately in **mock mode** (`npm run dev`). Follow the sections
below to switch each integration to live. Nothing here needs a code change — it
is all environment variables and dashboards.

Copy the template first. That line just means "make a copy of `.env.example`,
named `.env.local`" — the real file is ignored by git, the template is committed:

```bash
cp .env.example .env.local
```

<details>
<summary>On Windows (PowerShell, or with no terminal at all)</summary>

```powershell
Copy-Item .env.example .env.local
```

With no terminal: open the `hng-shop` folder in File Explorer, click
`.env.example` once, `Ctrl+C`, `Ctrl+V`. Rename the copy to `env.local`, then
rename it again to `.env.local` (Windows hides the leading dot). Open it in
Notepad and paste each value straight after its `=`. A blank value simply means
"not configured yet".
</details>

After every change to `.env.local`, restart `npm run dev` (Next.js only reads env
files at startup).

---

## 1. Database + Google auth — Supabase

### 1.1 Create the project

1. Sign in at [supabase.com](https://supabase.com) → **New project**.
2. Pick a name, a strong database password, and the region closest to you.
3. Wait for provisioning (~2 minutes).

### 1.2 Create the tables

1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](./supabase/schema.sql) and press **Run**.
3. Confirm the tables exist under **Table Editor**: `products`, `orders`,
   `order_items`, `profiles`, with 6 seed products.

The script is idempotent — re-running it is safe.

### 1.3 Fill in the keys

**Project Settings → API** gives you three values:

| Dashboard label | `.env.local` variable | Where it is used |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | browser + server |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser (RLS-protected) |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` | **server only**, checkout writes |

> The service role key bypasses row level security. It is read only by server
> code (no `NEXT_PUBLIC_` prefix) and must never be committed.

Restart the dev server. The banner at the top should now read *Live mode*, and
`/api/health` should report `"database": true`.

### 1.4 Google sign-in

**Step A — Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Create a project (or pick an existing one).
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app
   name and your support email, then add your own Google account under
   **Test users** while the app is in Testing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `Zedu Store`
   - **Authorised JavaScript origins**:
     - `http://localhost:3000`
     - `https://<your-site>.netlify.app` (add after your first deploy)
   - **Authorised redirect URI** — this points at *Supabase*, not at the app:
     - `https://<project-ref>.supabase.co/auth/v1/callback`
4. Press **Create** and copy the **Client ID** and **Client secret**.

**Step B — Supabase dashboard**:

1. **Authentication → Providers → Google** → toggle **Enable**.
2. Paste the Client ID and Client secret → **Save**.
3. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback` **and**
     `https://<your-site>.netlify.app/auth/callback`.

**Step C — verify**

1. `npm run dev`, open <http://localhost:3000/login>.
2. Click **Continue with Google**, approve, and you land back on `/orders`
   signed in.
3. Sign in on the checkout page: the green banner names your account and the
   order is linked to `orders.user_id`.

Common failure: `redirect_uri_mismatch` means the redirect URI in Google Cloud
does not exactly match `https://<project-ref>.supabase.co/auth/v1/callback`.

---

## 2. Confirmation emails — Resend

Resend is the email provider this project uses. It sends over the HTTP API
(`POST https://api.resend.com/emails`), so there is no SMTP setup and no DNS work
to get started.

1. Sign up at [resend.com](https://resend.com).
   > **Sign up with the address you want to receive the confirmation at.** On the
   > shared `resend.dev` testing sender, Resend only delivers to the address that
   > owns the account. Sending anywhere else returns `403`. Verifying a domain
   > (step 5) lifts that restriction.
2. Open [resend.com/api-keys](https://resend.com/api-keys) → **Create API Key**.
   Name it `zedu-store`, give it **Sending access**, and copy the key (`re_â€¦`).
   The key is shown once.
3. Fill in `.env.local`:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM="Zedu Store <onboarding@resend.dev>"
EMAIL_PROVIDER=resend
```

4. Restart `npm run dev`, then check the wiring:

```bash
curl http://localhost:3000/api/health
# → "email": true, "emailProvider": "resend"
```

5. Place a test order and open the confirmation page. `orders.email_status`
   should read `sent`, and the message appears under
   [resend.com/emails](https://resend.com/emails) with its delivery status.

**Sending to any address (optional).** Add your own domain under
[resend.com/domains](https://resend.com/domains), publish the SPF/DKIM records it
shows until the domain reads *Verified*, then set
`RESEND_FROM="Zedu Store <orders@yourdomain.com>"`.

**Automated tests / no real inbox:** `RESEND_FROM` may point at Resend's shared
testing sender, and the Resend dashboard log is enough to prove a send. The
`email.test.mjs` suite stubs `fetch`, so `npm test` never needs a key or network.

If Resend is unreachable the order is still saved: `orders.email_status`
becomes `failed`, the reason lands in `email_error`, and the confirmation page
offers a **Resend confirmation email** button.

<details>
<summary>Optional: switching to Mailgun instead</summary>

The Mailgun transport from the assignment brief is still in the codebase
(`src/lib/email/mailgun.ts`) and still covered by tests. To use it, add the
`MAILGUN_*` block in `.env.example` to `.env.local`, set
`EMAIL_PROVIDER=mailgun`, and add the recipient under **Sending → Domains → your
sandbox → Authorized recipients** — a sandbox domain rejects everything else with
`403` until the domain is verified. No code change is needed.
</details>

---

## 3. Deploy — Netlify

1. Push this folder to GitHub (see the README).
2. [app.netlify.com/start](https://app.netlify.com/start) → **Import an existing
   project** → pick the repository. Netlify detects Next.js and provisions
   everything itself through its OpenNext adapter. Leave the build command
   (`next build`) and publish directory at their detected defaults, and do **not**
   add `@netlify/plugin-nextjs` to `package.json` — Netlify installs the adapter
   and keeps it current on every build. This covers SSR, Route Handlers and the
   Next.js Middleware (which becomes an Edge Function).
3. **Site configuration → Environment variables** — add every key from
   `.env.local`:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.local` |
   | `SUPABASE_SERVICE_ROLE_KEY` | from `.env.local` |
   | `RESEND_API_KEY` | from `.env.local` |
   | `RESEND_FROM` | `Zedu Store <onboarding@resend.dev>` |
   | `RESEND_REPLY_TO` | your own address |
   | `EMAIL_PROVIDER` | `resend` |

   `EMAIL_PROVIDER` is not optional: `.env.local` never leaves your machine, so
   without it the deployed site has no email provider and checkout reports
   `email_status = skipped`.

   > **Do not set `NODE_ENV=production`.** Tailwind, PostCSS, TypeScript and the
   > `@types/*` packages are `devDependencies`, and Netlify skips
   > `devDependencies` when `NODE_ENV` is `production` — the build would fail.
   > Netlify leaves `NODE_ENV` unset by default, which is what you want.
4. **Deploy site**, then add the live URL to:
   - Supabase **Authentication → URL Configuration** — Site URL, plus
     `https://<your-site>.netlify.app/auth/callback` under Redirect URLs
   - Google Cloud **Authorised JavaScript origins**. The *redirect URI* does not
     change — it stays the Supabase callback.

Netlify's build uses the Node version pinned in `.nvmrc` (Node 20). To change it,
edit that file or set a `NODE_VERSION` environment variable.

---

## 4. Verify everything (5 minutes)

```bash
npm run check          # typecheck + 72 tests
npm run dev
```

| # | Check | Expected |
| --- | --- | --- |
| 1 | `GET /api/health` | `database: true`, `email: true`, `mode: "live"` |
| 2 | Add two products to the cart | Badge count updates, summary totals correct |
| 3 | `/checkout` with an empty cart | "Nothing to check out" |
| 4 | Submit with a bad email | Inline error, no order row created |
| 5 | Submit a valid order | Redirect to `/order/ZS-XXXXXX?placed=1` |
| 6 | Supabase → Table Editor → `orders` | One row, `status=paid`, `email_status=sent` |
| 7 | `order_items` | One row per cart line, totals matching the page |
| 8 | Inbox | Confirmation email with the same reference and total |
| 9 | Sign in with Google, buy again | `/orders` lists both, new row has `user_id` set |
| 10 | Tamper in the browser console | Editing `localStorage` prices changes nothing — the server re-prices |
| 11 | `GET /api/cart` with no `Authorization` header | `401` `{ error }` — the cart is never readable anonymously |
| 12 | `PUT /api/cart` with `{"items":"nope"}` | `422` `{ error, issues[0].field: "items" }` |
| 13 | `PUT /api/cart` with `{"items":[{"slug":"aura-desk-lamp","quantity":2}]}` | `200`, echoed `lines`, and `totalCents` = 2 Ã— lamp + shipping |
| 14 | `PUT` a price into the body, e.g. `{"items":[â€¦],"totalCents":1}` | Response ignores it — `totalCents` is recomputed from the catalog |
| 15 | `DELETE /api/cart` | `200` with `lines: []` and `totalCents: 0` |
| 16 | Sign in on the site, add an item, open the mobile app on the same account | The mobile cart shows the same line (the cross-device requirement) |
| 17 | `GET /api/products` | `200` `{ ok, count: 6, source, products[] }` |
| 18 | With the site open, change the cart in the mobile app | The website cart updates without a reload (Realtime) |
| 19 | Supabase → Database → Publications → `supabase_realtime` | `carts` and `cart_items` are both listed |

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Banner still says "Mock mode" | `.env.local` missing/typo'd, or the dev server was not restarted |
| `databaseWrites: false` in `/api/health` | `SUPABASE_SERVICE_ROLE_KEY` missing — orders fall back to memory |
| Order saves but `email_status = failed` | Resend key missing/invalid, or sending to an address other than the account owner on the `resend.dev` testing sender |
| `redirect_uri_mismatch` on Google | Redirect URI must be `https://<ref>.supabase.co/auth/v1/callback` |
| Products list is the bundled six | `products` table empty, or the anon key cannot read it (check the RLS policy) |

---

## 5. Installing behind a restrictive network or antivirus

Two environment quirks cost real time while this project was built. If you hit
them, these are the fixes.

**1. `npm install` crashes with `ERR_SSL_CIPHER_OPERATION_FAILED`.** Large
tarballs fail mid-download on some Node 24 / Windows 10 builds. Retry with the
legacy OpenSSL provider, serialised sockets and more retries — the npm cache
keeps whatever already landed, so repeated runs make progress:

```bash
NODE_OPTIONS=--openssl-legacy-provider npm install --ignore-scripts \
  --prefer-online --fetch-retries=12 --maxsockets=1
```

**2. `next build` / `next dev` fails with `Failed to load SWC binary`.** Next
downloads its compiler from a Vercel CDN, which endpoint-protection software
(and some corporate networks) block. Because npm can reach the registry, install
the same binary as a package and drop it where Next looks for a fallen-back
download:

```bash
npm install @next/swc-win32-x64-msvc@15.5.27 --ignore-scripts
mkdir -p node_modules/next/next-swc-fallback/@next/swc-win32-x64-msvc
cp node_modules/@next/swc-win32-x64-msvc/* \
   node_modules/next/next-swc-fallback/@next/swc-win32-x64-msvc/
```

Swap `win32-x64` for your platform (`darwin-arm64`, `linux-x64-gnu`, â€¦). After
that `npm run build` and `npm run dev` both work offline.

If `npm install` was run with `--ignore-scripts`, nothing else is missing: the
only lifecycle scripts in this dependency set are Next's own optional-binary
downloads.

**3. `npm test` fails with `spawn EPERM`.** The `node --test` runner starts a
child process per file over pipes; some Windows ACL policies deny that. The
`test` script therefore runs both suites in-process instead. Keep it that way on
Windows.

**4. `git push` fails with `RPC failed; curl 55 Send failure: Connection was
reset`** (or `send-pack: unexpected disconnect while reading sideband packet`, or
`Empty reply from server`). Endpoint protection interferes with Git's HTTP/2
connection, typically *after* the objects have finished uploading — so the output
looks like the push almost made it. Whether the ref actually landed is unclear,
so check before retrying:

```bash
git ls-remote origin          # no refs listed = the push did not land
git config http.version HTTP/1.1
git config http.postBuffer 524288000
git push origin main
```

The failure is intermittent: even with HTTP/1.1 in place a retry can be needed.
`git ls-remote` is the only trustworthy check — `git push` can print
`Everything up-to-date` while the remote is in fact still empty.

