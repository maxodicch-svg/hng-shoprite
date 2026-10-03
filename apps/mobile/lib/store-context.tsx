/**
 * The shared cart, as the app sees it.
 *
 * State machine:
 *
 *   guest              → a local cart in AsyncStorage, exactly like a signed-out
 *                        browser. No server row exists.
 *   signed in          → the server cart is the source of truth. Every mutation
 *                        is applied locally first (so the UI is instant) and then
 *                        PUT to `/api/cart`; the response replaces local state,
 *                        because only the server prices things.
 *
 * **Guest-merge rule** — the same one the website uses: on sign-in, local lines
 * are merged *into* the account cart (quantities summed and clamped), never
 * overwritten. See `mergeCartLines` below and the note in the website README.
 *
 * Sync is **refetch-on-focus**: `refresh()` is called whenever the Cart screen
 * regains focus, which is the "navigate away and back" refresh the brief allows.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
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

import { CATALOG, type Product } from './catalog.ts';
import {
  MAX_LINE_QUANTITY,
  normalizeCart,
  normalizeQuantity,
  type CartLine,
} from './cart.ts';
import { EMPTY_CART, deleteCart, getCart, putCart, type ServerCart } from './api.ts';
import { accessToken, currentSession, onAuthChange, signInWithGoogle, signOut, supabase } from './auth.ts';

const STORAGE_KEY = 'zedu-store.mobile.cart.v1';

export type SyncState = 'guest' | 'loading' | 'synced' | 'error';

type CartContextValue = {
  products: Product[];
  cart: ServerCart;
  syncState: SyncState;
  syncing: boolean;
  error: string | null;
  session: Session | null;
  authReady: boolean;
  /** Reload the account cart. Safe to call on every screen focus. */
  refresh: (quiet?: boolean) => Promise<void>;
  addToCart: (slug: string, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
  signIn: () => Promise<void>;
  signOutNow: () => Promise<void>;
  setProducts: (products: Product[]) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Sum quantities per slug, clamped — the documented guest-merge rule. */
function mergeCartLines(
  ...groups: (readonly CartLine[] | CartLine[] | null | undefined)[]
): CartLine[] {
  const combined: CartLine[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const line of group) {
      if (!line || typeof line !== 'object') continue;
      combined.push({
        slug: String(line.slug ?? ''),
        quantity: normalizeQuantity(line.quantity),
      });
    }
  }
  return normalizeCart(combined);
}

async function readLocalCart(): Promise<CartLine[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalizeCart(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

async function writeLocalCart(lines: CartLine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable — the cart still works for this session */
  }
}

/** Price locally from the bundled catalog, for an optimistic total. */
function optimisticCart(lines: CartLine[], products: Product[]): ServerCart {
  let subtotal = 0;
  let itemCount = 0;
  let currency = 'USD';

  for (const line of lines) {
    const product = products.find((p) => p.slug === line.slug);
    if (!product) continue;
    subtotal += product.priceCents * line.quantity;
    itemCount += line.quantity;
    currency = product.currency;
  }

  const shipping = subtotal <= 0 ? 0 : subtotal >= 15000 ? 0 : 900;

  return {
    lines,
    itemCount,
    subtotalCents: subtotal,
    shippingCents: shipping,
    totalCents: subtotal + shipping,
    currency,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(CATALOG);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cart, setCart] = useState<ServerCart>(EMPTY_CART);
  const [syncState, setSyncState] = useState<SyncState>('guest');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const productsRef = useRef<Product[]>(CATALOG);
  const hydratedFor = useRef<string | null>(null);

  sessionRef.current = session;
  productsRef.current = products;

  // ------------------------------------------------------------- session ----
  useEffect(() => {
    let active = true;

    currentSession()
      .then((found) => {
        if (!active) return;
        setSession(found);
        setAuthReady(true);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setAuthReady(true);
      });

    const unsubscribe = onAuthChange((next) => {
      setSession(next);
      setAuthReady(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // --------------------------------------------------- hydrate on sign-in ---
  // Mirrors the website: fetch the account cart, merge the local draft into it,
  // push the merge back. Runs again on sign-out, which drops to local-only.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!session) {
        const local = await readLocalCart();
        if (cancelled) return;
        hydratedFor.current = null;
        setCart(optimisticCart(local, productsRef.current));
        setSyncState('guest');
        setError(null);
        return;
      }

      hydratedFor.current = session.user.id;
      setSyncState('loading');
      setSyncing(true);

      const token = await accessToken();
      if (cancelled) return;
      if (!token) {
        setSyncState('error');
        setError('Could not read your session. Sign in again.');
        setSyncing(false);
        return;
      }

      const remote = await getCart(token);
      if (cancelled) return;

      if (!remote.ok) {
        setSyncState('error');
        setError(remote.error);
        setSyncing(false);
        return;
      }

      const local = await readLocalCart();
      if (cancelled) return;

      const merged = mergeCartLines(remote.data.lines, local);

      if (local.length === 0) {
        setCart(remote.data);
        setSyncState('synced');
        setError(null);
        setSyncing(false);
        return;
      }

      // There was a guest draft: send the merge and adopt what was stored.
      const pushed = await putCart(token, merged);
      if (cancelled) return;

      if (pushed.ok) {
        setCart(pushed.data);
        setSyncState('synced');
        setError(null);
        await writeLocalCart([]); // the draft now lives on the account
      } else {
        setCart(optimisticCart(merged, productsRef.current));
        setSyncState('error');
        setError(pushed.error);
      }
      setSyncing(false);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Guests keep a local draft, so the app is usable signed out.
  useEffect(() => {
    if (!authReady || session) return;
    writeLocalCart(cart.lines);
  }, [cart, session, authReady]);

  /**
   * Reload the account cart.
   *
   * The Cart screen calls this on focus (the refetch-on-focus baseline), and the
   * Realtime subscription below calls it quietly when the website changes the
   * same cart. `quiet` suppresses the pull-to-refresh spinner so a background
   * push does not look like the user pulled the screen.
   */
  const refresh = useCallback(async (quiet = false) => {
    const current = sessionRef.current;
    if (!current) {
      const local = await readLocalCart();
      setCart(optimisticCart(local, productsRef.current));
      return;
    }

    if (!quiet) setSyncing(true);
    const token = await accessToken();
    if (!token) {
      setSyncState('error');
      setError('Could not read your session. Sign in again.');
      if (!quiet) setSyncing(false);
      return;
    }

    // Pull before pushing: another device may have changed the cart.
    const remote = await getCart(token);
    if (!remote.ok) {
      setSyncState('error');
      setError(remote.error);
      if (!quiet) setSyncing(false);
      return;
    }

    const local = await readLocalCart();
    const merged = mergeCartLines(remote.data.lines, local);

    if (local.length > 0) {
      const pushed = await putCart(token, merged);
      if (pushed.ok) {
        setCart(pushed.data);
        await writeLocalCart([]);
      } else {
        setCart(optimisticCart(merged, productsRef.current));
        setError(pushed.error);
        setSyncState('error');
        if (!quiet) setSyncing(false);
        return;
      }
    } else {
      setCart(remote.data);
    }

    setSyncState('synced');
    setError(null);
    if (!quiet) setSyncing(false);
  }, []);

  // ------------------------------------------------------- instant sync ----
  // Supabase Realtime: when the website (or another phone) changes this account's
  // cart, the app hears about it and refetches immediately — no polling, no
  // "navigate away and back" needed. This is the advanced tier the brief calls
  // "instant synchronization"; refetch-on-focus stays as the fallback for when
  // Realtime is unavailable, so nothing regresses if the publication is missing.
  useEffect(() => {
    if (!session || !supabase) return;

    let cancelled = false;

    const channel = supabase
      .channel(`cart-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items' },
        () => {
          if (!cancelled) void refresh(true);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carts' },
        () => {
          if (!cancelled) void refresh(true);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [session, refresh]);

  /** Apply a change locally, then persist it. */
  const applyLines = useCallback((next: CartLine[]) => {
    setCart(optimisticCart(next, productsRef.current));

    const current = sessionRef.current;
    if (!current) return; // guest: the local effect persists it

    void (async () => {
      const token = await accessToken();
      if (!token) {
        setSyncState('error');
        setError('Could not read your session. Sign in again.');
        return;
      }
      const pushed = await putCart(token, next);
      if (pushed.ok) {
        setCart(pushed.data);
        setSyncState('synced');
        setError(null);
      } else {
        setSyncState('error');
        setError(pushed.error);
        // Re-read the truth rather than leaving a wrong total on screen.
        const remote = await getCart(token);
        if (remote.ok) setCart(remote.data);
      }
    })();
  }, []);

  /** Add `quantity` of a slug, summing with any existing line. */
  const addToCart = useCallback(
    (slug: string, quantity = 1) => {
      const existing = cart.lines.find((line) => line.slug === slug);
      const next = existing
        ? cart.lines.map((line) =>
            line.slug === slug
              ? { slug, quantity: normalizeQuantity(line.quantity + quantity) }
              : line,
          )
        : [...cart.lines, { slug, quantity: normalizeQuantity(quantity) }];
      applyLines(next);
    },
    [cart.lines, applyLines],
  );

  const setQuantity = useCallback(
    (slug: string, quantity: number) => {
      const clamped = normalizeQuantity(quantity);
      const next =
        clamped <= 0
          ? cart.lines.filter((line) => line.slug !== slug)
          : cart.lines.map((line) => (line.slug === slug ? { slug, quantity: clamped } : line));
      applyLines(next);
    },
    [cart.lines, applyLines],
  );

  const remove = useCallback(
    (slug: string) => applyLines(cart.lines.filter((line) => line.slug !== slug)),
    [cart.lines, applyLines],
  );

  const clear = useCallback(() => {
    const current = sessionRef.current;
    if (!current) {
      applyLines([]);
      return;
    }
    setCart(EMPTY_CART);
    void (async () => {
      const token = await accessToken();
      if (!token) return;
      const result = await deleteCart(token);
      if (result.ok) {
        setCart(result.data);
        setSyncState('synced');
        setError(null);
      } else {
        setSyncState('error');
        setError(result.error);
        const remote = await getCart(token);
        if (remote.ok) setCart(remote.data);
      }
    })();
  }, [applyLines]);

  const signIn = useCallback(async () => {
    setError(null);
    const result = await signInWithGoogle();
    if (!result.ok) {
      if (!result.cancelled) setError(result.error);
      return;
    }
    // `onAuthChange` fires with the new session; hydration takes it from there.
  }, []);

  const signOutNow = useCallback(async () => {
    await signOut();
    setSession(null);
    hydratedFor.current = null;
    setCart(optimisticCart(await readLocalCart(), productsRef.current));
    setSyncState('guest');
    setError(null);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      products,
      cart,
      syncState,
      syncing,
      error,
      session,
      authReady,
      refresh,
      addToCart,
      setQuantity,
      remove,
      clear,
      signIn,
      signOutNow,
      setProducts,
    }),
    [
      products,
      cart,
      syncState,
      syncing,
      error,
      session,
      authReady,
      refresh,
      addToCart,
      setQuantity,
      remove,
      clear,
      signIn,
      signOutNow,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useStore(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useStore must be used inside <CartProvider>');
  return context;
}

export { MAX_LINE_QUANTITY };
