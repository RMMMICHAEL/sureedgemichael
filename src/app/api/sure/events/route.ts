/**
 * POST /api/sure/events
 * Retorna a lista de eventos do dia lida do Supabase (cache do PC).
 * O PC roda renew-cookie.mjs a cada 30 min e salva em sm_events.
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1']; // São Paulo — evita bloqueio IP no SuperMonitor

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
  let all  = false;
  try {
    const body = await req.json() as { date?: string; all?: boolean };
    date = body.date ?? '';
    all  = body.all  ?? false;
  } catch (_e) { /* vazio */ }

  try {
    const sb = await getSupabaseAdmin();

    // ── Modo "all": retorna todos os eventos futuros do cache (sem filtro de data)
    if (all) {
      // Começa da meia-noite BRT de hoje (03:00 UTC) para não incluir jogos passados.
      // Vercel roda em UTC — subtrai 3 h para obter a data local BRT correta.
      const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const p   = (x: number) => String(x).padStart(2, '0');
      const todayBrt = `${brt.getUTCFullYear()}-${p(brt.getUTCMonth()+1)}-${p(brt.getUTCDate())}`;
      const fromUtc  = `${todayBrt}T03:00:00.000Z`;

      const { data, error } = await sb
        .from('sm_events')
        .select('id, name, sport, league, start_utc, house_count')
        .gte('start_utc', fromUtc)
        .order('start_utc', { ascending: true });

      if (error) {
        console.error('[events/all] Supabase error:', error.message);
        return NextResponse.json({ ok: false, error: 'cache/supabase-error' });
      }

      const events = (data ?? []) as CachedEvent[];
      if (!events.length) {
        return NextResponse.json({ ok: false, error: 'cache/empty' });
      }
      return NextResponse.json({ ok: true, events, source: 'supabase-cache-all' });
    }

    // ── Modo padrão: filtro por dia específico
    // Usa data local se não recebeu nada (fallback: UTC — mas frontend deve sempre enviar local)
    const targetDate = date || (() => {
      const n = new Date(); const p = (x: number) => String(x).padStart(2, '0');
      return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}`;
    })();

    // Converte a data local (Brasil UTC-3) para janela UTC:
    //   meia-noite BRT = 03:00 UTC do mesmo dia
    //   meia-noite BRT seguinte = 03:00 UTC do dia seguinte
    const dayStartUtc = `${targetDate}T03:00:00.000Z`;
    const dayEndDate  = new Date(dayStartUtc);
    dayEndDate.setUTCDate(dayEndDate.getUTCDate() + 1);
    const dayEndUtc = dayEndDate.toISOString();

    // Tenta primeiro por start_utc range (mais confiável)
    let { data, error } = await sb
      .from('sm_events')
      .select('id, name, sport, league, start_utc, house_count')
      .gte('start_utc', dayStartUtc)
      .lt('start_utc', dayEndUtc)
      .order('start_utc', { ascending: true });

    // Fallback: se vazio, tenta event_date (compatibilidade)
    if (!error && (!data || data.length === 0)) {
      const fb = await sb
        .from('sm_events')
        .select('id, name, sport, league, start_utc, house_count')
        .eq('event_date', targetDate)
        .order('start_utc', { ascending: true });
      if (!fb.error && fb.data && fb.data.length > 0) {
        data  = fb.data;
        error = fb.error;
      }
    }

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
