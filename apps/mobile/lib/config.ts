/**
 * Runtime configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the bundle at build time, so every
 * value here is public. Only the Supabase **anon** key belongs in this app — the
 * service role key bypasses row level security and must stay on the server.
 */

const rawApiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const rawAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const API_BASE_URL = rawApiBase.replace(/\/+$/, '');
export const SUPABASE_URL = rawSupabaseUrl.replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = rawAnonKey;

/** The deep link Google sign-in returns to. Must match the Supabase allow-list. */
export const AUTH_REDIRECT = 'zedustore://auth/callback';

/** True when both halves of the Supabase config are present. */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** True when the API base URL is present. */
export const apiConfigured = Boolean(API_BASE_URL);

/** A single line explaining what is missing, for the in-app banner. */
export function configProblem(): string | null {
  const missing: string[] = [];
  if (!apiConfigured) missing.push('EXPO_PUBLIC_API_BASE_URL');
  if (!supabaseConfigured) {
    missing.push('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }
  if (missing.length === 0) return null;
  return `Add ${missing.join(', ')} to apps/mobile/.env and restart Expo (npx expo start --clear).`;
}
