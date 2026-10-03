/**
 * Data access layer.
 *
 * Every read and write goes through here so route handlers and server
 * components never touch Supabase directly. Each function falls back to the
 * static catalog / mock store when the project is unconfigured, which is what
 * makes the app demoable before keys exist.
 */

// This module holds the service-role client, so it must never reach a browser
// bundle. `server-only` does that at build time, but it *throws* under plain
// Node, which would stop `tests/` importing the mock-mode path. Detect Next's
// server build instead and fail loudly there; under `node --test` it is a no-op.
if (!process.env.NEXT_RUNTIME && !process.env.NODE_TEST_CONTEXT) {
  throw new Error('src/lib/store.ts is server-only and must not be imported from client code.');
}

import { getAdminClient, getAnonClient, hasServiceRole, isSupabaseConfigured } from './supabase.ts';
import { CATALOG, type Product } from './products.ts';
import { normalizeCart, type CartLine, type PricedOrder } from './cart.ts';
import {
  deleteMockCart,
  getMockCart,
  getMockOrder,
  listMockOrders,
  saveMockCart,
  saveMockOrder,
  updateMockOrderEmail,
  type MockOrder,
} from './mock-store.ts';

export type OrderRecord = MockOrder & { mode: 'supabase' | 'mock' };

/** Shape of a row in `public.products`. */
type ProductRow = {
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string | null;
  image_url: string | null;
  badge: string | null;
  in_stock: boolean | null;
  stock: number | null;
};

function toProduct(row: ProductRow): Product {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    priceCents: row.price_cents,
    currency: row.currency ?? 'USD',
    imageUrl: row.image_url ?? '',
    badge: row.badge ?? null,
    inStock: row.in_stock ?? true,
    stock: row.stock ?? 0,
  };
}

/**
 * The catalog. Reads `public.products` when Supabase is configured, and falls
 * back to the bundled catalog on any error so the storefront never 500s.
 */
export async function getProducts(): Promise<{ products: Product[]; source: string }> {
  if (!isSupabaseConfigured()) {
    return { products: CATALOG, source: 'bundled catalog (mock mode)' };
  }
  try {
    const client = getAnonClient() ?? getAdminClient();
    const { data, error } = await client
      .from('products')
      .select('slug,name,description,price_cents,currency,image_url,badge,in_stock,stock')
      .order('price_cents', { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return { products: CATALOG, source: 'bundled catalog (products table empty)' };
    }
    return { products: (data as ProductRow[]).map(toProduct), source: 'supabase' };
  } catch (error) {
    console.warn('[store] product read failed, using bundled catalog:', (error as Error).message);
    return { products: CATALOG, source: 'bundled catalog (supabase read failed)' };
  }
}

export async function getProduct(slug: string): Promise<Product | null> {
  const { products } = await getProducts();
  return products.find((p) => p.slug === slug) ?? null;
}

/** The signed-in user derived from a Supabase access token, or `null`. */
export async function getUserFromToken(
  token: string | null,
): Promise<{ id: string; email: string | null } | null> {
  if (!token || !isSupabaseConfigured() || !hasServiceRole()) return null;
  try {
    const { data, error } = await getAdminClient().auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

export type PersistOrderInput = {
  reference: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  note: string | null;
  order: PricedOrder;
};

/** Persist an order plus its line items. Falls back to the mock store. */
export async function createOrder(input: PersistOrderInput): Promise<OrderRecord> {
  if (!hasServiceRole()) {
    const record = saveMockOrder(input);
    await new Promise((r) => setTimeout(r, 120)); // surface the loading state in dev
    return { ...record, mode: 'mock' };
  }

  const client = getAdminClient();

  const { data: orderRow, error: orderError } = await client
    .from('orders')
    .insert({
      reference: input.reference,
      user_id: input.userId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      shipping_address: input.shippingAddress,
      note: input.note,
      subtotal_cents: input.order.subtotalCents,
      shipping_cents: input.order.shippingCents,
      total_cents: input.order.totalCents,
      currency: input.order.currency,
      status: 'paid',
      email_status: 'pending',
    })
    .select('*')
    .single();

  if (orderError || !orderRow) {
    throw new Error(`Could not save the order: ${orderError?.message ?? 'no row returned'}`);
  }

  const items = input.order.lines.map((line) => ({
    order_id: orderRow.id,
    product_name: line.name,
    product_slug: line.slug,
    unit_price_cents: line.unitPriceCents,
    quantity: line.quantity,
    line_total_cents: line.lineTotalCents,
  }));

  const { data: itemRows, error: itemError } = await client
    .from('order_items')
    .insert(items)
    .select('*');

  if (itemError) {
    // Roll back the header so we never leave a line-less order behind.
    await client.from('orders').delete().eq('id', orderRow.id);
    throw new Error(`Could not save the order items: ${itemError.message}`);
  }

  return {
    ...(orderRow as unknown as MockOrder),
    order_items: (itemRows ?? []) as MockOrder['order_items'],
    mode: 'supabase',
  };
}

/** Record the outcome of the confirmation email on the order row. */
export async function markOrderEmail(
  orderId: string,
  status: 'sent' | 'failed' | 'skipped' | 'pending',
  errorDetail: string | null,
): Promise<void> {
  if (!hasServiceRole()) {
    updateMockOrderEmail(orderId, status, errorDetail);
    return;
  }
  try {
    await getAdminClient()
      .from('orders')
      .update({
        email_status: status,
        email_error: errorDetail,
        email_sent_at: status === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', orderId);
  } catch (error) {
    console.warn('[store] could not record email status:', (error as Error).message);
  }
}

/** Fetch one order by id or reference (owners only, unless the server asks). */
export async function getOrder(by: {
  id?: string;
  reference?: string;
}): Promise<OrderRecord | null> {
  if (!hasServiceRole()) {
    const record = getMockOrder(by);
    return record ? { ...record, mode: 'mock' } : null;
  }
  try {
    const client = getAdminClient();
    let query = client.from('orders').select('*, order_items(*)');
    query = by.id ? query.eq('id', by.id) : query.eq('reference', by.reference);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return { ...(data as unknown as MockOrder), mode: 'supabase' };
  } catch (error) {
    console.warn('[store] order read failed:', (error as Error).message);
    return null;
  }
}

/** All orders belonging to one user, newest first. */
export async function listOrdersForUser(userId: string): Promise<OrderRecord[]> {
  if (!hasServiceRole()) {
    return listMockOrders(userId).map((o) => ({ ...o, mode: 'mock' as const }));
  }
  try {
    const { data, error } = await getAdminClient()
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as unknown as MockOrder[]).map((o) => ({ ...o, mode: 'supabase' as const }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------- cart ---
//
// The shared draft cart. One `carts` row per user, lines in `cart_items`, so the
// website and the mobile app read and write the same lines for the same account.
//
// Nothing here is priced: prices stay in `priceCart()`/`products`, and callers
// re-price on every read. Guest carts have no row at all — they stay in
// localStorage until the shopper signs in and merges (see `mergeCartLines`).

/** Shape of a row in `public.carts` joined with its `cart_items`. */
type CartRow = {
  id: string;
  updated_at: string | null;
  cart_items: { product_slug: string; quantity: number }[] | null;
};

/**
 * Read one user's stored cart lines.
 *
 * Degrades instead of throwing: an unconfigured project, a missing row, a
 * failed query or unparseable data all return an empty cart, never an error.
 */
export async function getCart(userId: string): Promise<CartLine[]> {
  if (!userId) return [];
  if (!hasServiceRole()) return getMockCart(userId);

  try {
    const { data, error } = await getAdminClient()
      .from('carts')
      .select('id,updated_at,cart_items(product_slug,quantity)')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return [];
    const row = data as unknown as CartRow;
    return normalizeCart(
      (row.cart_items ?? []).map((item) => ({
        slug: item.product_slug,
        quantity: item.quantity,
      })),
    );
  } catch (error) {
    console.warn('[store] cart read failed:', (error as Error).message);
    return [];
  }
}

/**
 * Replace one user's stored cart with `lines` (full-document PUT semantics).
 *
 * `lines` is expected to be already normalised by the caller; it is normalised
 * again here so a direct call can never write a junk slug or quantity, and the
 * unique `(cart_id, product_slug)` constraint can never be violated.
 *
 * Falls back to the in-memory store when there is no service role key. Throws
 * only on a genuine database error, which `/api/cart` turns into a 502 — the
 * route must not report success when nothing was persisted.
 */
export async function saveCart(userId: string, lines: CartLine[]): Promise<CartLine[]> {
  const clean = normalizeCart(lines);
  if (!hasServiceRole()) return saveMockCart(userId, clean);

  const client = getAdminClient();

  const { data: cartRow, error: cartError } = await client
    .from('carts')
    .upsert({ user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (cartError || !cartRow) {
    throw new Error(`Could not save the cart: ${cartError?.message ?? 'no row returned'}`);
  }

  const cartId = (cartRow as { id: string }).id;

  // Delete-then-insert keeps PUT semantics honest: what the caller sent is
  // exactly what is stored afterwards, with no stale lines left behind.
  const { error: clearError } = await client.from('cart_items').delete().eq('cart_id', cartId);
  if (clearError) throw new Error(`Could not clear the cart: ${clearError.message}`);

  if (clean.length > 0) {
    const { error: itemError } = await client.from('cart_items').insert(
      clean.map((line) => ({
        cart_id: cartId,
        product_slug: line.slug,
        quantity: line.quantity,
      })),
    );
    if (itemError) throw new Error(`Could not save the cart lines: ${itemError.message}`);
  }

  return clean;
}

/**
 * Empty one user's cart. Leaves the `carts` row in place so the next write is a
 * cheap upsert; removing the lines is what actually empties the cart.
 */
export async function clearCart(userId: string): Promise<void> {
  if (!hasServiceRole()) {
    deleteMockCart(userId);
    return;
  }
  try {
    const { data, error } = await getAdminClient()
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return;
    await getAdminClient().from('cart_items').delete().eq('cart_id', (data as { id: string }).id);
  } catch (error) {
    console.warn('[store] cart clear failed:', (error as Error).message);
  }
}
