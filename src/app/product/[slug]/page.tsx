import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/store';
import { formatMoney } from '@/lib/money';
import { AddToCart } from '@/components/add-to-cart';

export const dynamic = 'force-dynamic';

/** Product detail page. */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    notFound();
    return null;
  }

  const outOfStock = !product.inStock || product.stock <= 0;

  return (
    <div>
      <p className="small muted" style={{ marginBottom: 14 }}>
        <Link href="/" style={{ textDecoration: 'underline' }}>
          Shop
        </Link>{' '}
        / {product.name}
      </p>

      <div className="split">
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            width={900}
            height={600}
            style={{ width: '100%', display: 'block' }}
          />
        </div>

        <div>
          {product.badge && <p className="badge" style={{ marginBottom: 10 }}>{product.badge}</p>}
          <h1 style={{ fontSize: 28 }}>{product.name}</h1>
          <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 14px' }}>
            {formatMoney(product.priceCents, product.currency)}
          </p>
          <p className="muted">{product.description}</p>

          <dl className="small" style={{ margin: '18px 0', display: 'grid', gap: 6 }}>
            <div>
              <dt style={{ display: 'inline', color: 'var(--muted)' }}>Availability: </dt>
              <dd style={{ display: 'inline', margin: 0 }}>
                {outOfStock ? 'Out of stock' : `${product.stock} in stock`}
              </dd>
            </div>
            <div>
              <dt style={{ display: 'inline', color: 'var(--muted)' }}>Ships: </dt>
              <dd style={{ display: 'inline', margin: 0 }}>2–4 business days</dd>
            </div>
          </dl>

          <AddToCart slug={product.slug} name={product.name} disabled={outOfStock} />

          <p className="small muted" style={{ marginTop: 16 }}>
            <Link href="/cart" style={{ textDecoration: 'underline' }}>
              Go to cart
            </Link>{' '}
            ·{' '}
            <Link href="/checkout" style={{ textDecoration: 'underline' }}>
              Checkout
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
