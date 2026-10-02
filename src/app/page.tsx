import Link from 'next/link';
import { getProducts } from '@/lib/store';
import { formatMoney } from '@/lib/money';
import { AddToCart } from '@/components/add-to-cart';
import { FREE_SHIPPING_THRESHOLD_CENTS } from '@/lib/products';

export const dynamic = 'force-dynamic';

/** Home page — the shop front. */
export default async function ShopPage() {
  const { products } = await getProducts();

  return (
    <div>
      <section className="card" style={{ padding: 26, marginBottom: 26 }}>
        <p className="badge">HNG15 · Lesson 2</p>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginTop: 12 }}>
          Gear that makes a desk worth sitting at.
        </h1>
        <p className="muted" style={{ maxWidth: 620, margin: 0 }}>
          {products.length} products, a real checkout, orders persisted in a Postgres database, a
          Mailgun confirmation email for every purchase, and Google sign-in for your order history.
          Free shipping over {formatMoney(FREE_SHIPPING_THRESHOLD_CENTS)}.
        </p>
      </section>

      <h2 style={{ fontSize: 20 }}>All products</h2>
      <ul
        className="grid-products"
        style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}
      >
        {products.map((product) => (
          <li key={product.slug} className="card" style={{ overflow: 'hidden' }}>
            <Link href={`/product/${product.slug}`} aria-label={product.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl}
                alt={product.name}
                width={900}
                height={600}
                style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }}
              />
            </Link>
            <div style={{ padding: 16 }}>
              {product.badge && <p className="badge" style={{ marginBottom: 8 }}>{product.badge}</p>}
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>
                <Link href={`/product/${product.slug}`}>{product.name}</Link>
              </h3>
              <p className="small muted" style={{ minHeight: 40, margin: '0 0 10px' }}>
                {product.description}
              </p>
              <p style={{ fontWeight: 700, margin: '0 0 12px' }}>
                {formatMoney(product.priceCents, product.currency)}
              </p>
              <AddToCart
                slug={product.slug}
                name={product.name}
                disabled={!product.inStock || product.stock <= 0}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
