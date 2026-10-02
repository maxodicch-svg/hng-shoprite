/**
 * Email entry point.
 *
 * The template lives in `email/template.ts` (pure), and each provider in its own
 * module (`email/mailgun.ts`, `email/resend.ts`). This file picks one and sends.
 *
 * Provider selection:
 *   1. `EMAIL_PROVIDER=mailgun|resend` forces a provider.
 *   2. Otherwise Mailgun wins when configured — it is what the assignment asks
 *      for — then Resend.
 *   3. With neither configured, sending degrades to **mock mode**: the rendered
 *      message is logged and reported as `skipped`, so checkout never fails just
 *      because email is unconfigured.
 *
 * Setting `EMAIL_FALLBACK=1` tries the second provider when the first fails,
 * which is what keeps checkout working while a Mailgun sandbox is still being
 * set up.
 */

import {
  renderOrderConfirmation,
  type EmailMessage,
  type OrderEmailData,
  type SendResult,
} from './email/template.ts';
import { isMailgunConfigured, sendViaMailgun, MAILGUN } from './email/mailgun.ts';
import { isResendConfigured, sendViaResend, RESEND } from './email/resend.ts';

export { renderOrderConfirmation, esc } from './email/template.ts';
export type { EmailMessage, OrderEmailData, SendResult } from './email/template.ts';

export type ProviderName = 'mailgun' | 'resend';

/** Every provider that has credentials, in preference order. */
export function configuredProviders(): ProviderName[] {
  const providers: ProviderName[] = [];
  if (isMailgunConfigured()) providers.push(MAILGUN);
  if (isResendConfigured()) providers.push(RESEND);

  const forced = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (forced === MAILGUN || forced === RESEND) {
    const available = providers.includes(forced);
    // A forced provider that is configured always wins, even if it is second
    // in the natural order.
    if (available) return [forced, ...providers.filter((p) => p !== forced)];
    // Forced but unconfigured is a setup mistake worth surfacing loudly.
    console.warn(
      `[email] EMAIL_PROVIDER=${forced} but that provider is not configured; ` +
        `using ${providers.join(', ') || 'mock mode'}.`,
    );
  }
  return providers;
}

/** True when at least one email provider has credentials. */
export function isEmailConfigured(): boolean {
  return configuredProviders().length > 0;
}

/** The provider that would be used right now, or `null` in mock mode. */
export function activeProvider(): ProviderName | null {
  return configuredProviders()[0] ?? null;
}

async function sendWith(provider: ProviderName, message: EmailMessage): Promise<SendResult> {
  return provider === MAILGUN ? sendViaMailgun(message) : sendViaResend(message);
}

/**
 * Send one message through the configured provider(s).
 *
 * Never throws: network and API failures come back as `{ ok: false }` so the
 * caller can record `orders.email_status = 'failed'` and still keep the order.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const providers = configuredProviders();

  if (providers.length === 0) {
    // Mock mode: log the text part so the flow is verifiable without keys.
    console.info(
      `[email:mock] would send "${message.subject}" to ${message.to}\n${message.text}`,
    );
    return {
      ok: true,
      status: 'skipped',
      provider: 'mock',
      detail:
        'No email provider configured (MAILGUN_API_KEY/MAILGUN_DOMAIN or RESEND_API_KEY) — ' +
        'the message was logged instead of sent.',
    };
  }

  const attempts = process.env.EMAIL_FALLBACK === '1' ? providers : providers.slice(0, 1);
  const failures: string[] = [];

  for (const provider of attempts) {
    const result = await sendWith(provider, message);
    if (result.ok) {
      // Surface a fallback save in the logs, since it means the primary is sick.
      if (failures.length > 0) {
        console.warn(`[email] ${provider} delivered after: ${failures.join(' | ')}`);
      }
      return result;
    }
    failures.push(result.detail);
    console.warn(`[email] ${provider} failed: ${result.detail}`);
  }

  return {
    ok: false,
    status: 'failed',
    provider: attempts[attempts.length - 1],
    detail: failures.join(' | '),
  };
}

/** Render + send the order confirmation in one step. */
export async function sendOrderConfirmation(data: OrderEmailData): Promise<SendResult> {
  return sendEmail(renderOrderConfirmation(data));
}
