/**
 * POST /api/supermonitor/events
 * Retorna a lista de eventos do dia lida do Supabase (cache do PC).
 * O PC roda renew-cookie.mjs a cada 30 min e salva em sm_events.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

interface CachedEvent {
  id:          string;
  name:        string;
  sport:       string;
  league:      string;
  start_utc:   string;
  house_count: number;
  event_date:  string;
  updated_at:  string;
}

export async function POST(req: NextRequest) {
  let date = '';
  try {
    const body = await req.json() as { date?: string };
    date = body.date ?? '';
  } catch (_e) { /* vazio */ }

  const targetDate = date || new Date().toISOString().slice(0, 10);

  try {
    const sb = await getSupabaseAdmin();
    const { data, error } = await sb
      .from('sm_events')
      .select('id, name, sport, league, start_utc, house_count')
      .eq('event_date', targetDate)
      .order('start_utc', { ascending: true });

    if (error) {
      console.error('[events] Supabase error:', error.message);
      return NextResponse.json({
        ok: false,
        error: 'cache/supabase-error',
        detail: error.message,
      });
    }

    const events = (data ?? []) as CachedEvent[];

    // Sem eventos: cache ainda não populado pelo PC
    if (events.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'cache/empty',
        hint: 'Execute renew-cookie.mjs no seu PC para popular o cache.',
      });
    }

    return NextResponse.json({ ok: true, events, source: 'supabase-cache', date: targetDate });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[events] unexpected error:', msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}
