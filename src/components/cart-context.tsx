'use client';

/**
 * Client cart.
 *
 * Two tiers, in this order of authority:
 *
 *  1. **Server (signed in).** `GET/PUT /api/cart` stores the cart against the
 *     Supabase user, so the website and the mobile app share one cart. This is
 *     what makes "added on the web, visible on the phone" work.
 *  2. **localStorage (signed out).** The original behaviour: a pre-purchase
 *     draft in the browser, per device. Untouched for guests.
 *
 * **Guest-merge rule** (deliberate, see `mergeCartLines` in `src/lib/cart.ts`):
 * when a guest with local lines signs in, their lines are merged *into* the
 * server cart — quantities for the same slug are summed and clamped, and
 * neither side is discarded. Overwriting was rejected because it silently
 * destroys lines the same account added on another device, which is the exact
 * cross-device behaviour this feature exists to provide.
 *
 * Nothing here is priced. Totals come from `priceCart()` against the catalog.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  mergeCartLines,
  normalizeCart,
  priceCart,
  MAX_LINE_QUANTITY,
  type CartLine,
  type PricedOrder,
} from '@/lib/cart';
import type { Product } from '@/lib/products';
import { accessToken, getBrowserClient } from '@/lib/auth-client';

const STORAGE_KEY = 'zedu-store.cart.v1';

/** How the browser cart and the shared server cart currently relate. */
export type CartSyncState = 'guest' | 'loading' | 'synced' | 'error';

type CartContextValue = {
  /** Raw lines: `[{ slug, quantity }]`. */
  lines: CartLine[];
  /** Priced against the live catalog. */
  priced: PricedOrder;
  itemCount: number;
  ready: boolean;
  /** `guest` when signed out; otherwise the state of the server mirror. */
  syncState: CartSyncState;
  add: (slug: string, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** PUT the full cart for one access token. Returns the stored lines, or null. */
async function pushCart(token: string, lines: CartLine[]): Promise<CartLine[] | null> {
  try {
    const response = await fetch('/api/cart', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: lines }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { lines?: CartLine[] };
    return normalizeCart(body.lines ?? []);
  } catch {
    return null;
  }
}

/** GET the stored cart for one access token. Returns null when unreachable. */
async function fetchCart(token: string): Promise<CartLine[] | null> {
  try {
    const response = await fetch('/api/cart', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { lines?: CartLine[] };
    return normalizeCart(body.lines ?? []);
  } catch {
    return null;
  }
}

export function CartProvider({
  catalog,
  children,
}: {
  catalog: Product[];
  children: ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<CartSyncState>('guest');

  /** The signed-in user id, or null for a guest. */
  const [userId, setUserId] = useState<string | null>(null);

  /** Mirrors `lines` so the debounced writer can read the latest value. */
  const linesRef = useRef<CartLine[]>([]);
  /** Which user's cart the current `lines` were hydrated from. */
  const hydratedFor = useRef<string | null>(null);
  /** Skips the write-back for the very state the hydration just produced. */
  const skipNextWrite = useRef(false);

  linesRef.current = lines;

  // ------------------------------------------------------------ the session --
  // `getBrowserClient()` returns null in mock mode, so this stays a no-op and
  // the cart behaves exactly as it did before: localStorage only.
  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) {
      setUserId(null);
      return;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user?.id ?? null);
      })
      .catch(() => {
        if (active) setUserId(null);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // ----------------------------------------------- hydrate, then merge in ---
  // Re-runs on sign-in and sign-out. Signed out it is purely localStorage; on
  // sign-in it merges the guest draft into the server cart and writes back.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let local: CartLine[] = [];
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        local = normalizeCart(raw ? JSON.parse(raw) : [], catalog);
      } catch {
        local = [];
      }

      if (!userId) {
        if (cancelled) return;
        hydratedFor.current = null;
        setLines(local);
        setSyncState('guest');
        setReady(true);
        return;
      }

      setSyncState('loading');
      const token = await accessToken();
      if (cancelled) return;

      if (!token) {
        setLines(local);
        setSyncState('error');
        setReady(true);
        return;
      }

      const remote = await fetchCart(token);
      if (cancelled) return;

      if (remote === null) {
        // Unreachable: keep the local draft, say so, and never lose the cart.
        setLines(local);
        setSyncState('error');
        setReady(true);
        return;
      }

      // The merge rule. `skipNextWrite` suppresses a redundant PUT when there
      // was nothing local to merge.
      const merged = mergeCartLines(local, remote);
      skipNextWrite.current = true;
      hydratedFor.current = userId;
      setLines(merged);
      setSyncState('synced');
      setReady(true);

      if (local.length > 0) {
        const stored = await pushCart(token, merged);
        if (!cancelled && stored) {
          // Adopt the server's version of the merge (it clamps, we mirror).
          skipNextWrite.current = true;
          setLines(stored);
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [userId, catalog]);

  // ---------------------------------------------------------- write back ---
  // Debounced full-document PUT. The server is a mirror of this browser, so a
  // burst of quantity clicks costs one request.
  useEffect(() => {
    if (!ready || !userId) return;
    if (hydratedFor.current !== userId) return; // hydration owns this state
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const token = await accessToken();
      if (!token || cancelled) return;
      const stored = await pushCart(token, linesRef.current);
      if (cancelled) return;
      setSyncState(stored ? 'synced' : 'error');
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lines, ready, userId]);

  // Guests keep the original localStorage draft; signed-in users do not write
  // it, so signing out on a shared device cannot resurrect a stale cart.
  useEffect(() => {
    if (!ready || userId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage full or blocked — the cart still works for this session */
    }
  }, [lines, ready, userId]);

  // -------------------------------------------------------- instant sync ----
  // When the mobile app changes the same cart, adopt it without a page reload.
  // Realtime is what makes the phone → website direction visible on camera; if
  // the tables are not in the `supabase_realtime` publication this simply stays
  // silent and the cart keeps working through the normal PUT path.
  //
  // `skipNextWrite` is set first so adopting the incoming cart does not bounce
  // straight back to the server as a redundant PUT.
  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    async function adoptRemote() {
      const token = await accessToken();
      if (!token || cancelled) return;

      const remote = await fetchCart(token);
      if (remote === null || cancelled) return;

      skipNextWrite.current = true;
      setLines(remote);
      setSyncState('synced');
    }

    const channel = supabase
      .channel(`cart-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items' },
        () => void adoptRemote(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carts' },
        () => void adoptRemote(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const add = useCallback(
    (slug: string, quantity = 1) => {
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
    },
    [catalog],
  );

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
      syncState,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, priced, ready, syncState, add, setQuantity, remove, clear],
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
