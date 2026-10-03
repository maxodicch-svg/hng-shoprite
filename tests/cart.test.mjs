/**
 * Shared-cart tests.
 *
 * Two layers, matching the way `/api/cart` is built:
 *
 *  1. pure rules — `mergeCartLines` (the documented guest-merge rule) and the
 *     normalisation the endpoint relies on;
 *  2. the persistence contract — `store.ts` against its mock fallback, which is
 *     the exact code path a checkout-free demo runs on.
 *
 * `src/lib/store.ts` refuses to load outside Next's server runtime, so
 * `NODE_TEST_CONTEXT` is set *before* it is imported dynamically. Keep that
 * ordering: a static import would evaluate `store.ts` too early and throw.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeCartLines,
  normalizeCart,
  priceCart,
  MAX_LINE_QUANTITY,
  MAX_LINES,
} from '../src/lib/cart.ts';
import { CATALOG } from '../src/lib/products.ts';

const LAMP = 'aura-desk-lamp'; // 8900
const MUG = 'terra-ceramic-mug'; // 1900
const KEYBOARD = 'orbit-mechanical-keyboard'; // 17900

// ------------------------------------------------------- guest-merge rule ---

test('cart: merging an empty guest cart leaves the server cart untouched', () => {
  const server = [{ slug: MUG, quantity: 2 }];
  assert.deepEqual(mergeCartLines(server, []), server);
  assert.deepEqual(mergeCartLines([], server), server);
});

test('cart: a guest cart merges into the server cart instead of replacing it', () => {
  // This is the decision documented on mergeCartLines: nothing on either side
  // is thrown away, because overwriting would destroy another device's lines.
  const merged = mergeCartLines(
    [{ slug: MUG, quantity: 1 }], // guest
    [{ slug: LAMP, quantity: 1 }], // server
  );
  assert.deepEqual(merged, [
    { slug: MUG, quantity: 1 },
    { slug: LAMP, quantity: 1 },
  ]);
});

test('cart: the same slug on both sides sums, clamped to the line maximum', () => {
  assert.deepEqual(mergeCartLines([{ slug: MUG, quantity: 3 }], [{ slug: MUG, quantity: 2 }]), [
    { slug: MUG, quantity: 5 },
  ]);
  assert.deepEqual(mergeCartLines([{ slug: MUG, quantity: 8 }], [{ slug: MUG, quantity: 9 }]), [
    { slug: MUG, quantity: MAX_LINE_QUANTITY },
  ]);
});

test('cart: merge ignores junk, unknown slugs and missing groups', () => {
  const merged = mergeCartLines(
    null,
    undefined,
    [{ slug: 'free-iphone', quantity: 1 }],
    [{ slug: MUG, quantity: 'x' }],
    [{ slug: KEYBOARD, quantity: 1 }],
  );
  assert.deepEqual(merged, [{ slug: KEYBOARD, quantity: 1 }]);
});

test('cart: merge is order-stable and never exceeds MAX_LINES', () => {
  const groups = Array.from({ length: MAX_LINES + 8 }, (_, i) => [
    { slug: i % 2 === 0 ? MUG : LAMP, quantity: 1 },
  ]);
  const merged = mergeCartLines(...groups);
  assert.ok(merged.length <= MAX_LINES);
  // First-seen order: the mug appears in group 0, the lamp in group 1.
  assert.deepEqual(merged.map((l) => l.slug), [MUG, LAMP]);
});

test('cart: merge does not mutate its inputs', () => {
  const guest = [{ slug: MUG, quantity: 2 }];
  const server = [{ slug: LAMP, quantity: 1 }];
  mergeCartLines(guest, server);
  assert.deepEqual(guest, [{ slug: MUG, quantity: 2 }]);
  assert.deepEqual(server, [{ slug: LAMP, quantity: 1 }]);
});

// --------------------------------------------------- endpoint contract ---

test('cart: a merged cart is priced from the catalog, never from the payload', () => {
  const merged = mergeCartLines(
    [{ slug: MUG, quantity: 2, priceCents: 1 }],
    [{ slug: KEYBOARD, quantity: 1, totalCents: 1 }],
  );
  const priced = priceCart(merged, CATALOG);
  assert.equal(priced.subtotalCents, 2 * 1900 + 17900);
  assert.equal(priced.totalCents, priced.subtotalCents + priced.shippingCents);
});

test('cart: normalising a payload drops anything the catalog cannot resolve', () => {
  assert.deepEqual(normalizeCart([{ slug: 'nope', quantity: 1 }], CATALOG), []);
  assert.deepEqual(normalizeCart('not-an-array', CATALOG), []);
  assert.deepEqual(normalizeCart([{ slug: LAMP, quantity: 0 }], CATALOG), []);
});

test('cart: the mock store round-trips, replaces and clears one user cart', async () => {
  process.env.NODE_TEST_CONTEXT = '1';
  const { getCart, saveCart, clearCart } = await import('../src/lib/store.ts');
  const { clearMockCarts } = await import('../src/lib/mock-store.ts');

  clearMockCarts();
  const user = '9f1c2f7e-0000-4000-8000-000000000009';

  // An untouched account has an empty cart, not an error.
  assert.deepEqual(await getCart(user), []);

  await saveCart(user, [{ slug: MUG, quantity: 2 }]);
  assert.deepEqual(await getCart(user), [{ slug: MUG, quantity: 2 }]);

  // PUT semantics: the stored cart is exactly what was last sent.
  await saveCart(user, [{ slug: LAMP, quantity: 1 }]);
  assert.deepEqual(await getCart(user), [{ slug: LAMP, quantity: 1 }]);

  // Junk cannot be persisted, even through a direct call.
  await saveCart(user, [{ slug: 'free-iphone', quantity: 99 }]);
  assert.deepEqual(await getCart(user), []);

  await saveCart(user, [{ slug: MUG, quantity: 1 }]);
  await clearCart(user);
  assert.deepEqual(await getCart(user), []);

  clearMockCarts();
});

test('cart: one user cart never leaks into another', async () => {
  process.env.NODE_TEST_CONTEXT = '1';
  const { getCart, saveCart } = await import('../src/lib/store.ts');
  const { clearMockCarts } = await import('../src/lib/mock-store.ts');

  clearMockCarts();
  const a = '9f1c2f7e-0000-4000-8000-00000000000a';
  const b = '9f1c2f7e-0000-4000-8000-00000000000b';

  await saveCart(a, [{ slug: LAMP, quantity: 1 }]);
  await saveCart(b, [{ slug: MUG, quantity: 3 }]);

  assert.deepEqual(await getCart(a), [{ slug: LAMP, quantity: 1 }]);
  assert.deepEqual(await getCart(b), [{ slug: MUG, quantity: 3 }]);

  // An empty user id must never read somebody else's rows.
  assert.deepEqual(await getCart(''), []);
  clearMockCarts();
});
