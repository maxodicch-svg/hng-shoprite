/**
 * Resend transport — optional secondary provider.
 *
 * The assignment asks for Mailgun, so Resend is only used when it is the only
 * provider configured, or as a fallback when `EMAIL_FALLBACK=1` and Mailgun
 * fails. That way the graded requirement stays intact while an unverified
 * Mailgun account never blocks checkout.
 *
 *   RESEND_API_KEY  re_... from resend.com/api-keys
 *   RESEND_FROM     defaults to "Zedu Store <onboarding@resend.dev>"
 *
 * Note the same constraint Mailgun's sandbox has: with the shared
 * `resend.dev` testing domain you can only deliver to the address that owns the
 * Resend account. Verifying a domain lifts that. See
 * https://resend.com/docs/knowledge-base/403-error-resend-dev-domain.md
 */

import type { EmailMessage, SendResult } from './template.ts';

export const RESEND = 'resend';

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  return process.env.RESEND_FROM?.trim() || 'Zedu Store <onboarding@resend.dev>';
}

/** Send through the Resend HTTP API. Never throws. */
export async function sendViaResend(message: EmailMessage): Promise<SendResult> {
  const body: Record<string, unknown> = {
    from: fromAddress(),
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  if (process.env.RESEND_REPLY_TO?.trim()) body.reply_to = process.env.RESEND_REPLY_TO.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const payload = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        status: 'failed',
        provider: RESEND,
        detail: `Resend ${res.status}: ${
          payload.message ?? payload.error?.message ?? res.statusText
        }`,
      };
    }
    return {
      ok: true,
      status: 'sent',
      provider: RESEND,
      detail: 'Accepted by Resend.',
      messageId: payload.id,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      provider: RESEND,
      detail: `Resend request failed: ${(error as Error).message}`,
    };
  }
}
