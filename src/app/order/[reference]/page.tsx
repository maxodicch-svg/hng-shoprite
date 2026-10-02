import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrder } from '@/lib/store';
import { formatMoney } from '@/lib/money';
import { ResendEmail } from '@/components/resend-email';

export const dynamic = 'force-dynamic';

const EMAIL_LABEL: Record<string, string> = {
  sent: 'Confirmation email sent',
  skipped: 'Confirmation email logged (Mailgun not configured)',
  failed: 'Confirmation email could not be sent',
  pending: 'Confirmation email pending',
};

/** Order confirmation page, reachable by its reference. */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { reference } = await params;
  const { placed } = await searchParams;
  const order = await getOrder({ reference });
  if (!order) {
    notFound();
    return null;
  }

  const currency = order.currency;
  const placedAt = new Date(order.created_at).toUTCString();

  return (
    <div>
      {placed === '1' && (
        <p className="banner banner-ok" role="status">
          Order placed. A confirmation email is on its way to {order.customer_email}.
        </p>
      )}

      <h1 style={{ fontSize: 26, marginTop: 16 }}>Thank you, {order.customer_name}!</h1>
      <p className="muted">
        Your order reference is <strong style={{ color: 'var(--text)' }}>{order.reference}</strong>,
        placed {placedAt}.
      </p>

      <div className="split" style={{ marginTop: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 18 }}>Items</h2>
          <table className="lines" style={{ marginTop: 10 }}>
            <caption className="sr-only">Items in this order</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="num">
                  Qty
                </th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((item) => (
                <tr key={`${item.product_slug}-${item.product_name}`}>
                  <td>
                    <Link href={`/product/${item.product_slug}`}>{item.product_name}</Link>
                    <div className="small muted">
                      {formatMoney(item.unit_price_cents, currency)} each
                    </div>
                  </td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">{formatMoney(item.line_total_cents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl style={{ display: 'grid', gap: 8, marginTop: 18, maxWidth: 340 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt className="muted">Subtotal</dt>
              <dd style={{ margin: 0 }}>{formatMoney(order.subtotal_cents, currency)}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt className="muted">Shipping</dt>
              <dd style={{ margin: 0 }}>
                {order.shipping_cents === 0 ? 'Free' : formatMoney(order.shipping_cents, currency)}
              </dd>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--line)',
                paddingTop: 10,
                fontWeight: 700,
                fontSize: 17,
              }}
            >
              <dt>Total</dt>
              <dd style={{ margin: 0 }}>{formatMoney(order.total_cents, currency)}</dd>
            </div>
          </dl>
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16 }}>Confirmation email</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              {EMAIL_LABEL[order.email_status] ?? order.email_status} · sent to{' '}
              {order.customer_email}
            </p>
            <ResendEmail reference={order.reference} />
          </section>

          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16 }}>Shipping to</h2>
            <p className="small" style={{ margin: 0 }}>
              {order.customer_name}
              <br />
              {order.shipping_address}
              <br />
              {order.customer_email}
            </p>
            {order.note && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Note: {order.note}
              </p>
            )}
          </section>

          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16 }}>Where this order lives</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              {order.mode === 'supabase'
                ? 'Persisted in Supabase (Postgres) — tables orders and order_items.'
                : 'Stored in memory only, because Supabase keys are not set. It disappears when the server restarts.'}
            </p>
            <Link href="/orders" className="small" style={{ textDecoration: 'underline' }}>
              View all my orders
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
