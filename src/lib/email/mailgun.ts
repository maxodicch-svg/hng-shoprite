/**
 * Mailgun transport — the provider named in the assignment brief.
 *
 *   MAILGUN_API_KEY   private API key from app.mailgun.com
 *   MAILGUN_DOMAIN    e.g. sandbox123.mailgun.org
 *   MAILGUN_API_BASE  https://api.mailgun.net (EU: https://api.eu.mailgun.net)
 *   MAILGUN_FROM      "Zedu Store <postmaster@your-domain>"
 *   MAILGUN_REPLY_TO  optional
 */

import type { EmailMessage, SendResult } from './template.ts';

export const MAILGUN = 'mailgun';

export function isMailgunConfigured(): boolean {
  return Boolean(process.env.MAILGUN_API_KEY?.trim() && process.env.MAILGUN_DOMAIN?.trim());
}

function apiBase(): string {
  const base = process.env.MAILGUN_API_BASE?.trim() || 'https://api.mailgun.net';
  return base.replace(/\/+$/, '');
}

function fromAddress(): string {
  return (
    process.env.MAILGUN_FROM?.trim() ||
    `Zedu Store <postmaster@${process.env.MAILGUN_DOMAIN?.trim()}>`
  );
}

/** Send through the Mailgun HTTP API. Never throws. */
export async function sendViaMailgun(message: EmailMessage): Promise<SendResult> {
  const form = new URLSearchParams();
  form.set('from', fromAddress());
  form.set('to', message.to);
  form.set('subject', message.subject);
  form.set('text', message.text);
  form.set('html', message.html);
  if (process.env.MAILGUN_REPLY_TO) form.set('h:Reply-To', process.env.MAILGUN_REPLY_TO);

  const auth = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64');
  const endpoint = `${apiBase()}/v3/${process.env.MAILGUN_DOMAIN}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      cache: 'no-store',
    });

    const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!res.ok) {
      return {
        ok: false,
        status: 'failed',
        provider: MAILGUN,
        detail: `Mailgun ${res.status}: ${payload.message ?? res.statusText}`,
      };
    }
    return {
      ok: true,
      status: 'sent',
      provider: MAILGUN,
      detail: 'Accepted by Mailgun.',
      messageId: payload.id,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      provider: MAILGUN,
      detail: `Mailgun request failed: ${(error as Error).message}`,
    };
  }
}
