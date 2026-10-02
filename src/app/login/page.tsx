'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { authConfigured, getBrowserClient, signInWithGoogle, signOut } from '@/lib/auth-client';

function LoginBody() {
  const params = useSearchParams();
  const error = params.get('error');
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) {
      setChecked(true);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setChecked(true);
    });
  }, []);

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 26 }}>Sign in</h1>
      <p className="muted">
        Google sign-in is handled by Supabase Auth (Google Cloud OAuth client → Supabase provider →
        this app). Signing in links your orders to your account so you can find them later.
      </p>

      {error && (
        <p className="banner banner-danger" role="alert">
          Sign-in failed: {error}
        </p>
      )}

      {!authConfigured && (
        <div className="banner" role="status">
          <strong>Supabase is not configured yet.</strong>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>Create a project at supabase.com.</li>
            <li>Copy the Project URL and the anon public key into <code>.env.local</code>.</li>
            <li>
              In Supabase → Authentication → Providers, enable <strong>Google</strong> and paste the
              Client ID and Client Secret from Google Cloud Console.
            </li>
            <li>
              Add <code>{'{your-site}'}/auth/callback</code> to the authorized redirect URLs.
            </li>
          </ol>
          <p style={{ margin: '8px 0 0' }}>
            Full steps: <code>SETUP.md</code>.
          </p>
        </div>
      )}

      {checked && email ? (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          <p style={{ marginTop: 0 }}>
            You are signed in as <strong>{email}</strong>.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/orders" className="btn">
              My orders
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await signOut();
                window.location.href = '/';
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-google"
          style={{ marginTop: 16 }}
          disabled={!authConfigured}
          onClick={async () => {
            const result = await signInWithGoogle('/orders');
            if (result.error) window.alert(result.error);
          }}
        >
          <span aria-hidden="true">G</span> Continue with Google
        </button>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <LoginBody />
    </Suspense>
  );
}
