'use client';

import { useState } from 'react';
import { useCart } from '@/components/cart-context';

/** Add-to-cart control. Reports success through an `aria-live` region. */
export function AddToCart({
  slug,
  name,
  disabled = false,
  quantity = 1,
}: {
  slug: string;
  name: string;
  disabled?: boolean;
  quantity?: number;
}) {
  const { add, setQuantity: setLineQuantity, lines } = useCart();
  const [message, setMessage] = useState('');
  const inCart = lines.find((line) => line.slug === slug)?.quantity ?? 0;

  return (
    <div>
      <button
        type="button"
        className="btn"
        disabled={disabled}
        style={{ width: '100%' }}
        onClick={() => {
          add(slug, quantity);
          setMessage(`${name} added to your cart.`);
        }}
      >
        {disabled ? 'Out of stock' : inCart > 0 ? `Add another (${inCart} in cart)` : 'Add to cart'}
      </button>
      <p role="status" aria-live="polite" className="small" style={{ minHeight: 20, marginTop: 6 }}>
        {message && (
          <>
            <span className="muted">{message} </span>
            <a href="/cart" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>
              View cart
            </a>{' '}
            <button
              type="button"
              onClick={() => {
                setLineQuantity(slug, 0);
                setMessage(`${name} removed.`);
              }}
              style={{
                background: 'none',
                border: 0,
                color: 'var(--muted)',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
              }}
            >
              Undo
            </button>
          </>
        )}
      </p>
    </div>
  );
}
