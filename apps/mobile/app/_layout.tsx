import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CartProvider } from '../lib/store-context.tsx';

/**
 * Root layout.
 *
 * The cart provider wraps every screen so the account cart is fetched once and
 * shared rather than per screen, and so the Realtime subscription has a single
 * owner. `GestureHandlerRootView` is required by the native stack navigator.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CartProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#ffffff' },
              headerTitleStyle: { color: '#111827' },
              headerTintColor: '#111827',
              contentStyle: { backgroundColor: '#f8fafc' },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Zedu Store' }} />
            <Stack.Screen name="cart" options={{ title: 'Your cart' }} />
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          </Stack>
        </CartProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
