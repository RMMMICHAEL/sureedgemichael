export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** GET — retorna status atual do SuperMonitor */
export async function GET() {
  try {
    const sb = await getSupabaseAdmin();
    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'supermonitor_status')
      .single();

    if (!data) return NextResponse.json({ status: 'ok' });
    return NextResponse.json({ status: data.value ?? 'ok', updatedAt: data.updated_at ?? null });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}

/** POST — reseta para ok e re-enfileira itens com erro recente */
export async function POST() {
  try {
    const sb = await getSupabaseAdmin();

    // 1. Reseta status
    await sb.from('app_config').upsert(
      { key: 'supermonitor_status', value: 'ok', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

    // 2. Re-enfileira itens com erro nos últimos 15 min
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await sb
      .from('odds_queue')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('status', 'error')
      .gte('updated_at', cutoff);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
