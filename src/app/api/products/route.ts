import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/store';

/**
 * GET /api/products — the public catalog.
 *
 * Read-only and unauthenticated: it exposes exactly the product columns the
 * storefront already renders. It exists so the mobile app can list the same
 * products without bundling a second copy of the catalog, and it degrades the
 * same way the shop does — `getProducts()` falls back to the bundled catalog
 * when Supabase is unconfigured or a read fails.
 *
 * 200 `{ ok, count, source, products }`.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { products, source } = await getProducts();

  return NextResponse.json({
    ok: true,
    count: products.length,
    source,
    products: products.map((product) => ({
      slug: product.slug,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      currency: product.currency,
      imageUrl: product.imageUrl,
      badge: product.badge,
      inStock: product.inStock,
      stock: product.stock,
    })),
  });
}
