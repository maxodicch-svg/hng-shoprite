/**
 * Temporary in-memory store used only when Supabase is not configured.
 *
 * It exists so the shop → checkout → confirmation flow is fully clickable
 * during review without keys. It is intentionally tiny, process-local and
 * non-durable; the UI labels it "mock mode" so nobody mistakes it for a
 * database. Once `NEXT_PUBLIC_SUPABASE_URL` is set, every function here is
 * bypassed.
 */

import type { CartLine, PricedOrder } from './cart.ts';

export type MockOrder = {
  id: string;
  reference: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  shipping_address: string;
  note: string | null;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  currency: string;
  status: string;
  email_status: string;
  email_error: string | null;
  email_sent_at: string | null;
  created_at: string;
  order_items: {
    product_name: string;
    product_slug: string;
    unit_price_cents: number;
    quantity: number;
    line_total_cents: number;
  }[];
};

const orders = new Map<string, MockOrder>();

/** Insert an order and return the stored row. */
export function saveMockOrder(input: {
  reference: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  note: string | null;
  order: PricedOrder;
}): MockOrder {
  const id = crypto.randomUUID();
  const record: MockOrder = {
    id,
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
    email_error: null,
    email_sent_at: null,
    created_at: new Date().toISOString(),
    order_items: input.order.lines.map((line) => ({
      product_name: line.name,
      product_slug: line.slug,
      unit_price_cents: line.unitPriceCents,
      quantity: line.quantity,
      line_total_cents: line.lineTotalCents,
    })),
  };
  orders.set(id, record);
  return record;
}

export function updateMockOrderEmail(
  id: string,
  emailStatus: string,
  emailError: string | null,
): void {
  const record = orders.get(id);
  if (!record) return;
  record.email_status = emailStatus;
  record.email_error = emailError;
  record.email_sent_at = emailStatus === 'sent' ? new Date().toISOString() : null;
}

export function getMockOrder(by: { id?: string; reference?: string }): MockOrder | null {
  for (const record of orders.values()) {
    if (by.id && record.id === by.id) return record;
    if (by.reference && record.reference === by.reference) return record;
  }
  return null;
}

export function listMockOrders(userId: string): MockOrder[] {
  return [...orders.values()]
    .filter((o) => o.user_id === userId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Test helper — clears the store between cases. */
export function clearMockOrders(): void {
  orders.clear();
}

// --------------------------------------------------------------------- carts ---
// The shared draft cart, held per user id. Same contract as the Supabase path
// in `store.ts`: read returns `[]`, write never throws.

const carts = new Map<string, CartLine[]>();

export function getMockCart(userId: string): CartLine[] {
  return (carts.get(userId) ?? []).map((line) => ({ ...line }));
}

export function saveMockCart(userId: string, lines: CartLine[]): CartLine[] {
  const stored = lines.map((line) => ({ ...line }));
  carts.set(userId, stored);
  return stored.map((line) => ({ ...line }));
}

export function deleteMockCart(userId: string): void {
  carts.delete(userId);
}

/** Test helper — clears the mock carts between cases. */
export function clearMockCarts(): void {
  carts.clear();
}
