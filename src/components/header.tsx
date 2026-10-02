'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '@/components/cart-context';
import { authConfigured, getBrowserClient, signOut } from '@/lib/auth-client';

type User = { email?: string | null } | null;

function CartLink() {
  const { itemCount } = useCart();
  return (
    <Link href="/cart" className="btn btn-ghost" style={{ padding: '9px 14px' }}>
      Cart
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          minWidth: 20,
          padding: '0 6px',
          borderRadius: 999,
          background: itemCount ? 'var(--brand)' : 'var(--surface-2)',
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        {itemCount}
      </span>
      <span className="sr-only">{itemCount} items in cart</span>
    </Link>
  );
}

function UserArea() {
  const [user, setUser] = useState<User>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <span className="small muted">…</span>;

  if (!user) {
    return (
      <Link href="/login" className="btn btn-ghost" style={{ padding: '9px 14px' }}>
        {authConfigured ? 'Sign in' : 'Sign in (setup needed)'}
      </Link>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <Link href="/orders" className="small" style={{ textDecoration: 'underline' }}>
        {user.email}
      </Link>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: '9px 14px' }}
        onClick={async () => {
          await signOut();
          window.location.href = '/';
        }}
      >
        Sign out
      </button>
    </span>
  );
}

export function Header() {
  return (
    <header style={{ borderBottom: '1px solid var(--line)', background: 'rgba(7,11,22,0.7)' }}>
      <div
        className="wrap"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          minHeight: 66,
          flexWrap: 'wrap',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: 'linear-gradient(135deg, var(--brand), var(--accent))',
              display: 'inline-block',
            }}
          />
          <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>Zedu Store</span>
        </Link>

        <nav aria-label="Main" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" className="small muted">
            Shop
          </Link>
          <Link href="/orders" className="small muted">
            Orders
          </Link>
          <CartLink />
          <UserArea />
        </nav>
      </div>
    </header>
  );
}
