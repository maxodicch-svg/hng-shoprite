'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { accessToken, authConfigured, getBrowserClient, signInWithGoogle } from '@/lib/auth-client';
import { formatMoney } from '@/lib/money';

type ApiOrder = {
  reference: string;
  createdAt: string;
  totalCents: number;
  currency: string;
  status: string;
  emailStatus: string;
  items: { name: string; quantity: number; lineTotalCents: number }[];
};

/** Order history for the signed-in Google user. */
export default function OrdersPage() {
  const [state, setState] = useState<'loading' | 'anon' | 'ready' | 'error'>('loading');
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = getBrowserClient();
      const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      if (!data?.user) {
        setState('anon');
        return;
      }
      const token = await accessToken();
      const res = await fetch('/api/orders', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setMessage(payload.error ?? 'Could not load your orders.');
        setState('error');
        return;
      }
      const payload = await res.json();
      setOrders(payload.orders ?? []);
      setState('ready');
    })();
  }, []);

  if (state === 'loading') return <p className="muted">Loading your orders…</p>;

  if (state === 'anon') {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>My orders</h1>
        <p className="muted">
          Sign in with Google to see the orders linked to your account. Guest orders are still
          reachable from the reference link in your confirmation email.
        </p>
        <button
          type="button"
          className="btn btn-google"
          disabled={!authConfigured}
          onClick={async () => {
            const result = await signInWithGoogle('/orders');
            if (result.error) setMessage(result.error);
          }}
        >
          <span aria-hidden="true">G</span> Continue with Google
        </button>
        {!authConfigured && (
          <p className="small muted">
            Google sign-in needs Supabase keys — see <Link href="/login">Sign in</Link>.
          </p>
        )}
        {message && <p className="error-text">{message}</p>}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>My orders</h1>
        <p className="banner banner-danger" role="alert">
          {message}
        </p>
        <Link href="/login" className="btn btn-ghost">
          Sign in again
        </Link>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>My orders</h1>
        <p className="muted">No orders yet. Anything you buy will appear here.</p>
        <Link href="/" className="btn">
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 26 }}>My orders</h1>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 16 }}>
        {orders.map((order) => (
          <li key={order.reference} className="card" style={{ padding: 18 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <Link
                  href={`/order/${order.reference}`}
                  style={{ fontWeight: 700, textDecoration: 'underline' }}
                >
                  {order.reference}
                </Link>
                <div className="small muted">
                  {new Date(order.createdAt).toUTCString()} · {order.status} · email{' '}
                  {order.emailStatus}
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>{formatMoney(order.totalCents, order.currency)}</div>
            </div>
            <ul className="small muted" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
              {order.items.map((item) => (
                <li key={`${order.reference}-${item.name}`}>
                  {item.name} × {item.quantity} — {formatMoney(item.lineTotalCents, order.currency)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
