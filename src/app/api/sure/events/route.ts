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
  } catch { /* vazio */ }

  try {
    const sb = await getSupabaseAdmin();

    let query = sb
      .from('sm_events')
      .select('id, name, sport, league, start_utc, house_count, event_date, updated_at')
      .order('start_utc', { ascending: true });

    if (!all && date) {
      query = query.eq('event_date', date);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[events POST]', error.message);
      return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, events: (data ?? []) as CachedEvent[] });
  } catch (e: unknown) {
    console.error('[events POST]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}
