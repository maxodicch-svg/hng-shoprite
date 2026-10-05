import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';

import { completeSignInFromUrl } from '../../lib/auth.ts';
import { AUTH_SCHEME_REDIRECT } from '../../lib/redirect.ts';
import { useStore } from '../../lib/store-context.tsx';

/**
 * Deep-link landing for the OAuth return URL.
 *
 * Usually unused: `openAuthSessionAsync` returns the redirect straight to
 * `signInWithGoogle`. It exists for the case where the OS cold-starts the app on
 * the redirect URL — which is the normal path in Expo Go, where the link is an
 * `exp://…` dev URL rather than the app scheme.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const { refresh } = useStore();
  const [status, setStatus] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('Finishing sign-in…');

  useEffect(() => {
    let active = true;

    async function finish() {
      if (params.error || params.error_description) {
        if (!active) return;
        setStatus('failed');
        setMessage(String(params.error_description ?? params.error));
        return;
      }

      if (!params.code) {
        // No code: the browser flow already handled it. Just resync.
        if (!active) return;
        setStatus('done');
        setMessage('Signed in.');
        await refresh();
        return;
      }

      const query = `${AUTH_SCHEME_REDIRECT}?code=${encodeURIComponent(String(params.code))}`;
      const result = await completeSignInFromUrl(query);
      if (!active) return;

      if (result.ok) {
        setStatus('done');
        setMessage('Signed in. Loading your shared cart…');
        await refresh();
        setTimeout(() => router.replace('/cart'), 900);
      } else {
        setStatus('failed');
        setMessage(result.error);
      }
    }

    void finish();
    return () => {
      active = false;
    };
    // `params` is stable for a given deep link; re-running on `refresh` would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      {status === 'working' ? <ActivityIndicator /> : null}
      <Text style={styles.message}>{message}</Text>

      {status === 'failed' ? (
        <Link href="/cart" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Back to cart</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  message: { fontSize: 15, color: '#0f172a', textAlign: 'center' },
  button: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonText: { color: '#ffffff', fontWeight: '600' },
});
