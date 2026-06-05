/**
 * POST /api/sure/refresh-events
 * Seta a flag refresh_events_requested=true no Supabase.
 * O daemon (process-queue.mjs) detecta a flag no próximo ciclo (≤0.5s),
 * chama events_lite no SuperMonitor e atualiza sm_events.
 *
 * GET /api/sure/refresh-events
 * Retorna { done: bool, at: string|null } — usado pelo frontend para polling.
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

// POST — dispara o refresh
export async function POST() {
  try {
    const sb = await getSupabaseAdmin();

    // Limpa qualquer "done" anterior para não confundir o polling
    await sb.from('app_config').upsert(
      { key: 'refresh_events_done', value: '', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

    // Seta a flag de solicitação
    const { error } = await sb.from('app_config').upsert(
      { key: 'refresh_events_requested', value: 'true', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[refresh-events POST]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}

// GET — polling do status (done?)
export async function GET() {
  try {
    const sb = await getSupabaseAdmin();

    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'refresh_events_done')
      .single();

    const done = !!(data?.value && data.value !== '');
    return NextResponse.json({ ok: true, done, at: data?.value || null });
  } catch {
    return NextResponse.json({ ok: true, done: false, at: null });
  }
}
