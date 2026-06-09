/**
 * GET /api/dg/debug
 * Endpoint de diagnóstico: mostra contagem de odds em cada etapa do pipeline.
 * Retorna o JSON que alimenta o frontend para um par de times específico.
 *
 * Query params:
 *   ?home=Peru&away=Spain   → busca odds para esse jogo específico
 *   ?all=1                  → sem filtro de data
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse }  from 'next/server';
import { cookies }                     from 'next/headers';
import { createSupabaseServerClient }  from '@/lib/supabase/server';
import { getAllFootballOdds }          from '@/lib/altenar/client';
import { getBwinOdds }                 from '@/lib/bwin/client';
import { getBet365Odds }               from '@/lib/bet365/client';
import { getBetanoOdds }               from '@/lib/betano/client';
import { getSuperbetOdds }             from '@/lib/superbet/client';
import { getBetfairOdds }              from '@/lib/betfair/client';
import { getPinnacleOdds }             from '@/lib/pinnacle/client';
import { getBetNacionalOdds }          from '@/lib/betnacional/client';
import { getVivaSorteOdds }            from '@/lib/vivasorte/client';
import { mergeMatches, normalizeTeamName, type SourceEvent } from '@/lib/match-mapper';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const homeFilter = req.nextUrl.searchParams.get('home') ?? '';
  const awayFilter = req.nextUrl.searchParams.get('away') ?? '';

  const t0 = Date.now();

  const [altenarR, bwinR, bet365R, betanoR, superbetR, betfairR, pinnacleR, betnacR, vivasorteR] =
    await Promise.allSettled([
      getAllFootballOdds(), getBwinOdds(), getBet365Odds(), getBetanoOdds(),
      getSuperbetOdds(), getBetfairOdds(), getPinnacleOdds(), getBetNacionalOdds(), getVivaSorteOdds(),
    ]);

  const sources = {
    altenar:    { count: 0, sample: '' as string },
    bwin:       { count: 0, sample: '' },
    bet365:     { count: 0, sample: '' },
    betano:     { count: 0, sample: '' },
    superbet:   { count: 0, sample: '' },
    betfair:    { count: 0, sample: '' },
    pinnacle:   { count: 0, sample: '' },
    betnacional:{ count: 0, sample: '' },
    vivasorte:  { count: 0, sample: '' },
  };

  const altenar   = altenarR.status   === 'fulfilled' ? altenarR.value   : [];
  const bwin      = bwinR.status      === 'fulfilled' ? bwinR.value      : [];
  const bet365    = bet365R.status    === 'fulfilled' ? bet365R.value    : [];
  const betano    = betanoR.status    === 'fulfilled' ? betanoR.value    : [];
  const superbet  = superbetR.status  === 'fulfilled' ? superbetR.value  : [];
  const betfair   = betfairR.status   === 'fulfilled' ? betfairR.value   : [];
  const pinnacle  = pinnacleR.status  === 'fulfilled' ? pinnacleR.value  : [];
  const betnac    = betnacR.status    === 'fulfilled' ? betnacR.value    : [];
  const vivasorte = vivasorteR.status === 'fulfilled' ? vivasorteR.value : [];

  function fill(key: keyof typeof sources, data: SourceEvent[]) {
    sources[key].count = data.length;
    if (data[0]) sources[key].sample = `${data[0].home_team} vs ${data[0].away_team}`;
  }
  fill('altenar',     altenar);
  fill('bwin',        bwin);
  fill('bet365',      bet365);
  fill('betano',      betano);
  fill('superbet',    superbet);
  fill('betfair',     betfair);
  fill('pinnacle',    pinnacle);
  fill('betnacional', betnac);
  fill('vivasorte',   vivasorte);

  // Step 2: Merge
  const { matches: merged, stats: mergeStats } = mergeMatches(
    [altenar, bwin, bet365, betano, superbet, betfair, pinnacle, betnac, vivasorte],
    ['altenar', 'bwin', 'bet365', 'betano', 'superbet', 'betfair', 'pinnacle', 'betnacional', 'vivasorte'],
  );

  // Conta bookmakers por slug em todos os matches
  const bkTotals: Record<string, number> = {};
  for (const m of merged) {
    for (const bk of m.bookmakers) {
      bkTotals[bk.bookmaker_slug] = (bkTotals[bk.bookmaker_slug] ?? 0) + 1;
    }
  }

  // Se filtro de time fornecido, mostra o match específico
  let matchDetail = null;
  if (homeFilter || awayFilter) {
    const found = merged.find(m =>
      (!homeFilter || m.home_norm.includes(homeFilter.toLowerCase()) || m.home_team.toLowerCase().includes(homeFilter.toLowerCase())) &&
      (!awayFilter || m.away_norm.includes(awayFilter.toLowerCase()) || m.away_team.toLowerCase().includes(awayFilter.toLowerCase()))
    );
    if (found) {
      matchDetail = {
        home_team:   found.home_team,
        away_team:   found.away_team,
        home_norm:   found.home_norm,
        away_norm:   found.away_norm,
        start_time:  found.start_time,
        league_name: found.league_name,
        bookmakers:  found.bookmakers,
      };
    }
  }

  // Amostra dos primeiros 5 matches com seus bookmakers
  const sample = merged.slice(0, 5).map(m => ({
    home: m.home_team,
    away: m.away_team,
    home_norm: m.home_norm,
    away_norm: m.away_norm,
    bookmakers: m.bookmakers.map(b => b.bookmaker_slug),
  }));

  // Normalização de exemplo para diagnóstico
  const normExamples = [
    'Peru vs Spain', 'Peru x Espanha', 'Peru National Team vs Spain National Team',
    'Indonesia', 'Indonésia', 'Mozambique', 'Moçambique',
  ].map(s => ({ input: s, normalized: normalizeTeamName(s) }));

  return NextResponse.json({
    timing_ms:      Date.now() - t0,
    step1_sources:  sources,
    step2_merge: {
      total_matches:    merged.length,
      bookmakers_count: bkTotals,
      survival_stats:   mergeStats.perSource,
    },
    sample_matches:   sample,
    norm_examples:    normExamples,
    match_detail:     matchDetail,
  });
}
