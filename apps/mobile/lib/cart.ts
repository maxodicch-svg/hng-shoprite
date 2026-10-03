/**
 * Pure cart rules — mirrors the display half of `src/lib/cart.ts`.
 *
 * Used only to render a local, optimistic total and to sanitise what the app
 * sends to the server. The number that matters is the one `PUT/GET /api/cart`
 * returns: the server re-prices every line from the catalog and the app adopts
 * that response verbatim.
 */

import { type Product, CATALOG, findProduct, shippingFor } from './catalog.ts';

export const MAX_LINE_QUANTITY = 10;
export const MAX_LINES = 20;

export type CartLine = { slug: string; quantity: number };

export type PricedLine = {
  slug: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

export type PricedCart = {
  lines: PricedLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  itemCount: number;
};

/** Coerce anything into a clamped integer quantity; never throws. */
export function normalizeQuantity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.floor(n);
  if (whole < 0) return 0;
  return Math.min(whole, MAX_LINE_QUANTITY);
}

/**
 * Repair an untrusted payload (an API response, a deep link) into cart lines.
 * Unknown slugs are dropped, duplicates keep the highest quantity.
 */
export function normalizeCart(input: unknown, catalog: Product[] = CATALOG): CartLine[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, number>();

  for (const raw of input.slice(0, MAX_LINES * 4)) {
    if (!raw || typeof raw !== 'object') continue;
    const slug = String((raw as Record<string, unknown>).slug ?? '');
    if (!slug || !findProduct(slug, catalog)) continue;
    const quantity = normalizeQuantity((raw as Record<string, unknown>).quantity);
    if (quantity <= 0) continue;
    const current = merged.get(slug) ?? 0;
    merged.set(slug, Math.min(current + quantity, MAX_LINE_QUANTITY));
  }

  return [...merged.entries()]
    .slice(0, MAX_LINES)
    .map(([slug, quantity]) => ({ slug, quantity }));
}

/** Price a cart locally. The server's response always wins over this. */
export function priceCart(input: unknown, catalog: Product[] = CATALOG): PricedCart {
  const lines: PricedLine[] = [];

  for (const line of normalizeCart(input, catalog)) {
    const product = findProduct(line.slug, catalog);
    if (!product) continue;
    lines.push({
      slug: product.slug,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity: line.quantity,
      lineTotalCents: product.priceCents * line.quantity,
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const shippingCents = shippingFor(subtotalCents);
  const currency = lines.length ? findProduct(lines[0].slug, catalog)!.currency : 'USD';

  return {
    lines,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    currency,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}
