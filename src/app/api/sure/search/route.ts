/**
 * POST /api/sure/search
 * Retorna odds de um evento lidas do Supabase (cache do PC).
 * Body: { query: string, eventId?: string }
 *   eventId — ID do evento (preferencial, busca exata)
 *   query   — nome do evento (fallback, busca por semelhança)
 *
 * Resposta quando dado existe e fresco (< 15 min):
 *   { ok: true, data, cached_at }
 *
 * Resposta quando dado está velho (>= 15 min):
 *   { ok: false, reason: 'stale', event_id, event_name }
 *
 * Resposta quando não encontrado:
 *   { ok: false, reason: 'not_found', event_id }
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

export async function POST(req: NextRequest) {
  let query = '', eventId = '';
  try {
    const body  = await req.json() as { query?: string; eventId?: string };
    query   = (body.query   ?? '').trim();
    eventId = (body.eventId ?? '').trim();
  } catch (_e) { /* vazio */ }

  if (!query && !eventId) {
    return NextResponse.json({ ok: false, error: 'query ou eventId obrigatório' });
  }

  try {
    const sb = await getSupabaseAdmin();

    // ── Busca por eventId (preferencial — exato e rápido) ─────────────────
    if (eventId) {
      const { data, error } = await sb
        .from('sm_odds')
        .select('data, event_name, updated_at')
        .eq('event_id', eventId)
        .single();

      if (!error && data) {
        const age = Date.now() - new Date(data.updated_at).getTime();
        if (age >= CACHE_TTL_MS) {
          // Dado existe mas está velho — frontend deve enfileirar
          return NextResponse.json({
            ok: false,
            reason: 'stale',
            event_id: eventId,
            event_name: data.event_name,
            cached_at: data.updated_at,
          });
        }
        return NextResponse.json({ ok: true, data: data.data, cached_at: data.updated_at });
      }

      // Não encontrado por eventId
      if (!query) {
        return NextResponse.json({ ok: false, reason: 'not_found', event_id: eventId });
      }
    }

    // ── Fallback: busca por nome (ilike) ──────────────────────────────────
    if (query) {
      // Tenta primeiro correspondência exata
      const { data: exact } = await sb
        .from('sm_odds')
        .select('data, event_name, updated_at')
        .ilike('event_name', query)
        .limit(1)
        .single();

      if (exact) {
        const age = Date.now() - new Date(exact.updated_at).getTime();
        if (age >= CACHE_TTL_MS) {
          return NextResponse.json({
            ok: false,
            reason: 'stale',
            event_id: eventId || '',
            event_name: exact.event_name,
            cached_at: exact.updated_at,
          });
        }
        return NextResponse.json({ ok: true, data: exact.data, cached_at: exact.updated_at });
      }

      // Busca parcial: divide o nome e procura por parte relevante
      const parts   = query.split(' x ');
      const keyword = parts[0]?.trim() ?? query;
      const { data: partial } = await sb
        .from('sm_odds')
        .select('data, event_name, updated_at')
        .ilike('event_name', `%${keyword}%`)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (partial) {
        const age = Date.now() - new Date(partial.updated_at).getTime();
        if (age >= CACHE_TTL_MS) {
          return NextResponse.json({
            ok: false,
            reason: 'stale',
            event_id: eventId || '',
            event_name: partial.event_name,
            cached_at: partial.updated_at,
          });
        }
        return NextResponse.json({ ok: true, data: partial.data, cached_at: partial.updated_at });
      }
    }

    // Nenhum resultado encontrado
    return NextResponse.json({
      ok: false,
      reason: 'not_found',
      event_id: eventId,
      hint: 'Odds ainda não disponíveis. Selecione o evento para enfileirar a busca.',
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[search] unexpected error:', msg);
    return NextResponse.json({ ok: false, error: msg, reason: 'error' });
  }
}
