/**
 * GET /api/sure/sse-token
 * Retorna o temp_token SSE e sse_url salvos pelo process-queue.mjs no Supabase.
 * O frontend usa esses valores para abrir EventSource: {sse_url}/events?temp_token=...
 *
 * TTL do token: 840s (~14 min). O daemon renova a cada 12 min.
 * Aqui rejeitamos tokens com mais de 15 min.
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1']; // São Paulo — evita bloqueio IP no SuperMonitor

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

    // Busca token e URL em paralelo
    const [tokenRow, urlRow] = await Promise.all([
      sb.from('app_config').select('value, updated_at').eq('key', 'sse_temp_token').single(),
      sb.from('app_config').select('value').eq('key', 'sse_url').single(),
    ]);

    if (tokenRow.error || !tokenRow.data?.value) {
      return NextResponse.json({ ok: false, error: 'token_indisponivel' });
    }

    // Rejeita tokens com mais de 15 min (TTL = 840s; daemon renova a cada 720s)
    const age = Date.now() - new Date(tokenRow.data.updated_at).getTime();
    if (age > 15 * 60 * 1000) {
      return NextResponse.json({ ok: false, error: 'token_expirado' });
    }

    return NextResponse.json({
      ok: true,
      token: tokenRow.data.value,
      sse_url: urlRow.data?.value ?? null,
      updated_at: tokenRow.data.updated_at,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg });
  }
}
