/**
 * The shop catalog.
 *
 * Mirrors `src/lib/products.ts` on the website. Two jobs:
 *
 *  1. give the product list a type, and
 *  2. provide a fallback so the app renders a real shop even when
 *     `GET /api/products` is unreachable.
 *
 * It is **not** a pricing authority. Every total the app displays comes from the
 * server's `priceCart()` response, exactly as on the website.
 */

export type Product = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string;
  badge: string | null;
  inStock: boolean;
  stock: number;
};

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;

/** Fallback catalog — the same six products as the website and the SQL seed. */
export const CATALOG: Product[] = [
  {
    slug: 'aura-desk-lamp',
    name: 'Aura Desk Lamp',
    description:
      'Warm-to-cool dimmable LED lamp with a weighted aluminium base and a 40,000-hour lifespan.',
    priceCents: 8900,
    currency: 'USD',
    imageUrl: img('photo-1507473885765-e6ed057f782c'),
    badge: 'Best seller',
    inStock: true,
    stock: 24,
  },
  {
    slug: 'meridian-headphones',
    name: 'Meridian Headphones',
    description:
      'Closed-back over-ears with active noise cancelling, 45-hour battery and USB-C fast charge.',
    priceCents: 24900,
    currency: 'USD',
    imageUrl: img('photo-1505740420928-5e560c06d30e'),
    badge: 'New',
    inStock: true,
    stock: 12,
  },
  {
    slug: 'field-notes-journal',
    name: 'Field Notes Journal',
    description:
      'A5 dotted notebook, 160gsm bleed-proof paper, lay-flat binding and an elastic closure.',
    priceCents: 2400,
    currency: 'USD',
    imageUrl: img('photo-1517842645767-c639042777db'),
    badge: null,
    inStock: true,
    stock: 60,
  },
  {
    slug: 'orbit-mechanical-keyboard',
    name: 'Orbit Mechanical Keyboard',
    description:
      '75% hot-swappable board, gasket mount, PBT keycaps and per-key RGB you can actually turn off.',
    priceCents: 17900,
    currency: 'USD',
    imageUrl: img('photo-1587829741301-dc798b83add3'),
    badge: 'Low stock',
    inStock: true,
    stock: 7,
  },
  {
    slug: 'terra-ceramic-mug',
    name: 'Terra Ceramic Mug',
    description: 'Stoneware mug with a reactive glaze, 350ml, dishwasher and microwave safe.',
    priceCents: 1900,
    currency: 'USD',
    imageUrl: img('photo-1514228742587-6b1558fcca3d'),
    badge: null,
    inStock: true,
    stock: 80,
  },
  {
    slug: 'nomad-weekender-bag',
    name: 'Nomad Weekender',
    description:
      'Water-resistant waxed canvas and full-grain leather trim, with a padded 16" laptop sleeve.',
    priceCents: 19900,
    currency: 'USD',
    imageUrl: img('photo-1553062407-98eeb64c6a62'),
    badge: null,
    inStock: true,
    stock: 15,
  },
];

/** Flat-rate shipping, in minor units. Free above the threshold. */
export const SHIPPING_FLAT_CENTS = 900;
export const FREE_SHIPPING_THRESHOLD_CENTS = 15000;

export function findProduct(slug: string, catalog: Product[] = CATALOG): Product | undefined {
  return catalog.find((product) => product.slug === slug);
}

/** Shipping charge for a subtotal: free from the threshold, else the flat rate. */
export function shippingFor(subtotalCents: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FLAT_CENTS;
}
