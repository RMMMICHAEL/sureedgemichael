/**
 * GET /api/sure/debug-markets
 * Pega a entrada mais recente do cache sm_odds e lista todos os mercados
 * disponíveis na resposta da API, com seus nomes e estrutura de odds.
 * APENAS PARA TESTE — requer admin.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET() {
  // Admin-only
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const sb = await getSupabaseAdmin();

    // Pega as 5 entradas mais recentes do cache
    const { data: rows, error } = await sb
      .from('sm_odds')
      .select('event_id, event_name, data, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error || !rows?.length) {
      return NextResponse.json({ ok: false, error: error?.message ?? 'Nenhum dado no cache' });
    }

    // Analisa todos os mercados em todos os eventos cacheados
    const summary: Record<string, {
      event: string;
      houses: number;
      market_names: string[];
      sample: Record<string, unknown>;
    }> = {};

    for (const row of rows) {
      const payload = row.data as Record<string, unknown>;
      const results: Record<string, unknown>[] = Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.data)
          ? (payload.data as Record<string, unknown>[])
          : [];

      if (!results.length) continue;

      const marketNames = new Set<string>();
      const marketSamples: Record<string, unknown> = {};
      let houseCount = 0;

      for (const result of results) {
        const bms = result.bookmakers as Record<string, unknown[]> | undefined;
        if (!bms) continue;
        houseCount++;

        for (const [, markets] of Object.entries(bms)) {
          if (!Array.isArray(markets)) continue;
          for (const market of markets as Record<string, unknown>[]) {
            const mName = String(market.name ?? '').toLowerCase();
            marketNames.add(mName);

            // Guarda um exemplo da estrutura de odds para cada mercado
            if (!marketSamples[mName] && Array.isArray(market.odds) && market.odds.length > 0) {
              marketSamples[mName] = {
                name: market.name,
                odds_keys: Object.keys(market.odds[0] as object),
                odds_sample: market.odds[0],
              };
            }
          }
        }
      }

      summary[row.event_id] = {
        event: row.event_name,
        houses: houseCount,
        market_names: [...marketNames].sort(),
        sample: marketSamples,
      };
    }

    // Agrega todos os mercados únicos vistos em todos os eventos
    const allMarkets = new Set<string>();
    for (const s of Object.values(summary)) {
      for (const m of s.market_names) allMarkets.add(m);
    }

    return NextResponse.json({
      ok: true,
      total_events_checked: rows.length,
      all_unique_markets: [...allMarkets].sort(),
      per_event: summary,
    }, { headers: { 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }
}
