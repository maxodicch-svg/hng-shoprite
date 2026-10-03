import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { formatMoney } from '../lib/money.ts';
import { CATALOG } from '../lib/catalog.ts';
import { MAX_LINE_QUANTITY } from '../lib/cart.ts';
import { useStore } from '../lib/store-context.tsx';

/**
 * The shared cart.
 *
 * Sync tier: **refetch on focus.** Navigating away and back re-reads
 * `/api/cart`, which is the "beginner" option the brief explicitly allows. Pull
 * to refresh does the same thing on demand, so the sync is visible on camera.
 */
export default function CartScreen() {
  const {
    cart,
    syncState,
    syncing,
    error,
    session,
    authReady,
    refresh,
    setQuantity,
    remove,
    clear,
    signIn,
    signOutNow,
  } = useStore();

  // Refetch every time this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const signedIn = Boolean(session);
  const { lines, currency } = cart;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={syncing} onRefresh={() => void refresh()} tintColor="#0f172a" />
      }
    >
      {/* ------------------------------------------------------- account --- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{signedIn ? 'Signed in' : 'Your account'}</Text>

        {!authReady ? (
          <ActivityIndicator style={styles.spinner} />
        ) : signedIn ? (
          <>
            <Text style={styles.muted}>{session?.user.email ?? session?.user.id}</Text>
            <Text style={styles.status}>
              {syncState === 'loading'
                ? 'Syncing your cart…'
                : syncState === 'synced'
                  ? 'Cart synced — this is the same cart as the website.'
                  : syncState === 'error'
                    ? 'Could not reach the server.'
                    : ''}
            </Text>
            <Pressable style={styles.secondary} onPress={() => void signOutNow()}>
              <Text style={styles.secondaryText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.muted}>
              Sign in with the same Google account you use on the website to see the same cart.
            </Text>
            <Pressable style={styles.primary} onPress={() => void signIn()}>
              <Text style={styles.primaryText}>Sign in with Google</Text>
            </Pressable>
            <Text style={styles.hint}>
              Signed out, this cart is stored on this phone only.
            </Text>
          </>
        )}

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>

      {/* ---------------------------------------------------------- lines --- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {lines.length === 0 ? 'Your cart is empty' : 'In your cart'}
        </Text>

        {lines.length === 0 ? (
          <Text style={styles.muted}>
            Add something on the website, then pull down to refresh — it will appear here.
          </Text>
        ) : (
          lines.map((line) => {
            const product = cart.lines.length ? line : null;
            const name =
              // Prefer the server-computed line, fall back to the slug.
              cartLineName(line.slug) ?? product?.slug ?? line.slug;
            const unitPrice = unitPriceFor(line.slug);
            return (
              <View key={line.slug} style={styles.line}>
                <View style={styles.lineInfo}>
                  <Text style={styles.lineName}>{name}</Text>
                  <Text style={styles.muted}>
                    {unitPrice === null
                      ? `${line.quantity} ×`
                      : `${line.quantity} × ${formatMoney(unitPrice, currency)}`}
                  </Text>
                </View>

                <View style={styles.quantity}>
                  <Pressable
                    accessibilityLabel={`Decrease quantity of ${name}`}
                    style={styles.step}
                    onPress={() => setQuantity(line.slug, line.quantity - 1)}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.quantityValue}>{line.quantity}</Text>
                  <Pressable
                    accessibilityLabel={`Increase quantity of ${name}`}
                    style={styles.step}
                    onPress={() => setQuantity(line.slug, line.quantity + 1)}
                    disabled={line.quantity >= MAX_LINE_QUANTITY}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityLabel={`Remove ${name}`}
                  onPress={() => remove(line.slug)}
                  style={styles.remove}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      {/* -------------------------------------------------------- totals --- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Summary</Text>
        <Row label="Subtotal" value={formatMoney(cart.subtotalCents, currency)} />
        <Row
          label="Shipping"
          value={cart.shippingCents === 0 ? 'Free' : formatMoney(cart.shippingCents, currency)}
        />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(cart.totalCents, currency)}</Text>
        </View>
        <Text style={styles.hint}>Totals are computed by the server, never by this app.</Text>

        {lines.length > 0 ? (
          <Pressable style={styles.secondary} onPress={clear}>
            <Text style={styles.secondaryText}>Clear cart</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

// Line names and unit prices come from the static catalog; the amounts actually
// charged are the ones the API returned in `cart`.
function cartLineName(slug: string): string | null {
  return CATALOG.find((product) => product.slug === slug)?.name ?? null;
}

function unitPriceFor(slug: string): number | null {
  return CATALOG.find((product) => product.slug === slug)?.priceCents ?? null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  muted: { fontSize: 14, color: '#475569' },
  status: { fontSize: 13, color: '#166534' },
  hint: { fontSize: 12, color: '#94a3b8' },
  error: { fontSize: 13, color: '#b91c1c' },
  spinner: { marginVertical: 8 },
  primary: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  secondary: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  lineInfo: { flex: 1, gap: 2 },
  lineName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  quantity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  quantityValue: { fontSize: 15, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  remove: { paddingHorizontal: 6, paddingVertical: 4 },
  removeText: { color: '#b91c1c', fontSize: 13, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowValue: { fontSize: 14, color: '#0f172a' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    marginTop: 2,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  totalValue: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
});
