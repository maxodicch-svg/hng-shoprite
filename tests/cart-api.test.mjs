/**
 * `/api/cart` request rules.
 *
 * The status codes this endpoint can return are decided by `src/lib/cart-api.ts`,
 * which is deliberately pure: no `Request`, no `Response`, no Supabase. That is
 * what makes every error path testable offline, and it is the same split the
 * checkout route uses (`cart.ts` + `flow.test.mjs`).
 *
 * The one thing this file cannot cover is the auth guard, because the guards need
 * `next/server`, which plain Node cannot resolve without a bundler. Those are
 * covered by the `curl` rows in SETUP.md §4 instead — see rows 11 and 12.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readCartPayload, buildCartBody, MAX_ITEM_PAYLOAD } from '../src/lib/cart-api.ts';

// ------------------------------------------------------------ 400 / 422 ---

test('cart api: a body that is not JSON is 400 with a generic message and no issues', () => {
  const result = readCartPayload(undefined, true);
  assert.equal(result.ok, false);
  assert.equal(result.failure.status, 400);
  assert.equal(typeof result.failure.body.error, 'string');
  assert.equal(result.failure.body.issues, undefined);
});

test('cart api: `items` missing, not an array, or a wrong type is 422 with issues[]', () => {
  for (const items of [undefined, null, 'nope', 42, {}, true]) {
    const result = readCartPayload({ items });
    assert.equal(result.ok, false, `items=${JSON.stringify(items)} should be rejected`);
    assert.equal(result.failure.status, 422);
    // The field name matters: it is what a client keys its inline error off.
    assert.deepEqual(
      result.failure.body.issues?.map((issue) => issue.field),
      ['items'],
    );
  }
});

test('cart api: a missing body object is 422, not a crash', () => {
  for (const body of [undefined, null, 'string', 7]) {
    const result = readCartPayload(body);
    assert.equal(result.ok, false);
    assert.equal(result.failure.status, 422);
  }
});

test('cart api: an over-long payload is 422, and exactly at the limit is accepted', () => {
  const line = { slug: 'aura-desk-lamp', quantity: 1 };

  const tooMany = readCartPayload({
    items: Array.from({ length: MAX_ITEM_PAYLOAD + 1 }, () => line),
  });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.failure.status, 422);
  assert.deepEqual(
    tooMany.failure.body.issues?.map((issue) => issue.field),
    ['items'],
  );

  const atLimit = readCartPayload({
    items: Array.from({ length: MAX_ITEM_PAYLOAD }, () => line),
  });
  assert.equal(atLimit.ok, true);
});

test('cart api: a valid array passes through untouched', () => {
  const items = [
    { slug: 'aura-desk-lamp', quantity: 2 },
    { slug: 'free-iphone', quantity: 99 },
  ];
  const result = readCartPayload({ items });
  assert.equal(result.ok, true);
  // Dropping unknown slugs is `normalizeCart`'s job, not this module's.
  assert.deepEqual(result.items, items);
});

test('cart api: an empty items array is accepted (it empties the cart)', () => {
  const result = readCartPayload({ items: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, []);
});

// ----------------------------------------------------------- response ---

test('cart api: the response body carries the server totals and echoes the user id', () => {
  const body = buildCartBody('user-1', [{ slug: 'terra-ceramic-mug', quantity: 2 }], {
    itemCount: 2,
    subtotalCents: 3800,
    shippingCents: 900,
    totalCents: 4700,
    currency: 'USD',
  });

  assert.equal(body.ok, true);
  assert.equal(body.userId, 'user-1');
  assert.equal(body.count, 1);
  assert.equal(body.itemCount, 2);
  assert.equal(body.subtotalCents, 3800);
  assert.equal(body.shippingCents, 900);
  assert.equal(body.totalCents, 4700);
  assert.equal(body.currency, 'USD');
  assert.deepEqual(body.lines, [{ slug: 'terra-ceramic-mug', quantity: 2 }]);
});

test('cart api: an empty cart serialises to zero totals, never to nulls', () => {
  const body = buildCartBody('user-2', [], {
    itemCount: 0,
    subtotalCents: 0,
    shippingCents: 0,
    totalCents: 0,
    currency: 'USD',
  });

  assert.equal(body.count, 0);
  assert.deepEqual(body.lines, []);
  assert.equal(body.totalCents, 0);
});
