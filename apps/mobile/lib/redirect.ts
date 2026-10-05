/**
 * Where Google must send the user back to after sign-in.
 *
 * This is deliberately **not** a single constant, because there are two runtimes
 * and they can receive different links:
 *
 * | Runtime | Registers the scheme | Usable return URL |
 * | --- | --- | --- |
 * | **Expo Go** | `exp://` only — that is Expo Go's scheme, not ours | the Metro dev URL, e.g. `exp://192.168.43.67:8081/--/auth/callback` |
 * | dev build / standalone | the `scheme` from `app.json` | `zedustore://auth/callback` |
 *
 * `Linking.createURL()` returns whichever one applies to the runtime it runs in,
 * so the app never hard-codes the custom scheme. Hard-coding it is what made
 * sign-in hang inside Expo Go: Android had nowhere to deliver `zedustore://…`,
 * the `Linking` listener in `openAuthSessionAsync` never fired, and the next tap
 * threw *"the auth session is in an invalid state with a redirect handler set
 * when it should not be"*.
 *
 * Whatever this resolves to must also be listed in Supabase →
 * Authentication → URL Configuration → Redirect URLs.
 */

/** Router path the provider returns to; `app/auth/callback.tsx` serves it. */
export const AUTH_CALLBACK_PATH = 'auth/callback';

/** The scheme declared in `app.json`; used by dev and standalone builds. */
export const AUTH_SCHEME = 'zedustore';

/** The return URL for a build that registers {@link AUTH_SCHEME}. */
export const AUTH_SCHEME_REDIRECT = `${AUTH_SCHEME}://${AUTH_CALLBACK_PATH}`;

/** True when `url` is an Expo Go dev-server link (`exp://` / `exps://`). */
export function isExpoGoUrl(url: string): boolean {
  return url.startsWith('exp://') || url.startsWith('exps://');
}

/**
 * Choose the OAuth return URL for the runtime that produced `appUrl`.
 *
 * @param appUrl The output of `Linking.createURL(AUTH_CALLBACK_PATH)`.
 * @returns `appUrl` unchanged inside Expo Go, otherwise the custom-scheme link —
 *   which is also what `appUrl` already is in a build, so this never surprises.
 */
export function authRedirectFor(appUrl: string): string {
  return isExpoGoUrl(appUrl) ? appUrl : AUTH_SCHEME_REDIRECT;
}
