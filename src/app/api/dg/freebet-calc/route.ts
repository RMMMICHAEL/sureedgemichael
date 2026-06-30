/**
 * GET /api/dg/freebet-calc
 *
 * Calcula as melhores oportunidades de conversão de freebet SNR (Stake Não Retornada).
 *
 * Usa DUAS fontes de dados:
 *   1. bookmaker_odds    → odds individuais do dia importadas pelo admin
 *   2. dg_opportunities  → oportunidades DG pré-computadas (legs já otimizados)
 *
 * A fonte DG geralmente produz resultados melhores porque as odds foram
 * selecionadas pelo algoritmo do DuploGreen. As duas fontes são mescladas
 * e deduplicadas por match_id, mantendo sempre o melhor resultado.
 *
 * Query params:
 *   ?bookmaker=slug   → slug da casa onde está a freebet (obrigatório)
 *   ?bookmaker=__list__ → apenas retorna lista de bookmakers disponíveis
 *
 * Fórmula SNR:
 *   F = valor da freebet, O_fb = odd da freebet, O_c1/O_c2 = coberturas
 *   s1 = F × (O_fb − 1) / O_c1
 *   s2 = F × (O_fb − 1) / O_c2
 *   lucro = F × (O_fb − 1) − s1 − s2
 *   conversão% = lucro / F × 100
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }   from 'next/server';
import { cookies }                     from 'next/headers';
import { createSupabaseServerClient }  from '@/lib/supabase/server';
import { isPaBookmaker as isPa }       from '@/lib/bookmakers';

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface DbRow {
  match_id:       string;
  home_team:      string;
  away_team:      string;
  match_date:     string | null;
  start_time:     string | null;
  league_name:    string | null;
  bookmaker_slug: string;
  bookmaker_name: string | null;
  market_type:    string;
  odd_home:       number;
  odd_draw:       number | null;
  odd_away:       number;
  match_url:      string | null;
}

interface DGLeg {
  bookmaker:     string;
  bookmakerSlug: string;
  odd:           number;
  outcome:       string;
  matchUrl?:     string | null;
  isPA:          boolean;
}

interface DGOpportunity {
  id:                string;
  match_id:          string;
  home_team:         string;
  away_team:         string;
  league:            string | null;
  kickoff:           string | null;
  dg_profit_pct:     number | null;
  dg_score:          number | null;
  dg_classification: string | null;
  legs:              DGLeg[];
}

export interface FreebetOpportunity {
  match_id:        string;
  home_team:       string;
  away_team:       string;
  league_name:     string;
  start_time:      string | null;
  freebet_outcome: 'home' | 'draw' | 'away';
  freebet_odd:     number;
  freebet_url:     string | null;
  covers: {
    outcome:        'home' | 'draw' | 'away';
    bookmaker_slug: string;
    bookmaker_name: string;
    odd:            number;
    stake_per_100:  number;
    is_pa:          boolean;
    url:            string | null;
  }[];
  conversion_pct:     number;
  profit_per_100:     number;
  cover_cost_per_100: number;
  /** Fonte dos dados: 'odds' = bookmaker_odds, 'dg' = dg_opportunities */
  source: 'odds' | 'dg';
  /** Score DG (quando disponível) */
  dg_score?: number | null;
  dg_classification?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}


function slugMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[\s\-_.]/g,'');
  const nb = b.toLowerCase().replace(/[\s\-_.]/g,'');
  return na === nb || na.startsWith(nb.slice(0,5)) || nb.startsWith(na.slice(0,5));
}

/** Calcula conversão SNR e retorna FreebetOpportunity ou null se inviável */
function computeSNR(params: {
  matchId:       string;
  homeName:      string;
  awayName:      string;
  leagueName:    string;
  startTime:     string | null;
  fbOutcome:     'home' | 'draw' | 'away';
  fbOdd:         number;
  fbUrl:         string | null;
  covers: {
    outcome:   'home' | 'draw' | 'away';
    slug:      string;
    name:      string;
    odd:       number;
    url:       string | null;
  }[];
  source:        'odds' | 'dg';
  dgScore?:      number | null;
  dgClass?:      string | null;
}): FreebetOpportunity | null {
  const { fbOdd, covers } = params;
  if (fbOdd <= 1 || covers.length < 2) return null;

  // Para cada outcome de cobertura precisamos de exatamente 1 casa
  const needed = (['home','draw','away'] as const).filter(o => o !== params.fbOutcome);
  const c1 = covers.find(c => c.outcome === needed[0]);
  const c2 = covers.find(c => c.outcome === needed[1]);
  if (!c1 || !c2 || c1.odd <= 1 || c2.odd <= 1) return null;

  const F = 100;
  const profit_fb = F * (fbOdd - 1);
  const s1 = profit_fb / c1.odd;
  const s2 = profit_fb / c2.odd;
  const profit = profit_fb - s1 - s2;
  const conversion_pct = (profit / F) * 100;
  if (conversion_pct <= 0) return null;

  return {
    match_id:        params.matchId,
    home_team:       params.homeName,
    away_team:       params.awayName,
    league_name:     params.leagueName,
    start_time:      params.startTime,
    freebet_outcome: params.fbOutcome,
    freebet_odd:     fbOdd,
    freebet_url:     params.fbUrl,
    covers: [
      { outcome: c1.outcome, bookmaker_slug: c1.slug, bookmaker_name: c1.name, odd: c1.odd, stake_per_100: s1, is_pa: isPa(c1.slug), url: c1.url },
      { outcome: c2.outcome, bookmaker_slug: c2.slug, bookmaker_name: c2.name, odd: c2.odd, stake_per_100: s2, is_pa: isPa(c2.slug), url: c2.url },
    ],
    conversion_pct,
    profit_per_100:     profit,
    cover_cost_per_100: s1 + s2,
    source:             params.source,
    dg_score:           params.dgScore,
    dg_classification:  params.dgClass,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bookmakerParam = searchParams.get('bookmaker');

  if (!bookmakerParam) {
    return NextResponse.json({ ok: false, error: 'Parâmetro bookmaker obrigatório' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const today       = todayBRT();
  const now         = Date.now();

  // ── Busca as duas fontes em paralelo ─────────────────────────────────────────
  const [oddsRes, dgRes] = await Promise.all([
    supabase
      .from('bookmaker_odds')
      .select(`
        match_id, home_team, away_team, match_date, start_time,
        league_name, bookmaker_slug, bookmaker_name, market_type,
        odd_home, odd_draw, odd_away, match_url
      `)
      .eq('match_date', today)
      .order('start_time', { ascending: true }),

    supabase
      .from('dg_opportunities')
      .select('id, match_id, home_team, away_team, league, kickoff, dg_profit_pct, dg_score, dg_classification, legs')
      .gt('kickoff', new Date().toISOString()),
  ]);

  const rows     = (oddsRes.data ?? []) as DbRow[];
  const dgOpps   = (dgRes.data   ?? []) as DGOpportunity[];

  // Lista de bookmakers disponíveis nas DUAS fontes
  const bookmakerSet = new Map<string, string>();
  for (const r of rows) {
    if (!bookmakerSet.has(r.bookmaker_slug)) {
      bookmakerSet.set(r.bookmaker_slug, r.bookmaker_name ?? r.bookmaker_slug);
    }
  }
  for (const opp of dgOpps) {
    for (const leg of opp.legs) {
      if (!bookmakerSet.has(leg.bookmakerSlug)) {
        bookmakerSet.set(leg.bookmakerSlug, leg.bookmaker);
      }
    }
  }

  // Modo listagem — só retorna bookmakers disponíveis
  if (bookmakerParam === '__list__') {
    return NextResponse.json({
      ok: true, bookmaker: '__list__', date: today,
      total_events: 0, total_opportunities: 0,
      bookmakers_available: Array.from(bookmakerSet.entries()).map(([slug, name]) => ({ slug, name })),
      results: [],
    });
  }

  const allResults: FreebetOpportunity[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // Fonte 1: bookmaker_odds
  // ─────────────────────────────────────────────────────────────────────────────
  const byMatch = new Map<string, DbRow[]>();
  for (const row of rows) {
    if (!byMatch.has(row.match_id)) byMatch.set(row.match_id, []);
    byMatch.get(row.match_id)!.push(row);
  }

  for (const [matchId, matchRows] of byMatch) {
    const meta = matchRows[0];
    if (meta.start_time && new Date(meta.start_time).getTime() <= now) continue;

    const fbRows = matchRows.filter(r => slugMatch(r.bookmaker_slug, bookmakerParam));
    if (!fbRows.length) continue;

    const fbHome = Math.max(...fbRows.map(r => r.odd_home ?? 0).filter(v => v > 1), 0);
    const fbDraw = Math.max(...fbRows.map(r => r.odd_draw ?? 0).filter(v => v > 1), 0);
    const fbAway = Math.max(...fbRows.map(r => r.odd_away ?? 0).filter(v => v > 1), 0);
    const fbUrl  = fbRows.find(r => r.match_url)?.match_url ?? null;

    const coverRows = matchRows.filter(r => !slugMatch(r.bookmaker_slug, bookmakerParam));

    const bestCover = (outcome: 'home'|'draw'|'away') => {
      const col = outcome === 'home' ? 'odd_home' : outcome === 'draw' ? 'odd_draw' : 'odd_away';
      let best = 0; let bestRow: DbRow | null = null;
      for (const r of coverRows) {
        const v = (r[col] as number | null) ?? 0;
        if (v > best) { best = v; bestRow = r; }
      }
      if (!bestRow || best <= 1) return null;
      return { outcome, slug: bestRow.bookmaker_slug, name: bestRow.bookmaker_name ?? bestRow.bookmaker_slug, odd: best, url: bestRow.match_url ?? null };
    };

    for (const fbOutcome of ['home','draw','away'] as const) {
      const fbOdd = fbOutcome === 'home' ? fbHome : fbOutcome === 'draw' ? fbDraw : fbAway;
      if (fbOdd <= 1) continue;
      const coverOutcomes = (['home','draw','away'] as const).filter(o => o !== fbOutcome);
      const covers = coverOutcomes.map(bestCover).filter(Boolean) as NonNullable<ReturnType<typeof bestCover>>[];

      const result = computeSNR({
        matchId, homeName: meta.home_team, awayName: meta.away_team,
        leagueName: meta.league_name ?? '', startTime: meta.start_time,
        fbOutcome, fbOdd, fbUrl,
        covers, source: 'odds',
      });
      if (result) allResults.push(result);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Fonte 2: dg_opportunities
  // ─────────────────────────────────────────────────────────────────────────────
  for (const opp of dgOpps) {
    if (opp.kickoff && new Date(opp.kickoff).getTime() <= now) continue;

    // Encontra a leg correspondente ao bookmaker da freebet
    const fbLeg = opp.legs.find(l => slugMatch(l.bookmakerSlug, bookmakerParam));
    if (!fbLeg) continue;

    const fbOutcome = fbLeg.outcome as 'home' | 'draw' | 'away';
    if (!['home','draw','away'].includes(fbOutcome)) continue;

    // Coberturas: as demais legs (agrupadas por outcome — pega melhor odd de cada)
    const coverByOutcome = new Map<string, DGLeg>();
    for (const leg of opp.legs) {
      if (leg.outcome === fbOutcome) continue;
      const existing = coverByOutcome.get(leg.outcome);
      if (!existing || leg.odd > existing.odd) coverByOutcome.set(leg.outcome, leg);
    }

    const covers = Array.from(coverByOutcome.values()).map(leg => ({
      outcome:  leg.outcome as 'home' | 'draw' | 'away',
      slug:     leg.bookmakerSlug,
      name:     leg.bookmaker,
      odd:      leg.odd,
      url:      leg.matchUrl ?? null,
    }));

    const result = computeSNR({
      matchId:    opp.match_id,
      homeName:   opp.home_team,
      awayName:   opp.away_team,
      leagueName: opp.league ?? '',
      startTime:  opp.kickoff,
      fbOutcome,
      fbOdd:  fbLeg.odd,
      fbUrl:  fbLeg.matchUrl ?? null,
      covers,
      source: 'dg',
      dgScore: opp.dg_score,
      dgClass: opp.dg_classification,
    });
    if (result) allResults.push(result);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mescla e deduplica: por match_id, mantém o de maior conversão
  // Prefere fonte 'dg' em caso de empate (dados mais otimizados)
  // ─────────────────────────────────────────────────────────────────────────────
  allResults.sort((a, b) => {
    if (b.conversion_pct !== a.conversion_pct) return b.conversion_pct - a.conversion_pct;
    return a.source === 'dg' ? -1 : 1; // dg wins tie
  });

  const seen = new Set<string>();
  const deduplicated = allResults.filter(r => {
    if (seen.has(r.match_id)) return false;
    seen.add(r.match_id);
    return true;
  });

  return NextResponse.json({
    ok: true,
    bookmaker: bookmakerParam,
    date: today,
    total_events: byMatch.size,
    total_opportunities: deduplicated.length,
    bookmakers_available: Array.from(bookmakerSet.entries()).map(([slug, name]) => ({ slug, name })),
    results: deduplicated,
  });
}
