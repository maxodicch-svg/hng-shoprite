import { NextResponse, type NextRequest } from 'next/server';
import { getUserFromToken, listOrdersForUser } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/orders — the signed-in user's own orders.
 *
 * Requires `Authorization: Bearer <supabase access token>`; the token is
 * verified server-side and the query is scoped to that user id, so one account
 * can never read another's orders.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json({ error: 'Sign in to view your orders.' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 });
  }

  const orders = await listOrdersForUser(user.id);
  return NextResponse.json({
    ok: true,
    count: orders.length,
    orders: orders.map((order) => ({
      reference: order.reference,
      createdAt: order.created_at,
      totalCents: order.total_cents,
      currency: order.currency,
      status: order.status,
      emailStatus: order.email_status,
      items: order.order_items.map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        lineTotalCents: item.line_total_cents,
      })),
    })),
  });
}
