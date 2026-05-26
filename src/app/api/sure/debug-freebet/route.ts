/**
 * GET /api/sure/debug-freebet
 * Retorna o JSON bruto dos últimos resultados de freebet_queue (done)
 * para inspecionar a estrutura exata que o SuperMonitor retorna.
 * APENAS PARA DEBUG — remover após identificar os campos corretos.
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

export async function GET() {
  try {
    const sb = await getSupabaseAdmin();

    const { data: rows, error } = await sb
      .from('freebet_queue')
      .select('id, bookmaker, value, pa_filter, status, result, created_at')
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) throw new Error(error.message);
    if (!rows?.length) return NextResponse.json({ ok: false, error: 'Nenhum resultado done na fila' });

    // Para cada resultado, extrai as chaves dos hedges para identificar o campo da odd PA
    const analyzed = rows.map(row => {
      const raw = row.result as Record<string, unknown> | null;
      if (!raw) return { ...row, hedge_keys: [], sample_hedges: [] };

      // Navega pelos possíveis formatos
      const arr: unknown[] = Array.isArray(raw) ? raw
        : Array.isArray((raw as Record<string, unknown>).recommendations) ? (raw as Record<string, unknown>).recommendations as unknown[]
        : Array.isArray((raw as Record<string, unknown>).results) ? (raw as Record<string, unknown>).results as unknown[]
        : Array.isArray((raw as Record<string, unknown>).data) ? (raw as Record<string, unknown>).data as unknown[]
        : [];

      const firstItem = arr[0] as Record<string, unknown> | undefined;
      const hedges: unknown[] = Array.isArray(firstItem?.hedges) ? firstItem.hedges as unknown[] : [];
      const paHedges = hedges.filter((h: unknown) => {
        const hedge = h as Record<string, unknown>;
        return hedge.pa === true || hedge.is_pa === true || hedge.pa_available === true;
      });

      return {
        id: row.id,
        bookmaker: row.bookmaker,
        value: row.value,
        pa_filter: row.pa_filter,
        status: row.status,
        created_at: row.created_at,
        // Estrutura completa do primeiro item (apenas para inspecionar)
        first_item_keys: firstItem ? Object.keys(firstItem) : [],
        // Chaves do primeiro hedge
        first_hedge_keys: hedges[0] ? Object.keys(hedges[0] as object) : [],
        // Todos os hedges completos do primeiro resultado (para ver todos os campos)
        all_hedges_raw: hedges,
        // Hedges PA especificamente
        pa_hedges_raw: paHedges,
        // Amostra do primeiro item bruto (trunc para legibilidade)
        first_item_raw: firstItem,
      };
    });

    return NextResponse.json({ ok: true, count: rows.length, results: analyzed }, {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }
}
