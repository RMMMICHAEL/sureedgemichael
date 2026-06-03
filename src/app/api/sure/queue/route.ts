/**
 * /api/sure/queue
 *
 * POST { event_id, event_name }
 *   → verifica cache fresco (< 15 min) em sm_odds
 *   → verifica se já existe entrada pending/processing em odds_queue
 *   → insere nova entrada pending se necessário
 *   → retorna { ok, status: 'cached' | 'queued' }
 *
 * GET ?event_id=...
 *   → verifica se sm_odds tem dado fresco (< 15 min)
 *   → retorna { ok, ready, cached_at? }
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1']; // São Paulo — evita bloqueio IP no SuperMonitor

import { NextRequest, NextResponse } from 'next/server';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── POST — enfileira evento para busca de odds ────────────────────────────────
export async function POST(req: NextRequest) {
  let event_id = '', event_name = '';
  try {
    const body = await req.json() as { event_id?: string; event_name?: string };
    event_id   = (body.event_id   ?? '').trim();
    event_name = (body.event_name ?? '').trim();
  } catch (_e) { /* vazio */ }

  if (!event_id || !event_name) {
    return NextResponse.json({ ok: false, error: 'event_id e event_name são obrigatórios' }, { status: 400 });
  }

  try {
    const sb = await getSupabaseAdmin();

    // 1. Verifica se já há dados frescos em sm_odds (< 15 min)
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

    // 2. Verifica se já existe entrada pending ou processing na fila
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

    // 3. Insere nova entrada pending
    const { error: insertErr } = await sb
      .from('odds_queue')
      .insert({ event_id, event_name, status: 'pending' });

    if (insertErr) {
      console.error('[queue POST] insert error:', insertErr.message);
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'queued' });

  } catch (err: unknown) {
    console.error('[queue POST] unexpected error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}

// ── GET — verifica se odds já estão prontas ───────────────────────────────────
export async function GET(req: NextRequest) {
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

  } catch (err: unknown) {
    console.error('[queue GET] unexpected error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}
