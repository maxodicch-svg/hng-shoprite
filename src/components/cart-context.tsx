'use client';

/**
 * Client cart.
 *
 * The cart lives in `localStorage` — it is a pre-purchase draft, not an order.
 * Once checkout runs, the server rebuilds and prices the cart from the catalog
 * and persists it (Supabase), and that persisted row is the record of truth.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  normalizeCart,
  priceCart,
  MAX_LINE_QUANTITY,
  type PricedOrder,
} from '@/lib/cart';
import type { Product } from '@/lib/products';

const STORAGE_KEY = 'zedu-store.cart.v1';

type CartContextValue = {
  /** Raw lines: `[{ slug, quantity }]`. */
  lines: { slug: string; quantity: number }[];
  /** Priced against the live catalog. */
  priced: PricedOrder;
  itemCount: number;
  ready: boolean;
  add: (slug: string, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  catalog,
  children,
}: {
  catalog: Product[];
  children: ReactNode;
}) {
  const [lines, setLines] = useState<{ slug: string; quantity: number }[]>([]);
  const [ready, setReady] = useState(false);

  // Load once on mount. Wrapped because storage can be disabled entirely.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setLines(normalizeCart(raw ? JSON.parse(raw) : [], catalog));
    } catch {
      setLines([]);
    }
    setReady(true);
  }, [catalog]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage full or blocked — the cart still works for this session */
    }
  }, [lines, ready]);

  const add = useCallback((slug: string, quantity = 1) => {
    setLines((current) => {
      const next = normalizeCart(
        [...current, { slug, quantity }].map((line) =>
          line.slug === slug
            ? { slug, quantity: (current.find((c) => c.slug === slug)?.quantity ?? 0) + quantity }
            : line,
        ),
        catalog,
      );
      return next;
    });
  }, [catalog]);

  const setQuantity = useCallback(
    (slug: string, quantity: number) => {
      setLines((current) =>
        normalizeCart(
          current.map((line) => (line.slug === slug ? { slug, quantity } : line)),
          catalog,
        ),
      );
    },
    [catalog],
  );

  const remove = useCallback((slug: string) => {
    setLines((current) => current.filter((line) => line.slug !== slug));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const priced = useMemo(() => priceCart(lines, catalog), [lines, catalog]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      priced,
      itemCount: priced.itemCount,
      ready,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, priced, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Cart hook. Throws if used outside `CartProvider` so bugs surface early. */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

export { MAX_LINE_QUANTITY, STORAGE_KEY as CART_STORAGE_KEY };
