import { NextResponse, type NextRequest } from 'next/server';
import { getOrder, markOrderEmail } from '@/lib/store';
import { renderOrderConfirmation, sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/orders/[reference]/email
 *
 * Re-sends the confirmation email — useful when Mailgun was temporarily down or
 * unconfigured at checkout time. The order is looked up by its public reference;
 * no session is required because the reference is the unguessable capability.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
  const order = await getOrder({ reference });

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (order.email_status === 'sent') {
    return NextResponse.json(
      { ok: true, status: 'sent', detail: 'Already sent.', reference: order.reference },
      { status: 200 },
    );
  }

  const message = renderOrderConfirmation({
    reference: order.reference,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    shippingAddress: order.shipping_address,
    order: {
      lines: order.order_items.map((item) => ({
        slug: item.product_slug,
        name: item.product_name,
        unitPriceCents: item.unit_price_cents,
        quantity: item.quantity,
        lineTotalCents: item.line_total_cents,
      })),
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents,
      totalCents: order.total_cents,
      currency: order.currency,
      itemCount: order.order_items.reduce((sum, item) => sum + item.quantity, 0),
    },
    placedAt: new Date(order.created_at).toUTCString(),
  });

  const result = await sendEmail(message);
  await markOrderEmail(order.id, result.status, result.ok ? null : result.detail);

  return NextResponse.json(
    { ok: result.ok, status: result.status, detail: result.detail, reference: order.reference },
    { status: result.ok ? 200 : 502 },
  );
}
