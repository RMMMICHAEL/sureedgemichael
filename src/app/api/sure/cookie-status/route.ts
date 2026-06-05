/**
 * GET /api/sure/cookie-status
 * Retorna se o cookie do SuperMonitor está válido ou expirado.
 * Lê app_config.supermonitor_cookie_status salvo pelo daemon.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET() {
  try {
    const sb = await getSupabaseAdmin();

    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'cookie_status')
      .single();

    // Se não existe a chave ainda, assume válido (daemon ainda não rodou)
    if (!data) return NextResponse.json({ ok: true, status: 'unknown' });

    return NextResponse.json({
      ok: true,
      status: data.value ?? 'unknown',   // 'valid' | 'expired' | 'unknown'
      updatedAt: data.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ ok: true, status: 'unknown' });
  }
}
