'use client';

import Link from 'next/link';
import { useCart, MAX_LINE_QUANTITY } from '@/components/cart-context';
import { formatMoney } from '@/lib/money';
import { FREE_SHIPPING_THRESHOLD_CENTS } from '@/lib/products';

/** Cart page. Draft only — the order is created at checkout. */
export default function CartPage() {
  const { priced, ready, setQuantity, remove, clear } = useCart();

  if (!ready) return <p className="muted">Loading your cart…</p>;

  if (priced.lines.length === 0) {
    return (
      <div className="card" style={{ padding: 26 }}>
        <h1 style={{ fontSize: 24 }}>Your cart is empty</h1>
        <p className="muted">Add something from the shop and it will show up here.</p>
        <Link href="/" className="btn">
          Browse products
        </Link>
      </div>
    );
  }

  const remaining = FREE_SHIPPING_THRESHOLD_CENTS - priced.subtotalCents;

  return (
    <div>
      <h1 style={{ fontSize: 26 }}>Your cart</h1>
      <div className="split">
        <div className="card" style={{ padding: 20 }}>
          <table className="lines">
            <caption className="sr-only">Items in your cart</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Quantity</th>
                <th scope="col" className="num">
                  Line total
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {priced.lines.map((line) => (
                <tr key={line.slug}>
                  <td>
                    <Link href={`/product/${line.slug}`} style={{ fontWeight: 600 }}>
                      {line.name}
                    </Link>
                    <div className="small muted">
                      {formatMoney(line.unitPriceCents, priced.currency)} each
                    </div>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`qty-${line.slug}`}>
                      Quantity for {line.name}
                    </label>
                    <input
                      id={`qty-${line.slug}`}
                      className="input"
                      type="number"
                      min={1}
                      max={MAX_LINE_QUANTITY}
                      value={line.quantity}
                      style={{ width: 84 }}
                      onChange={(event) => setQuantity(line.slug, Number(event.target.value))}
                    />
                  </td>
                  <td className="num">
                    {formatMoney(line.lineTotalCents, priced.currency)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="small"
                      onClick={() => remove(line.slug)}
                      style={{
                        background: 'none',
                        border: 0,
                        color: 'var(--danger)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-ghost">
              Continue shopping
            </Link>
            <button type="button" className="btn btn-ghost" onClick={clear}>
              Clear cart
            </button>
          </div>
        </div>

        <aside className="card" style={{ padding: 20 }} aria-label="Order summary">
          <h2 style={{ fontSize: 18 }}>Summary</h2>
          <dl style={{ display: 'grid', gap: 8, margin: '12px 0 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt className="muted">Subtotal</dt>
              <dd style={{ margin: 0 }}>{formatMoney(priced.subtotalCents, priced.currency)}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt className="muted">Shipping</dt>
              <dd style={{ margin: 0 }}>
                {priced.shippingCents === 0
                  ? 'Free'
                  : formatMoney(priced.shippingCents, priced.currency)}
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
              <dd style={{ margin: 0 }}>{formatMoney(priced.totalCents, priced.currency)}</dd>
            </div>
          </dl>

          {remaining > 0 && (
            <p className="small muted" style={{ marginTop: 0 }}>
              Add {formatMoney(remaining, priced.currency)} more for free shipping.
            </p>
          )}

          <Link href="/checkout" className="btn" style={{ width: '100%' }}>
            Proceed to checkout
          </Link>
        </aside>
      </div>
    </div>
  );
}
