/**
 * Pure cart rules: validation, normalisation and money math.
 *
 * No DOM, no network, no Supabase — this module is unit-tested directly by
 * `tests/*.test.mjs` and imported by both the client cart and the API route, so
 * the price the customer sees is computed by the same code that prices the
 * order on the server.
 */

import { type Product, CATALOG, findProduct, shippingFor } from './products.ts';

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

export type PricedOrder = {
  lines: PricedLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  itemCount: number;
};

export type ValidationIssue = { field: string; message: string };

/** Coerce anything into a clamped integer quantity; never throws. */
export function normalizeQuantity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.floor(n);
  if (whole < 0) return 0;
  return Math.min(whole, MAX_LINE_QUANTITY);
}

/**
 * Repair an untrusted payload (localStorage, request body) into cart lines.
 * Unknown slugs, duplicates keep the highest quantity, junk becomes `[]`.
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

/**
 * Price a cart against the catalog. Empty lines are dropped, so an empty
 * catalog yields a zero-value order rather than an exception.
 */
export function priceCart(input: unknown, catalog: Product[] = CATALOG): PricedOrder {
  const lines: PricedLine[] = [];

  for (const line of normalizeCart(input, catalog)) {
    const product = findProduct(line.slug, catalog);
    if (!product) continue;
    const quantity = line.quantity;
    lines.push({
      slug: product.slug,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: product.priceCents * quantity,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const shippingCents = shippingFor(subtotalCents);
  const currency = lines.length ? findProduct(lines[0].slug, catalog)!.currency : 'USD';

  return {
    lines,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    currency,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

// ---------------------------------------------------------------- customer ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export type CustomerInput = {
  fullName?: unknown;
  email?: unknown;
  address?: unknown;
  city?: unknown;
  postalCode?: unknown;
  note?: unknown;
};

export type Customer = {
  fullName: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  note: string;
  shippingAddress: string;
};

/** True for anything that looks like a deliverable email address. */
export function isValidEmail(value: unknown): boolean {
  const email = String(value ?? '').trim();
  return email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * Validate checkout fields.
 *
 * @returns a list of issues; empty means the payload is safe to persist.
 */
export function validateCustomer(input: CustomerInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const name = String(input.fullName ?? '').trim();
  const email = String(input.email ?? '').trim();
  const address = String(input.address ?? '').trim();
  const city = String(input.city ?? '').trim();
  const postal = String(input.postalCode ?? '').trim();

  if (name.length < 2) issues.push({ field: 'fullName', message: 'Enter your full name.' });
  if (name.length > 120) issues.push({ field: 'fullName', message: 'That name is too long.' });
  if (!isValidEmail(email)) {
    issues.push({ field: 'email', message: 'Enter a valid email address.' });
  }
  if (address.length < 5) {
    issues.push({ field: 'address', message: 'Enter your street address.' });
  }
  if (address.length > 300) {
    issues.push({ field: 'address', message: 'That address is too long.' });
  }
  if (city.length < 2) issues.push({ field: 'city', message: 'Enter your city.' });
  if (postal.length > 0 && postal.length < 3) {
    issues.push({ field: 'postalCode', message: 'That postal code looks too short.' });
  }
  if (String(input.note ?? '').length > 500) {
    issues.push({ field: 'note', message: 'Keep the note under 500 characters.' });
  }

  return issues;
}

/** Normalise validated fields into the shape stored on the order row. */
export function toCustomer(input: CustomerInput): Customer {
  const fullName = String(input.fullName ?? '').trim().replace(/\s+/g, ' ');
  const email = String(input.email ?? '').trim().toLowerCase();
  const address = String(input.address ?? '').trim();
  const city = String(input.city ?? '').trim();
  const postalCode = String(input.postalCode ?? '').trim();
  const note = String(input.note ?? '').trim().slice(0, 500);

  return {
    fullName,
    email,
    address,
    city,
    postalCode,
    note,
    shippingAddress: [address, city, postalCode].filter(Boolean).join(', '),
  };
}

// --------------------------------------------------------------- reference ---

/**
 * Human-readable order reference, e.g. `ZS-7QK2M4`.
 * `random` is injectable so tests can assert exact output.
 */
export function makeReference(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.min(alphabet.length - 1, Math.floor(random() * alphabet.length));
    out += alphabet[idx];
  }
  return `ZS-${out}`;
}
