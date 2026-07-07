/**
 * GET /api/sync/metrics
 *
 * Retorna métricas agregadas do Sync Bridge:
 * total_odds, total_matches, market_1x2, market_pa, avg_bookmakers, last_updated
 *
 * Usa a função RPC sync_bridge_metrics() se disponível (migration aplicada),
 * com fallback para queries diretas caso a função ainda não exista.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface SyncMetrics {
  total_odds:      number;
  total_matches:   number;
  market_1x2:      number;
  market_pa:       number;
  avg_bookmakers:  number;
  last_updated:    string | null;
}

function sinceSeconds(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
}

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });

  // Tenta via RPC (disponível após migration aplicada)
  try {
    const { data, error } = await supabase.rpc('sync_bridge_metrics');
    if (!error && data) {
      const m = data as SyncMetrics;
      return NextResponse.json({
        ok: true,
        ...m,
        since_seconds: sinceSeconds(m.last_updated),
      });
    }
  } catch { /* RPC não disponível ainda */ }

  // Fallback: queries individuais (sem distinct count)
  const [r1, r2, r3] = await Promise.all([
    supabase.from('bookmaker_odds').select('*', { count: 'exact', head: true }).eq('market_type', '1x2'),
    supabase.from('bookmaker_odds').select('*', { count: 'exact', head: true }).eq('market_type', '1x2_pa'),
    supabase.from('bookmaker_odds').select('updated_at').order('updated_at', { ascending: false }).limit(1),
  ]);

  const market_1x2   = r1.count ?? 0;
  const market_pa    = r2.count ?? 0;
  const total_odds   = market_1x2 + market_pa;
  const last_updated = (r3.data?.[0]?.updated_at as string) ?? null;

  return NextResponse.json({
    ok:            true,
    total_odds,
    total_matches: null, // indisponível sem RPC
    market_1x2,
    market_pa,
    avg_bookmakers: null,
    last_updated,
    since_seconds:  sinceSeconds(last_updated),
  });
}
