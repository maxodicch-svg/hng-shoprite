import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * OAuth redirect target: exchanges the Google authorization `code` for a
 * Supabase session cookie, then forwards the user to `?next` (default /orders).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/orders';
  const safeNext = next.startsWith('/') ? next : '/orders';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }
  if (!url || !key) {
    return NextResponse.redirect(`${origin}/login?error=supabase_unconfigured`);
  }

  const response = NextResponse.redirect(`${origin}${safeNext}`);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }
  return response;
}
