/**
 * Pure-logic tests: money, normalization, pricing, validation, email rendering.
 *
 * Run with `npm test`. These cover the rules that decide what a customer is
 * charged, so they are the tests that matter most in this project.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMoney,
  minorUnitFactor,
  isValidCents,
  currencySymbol,
} from '../src/lib/money.ts';
import {
  normalizeCart,
  normalizeQuantity,
  priceCart,
  validateCustomer,
  toCustomer,
  isValidEmail,
  makeReference,
  MAX_LINE_QUANTITY,
} from '../src/lib/cart.ts';
import { CATALOG, findProduct, shippingFor, FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_FLAT_CENTS } from '../src/lib/products.ts';
import { renderOrderConfirmation } from '../src/lib/email.ts';

// ------------------------------------------------------------------- money ---

test('money: formats minor units per currency', () => {
  assert.equal(formatMoney(8900), '$89.00');
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(199900, 'NGN'), '₦1,999.00');
  assert.equal(formatMoney(1250, 'JPY'), '¥1,250');
});

test('money: minor unit factor and validity', () => {
  assert.equal(minorUnitFactor('USD'), 100);
  assert.equal(minorUnitFactor('jpy'), 1);
  assert.equal(minorUnitFactor('KWD'), 1000);
  assert.equal(isValidCents(0), true);
  assert.equal(isValidCents(10.5), false);
  assert.equal(isValidCents(-1), false);
  assert.equal(isValidCents('100'), false);
});

test('money: unknown currency never throws and coerces bad input to zero', () => {
  const out = formatMoney(Number.NaN, 'XYZ');
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0);
  assert.equal(currencySymbol('XYZ'), 'XYZ ');
  assert.equal(formatMoney(-500).includes('0.00'), true);
});

// -------------------------------------------------------------------- cart ---

test('quantity: clamps junk, negatives and runaway values', () => {
  assert.equal(normalizeQuantity('3'), 3);
  assert.equal(normalizeQuantity(2.9), 2);
  assert.equal(normalizeQuantity(-4), 0);
  assert.equal(normalizeQuantity('abc'), 0);
  assert.equal(normalizeQuantity(999), MAX_LINE_QUANTITY);
  assert.equal(normalizeQuantity(null), 0);
});

test('normalizeCart: rejects unknown slugs and non-arrays', () => {
  assert.deepEqual(normalizeCart(null), []);
  assert.deepEqual(normalizeCart('nonsense'), []);
  assert.deepEqual(normalizeCart([{ slug: 'not-a-product', quantity: 2 }]), []);
  assert.deepEqual(normalizeCart([{ slug: 'terra-ceramic-mug', quantity: 0 }]), []);
  assert.deepEqual(
    normalizeCart([{ slug: 'terra-ceramic-mug', quantity: 2 }]),
    [{ slug: 'terra-ceramic-mug', quantity: 2 }],
  );
});

test('normalizeCart: merges duplicate slugs and caps line quantity', () => {
  const merged = normalizeCart([
    { slug: 'terra-ceramic-mug', quantity: 2 },
    { slug: 'terra-ceramic-mug', quantity: 3 },
  ]);
  assert.deepEqual(merged, [{ slug: 'terra-ceramic-mug', quantity: 5 }]);

  const capped = normalizeCart([
    { slug: 'terra-ceramic-mug', quantity: 8 },
    { slug: 'terra-ceramic-mug', quantity: 8 },
  ]);
  assert.deepEqual(capped, [{ slug: 'terra-ceramic-mug', quantity: MAX_LINE_QUANTITY }]);
});

test('normalizeCart: ignores inherited/extra keys and objects without slug', () => {
  assert.deepEqual(normalizeCart([{ quantity: 3 }]), []);
  assert.deepEqual(normalizeCart(['terra-ceramic-mug']), []);
});

test('priceCart: prices from the catalog, not from the client payload', () => {
  const priced = priceCart([{ slug: 'aura-desk-lamp', quantity: 2 }]);
  assert.equal(priced.lines.length, 1);
  assert.equal(priced.lines[0].unitPriceCents, 8900);
  assert.equal(priced.subtotalCents, 17800);
  assert.equal(priced.itemCount, 2);
});

test('priceCart: ignores a client-supplied price field entirely', () => {
  const priced = priceCart([{ slug: 'meridian-headphones', quantity: 1, priceCents: 1 }]);
  assert.equal(priced.lines[0].unitPriceCents, 24900);
  assert.equal(priced.totalCents, 24900);
});

test('priceCart: empty or invalid cart prices to zero without throwing', () => {
  for (const input of [[], null, undefined, 'x', [{}], [{ slug: 'nope', quantity: 5 }]]) {
    const priced = priceCart(input);
    assert.equal(priced.subtotalCents, 0);
    assert.equal(priced.totalCents, 0);
    assert.equal(priced.shippingCents, 0);
    assert.equal(priced.itemCount, 0);
  }
});

test('shipping: free at the threshold, flat rate below it, zero for nothing', () => {
  assert.equal(shippingFor(0), 0);
  assert.equal(shippingFor(SHIPPING_FLAT_CENTS), SHIPPING_FLAT_CENTS);
  assert.equal(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS - 1), SHIPPING_FLAT_CENTS);
  assert.equal(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS), 0);
  assert.equal(shippingFor(50000), 0);
});

test('priceCart: applies free shipping above the threshold', () => {
  const priced = priceCart([{ slug: 'meridian-headphones', quantity: 1 }]);
  assert.equal(priced.subtotalCents, 24900);
  assert.equal(priced.shippingCents, 0);
  assert.equal(priced.totalCents, 24900);
});

test('priceCart: totals always equal subtotal plus shipping', () => {
  const priced = priceCart([
    { slug: 'terra-ceramic-mug', quantity: 1 },
    { slug: 'field-notes-journal', quantity: 1 },
  ]);
  assert.equal(priced.totalCents, priced.subtotalCents + priced.shippingCents);
  assert.equal(priced.subtotalCents, 4300);
});

test('catalog: slugs are unique and every price is a valid integer', () => {
  const slugs = CATALOG.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const product of CATALOG) {
    assert.ok(Number.isSafeInteger(product.priceCents), `${product.slug} price`);
    assert.ok(product.priceCents > 0, `${product.slug} price positive`);
  }
  assert.equal(findProduct('aura-desk-lamp')?.name, 'Aura Desk Lamp');
  assert.equal(findProduct('ghost-product'), undefined);
});

// --------------------------------------------------------------- customer ----

test('email validation accepts real addresses and rejects junk', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('first.last+tag@sub.domain.io'), true);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('no-at-sign'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('a b@c.com'), false);
  assert.equal(isValidEmail(`${'x'.repeat(250)}@example.com`), false);
});

test('validateCustomer: reports each missing field with a field name', () => {
  const issues = validateCustomer({});
  const fields = issues.map((i) => i.field).sort();
  assert.deepEqual(fields, ['address', 'city', 'email', 'fullName']);
});

test('validateCustomer: accepts a complete payload and long-but-legal values', () => {
  assert.deepEqual(
    validateCustomer({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      address: '12 Analytical Engine Way',
      city: 'London',
      postalCode: 'EC1A',
      note: 'Leave with the porter.',
    }),
    [],
  );
});

test('validateCustomer: rejects over-long input instead of truncating silently', () => {
  const issues = validateCustomer({
    fullName: 'A'.repeat(121),
    email: 'ada@example.com',
    address: 'B'.repeat(301),
    city: 'London',
    note: 'n'.repeat(501),
  });
  const fields = issues.map((i) => i.field).sort();
  assert.deepEqual(fields, ['address', 'fullName', 'note']);
});

test('toCustomer: normalises whitespace, email case and note length', () => {
  const customer = toCustomer({
    fullName: '  Ada   Lovelace ',
    email: '  ADA@Example.COM ',
    address: ' 12 Engine Way ',
    city: ' London ',
    postalCode: ' EC1A ',
    note: 'n'.repeat(600),
  });
  assert.equal(customer.fullName, 'Ada Lovelace');
  assert.equal(customer.email, 'ada@example.com');
  assert.equal(customer.shippingAddress, '12 Engine Way, London, EC1A');
  assert.equal(customer.note.length, 500);
});

test('toCustomer: tolerates missing fields without throwing', () => {
  const customer = toCustomer({});
  assert.equal(customer.fullName, '');
  assert.equal(customer.shippingAddress, '');
});

// -------------------------------------------------------------- reference ----

test('makeReference: deterministic with an injected random source', () => {
  assert.equal(makeReference(() => 0), 'ZS-AAAAAA');
  assert.equal(makeReference(() => 0.999999), 'ZS-999999');
});

test('makeReference: unique-looking and prefixed for real calls', () => {
  const refs = new Set(Array.from({ length: 200 }, () => makeReference()));
  assert.equal(refs.size, 200);
  for (const ref of refs) assert.match(ref, /^ZS-[A-Z2-9]{6}$/);
});

// ------------------------------------------------------------------- email ---

test('email: renders the reference, totals and shipping address', () => {
  const priced = priceCart([{ slug: 'aura-desk-lamp', quantity: 1 }]);
  const message = renderOrderConfirmation({
    reference: 'ZS-TEST01',
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    shippingAddress: '12 Engine Way, London, EC1A',
    order: priced,
    placedAt: 'Fri, 01 Jan 2027 00:00:00 GMT',
  });

  assert.equal(message.to, 'ada@example.com');
  assert.match(message.subject, /ZS-TEST01/);
  assert.match(message.html, /Aura Desk Lamp/);
  assert.match(message.text, /Total:\s+\$98\.00/);
  assert.match(message.text, /12 Engine Way, London, EC1A/);
});

test('email: escapes HTML so a customer name cannot inject markup', () => {
  const priced = priceCart([{ slug: 'terra-ceramic-mug', quantity: 1 }]);
  const message = renderOrderConfirmation({
    reference: 'ZS-XSS001',
    customerName: '<script>alert(1)</script>',
    customerEmail: 'ada@example.com',
    shippingAddress: '<img src=x onerror=alert(1)>',
    order: priced,
    placedAt: 'now',
  });
  assert.equal(message.html.includes('<script>'), false);
  assert.match(message.html, /&lt;script&gt;/);
  assert.equal(message.html.includes('<img src=x'), false);
  assert.match(message.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('email: says "Free" instead of a zero shipping charge', () => {
  const priced = priceCart([{ slug: 'nomad-weekender-bag', quantity: 1 }]);
  const message = renderOrderConfirmation({
    reference: 'ZS-FREE01',
    customerName: 'Ada',
    customerEmail: 'ada@example.com',
    shippingAddress: 'Somewhere',
    order: priced,
    placedAt: 'now',
  });
  assert.equal(priced.shippingCents, 0);
  assert.match(message.html, /Free/);
});
