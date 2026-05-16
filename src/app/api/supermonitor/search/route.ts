/**
 * POST /api/supermonitor/search
 * Retorna odds de um evento lidas do Supabase (cache do PC).
 * Body: { query: string, eventId?: string }
 *   eventId — ID do evento (preferencial, busca exata)
 *   query   — nome do evento (fallback, busca por semelhança)
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
        return NextResponse.json({ ok: true, data: data.data, cached_at: data.updated_at });
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
        return NextResponse.json({ ok: true, data: partial.data, cached_at: partial.updated_at });
      }
    }

    // Nenhum resultado
    return NextResponse.json({
      ok: false,
      error: 'cache/not-found',
      hint: 'Odds ainda não disponíveis. O cache é atualizado a cada 30 min pelo PC.',
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[search] unexpected error:', msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}
