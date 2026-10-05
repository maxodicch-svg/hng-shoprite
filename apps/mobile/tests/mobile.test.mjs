/**
 * Tests for the mobile app's pure logic.
 *
 * The Expo screens cannot be tested offline without Node modules, but the three
 * modules that decide what the app *shows* and *sends* are dependency-free, so
 * they run here under the same `node:test` harness as the website.
 *
 * Run: node --experimental-strip-types tests/mobile.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { formatMoney, currencySymbol, minorUnitFactor } from '../lib/money.ts';
import {
  normalizeCart,
  normalizeQuantity,
  priceCart,
  MAX_LINE_QUANTITY,
} from '../lib/cart.ts';
import { CATALOG, findProduct, shippingFor } from '../lib/catalog.ts';
import {
  AUTH_CALLBACK_PATH,
  AUTH_SCHEME,
  AUTH_SCHEME_REDIRECT,
  authRedirectFor,
  isExpoGoUrl,
} from '../lib/redirect.ts';

const LAMP = 'aura-desk-lamp'; // 8900
const MUG = 'terra-ceramic-mug'; // 1900
const KEYBOARD = 'orbit-mechanical-keyboard'; // 17900

test('mobile money: formats integer minor units without Intl', () => {
  assert.equal(formatMoney(8900), '$89.00');
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(249000), '$2,490.00');
  assert.equal(formatMoney(199900, 'NGN'), '₦1,999.00');
  assert.equal(formatMoney(1250, 'JPY'), '¥1,250');
  assert.equal(currencySymbol('XYZ'), 'XYZ ');
  assert.equal(minorUnitFactor('KWD'), 1000);
});

test('mobile money: junk amounts render as zero, never NaN', () => {
  for (const value of [Number.NaN, -500, 10.5, undefined]) {
    const out = formatMoney(value);
    assert.equal(typeof out, 'string');
    assert.ok(!out.includes('NaN'), `${value} produced ${out}`);
    assert.equal(out, '$0.00');
  }
});

test('mobile cart: quantities clamp exactly like the website', () => {
  assert.equal(normalizeQuantity('3'), 3);
  assert.equal(normalizeQuantity(500), MAX_LINE_QUANTITY);
  assert.equal(normalizeQuantity(-4), 0);
  assert.equal(normalizeQuantity('nonsense'), 0);
});

test('mobile cart: unknown slugs are dropped and duplicates sum', () => {
  assert.deepEqual(normalizeCart([{ slug: 'free-iphone', quantity: 1 }]), []);
  assert.deepEqual(
    normalizeCart([
      { slug: MUG, quantity: 2 },
      { slug: MUG, quantity: 3 },
    ]),
    [{ slug: MUG, quantity: 5 }],
  );
  assert.deepEqual(normalizeCart('nope'), []);
});

test('mobile cart: local pricing matches the server catalog + shipping rules', () => {
  const priced = priceCart([
    { slug: KEYBOARD, quantity: 1 },
    { slug: MUG, quantity: 2 },
  ]);
  assert.equal(priced.subtotalCents, 17900 + 2 * 1900);
  assert.equal(priced.itemCount, 3);
  // 21700 >= the 15000 free-shipping threshold.
  assert.equal(priced.shippingCents, 0);
  assert.equal(priced.totalCents, 21700);

  const small = priceCart([{ slug: MUG, quantity: 1 }]);
  assert.equal(small.shippingCents, 900);
  assert.equal(small.totalCents, 2800);
});

test('mobile cart: the catalog mirrors the website, slug for slug', () => {
  assert.equal(CATALOG.length, 6);
  assert.equal(findProduct(LAMP)?.priceCents, 8900);
  assert.equal(findProduct('not-a-product'), undefined);
  assert.equal(shippingFor(15000), 0);
  assert.equal(shippingFor(14999), 900);
  assert.equal(shippingFor(0), 0);
});

test('mobile auth: the return URL is the one the running shell can receive', () => {
  // Regression: the return URL used to be the hard-coded custom scheme, which
  // Expo Go cannot receive, so the first sign-in attempt hung and the second
  // threw "the auth session is in an invalid state with a redirect handler set".
  const expoGo = 'exp://192.168.43.67:8081/--/auth/callback';
  assert.equal(authRedirectFor(expoGo), expoGo);
  assert.equal(authRedirectFor('exps://kmane-8081.exp.direct/--/auth/callback'),
    'exps://kmane-8081.exp.direct/--/auth/callback');

  // A dev or standalone build registers app.json's scheme, so it keeps using it.
  assert.equal(authRedirectFor(AUTH_SCHEME_REDIRECT), 'zedustore://auth/callback');
  assert.equal(AUTH_SCHEME_REDIRECT, `${AUTH_SCHEME}://${AUTH_CALLBACK_PATH}`);

  assert.equal(isExpoGoUrl('exp://127.0.0.1:8081/--/auth/callback'), true);
  assert.equal(isExpoGoUrl('https://example.com/auth/callback'), false);
  assert.equal(isExpoGoUrl(''), false);
});

test('mobile auth: the redirect agrees with app.json and lands on a real route', () => {
  const appJson = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(appJson.expo.scheme, AUTH_SCHEME);
  assert.ok(
    existsSync(new URL(`../app/${AUTH_CALLBACK_PATH}.tsx`, import.meta.url)),
    `app/${AUTH_CALLBACK_PATH}.tsx must exist — the provider returns to that path`,
  );
});
