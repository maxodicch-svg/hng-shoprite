/**
 * Pure request/response rules for the `/api/cart` endpoint.
 *
 * Kept out of the route file for the same reason `cart.ts` is kept out of the
 * checkout route: the decisions that produce a status code are plain functions of
 * their input, so they can be unit-tested with `node:test` and no server. The
 * route is then a thin adapter that supplies the user id and the store.
 *
 * No `fetch`, no `process.env`, no Supabase, no `Request`/`Response` objects —
 * callers pass in the parsed body and the stored lines.
 */

import { type CartLine, type ValidationIssue } from './cart.ts';

/** `items.length` above this is refused outright, before normalisation. */
export const MAX_ITEM_PAYLOAD = 80;

export type CartFailure = {
  status: 400 | 422;
  body: { error: string; issues?: ValidationIssue[] };
};

export type CartLinesResult =
  | { ok: true; items: unknown[] }
  | { ok: false; failure: CartFailure };

/**
 * Validate the body of a `PUT /api/cart`.
 *
 * @param body the parsed JSON body, or `undefined` when parsing failed
 * @param parseFailed true when `request.json()` threw
 * @returns the raw `items` array, or the 400/422 to send back
 *
 * Reusable: passing `parseFailed: true` is how the route reports a non-JSON body
 * without this module ever touching a `Request`.
 */
export function readCartPayload(body: unknown, parseFailed = false): CartLinesResult {
  if (parseFailed) {
    return rejection(400, 'Send a JSON body.');
  }

  const items = (body as Record<string, unknown> | null | undefined)?.items;

  if (!Array.isArray(items)) {
    return rejection(422, 'Please fix the highlighted fields.', [
      { field: 'items', message: 'Send items as an array of { slug, quantity }.' },
    ]);
  }

  if (items.length > MAX_ITEM_PAYLOAD) {
    return rejection(422, 'Please fix the highlighted fields.', [
      { field: 'items', message: `Send at most ${MAX_ITEM_PAYLOAD} cart lines.` },
    ]);
  }

  return { ok: true, items };
}

function rejection(
  status: 400 | 422,
  error: string,
  issues?: ValidationIssue[],
): { ok: false; failure: CartFailure } {
  return { ok: false, failure: { status, body: issues ? { error, issues } : { error } } };
}

/** The response body for a set of cart lines, given their server-computed totals. */
export type CartBody = {
  ok: true;
  userId: string;
  count: number;
  itemCount: number;
  lines: CartLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
};

export function buildCartBody(
  userId: string,
  lines: CartLine[],
  priced: {
    itemCount: number;
    subtotalCents: number;
    shippingCents: number;
    totalCents: number;
    currency: string;
  },
): CartBody {
  return {
    ok: true,
    userId,
    count: lines.length,
    itemCount: priced.itemCount,
    lines,
    subtotalCents: priced.subtotalCents,
    shippingCents: priced.shippingCents,
    totalCents: priced.totalCents,
    currency: priced.currency,
  };
}
