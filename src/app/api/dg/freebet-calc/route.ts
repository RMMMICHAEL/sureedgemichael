/**
 * GET /api/dg/freebet-calc
 *
 * Calcula as melhores oportunidades de conversão de freebet
 * usando as odds já importadas na tabela bookmaker_odds.
 *
 * Query params:
 *   ?bookmaker=slug     → slug da casa onde está a freebet (obrigatório)
 *   ?amount=100         → valor da freebet (apenas para referência; cálculo é em %)
 *   ?market=1x2         → 1x2 ou 1x2_pa (padrão: ambos)
 *
 * Retorno:
 *   { ok, bookmaker, results: FreebetOpportunity[] }
 *
 * Fórmula SNR (Stake Não Retornada):
 *   Freebet F no outcome HOME com odd O_h:
 *   → cover_draw_stake  = F × (O_h − 1) / O_d
 *   → cover_away_stake  = F × (O_h − 1) / O_a
 *   → guaranteed_profit = F × (O_h − 1) × (1 − 1/O_d − 1/O_a)
 *   → conversion_pct    = guaranteed_profit / F × 100
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }   from 'next/server';
import { cookies }                     from 'next/headers';
import { createSupabaseServerClient }  from '@/lib/supabase/server';

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

export interface FreebetOpportunity {
  match_id:        string;
  home_team:       string;
  away_team:       string;
  league_name:     string;
  start_time:      string | null;
  /** Outcome onde vai a freebet: 'home' | 'draw' | 'away' */
  freebet_outcome: 'home' | 'draw' | 'away';
  freebet_odd:     number;
  freebet_url:     string | null;
  /** As 2 coberturas necessárias */
  covers: {
    outcome:        'home' | 'draw' | 'away';
    bookmaker_slug: string;
    bookmaker_name: string;
    odd:            number;
    /** Stake por R$100 de freebet */
    stake_per_100:  number;
    is_pa:          boolean;
    url:            string | null;
  }[];
  /** % de conversão garantida (por R$100 de freebet) */
  conversion_pct:    number;
  /** Lucro garantido por R$100 de freebet */
  profit_per_100:    number;
  /** Custo total de cobertura por R$100 de freebet */
  cover_cost_per_100: number;
}

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

const PA_SET = new Set([
  'estrelabet','br4bet','esportivabet','jogodeouro','vaidebet',
  'sortenabet','lotogreen','betpix365','f12','vupibet','vupibr',
  'bet7k','esportesdasorte','apostabet','brasilbet','superbet',
]);
function isPa(slug: string): boolean {
  const n = slug.toLowerCase().replace(/[\s\-_.]/g,'');
  for (const pa of PA_SET) {
    if (n === pa || n.startsWith(pa.slice(0,5)) || pa.startsWith(n.slice(0,5))) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bookmakerParam = searchParams.get('bookmaker');

  if (!bookmakerParam) {
    return NextResponse.json({ ok: false, error: 'Parâmetro bookmaker obrigatório' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);

  const today = todayBRT();

  // Busca TODOS os registros de hoje de uma vez
  const { data, error } = await supabase
    .from('bookmaker_odds')
    .select(`
      match_id, home_team, away_team, match_date, start_time,
      league_name, bookmaker_slug, bookmaker_name, market_type,
      odd_home, odd_draw, odd_away, match_url
    `)
    .eq('match_date', today)
    .order('start_time', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as DbRow[];

  // Agrupa por match_id
  const byMatch = new Map<string, DbRow[]>();
  for (const row of rows) {
    if (!byMatch.has(row.match_id)) byMatch.set(row.match_id, []);
    byMatch.get(row.match_id)!.push(row);
  }

  const now = Date.now();
  const results: FreebetOpportunity[] = [];

  for (const [matchId, matchRows] of byMatch) {
    // Só eventos futuros
    const meta = matchRows[0];
    if (meta.start_time && new Date(meta.start_time).getTime() <= now) continue;

    // Acha os registros da casa da freebet (case-insensitive slug)
    const fbSlug = bookmakerParam.toLowerCase().replace(/[\s\-_.]/g,'');
    const fbRows = matchRows.filter(r => {
      const s = r.bookmaker_slug.toLowerCase().replace(/[\s\-_.]/g,'');
      return s === fbSlug || s.startsWith(fbSlug.slice(0,5)) || fbSlug.startsWith(s.slice(0,5));
    });

    if (!fbRows.length) continue;

    // Pega melhor odd da casa da freebet para cada outcome
    const fbHome = Math.max(...fbRows.map(r => r.odd_home ?? 0).filter(v => v > 1), 0);
    const fbDraw = Math.max(...fbRows.map(r => r.odd_draw ?? 0).filter(v => v > 1), 0);
    const fbAway = Math.max(...fbRows.map(r => r.odd_away ?? 0).filter(v => v > 1), 0);
    const fbUrl  = fbRows.find(r => r.match_url)?.match_url ?? null;

    // Odds de cobertura: apenas outras casas
    const coverRows = matchRows.filter(r => {
      const s = r.bookmaker_slug.toLowerCase().replace(/[\s\-_.]/g,'');
      return !(s === fbSlug || s.startsWith(fbSlug.slice(0,5)) || fbSlug.startsWith(s.slice(0,5)));
    });

    // Para cada outcome como freebet, calcula melhor cobertura dos outros 2
    const outcomes: { key: 'home'|'draw'|'away'; fbOdd: number }[] = [
      { key: 'home', fbOdd: fbHome },
      { key: 'draw', fbOdd: fbDraw },
      { key: 'away', fbOdd: fbAway },
    ];

    for (const { key: fbOutcome, fbOdd } of outcomes) {
      if (fbOdd <= 1) continue;

      // Os 2 outcomes que precisam de cobertura
      const coverOutcomes = (['home','draw','away'] as const).filter(o => o !== fbOutcome);

      // Melhor bookmaker para cada outcome de cobertura
      const bestCovers = coverOutcomes.map(co => {
        const colKey = co === 'home' ? 'odd_home' : co === 'draw' ? 'odd_draw' : 'odd_away';
        let bestOdd = 0;
        let bestRow: DbRow | null = null;
        for (const r of coverRows) {
          const v = (r[colKey] as number | null) ?? 0;
          if (v > bestOdd) { bestOdd = v; bestRow = r; }
        }
        return { outcome: co, odd: bestOdd, row: bestRow };
      });

      // Todos os covers precisam ter odd > 1
      if (bestCovers.some(c => c.odd <= 1)) continue;

      const [c1, c2] = bestCovers;

      // SNR: stake por R$100 de freebet
      // cover1_stake = 100 × (fbOdd − 1) / c1.odd
      // cover2_stake = 100 × (fbOdd − 1) / c2.odd
      const F = 100;
      const profit_fb = F * (fbOdd - 1); // se a freebet ganhar
      const s1 = profit_fb / c1.odd;
      const s2 = profit_fb / c2.odd;
      const profit = profit_fb - s1 - s2;
      const conversion_pct = (profit / F) * 100;

      // Só inclui se conversão > 0%
      if (conversion_pct <= 0) continue;

      results.push({
        match_id:        matchId,
        home_team:       meta.home_team,
        away_team:       meta.away_team,
        league_name:     meta.league_name ?? '',
        start_time:      meta.start_time,
        freebet_outcome: fbOutcome,
        freebet_odd:     fbOdd,
        freebet_url:     fbUrl,
        covers: bestCovers.map((c, i) => ({
          outcome:        c.outcome,
          bookmaker_slug: c.row!.bookmaker_slug,
          bookmaker_name: c.row!.bookmaker_name ?? c.row!.bookmaker_slug,
          odd:            c.odd,
          stake_per_100:  i === 0 ? s1 : s2,
          is_pa:          isPa(c.row!.bookmaker_slug),
          url:            c.row!.match_url ?? null,
        })),
        conversion_pct,
        profit_per_100:     profit,
        cover_cost_per_100: s1 + s2,
      });
    }
  }

  // Ordena por conversão decrescente — melhor no topo
  results.sort((a, b) => b.conversion_pct - a.conversion_pct);

  // Deduplica: para o mesmo jogo, mantém só o melhor outcome
  const seen = new Set<string>();
  const deduplicated = results.filter(r => {
    if (seen.has(r.match_id)) return false;
    seen.add(r.match_id);
    return true;
  });

  // Lista de bookmakers disponíveis no banco hoje
  const bookmakerSet = new Map<string, string>();
  for (const r of rows) {
    if (!bookmakerSet.has(r.bookmaker_slug)) {
      bookmakerSet.set(r.bookmaker_slug, r.bookmaker_name ?? r.bookmaker_slug);
    }
  }

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
