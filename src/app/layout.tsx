import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getProducts } from '@/lib/store';
import { isSupabaseConfigured, hasServiceRole } from '@/lib/supabase';
import { isEmailConfigured } from '@/lib/email';
import { CartProvider } from '@/components/cart-context';
import { Header } from '@/components/header';

export const metadata: Metadata = {
  title: 'Zedu Store — shop, checkout, order confirmations',
  description:
    'A demo storefront with a checkout page, Supabase persistence, Mailgun confirmation emails and Google sign-in. Built for HNG Internship 15, Lesson 2.',
};

/** Renders the mock-mode banner so no reviewer mistakes the demo for live data. */
function ModeBanner() {
  const database = isSupabaseConfigured() && hasServiceRole();
  const email = isEmailConfigured();

  if (database && email) {
    return (
      <div className="wrap" style={{ paddingTop: 14 }}>
        <p className="banner banner-ok" role="status">
          Live mode — orders are stored in Supabase and confirmations are sent with Mailgun.
        </p>
      </div>
    );
  }

  const missing = [
    !database && 'Supabase keys',
    !email && 'Mailgun keys',
  ].filter(Boolean) as string[];

  return (
    <div className="wrap" style={{ paddingTop: 14 }}>
      <p className="banner" role="status">
        <strong>Mock mode.</strong> Missing {missing.join(' and ')}. The full shop → checkout →
        confirmation flow works, but orders live in memory only and confirmation emails are printed
        to the server log. See <code>SETUP.md</code> to switch to live mode.
      </p>
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { products, source } = await getProducts();

  return (
    <html lang="en">
      <body>
        <CartProvider catalog={products}>
          <a href="#main" className="sr-only">
            Skip to content
          </a>
          <Header />
          <ModeBanner />
          <main id="main" className="wrap" style={{ paddingTop: 22, paddingBottom: 64 }}>
            {children}
          </main>
          <footer className="wrap" style={{ paddingBottom: 40 }}>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '0 0 14px' }} />
            <p className="small muted">
              Zedu Store — a demo for HNG Internship 15, Lesson 2. Catalog source: {source}.{' '}
              <Link href="/api/health" style={{ textDecoration: 'underline' }}>
                Integration health
              </Link>
            </p>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
