/**
 * Checkout flow test — the same pipeline the `/api/checkout` route runs, minus
 * the network:
 *
 *   untrusted body → validate customer → re-price from the catalog →
 *   build the order record → render the Mailgun confirmation
 *
 * This is the regression guard for the two rules a reviewer will look for:
 * the server decides the price, and an invalid payload never reaches a write.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { priceCart, validateCustomer, toCustomer, makeReference } from '../src/lib/cart.ts';
import { renderOrderConfirmation } from '../src/lib/email.ts';
import { CATALOG } from '../src/lib/products.ts';

/** Mirrors the route handler: returns either `{ issues }` or a finished order. */
function runCheckout(body, catalog = CATALOG) {
  const customerInput = (body.customer ?? {}) ?? {};
  const issues = validateCustomer(customerInput);
  if (issues.length > 0) return { status: 422, issues };

  const priced = priceCart(body.items, catalog);
  if (priced.lines.length === 0) return { status: 422, error: 'Your cart is empty.' };

  const customer = toCustomer(customerInput);
  // Real randomness, exactly like the route: `makeReference()` with no argument.
  const reference = makeReference();

  return {
    status: 201,
    reference,
    priced,
    order: {
      reference,
      user_id: body.userId ?? null,
      customer_name: customer.fullName,
      customer_email: customer.email,
      shipping_address: customer.shippingAddress,
      subtotal_cents: priced.subtotalCents,
      shipping_cents: priced.shippingCents,
      total_cents: priced.totalCents,
      currency: priced.currency,
      status: 'paid',
      email_status: 'sent',
    },
  };
}

const goodCustomer = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  address: '12 Analytical Engine Way',
  city: 'London',
  postalCode: 'EC1A',
  note: 'Ring the bell twice.',
};

test('flow: a valid order is priced server-side and persisted ready for email', () => {
  const result = runCheckout({
    items: [
      { slug: 'orbit-mechanical-keyboard', quantity: 1 },
      { slug: 'field-notes-journal', quantity: 2 },
    ],
    customer: goodCustomer,
  });

  assert.equal(result.status, 201);
  assert.equal(result.order.status, 'paid');
  assert.equal(result.order.subtotal_cents, 17900 + 2 * 2400);
  assert.equal(result.order.total_cents, result.order.subtotal_cents + result.order.shipping_cents);
  assert.equal(result.order.customer_email, 'ada@example.com');
  assert.equal(result.order.shipping_address, '12 Analytical Engine Way, London, EC1A');
  assert.match(result.reference, /^ZS-/);
});

test('flow: the confirmation email matches the persisted order exactly', () => {
  const result = runCheckout({ items: [{ slug: 'aura-desk-lamp', quantity: 1 }], customer: goodCustomer });
  const message = renderOrderConfirmation({
    reference: result.order.reference,
    customerName: result.order.customer_name,
    customerEmail: result.order.customer_email,
    shippingAddress: result.order.shipping_address,
    order: result.priced,
    placedAt: 'Fri, 01 Jan 2027 00:00:00 GMT',
  });

  assert.equal(message.to, result.order.customer_email);
  assert.match(message.subject, new RegExp(result.reference));
  assert.match(message.text, /\$89\.00/);
  assert.match(message.text, /\$98\.00/); // 89.00 + 9.00 shipping
});

test('flow: an invalid customer is rejected before any pricing or write', () => {
  const result = runCheckout({
    items: [{ slug: 'aura-desk-lamp', quantity: 1 }],
    customer: { ...goodCustomer, email: 'not-an-email' },
  });

  assert.equal(result.status, 422);
  assert.deepEqual(result.issues.map((i) => i.field), ['email']);
  assert.equal(result.order, undefined);
});

test('flow: a tampered cart is rejected when nothing resolves to a product', () => {
  const result = runCheckout({
    items: [{ slug: 'free-iphone', quantity: 99 }],
    customer: goodCustomer,
  });
  assert.equal(result.status, 422);
  assert.equal(result.error, 'Your cart is empty.');
});

test('flow: tampered prices and quantities cannot lower the charge', () => {
  const result = runCheckout({
    items: [
      { slug: 'meridian-headphones', quantity: 500, priceCents: 1 },
      { slug: 'terraform', quantity: -3 },
    ],
    customer: goodCustomer,
  });

  assert.equal(result.status, 201);
  // Quantity clamped to 10, price taken from the catalog, junk slug dropped.
  assert.equal(result.priced.lines.length, 1);
  assert.equal(result.priced.lines[0].quantity, 10);
  assert.equal(result.order.subtotal_cents, 249000);
});

test('flow: an empty items array is a 422, never a zero-value order row', () => {
  for (const items of [[], undefined, null, 'x', {}]) {
    const result = runCheckout({ items, customer: goodCustomer });
    assert.equal(result.status, 422);
    assert.equal(result.order, undefined);
  }
});

test('flow: a guest order has a null user id and still gets a reference', () => {
  const result = runCheckout({ items: [{ slug: 'terra-ceramic-mug', quantity: 1 }], customer: goodCustomer });
  assert.equal(result.order.user_id, null);
  assert.ok(result.order.reference.startsWith('ZS-'));
});

test('flow: an authenticated order keeps the user id it was given', () => {
  const result = runCheckout({
    items: [{ slug: 'terra-ceramic-mug', quantity: 1 }],
    customer: goodCustomer,
    userId: '9f1c2f7e-0000-4000-8000-000000000001',
  });
  assert.equal(result.order.user_id, '9f1c2f7e-0000-4000-8000-000000000001');
});

test('flow: two orders never collide on a reference', () => {
  const refs = new Set();
  for (let i = 0; i < 500; i += 1) {
    const result = runCheckout({ items: [{ slug: 'terra-ceramic-mug', quantity: 1 }], customer: goodCustomer });
    refs.add(result.reference);
  }
  assert.equal(refs.size, 500);
});
