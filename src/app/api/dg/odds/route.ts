/**
 * GET /api/dg/odds
 *
 * Prioridade de fonte:
 *  1. Cache DuploGreen no Supabase (atualizado pelo daemon local dg-poller.mjs)
 *     → 20+ casas: Betano, Bet365, Betfair, Pinnacle, Sportingbet, etc.
 *  2. Altenar (fallback público) → EstrelaBet, Br4bet, EsportivaBet, Jogo de Ouro
 *
 * Query params:
 *   ?champ_id=11318  → filtra por liga (Altenar — ignorado quando DG disponível)
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAllFootballOdds, getOddsByLeague, type OddsSummary } from '@/lib/altenar/client';

const DG_CACHE_TTL_MS = 10 * 60 * 1000; // considera cache fresco por 10 min

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── Lê e transforma dados DuploGreen do Supabase ──────────────────────────────

interface DGOddsRecord {
  // Campos prováveis de get-all-odds — mapeamos o que chegar
  id?:                   string | number;
  match_id?:             string | number;
  home_team?:            string;
  team_home?:            string;
  away_team?:            string;
  team_away?:            string;
  league?:               string;
  league_name?:          string;
  start_time?:           string;
  start_date?:           string;
  date?:                 string;
  best_home?:            number;
  best_home_bookmaker?:  string;
  best_draw?:            number;
  best_draw_bookmaker?:  string;
  best_away?:            number;
  best_away_bookmaker?:  string;
  home_direction?:       string;
  draw_direction?:       string;
  away_direction?:       string;
  bookmaker_count?:      number;
  [key: string]: unknown;
}

interface DGOpportunityRecord {
  match_id?:       string | number;
  event_id?:       string | number;
  bookmaker_slug?: string;
  bookmaker?:      string;
  odd_home?:       number;
  home?:           number;
  odd_draw?:       number;
  draw?:           number;
  odd_away?:       number;
  away?:           number;
  is_best_home?:   boolean;
  is_best_draw?:   boolean;
  is_best_away?:   boolean;
  match_url?:      string;
  url?:            string;
  [key: string]: unknown;
}

function normalizeMatchId(r: DGOddsRecord): string {
  return String(r.id ?? r.match_id ?? '');
}

function normalizeOppMatchId(r: DGOpportunityRecord): string {
  return String(r.match_id ?? r.event_id ?? '');
}

function transformDGData(
  allOddsRaw: unknown,
  opportunitiesRaw: unknown,
): OddsSummary[] {
  // Extrai arrays (API pode retornar array direto ou { data: [...] })
  const allOdds: DGOddsRecord[] = Array.isArray(allOddsRaw)
    ? allOddsRaw
    : (allOddsRaw as { data?: DGOddsRecord[] })?.data ?? [];

  const opportunities: DGOpportunityRecord[] = Array.isArray(opportunitiesRaw)
    ? opportunitiesRaw
    : (opportunitiesRaw as { data?: DGOpportunityRecord[] })?.data ?? [];

  // Agrupa oportunidades por match_id para lookup O(1)
  const oppByMatch = new Map<string, DGOpportunityRecord[]>();
  for (const opp of opportunities) {
    const mid = normalizeOppMatchId(opp);
    if (!mid) continue;
    if (!oppByMatch.has(mid)) oppByMatch.set(mid, []);
    oppByMatch.get(mid)!.push(opp);
  }

  const results: OddsSummary[] = [];

  for (const match of allOdds) {
    const mid       = normalizeMatchId(match);
    const homeTeam  = match.home_team  ?? match.team_home ?? '';
    const awayTeam  = match.away_team  ?? match.team_away ?? '';
    const league    = match.league     ?? match.league_name ?? '';
    const startTime = match.start_time ?? match.start_date ?? match.date ?? '';

    if (!homeTeam && !awayTeam) continue;

    const opps = oppByMatch.get(mid) ?? [];

    // Constrói bookmakers a partir de get-dg-opportunities
    const bookmakers: OddsSummary['bookmakers'] = opps
      .filter(o => {
        const h = o.odd_home ?? o.home ?? 0;
        const a = o.odd_away ?? o.away ?? 0;
        return h > 0 && a > 0;
      })
      .map(o => ({
        slug: o.bookmaker_slug ?? o.bookmaker ?? 'desconhecido',
        name: slugToName(o.bookmaker_slug ?? o.bookmaker ?? ''),
        home: o.odd_home ?? o.home ?? 0,
        draw: o.odd_draw ?? o.draw ?? 0,
        away: o.odd_away ?? o.away ?? 0,
        url:  o.match_url ?? o.url ?? '',
      }));

    // Fallback: se não tem oportunidades detalhadas, usa best_* do get-all-odds
    if (bookmakers.length === 0) {
      const bh = match.best_home ?? 0;
      const bd = match.best_draw ?? 0;
      const ba = match.best_away ?? 0;
      if (bh > 0 || ba > 0) {
        bookmakers.push({
          slug: match.best_home_bookmaker ?? 'dg',
          name: match.best_home_bookmaker ?? 'DuploGreen',
          home: bh,
          draw: bd,
          away: ba,
          url:  '',
        });
      }
    }

    if (bookmakers.length === 0) continue;

    results.push({
      match_id:    mid || `dg-${results.length}`,
      home_team:   homeTeam,
      away_team:   awayTeam,
      start_time:  startTime,
      league_name: league,
      league_id:   0,
      bookmakers,
    });
  }

  return results;
}

// Converte slug → nome amigável
function slugToName(slug: string): string {
  const MAP: Record<string, string> = {
    betano:        'Betano',
    bet365:        'Bet365',
    betfair:       'Betfair',
    pinnacle:      'Pinnacle',
    sportingbet:   'Sportingbet',
    superbet:      'Superbet',
    novibet:       'Novibet',
    meridianbet:   'Meridianbet',
    pixbet:        'Pixbet',
    estrelabet:    'EstrelaBet',
    br4bet:        'Br4.bet',
    esportivabet:  'EsportivaBet',
    jogodeouro:    'Jogo de Ouro',
    betnacional:   'Betnacional',
    betpix365:     'BetPix365',
    vaidebet:      'VaideBet',
    apostaganha:   'ApostaGanha',
    blaze:         'Blaze',
    f12:           'F12.bet',
    kto:           'KTO',
    leon:          'Leon',
    bwin:          'Bwin',
    '1xbet':       '1xBet',
    betano_br:     'Betano',
  };
  return MAP[slug.toLowerCase()] ?? slug;
}

// ── Tenta carregar DG do Supabase ─────────────────────────────────────────────

async function loadDGFromSupabase(): Promise<{ odds: OddsSummary[]; age: number } | null> {
  try {
    const sb = await getSupabaseAdmin();

    const [allRow, oppRow] = await Promise.all([
      sb.from('app_config').select('value, updated_at').eq('key', 'dg_all_odds').single(),
      sb.from('app_config').select('value').eq('key', 'dg_opportunities').single(),
    ]);

    if (!allRow.data?.value) return null;

    const age = Date.now() - new Date(allRow.data.updated_at).getTime();
    if (age > DG_CACHE_TTL_MS) return null; // cache expirado

    const allOddsRaw      = JSON.parse(allRow.data.value);
    const opportunitiesRaw = oppRow.data?.value ? JSON.parse(oppRow.data.value) : [];

    const odds = transformDGData(allOddsRaw, opportunitiesRaw);
    return odds.length > 0 ? { odds, age } : null;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const champId = req.nextUrl.searchParams.get('champ_id');

  // 1. Tenta DuploGreen (cache do daemon local)
  const dgData = await loadDGFromSupabase();
  if (dgData) {
    const ageMin = Math.round(dgData.age / 60000);
    return NextResponse.json({
      ok:        true,
      count:     dgData.odds.length,
      source:    'duplogreenengine',
      cache_age: ageMin,
      odds:      dgData.odds,
    });
  }

  // 2. Fallback: Altenar
  try {
    const odds = champId
      ? await getOddsByLeague(Number(champId))
      : await getAllFootballOdds();

    return NextResponse.json({
      ok:     true,
      count:  odds.length,
      source: 'altenar',
      odds,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[dg/odds] altenar fallback falhou:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
