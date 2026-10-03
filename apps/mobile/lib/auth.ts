/**
 * Supabase auth for React Native.
 *
 * The website uses `@supabase/ssr` with cookies. A native app has no cookies, so
 * this uses plain `supabase-js` with the **PKCE flow** and a deep-link redirect:
 *
 *   1. `signInWithOAuth({ provider: 'google' })` stores a PKCE verifier and
 *      returns Google's authorization URL;
 *   2. the app opens it in a system browser tab (`expo-web-browser`), which is
 *      also what Google requires — an embedded webview is rejected;
 *   3. Google redirects back to `zedustore://auth/callback?code=…`;
 *   4. `exchangeCodeForSession(code)` trades that code for a session.
 *
 * `zedustore://auth/callback` must be listed in
 * Supabase → Authentication → URL Configuration → Redirect URLs, or step 3 fails
 * with a redirect error.
 *
 * The session is persisted in AsyncStorage, so the app stays signed in between
 * launches. The service role key is never used here — anon key only.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { AUTH_REDIRECT, SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from './config.ts';

WebBrowser.maybeCompleteAuthSession();

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No browser URL to sniff in React Native; the code is read manually.
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

/** Pull the authorization code (or an error) out of a deep link. */
function parseRedirect(url: string): { code?: string; error?: string } {
  try {
    const parsed = Linking.parse(url);
    // `Linking.parse` folds the query string into `queryParams`, but Supabase can
    // also return the values in the fragment, so check both.
    const fromQuery = (parsed.queryParams ?? {}) as Record<string, string | undefined>;
    const hashIndex = url.indexOf('#');
    const fromHash: Record<string, string | undefined> = {};
    if (hashIndex >= 0) {
      for (const pair of url.slice(hashIndex + 1).split('&')) {
        const [key, value] = pair.split('=');
        if (key) fromHash[key] = decodeURIComponent(value ?? '');
      }
    }
    const get = (key: string) => fromQuery[key] ?? fromHash[key];
    return {
      code: get('code'),
      error: get('error_description') ?? get('error'),
    };
  } catch {
    return { error: 'Could not read the sign-in response.' };
  }
}

/** Deep link the app is waiting for, e.g. `zedustore://auth/callback`. */
export const redirectUri = AUTH_REDIRECT;

export type SignInResult = { ok: true } | { ok: false; error: string; cancelled?: boolean };

/**
 * Run the full Google sign-in round trip.
 *
 * @returns `{ ok: true }` once a session exists, otherwise the reason it failed.
 *   A user who closes the browser tab is reported as `cancelled`, not an error.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured. Add your keys to apps/mobile/.env.' };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });

  if (error || !data?.url) {
    return { ok: false, error: error?.message ?? 'Google sign-in could not be started.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
  if (result.type !== 'success' || !result.url) {
    return { ok: false, error: 'Sign-in was cancelled.', cancelled: true };
  }

  const { code, error: redirectError } = parseRedirect(result.url);
  if (redirectError) return { ok: false, error: redirectError };
  if (!code) return { ok: false, error: 'Google did not return an authorization code.' };

  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) return { ok: false, error: exchanged.error.message };
  return { ok: true };
}

/**
 * Finish a sign-in from a deep link that arrived at the app directly.
 *
 * `WebBrowser.openAuthSessionAsync` normally hands the redirect back to
 * `signInWithGoogle`, but if the OS cold-starts the app on the redirect URL
 * (common on iOS), the code arrives here instead and must be exchanged for a
 * session.
 */
export async function completeSignInFromUrl(url: string): Promise<SignInResult> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured. Add your keys to apps/mobile/.env.' };
  }
  const { code, error } = parseRedirect(url);
  if (error) return { ok: false, error };
  if (!code) return { ok: false, error: 'No authorization code in the sign-in link.' };

  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) return { ok: false, error: exchanged.error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** The current session, for the initial render and after a token refresh. */
export async function currentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Subscribe to sign-in / sign-out / token-refresh events. */
export function onAuthChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/** The bearer token `/api/cart` and `/api/orders` expect, refreshed if needed. */
export async function accessToken(): Promise<string | null> {
  const session = await currentSession();
  return session?.access_token ?? null;
}
