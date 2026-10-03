import { NextResponse, type NextRequest } from 'next/server';
import { normalizeCart, priceCart, type CartLine } from '@/lib/cart';
import { buildCartBody, readCartPayload } from '@/lib/cart-api';
import type { Product } from '@/lib/products';
import { getProducts, getCart, saveCart, clearCart, getUserFromToken } from '@/lib/store';

/**
 * The shared draft cart API.
 *
 * This is what makes "add to cart on the website, see it in the mobile app"
 * possible: both clients authenticate with the same Supabase account and read
 * the same rows through here. The cart stays a pre-purchase draft — the order
 * created at checkout is still the record of truth.
 *
 * Every method requires `Authorization: Bearer <supabase access token>` and is
 * scoped to that token's user, so one account can never read another's cart.
 * Totals are never accepted from the client: they are recomputed from the
 * catalog by `priceCart()` on every response.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Extract a bearer token, or `null` when the header is absent/malformed. */
function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

type Resolved = { ok: true; userId: string } | { ok: false; response: NextResponse };

/** Resolve the caller's user id, or the 401 response to send back. */
async function authenticate(request: NextRequest): Promise<Resolved> {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in to use your cart.' }, { status: 401 }),
    };
  }
  const user = await getUserFromToken(token);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Your session has expired. Sign in again.' },
        { status: 401 },
      ),
    };
  }
  return { ok: true, userId: user.id };
}

/** Serialise cart lines plus the totals the server computes for them. */
function respondWith(lines: CartLine[], userId: string, products: Product[]) {
  return NextResponse.json(buildCartBody(userId, lines, priceCart(lines, products)));
}

/**
 * GET /api/cart — the caller's stored cart.
 *
 * 200 `{ ok, lines, subtotalCents, shippingCents, totalCents, currency }`
 * 401 missing or invalid token.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  const { products } = await getProducts();
  const lines = normalizeCart(await getCart(auth.userId), products);
  return respondWith(lines, auth.userId, products);
}

/**
 * PUT /api/cart — replace the caller's cart with the body's lines.
 *
 * Body: `{ items: [{ slug, quantity }] }`. Unknown slugs and out-of-range
 * quantities are dropped/clamped by `normalizeCart()` rather than rejected, so a
 * stale client can always sync; only a structurally wrong body is a 422.
 *
 * 200 the stored cart · 400 non-JSON body · 422 bad `items` · 401 no token ·
 * 502 persistence failed.
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  let parseFailed = false;
  try {
    body = await request.json();
  } catch {
    parseFailed = true;
  }

  const payload = readCartPayload(body, parseFailed);
  if (!payload.ok) {
    return NextResponse.json(payload.failure.body, { status: payload.failure.status });
  }

  const { products } = await getProducts();
  const lines = normalizeCart(payload.items, products);

  try {
    const stored = await saveCart(auth.userId, lines);
    return respondWith(stored, auth.userId, products);
  } catch (error) {
    console.error('[cart] save failed:', (error as Error).message);
    return NextResponse.json(
      { error: 'We could not save your cart. Please try again.' },
      { status: 502 },
    );
  }
}

/**
 * DELETE /api/cart — empty the caller's cart. Idempotent.
 *
 * 200 an empty cart · 401 no token.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  const { products } = await getProducts();
  await clearCart(auth.userId);

  const remaining = normalizeCart(await getCart(auth.userId), products);
  return respondWith(remaining, auth.userId, products);
}
