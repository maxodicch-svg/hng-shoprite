/**
 * Supabase server clients.
 *
 * Two clients, deliberately separated:
 *  - `getAdminClient()`  uses the **service role** key and therefore bypasses
 *    row level security. It is only ever imported by route handlers, and the
 *    key is kept in a non-`NEXT_PUBLIC_` env var so it can never reach a
 *    browser bundle.
 *  - `getAnonClient()`   uses the anon key, for reading public catalog rows.
 *
 * When the env vars are absent the app runs in **mock mode**: nothing is
 * persisted, but the whole shop → checkout → confirmation flow still works and
 * says so in the UI. That keeps the app reviewable before keys are issued.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const serviceKey = () =>
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '').trim();

/** True when the app can talk to a real Supabase project. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url() && anonKey());
}

/** True when writes can bypass RLS (service role key present). */
export function hasServiceRole(): boolean {
  return isSupabaseConfigured() && Boolean(serviceKey());
}

let adminCache: SupabaseClient | null = null;
let anonCache: SupabaseClient | null = null;

/** Service-role client. Server only — throws if the app is unconfigured. */
export function getAdminClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing).');
  }
  if (!adminCache) {
    adminCache = createClient(url(), serviceKey() || anonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'zedu-store' } },
    });
  }
  return adminCache;
}

/** Anon client, for public reads. Returns `null` when unconfigured. */
export function getAnonClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!anonCache) {
    anonCache = createClient(url(), anonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonCache;
}
