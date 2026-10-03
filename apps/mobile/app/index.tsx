import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';

import { fetchProducts } from '../lib/api.ts';
import { configProblem } from '../lib/config.ts';
import { formatMoney } from '../lib/money.ts';
import { useStore } from '../lib/store-context.tsx';

/**
 * The shop. Products come from `GET /api/products`, which degrades to the same
 * bundled catalog the website falls back to.
 */
export default function ShopScreen() {
  const { products, setProducts, cart, refresh, addToCart } = useStore();
  const problem = configProblem();

  useEffect(() => {
    let active = true;
    fetchProducts().then((next) => {
      if (active) setProducts(next);
    });
    return () => {
      active = false;
    };
  }, [setProducts]);

  return (
    <View style={styles.screen}>
      {problem && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{problem}</Text>
        </View>
      )}

      <FlatList
        data={products}
        keyExtractor={(product) => product.slug}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.imageUrl }} style={styles.image} />
            <View style={styles.cardBody}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{item.name}</Text>
                {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
              </View>
              <Text style={styles.price}>{formatMoney(item.priceCents, item.currency)}</Text>
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
              <Pressable
                accessibilityLabel={`Add ${item.name} to your cart`}
                style={styles.add}
                onPress={() => addToCart(item.slug, 1)}
              >
                <Text style={styles.addText}>Add to cart</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.heading}>Everything you need for modern learning</Text>
            <Text style={styles.subheading}>
              Add products here or on the website — the cart is shared with your account.
            </Text>
            <Link href="/cart" asChild>
              <Pressable style={styles.cta} onPress={() => refresh()}>
                <Text style={styles.ctaText}>
                  Go to cart{cart.itemCount > 0 ? ` (${cart.itemCount})` : ''}
                </Text>
              </Pressable>
            </Link>
          </View>
        }
        ListEmptyComponent={<ActivityIndicator style={styles.loading} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  warn: { backgroundColor: '#fef3c7', padding: 12 },
  warnText: { color: '#78350f', fontSize: 13 },
  list: { padding: 16, gap: 14 },
  header: { gap: 8, marginBottom: 6 },
  heading: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  subheading: { fontSize: 14, color: '#475569' },
  cta: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  ctaText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  image: { width: '100%', height: 160, backgroundColor: '#e2e8f0' },
  cardBody: { padding: 14, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: '#0f172a', flexShrink: 1 },
  badge: {
    fontSize: 11,
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  price: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  description: { fontSize: 13, color: '#64748b' },
  add: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addText: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  loading: { marginTop: 40 },
});
