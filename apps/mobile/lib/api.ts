/**
 * Client for the shop's JSON API.
 *
 * Only the endpoints the mobile app needs, and only standard `fetch` — no extra
 * HTTP dependency. Every cart call sends `Authorization: Bearer <access token>`
 * and the app **adopts the server's response verbatim**: totals are computed by
 * the same `priceCart()` the website uses, so the phone can never show a price
 * the server would not charge.
 */

import { API_BASE_URL, apiConfigured } from './config.ts';
import { CATALOG, type Product } from './catalog.ts';
import { normalizeCart, type CartLine } from './cart.ts';

/** A cart exactly as the server priced it. */
export type ServerCart = {
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  /** `supabase` when really persisted, `mock` when the API has no keys. */
  mode?: string;
};

export const EMPTY_CART: ServerCart = {
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  shippingCents: 0,
  totalCents: 0,
  currency: 'USD',
};

/** What went wrong, in a form the UI can show. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; unauthorized?: boolean };

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/** Turn a fetch/HTTP failure into a short, user-facing sentence. */
async function failure(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    /* not JSON — fall through to the generic message */
  }
  return fallback;
}

/**
 * `GET /api/products` — the live catalog.
 *
 * Falls back to the bundled catalog rather than failing: the shop should still
 * render with no network, which is the same degradation the website does.
 */
export async function fetchProducts(): Promise<Product[]> {
  if (!apiConfigured) return CATALOG;
  try {
    const response = await fetch(apiUrl('/api/products'), { headers: { Accept: 'application/json' } });
    if (!response.ok) return CATALOG;
    const body = (await response.json()) as { products?: Product[] };
    if (!Array.isArray(body.products) || body.products.length === 0) return CATALOG;
    return body.products;
  } catch {
    return CATALOG;
  }
}

/** Read a server cart body into the shape the UI uses. */
function toServerCart(body: Record<string, unknown>): ServerCart {
  return {
    lines: normalizeCart(body.lines),
    itemCount: Number(body.itemCount ?? 0),
    subtotalCents: Number(body.subtotalCents ?? 0),
    shippingCents: Number(body.shippingCents ?? 0),
    totalCents: Number(body.totalCents ?? 0),
    currency: String(body.currency ?? 'USD'),
    mode: typeof body.mode === 'string' ? body.mode : undefined,
  };
}

/**
 * `GET /api/cart` — the account's shared cart.
 *
 * This is the call that shows an item added on the website.
 */
export async function getCart(token: string): Promise<ApiResult<ServerCart>> {
  if (!apiConfigured) return { ok: false, error: 'The API base URL is not configured.' };
  try {
    const response = await fetch(apiUrl('/api/cart'), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (response.status === 401) {
      return { ok: false, status: 401, unauthorized: true, error: 'Your session has expired.' };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: await failure(response, 'Could not load your cart.'),
      };
    }

    const body = (await response.json()) as Record<string, unknown>;
    return { ok: true, data: toServerCart(body) };
  } catch {
    return { ok: false, error: 'Could not reach the shop. Check your connection.' };
  }
}

/**
 * `PUT /api/cart` — replace the account's cart with `lines`.
 *
 * The server drops unknown slugs and clamps quantities, then returns what it
 * actually stored; callers should adopt that, not their own optimistic state.
 */
export async function putCart(
  token: string,
  lines: CartLine[],
): Promise<ApiResult<ServerCart>> {
  if (!apiConfigured) return { ok: false, error: 'The API base URL is not configured.' };
  try {
    const response = await fetch(apiUrl('/api/cart'), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items: lines }),
    });

    if (response.status === 401) {
      return { ok: false, status: 401, unauthorized: true, error: 'Your session has expired.' };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: await failure(response, 'Could not save your cart.'),
      };
    }

    const body = (await response.json()) as Record<string, unknown>;
    return { ok: true, data: toServerCart(body) };
  } catch {
    return { ok: false, error: 'Could not reach the shop. Check your connection.' };
  }
}

/** `DELETE /api/cart` — empty the account's cart. */
export async function deleteCart(token: string): Promise<ApiResult<ServerCart>> {
  if (!apiConfigured) return { ok: false, error: 'The API base URL is not configured.' };
  try {
    const response = await fetch(apiUrl('/api/cart'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (response.status === 401) {
      return { ok: false, status: 401, unauthorized: true, error: 'Your session has expired.' };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: await failure(response, 'Could not clear your cart.'),
      };
    }
    const body = (await response.json()) as Record<string, unknown>;
    return { ok: true, data: toServerCart(body) };
  } catch {
    return { ok: false, error: 'Could not reach the shop. Check your connection.' };
  }
}
