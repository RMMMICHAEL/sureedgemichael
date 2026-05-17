/**
 * GET /api/supermonitor/sse-token
 * Retorna o temp_token SSE salvo pelo renew-cookie.mjs no Supabase.
 * O frontend usa esse token para abrir EventSource em api5.nomacisoft.com.
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
    const { data, error } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'sse_temp_token')
      .single();

    if (error || !data?.value) {
      return NextResponse.json({ ok: false, error: 'token_indisponivel' });
    }

    // Rejeita tokens com mais de 2 horas (provavelmente expirado)
    const age = Date.now() - new Date(data.updated_at).getTime();
    if (age > 2 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: false, error: 'token_expirado' });
    }

    return NextResponse.json({ ok: true, token: data.value, updated_at: data.updated_at });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg });
  }
}
