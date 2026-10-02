'use client';

/**
 * Browser Supabase client (Google OAuth).
 *
 * `createBrowserClient` from `@supabase/ssr` keeps the session in cookies, so
 * the server can read it too. Falls back to a null client when the app is
 * unconfigured, and the UI then explains that auth is in mock mode.
 */

import { createBrowserClient } from '@supabase/ssr';

/** Exact type of the SSR-aware browser client (differs from `createClient`). */
type BrowserClient = ReturnType<typeof createBrowserClient>;

let cached: BrowserClient | null = null;

export const authConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export function getBrowserClient(): BrowserClient | null {
  if (!authConfigured) return null;
  if (!cached) {
    cached = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
  }
  return cached;
}

/** Start the Google OAuth redirect flow. */
export async function signInWithGoogle(next = '/checkout'): Promise<{ error?: string }> {
  const supabase = getBrowserClient();
  if (!supabase) return { error: 'Supabase is not configured yet.' };

  const origin = window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  return error ? { error: error.message } : {};
}

export async function signOut(): Promise<void> {
  await getBrowserClient()?.auth.signOut();
}

/** The current session's access token, for authenticated API calls. */
export async function accessToken(): Promise<string | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
