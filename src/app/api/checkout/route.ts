import { NextResponse, type NextRequest } from 'next/server';
import { priceCart, validateCustomer, toCustomer, makeReference } from '@/lib/cart';
import { createOrder, getUserFromToken, markOrderEmail, getProducts } from '@/lib/store';
import { renderOrderConfirmation, sendEmail } from '@/lib/email';

/** Checkout writes to the database and calls Mailgun — never statically cached. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = Record<string, unknown>;

/**
 * POST /api/checkout
 *
 * Body: `{ items: [{slug, quantity}], customer: {fullName,email,address,city,postalCode,note} }`
 *
 * The browser's prices are ignored: the cart is re-priced from the catalog in
 * the database, then persisted to `orders` + `order_items`, and a Mailgun
 * confirmation is sent. Email failure is recorded on the order but does not
 * fail the request — the customer keeps their order either way.
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  // ------------------------------------------------------------ validation --
  const customerInput = (body.customer ?? {}) as Record<string, unknown>;
  const issues = validateCustomer(customerInput);
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'Please fix the highlighted fields.', issues },
      { status: 422 },
    );
  }

  const { products } = await getProducts();
  const priced = priceCart(body.items, products);
  if (priced.lines.length === 0) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 422 });
  }

  const customer = toCustomer(customerInput);

  // Optional: link the order to a signed-in Google user.
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const user = await getUserFromToken(token);

  const reference = makeReference();

  // ------------------------------------------------------------- persistence --
  let order;
  try {
    order = await createOrder({
      reference,
      userId: user?.id ?? null,
      customerName: customer.fullName,
      customerEmail: customer.email,
      shippingAddress: customer.shippingAddress,
      note: customer.note || null,
      order: priced,
    });
  } catch (error) {
    console.error('[checkout] persistence failed:', (error as Error).message);
    return NextResponse.json(
      { error: 'We could not save your order. Please try again.' },
      { status: 502 },
    );
  }

  // ------------------------------------------------------------------ email --
  const message = renderOrderConfirmation({
    reference: order.reference,
    customerName: customer.fullName,
    customerEmail: order.customer_email,
    shippingAddress: order.shipping_address,
    order: priced,
    placedAt: new Date(order.created_at).toUTCString(),
  });
  const email = await sendEmail(message);
  await markOrderEmail(order.id, email.status, email.ok ? null : email.detail);

  return NextResponse.json(
    {
      ok: true,
      reference: order.reference,
      totalCents: priced.totalCents,
      currency: priced.currency,
      mode: order.mode,
      email: { status: email.status, detail: email.detail },
    },
    { status: 201 },
  );
}

/** Anything but POST is a client bug, not a missing page. */
export async function GET() {
  return NextResponse.json({ error: 'Use POST to place an order.' }, { status: 405 });
}
