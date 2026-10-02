'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/components/cart-context';
import { formatMoney } from '@/lib/money';
import { accessToken, authConfigured, getBrowserClient, signInWithGoogle } from '@/lib/auth-client';
import { validateCustomer } from '@/lib/cart';

type Issues = Record<string, string>;

const EMPTY = {
  fullName: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  note: '',
};

export default function CheckoutPage() {
  const router = useRouter();
  const { priced, ready, clear } = useCart();
  const [form, setForm] = useState(EMPTY);
  const [issues, setIssues] = useState<Issues>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<{ email?: string | null } | null>(null);

  // Google session: prefill the form and remember who is checking out.
  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUser(data.user);
      setForm((current) => ({
        ...current,
        email: current.email || (data.user?.email ?? ''),
        fullName:
          current.fullName ||
          ((data.user?.user_metadata?.full_name as string | undefined) ?? ''),
      }));
    });
  }, []);

  if (!ready) return <p className="muted">Loading…</p>;

  if (priced.lines.length === 0) {
    return (
      <div className="card" style={{ padding: 26 }}>
        <h1 style={{ fontSize: 24 }}>Nothing to check out</h1>
        <p className="muted">Your cart is empty, so there is no order to place yet.</p>
        <Link href="/" className="btn">
          Browse products
        </Link>
      </div>
    );
  }

  const update = (field: keyof typeof EMPTY) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBanner(null);

    // Same validator the API uses, so the messages match exactly.
    const found = validateCustomer(form);
    if (found.length > 0) {
      setIssues(Object.fromEntries(found.map((i) => [i.field, i.message])));
      setBanner({ kind: 'error', text: 'Please fix the highlighted fields.' });
      return;
    }
    setIssues({});
    setSubmitting(true);

    try {
      const token = await accessToken();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: priced.lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
          customer: form,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        if (payload.issues) {
          setIssues(Object.fromEntries(payload.issues.map((i: { field: string; message: string }) => [i.field, i.message])));
        }
        setBanner({ kind: 'error', text: payload.error ?? 'Checkout failed. Please try again.' });
        setSubmitting(false);
        return;
      }

      clear();
      router.push(`/order/${payload.reference}?placed=1`);
    } catch (error) {
      setBanner({
        kind: 'error',
        text: `Network error: ${(error as Error).message}. Your cart is safe — try again.`,
      });
      setSubmitting(false);
    }
  }

  const field = (
    name: keyof typeof EMPTY,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="field" htmlFor={`co-${name}`}>
      <span>
        {label}
        {props.required ? ' *' : ''}
      </span>
      <input
        id={`co-${name}`}
        name={name}
        className="input"
        aria-invalid={issues[name] ? 'true' : undefined}
        aria-describedby={issues[name] ? `co-${name}-error` : undefined}
        value={form[name]}
        onChange={update(name)}
        {...props}
      />
      {issues[name] && (
        <span className="error-text" id={`co-${name}-error`} role="alert">
          {issues[name]}
        </span>
      )}
    </label>
  );

  return (
    <div>
      <h1 style={{ fontSize: 26 }}>Checkout</h1>

      <div className="split">
        <form className="card" style={{ padding: 22 }} onSubmit={submit} noValidate>
          <h2 style={{ fontSize: 18 }}>1. Sign in (optional)</h2>
          <p className="small muted">
            Sign in with Google to keep this order in your history. You can also check out as a
            guest — the email below is where your confirmation goes.
          </p>
          {user ? (
            <p className="banner banner-ok" role="status">
              Signed in as {user.email}. This order will be linked to your account.
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-google"
              disabled={!authConfigured}
              onClick={async () => {
                const { error } = await signInWithGoogle('/checkout');
                if (error) setBanner({ kind: 'error', text: error });
              }}
            >
              <span aria-hidden="true">G</span> Continue with Google
            </button>
          )}
          {!authConfigured && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Google sign-in is unavailable in mock mode.{' '}
              <Link href="/login" style={{ textDecoration: 'underline' }}>
                Details
              </Link>
            </p>
          )}

          <h2 style={{ fontSize: 18, marginTop: 26 }}>2. Delivery details</h2>
          {banner && (
            <p className="banner banner-danger" role="alert">
              {banner.text}
            </p>
          )}

          {field('fullName', 'Full name', { required: true, autoComplete: 'name' })}
          {field('email', 'Email for confirmation', {
            required: true,
            type: 'email',
            autoComplete: 'email',
            placeholder: 'you@example.com',
          })}
          {field('address', 'Street address', {
            required: true,
            autoComplete: 'street-address',
          })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {field('city', 'City', { required: true, autoComplete: 'address-level2' })}
            {field('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
          </div>

          <label className="field" htmlFor="co-note">
            <span>Delivery note (optional)</span>
            <textarea
              id="co-note"
              name="note"
              className="textarea"
              rows={3}
              maxLength={500}
              value={form.note}
              onChange={update('note')}
            />
          </label>

          <h2 style={{ fontSize: 18, marginTop: 26 }}>3. Place the order</h2>
          <p className="small muted">
            This is a demo store, so no card details are collected and nothing is charged.
          </p>
          <button type="submit" className="btn" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Placing your order…' : `Place order · ${formatMoney(priced.totalCents, priced.currency)}`}
          </button>
          <p className="small muted" style={{ marginBottom: 0 }}>
            By placing the order you agree to receive one confirmation email from Mailgun.
          </p>
        </form>

        <aside className="card" style={{ padding: 20 }} aria-label="Order summary">
          <h2 style={{ fontSize: 18 }}>Order summary</h2>
          <table className="lines" style={{ marginTop: 10 }}>
            <caption className="sr-only">Products being ordered</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {priced.lines.map((line) => (
                <tr key={line.slug}>
                  <td>
                    {line.name}
                    <div className="small muted">Qty {line.quantity}</div>
                  </td>
                  <td className="num">{formatMoney(line.lineTotalCents, priced.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl style={{ display: 'grid', gap: 8, marginTop: 16 }}>
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
          <Link href="/cart" className="small" style={{ textDecoration: 'underline' }}>
            Edit cart
          </Link>
        </aside>
      </div>
    </div>
  );
}
