import { NextResponse } from 'next/server';
import { isSupabaseConfigured, hasServiceRole } from '@/lib/supabase';
import { activeProvider, configuredProviders, isEmailConfigured } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Reports which integrations are wired. Safe to expose: it names booleans and
 * provider names, never key material. Used by the deployment checklist and by
 * the UI banner.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'zedu-store',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    integrations: {
      database: isSupabaseConfigured(),
      databaseWrites: hasServiceRole(),
      email: isEmailConfigured(),
      emailProviders: configuredProviders(),
      googleAuth: isSupabaseConfigured(),
    },
    emailProvider: activeProvider() ?? 'mock',
    mode: isSupabaseConfigured() && hasServiceRole() ? 'live' : 'mock',
  });
}
