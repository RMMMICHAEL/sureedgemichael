/**
 * /api/sure/queue — requer usuário autenticado com subscription ativa
 *
 * POST { event_id, event_name }
 *   → verifica cache fresco (< 15 min) em sm_odds
 *   → insere entrada pending se necessário
 *   → retorna { ok, status: 'cached' | 'queued' }
 *
 * GET ?event_id=...
 *   → verifica se sm_odds tem dado fresco (< 15 min)
 *   → retorna { ok, ready, cached_at? }
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1'];

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const CACHE_TTL_MS = 15 * 60 * 1000;

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

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  let event_id = '', event_name = '';
  try {
    const body = await req.json() as { event_id?: string; event_name?: string };
    event_id   = (body.event_id   ?? '').trim();
    event_name = (body.event_name ?? '').trim();
  } catch { /* vazio */ }

  if (!event_id || !event_name) {
    return NextResponse.json({ ok: false, error: 'event_id e event_name são obrigatórios' }, { status: 400 });
  }

  try {
    const sb = await getSupabaseAdmin();

    const { data: existing } = await sb
      .from('sm_odds')
      .select('updated_at')
      .eq('event_id', event_id)
      .single();

    if (existing?.updated_at) {
      const age = Date.now() - new Date(existing.updated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({ ok: true, status: 'cached', cached_at: existing.updated_at });
      }
    }

    const { data: queued } = await sb
      .from('odds_queue')
      .select('id, status')
      .eq('event_id', event_id)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .single();

    if (queued) {
      return NextResponse.json({ ok: true, status: 'queued' });
    }

    const { error: insertErr } = await sb
      .from('odds_queue')
      .insert({ event_id, event_name, status: 'pending' });

    if (insertErr) {
      return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'queued' });

  } catch {
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const event_id = (req.nextUrl.searchParams.get('event_id') ?? '').trim();

  if (!event_id) {
    return NextResponse.json({ ok: false, error: 'event_id obrigatório' }, { status: 400 });
  }

  try {
    const sb = await getSupabaseAdmin();

    const { data } = await sb
      .from('sm_odds')
      .select('updated_at')
      .eq('event_id', event_id)
      .single();

    if (data?.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({ ok: true, ready: true, cached_at: data.updated_at });
      }
    }

    return NextResponse.json({ ok: true, ready: false });

  } catch {
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}
