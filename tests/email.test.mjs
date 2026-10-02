/**
 * Email transport tests.
 *
 * These cover the behaviour that used to be unverifiable without a real Mailgun
 * account: provider selection, the Resend fallback when Mailgun fails, and the
 * mock-mode path. `fetch` is stubbed, so nothing leaves the machine.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import {
  sendEmail,
  sendOrderConfirmation,
  isEmailConfigured,
  activeProvider,
  configuredProviders,
  renderOrderConfirmation,
} from '../src/lib/email.ts';
import { priceCart } from '../src/lib/cart.ts';

const MAILGUN_VARS = ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_API_BASE', 'MAILGUN_FROM'];
const RESEND_VARS = ['RESEND_API_KEY', 'RESEND_FROM'];
const ALL_VARS = [...MAILGUN_VARS, ...RESEND_VARS, 'EMAIL_PROVIDER', 'EMAIL_FALLBACK'];

/** Run `body` with a clean set of email env vars, restored afterwards. */
async function withEmailEnv(vars, body) {
  const saved = {};
  for (const key of ALL_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, vars);
  try {
    return await body();
  } finally {
    for (const key of ALL_VARS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

const message = () =>
  renderOrderConfirmation({
    reference: 'ZS-ABC123',
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    shippingAddress: '12 Engine Way, London',
    order: priceCart([{ slug: 'aura-desk-lamp', quantity: 1 }]),
    placedAt: 'now',
  });

const MAILGUN_ENV = {
  MAILGUN_API_KEY: 'key-test',
  MAILGUN_DOMAIN: 'sandbox123.mailgun.org',
};
const RESEND_ENV = { RESEND_API_KEY: 're_test' };

test('email: with nothing configured it reports skipped and sends nothing', async () => {
  await withEmailEnv({}, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch must not be called in mock mode');
    });
    const result = await sendEmail(message());
    fetchMock.mock.restore();

    assert.equal(result.ok, true);
    assert.equal(result.status, 'skipped');
    assert.equal(result.provider, 'mock');
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(isEmailConfigured(), false);
    assert.equal(activeProvider(), null);
  });
});

test('email: Mailgun is preferred when both providers are configured', async () => {
  await withEmailEnv({ ...MAILGUN_ENV, ...RESEND_ENV }, async () => {
    assert.deepEqual(configuredProviders(), ['mailgun', 'resend']);
    assert.equal(activeProvider(), 'mailgun');
    assert.equal(isEmailConfigured(), true);
  });
});

test('email: a single provider is used when only that one is configured', async () => {
  await withEmailEnv(RESEND_ENV, async () => {
    assert.deepEqual(configuredProviders(), ['resend']);
    assert.equal(activeProvider(), 'resend');
  });
});

test('email: EMAIL_PROVIDER overrides the natural preference order', async () => {
  await withEmailEnv({ ...MAILGUN_ENV, ...RESEND_ENV, EMAIL_PROVIDER: 'resend' }, async () => {
    assert.deepEqual(configuredProviders(), ['resend', 'mailgun']);
    assert.equal(activeProvider(), 'resend');
  });
});

test('email: Mailgun posts the rendered message to the right endpoint', async () => {
  await withEmailEnv(MAILGUN_ENV, async () => {
    const calls = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ id: '<abc@mailgun>' }) };
    });

    const result = await sendEmail(message());
    fetchMock.mock.restore();

    assert.equal(result.ok, true);
    assert.equal(result.status, 'sent');
    assert.equal(result.provider, 'mailgun');
    assert.equal(result.messageId, '<abc@mailgun>');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.mailgun.net/v3/sandbox123.mailgun.org/messages');
    assert.match(calls[0].init.headers.Authorization, /^Basic /);
    const body = String(calls[0].init.body);
    assert.match(body, /to=ada%40example\.com/);
    assert.match(body, /ZS-ABC123/);
  });
});

test('email: an EU Mailgun base URL is honoured', async () => {
  await withEmailEnv({ ...MAILGUN_ENV, MAILGUN_API_BASE: 'https://api.eu.mailgun.net/' }, async () => {
    const urls = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await sendEmail(message());
    fetchMock.mock.restore();
    // Trailing slash must be normalised, not doubled.
    assert.equal(urls[0], 'https://api.eu.mailgun.net/v3/sandbox123.mailgun.org/messages');
  });
});

test('email: a Mailgun rejection surfaces the API message and fails the send', async () => {
  await withEmailEnv(MAILGUN_ENV, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'Sandbox domain recipient not authorized' }),
    }));
    const result = await sendEmail(message());
    fetchMock.mock.restore();

    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.match(result.detail, /403/);
    assert.match(result.detail, /not authorized/);
  });
});

test('email: a network throw is caught, never propagated to checkout', async () => {
  await withEmailEnv(MAILGUN_ENV, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('ECONNRESET');
    });
    const result = await sendEmail(message());
    fetchMock.mock.restore();
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.match(result.detail, /ECONNRESET/);
  });
});

test('email: EMAIL_FALLBACK uses Resend when Mailgun fails', async () => {
  await withEmailEnv({ ...MAILGUN_ENV, ...RESEND_ENV, EMAIL_FALLBACK: '1' }, async () => {
    const urls = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
      urls.push(url);
      if (String(url).includes('mailgun')) {
        return { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'resend-id' }) };
    });

    const result = await sendEmail(message());
    fetchMock.mock.restore();

    assert.equal(result.ok, true);
    assert.equal(result.provider, 'resend');
    assert.equal(result.messageId, 'resend-id');
    assert.equal(urls.length, 2);
    assert.match(String(urls[1]), /api\.resend\.com/);
  });
});

test('email: without EMAIL_FALLBACK a Mailgun failure is reported, and Resend is untouched', async () => {
  await withEmailEnv({ ...MAILGUN_ENV, ...RESEND_ENV }, async () => {
    const urls = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
      urls.push(url);
      return { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) };
    });
    const result = await sendEmail(message());
    fetchMock.mock.restore();

    assert.equal(result.ok, false);
    assert.equal(urls.length, 1);
    assert.match(String(urls[0]), /mailgun/);
  });
});

test('email: when both providers fail the detail lists both reasons', async () => {
  await withEmailEnv({ ...MAILGUN_ENV, ...RESEND_ENV, EMAIL_FALLBACK: '1' }, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (url) => ({
      ok: false,
      status: 422,
      statusText: 'Unprocessable',
      json: async () => ({ message: String(url).includes('resend') ? 'domain not verified' : 'bad key' }),
    }));
    const result = await sendEmail(message());
    fetchMock.mock.restore();

    assert.equal(result.ok, false);
    assert.match(result.detail, /bad key/);
    assert.match(result.detail, /domain not verified/);
  });
});

test('email: sendOrderConfirmation renders and sends the customer address', async () => {
  await withEmailEnv(RESEND_ENV, async () => {
    let sentBody = null;
    const fetchMock = mock.method(globalThis, 'fetch', async (_url, init) => {
      sentBody = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => ({ id: 'x' }) };
    });

    const result = await sendOrderConfirmation({
      reference: 'ZS-ORDER1',
      customerName: 'Ada Lovelace',
      customerEmail: 'ada@example.com',
      shippingAddress: '12 Engine Way, London',
      order: priceCart([{ slug: 'terra-ceramic-mug', quantity: 2 }]),
      placedAt: 'now',
    });
    fetchMock.mock.restore();

    assert.equal(result.status, 'sent');
    assert.deepEqual(sentBody.to, ['ada@example.com']);
    assert.match(sentBody.subject, /ZS-ORDER1/);
    assert.match(sentBody.from, /resend\.dev/);
    assert.match(sentBody.text, /\$38\.00/);
  });
});

test('email: a forced provider that is not configured warns and falls back safely', async () => {
  await withEmailEnv({ ...MAILGUN_ENV, EMAIL_PROVIDER: 'resend' }, async () => {
    // Resend is requested but has no key, so Mailgun must still be used.
    assert.deepEqual(configuredProviders(), ['mailgun']);
    assert.equal(activeProvider(), 'mailgun');
  });
});

test('email: RESEND_FROM overrides the testing sender', async () => {
  await withEmailEnv({ ...RESEND_ENV, RESEND_FROM: 'Zedu Store <shop@zedu.chat>' }, async () => {
    let sentBody = null;
    const fetchMock = mock.method(globalThis, 'fetch', async (_url, init) => {
      sentBody = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await sendEmail(message());
    fetchMock.mock.restore();
    assert.equal(sentBody.from, 'Zedu Store <shop@zedu.chat>');
  });
});
