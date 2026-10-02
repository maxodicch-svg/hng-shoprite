/**
 * Email template — pure, provider-agnostic.
 *
 * Nothing in this file knows whether the message will leave through Mailgun or
 * Resend, and nothing here touches `process.env` or the network. That keeps the
 * template fully unit-testable and makes a provider swap a one-file change
 * (`mailgun.ts` / `resend.ts`).
 */

import { formatMoney } from '../money.ts';
import type { PricedOrder } from '../cart.ts';

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export type SendResult = {
  ok: boolean;
  status: 'sent' | 'skipped' | 'failed';
  detail: string;
  messageId?: string;
  /** Which provider produced this result, for logging and `orders.email_error`. */
  provider?: string;
};

export type OrderEmailData = {
  reference: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  order: PricedOrder;
  placedAt: string;
};

/** Escape a value for safe interpolation into email HTML. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render the HTML and text bodies of the order confirmation. */
export function renderOrderConfirmation(data: OrderEmailData): EmailMessage {
  const { order, reference, customerName, shippingAddress } = data;
  const money = (cents: number) => formatMoney(cents, order.currency);

  const rows = order.lines
    .map(
      (line) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">${esc(line.name)}
            <div style="color:#6b7280;font-size:12px;">Qty ${line.quantity} × ${esc(
              money(line.unitPriceCents),
            )}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">
            ${esc(money(line.lineTotalCents))}
          </td>
        </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#4f46e5;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">Zedu Store</div>
      <h1 style="margin:6px 0 0;font-size:22px;">Order confirmed</h1>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
      <p style="margin:0 0 12px;">Hi ${esc(customerName)},</p>
      <p style="margin:0 0 16px;">Thanks for your order. We are preparing it now — keep this
        email as your receipt.</p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;">
        <strong>Reference:</strong> ${esc(reference)}<br />
        <strong>Placed:</strong> ${esc(data.placedAt)}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td style="padding:12px 0 4px;">Subtotal</td>
              <td style="padding:12px 0 4px;text-align:right;">${esc(money(order.subtotalCents))}</td></tr>
          <tr><td style="padding:4px 0;">Shipping</td>
              <td style="padding:4px 0;text-align:right;">${
                order.shippingCents === 0 ? 'Free' : esc(money(order.shippingCents))
              }</td></tr>
          <tr><td style="padding:8px 0;font-size:16px;"><strong>Total</strong></td>
              <td style="padding:8px 0;text-align:right;font-size:16px;"><strong>${esc(
                money(order.totalCents),
              )}</strong></td></tr>
        </tfoot>
      </table>
      <div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;font-size:14px;">
        <strong>Shipping to</strong><br />${esc(shippingAddress)}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">
        Zedu Store · HNG Internship 15, Lesson 2 · This is a demo store.</p>
    </div>
  </div>
</body></html>`;

  const text = [
    `Zedu Store — order confirmed`,
    ``,
    `Hi ${customerName}, thanks for your order.`,
    `Reference: ${reference}`,
    `Placed: ${data.placedAt}`,
    ``,
    ...order.lines.map((l) => `- ${l.name} x${l.quantity}  ${money(l.lineTotalCents)}`),
    ``,
    `Subtotal: ${money(order.subtotalCents)}`,
    `Shipping: ${order.shippingCents === 0 ? 'Free' : money(order.shippingCents)}`,
    `Total:    ${money(order.totalCents)}`,
    ``,
    `Shipping to: ${shippingAddress}`,
  ].join('\n');

  return {
    to: data.customerEmail,
    subject: `Your Zedu Store order ${reference} is confirmed`,
    html,
    text,
  };
}
