/**
 * POST /api/sure/events — requer usuário autenticado
 * Retorna a lista de eventos do dia lida do Supabase (cache do PC).
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1'];

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function requireUser() {
  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
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
  if (!(await requireUser())) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

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

    // ── Modo padrão: filtro por dia específico (BRT → UTC)
    const targetDate = date || (() => {
      const n = new Date(); const p = (x: number) => String(x).padStart(2, '0');
      return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}`;
    })();

    const dayStartUtc = `${targetDate}T03:00:00.000Z`;
    const dayEndDate  = new Date(dayStartUtc);
    dayEndDate.setUTCDate(dayEndDate.getUTCDate() + 1);
    const dayEndUtc = dayEndDate.toISOString();

    let { data, error } = await sb
      .from('sm_events')
      .select('id, name, sport, league, start_utc, house_count')
      .gte('start_utc', dayStartUtc)
      .lt('start_utc', dayEndUtc)
      .order('start_utc', { ascending: true });

    // Fallback: tenta event_date se start_utc range retornou vazio
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
      return NextResponse.json({ ok: false, error: 'cache/supabase-error', detail: error.message });
    }

    const events = (data ?? []) as CachedEvent[];

    if (events.length === 0) {
      return NextResponse.json({ ok: false, error: 'cache/empty' });
    }

    return NextResponse.json({ ok: true, events, source: 'supabase-cache', date: targetDate });

  } catch (err: unknown) {
    console.error('[events] unexpected error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Erro interno' });
  }
}
