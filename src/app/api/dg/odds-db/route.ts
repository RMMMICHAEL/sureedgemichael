/**
 * GET /api/dg/odds-db
 *
 * Lê odds da tabela bookmaker_odds (importadas via admin) e devolve
 * o mesmo formato de /api/dg/odds — OddsSummary[] com bookmakers agrupados.
 *
 * Query params:
 *   ?date=YYYY-MM-DD  → filtra por data (padrão: hoje BRT)
 *   ?all=1            → sem filtro de data
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
  league_slug:    string | null;
  league_name:    string | null;
  bookmaker_slug: string;
  bookmaker_name: string | null;
  market_type:    string;
  odd_home:       number;
  odd_draw:       number | null;
  odd_away:       number;
  match_url:      string | null;
  source_url:     string | null;
}

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const showAll   = req.nextUrl.searchParams.get('all')  === '1';
  const dateParam = req.nextUrl.searchParams.get('date') ?? todayBRT();

  // ── Query ────────────────────────────────────────────────────────────────────
  let query = supabase
    .from('bookmaker_odds')
    .select('match_id,home_team,away_team,match_date,start_time,league_slug,league_name,bookmaker_slug,bookmaker_name,market_type,odd_home,odd_draw,odd_away,match_url,source_url')
    .order('start_time', { ascending: true });

  if (!showAll) {
    query = query.eq('match_date', dateParam);
  }

  const { data, error } = await query.returns<DbRow[]>();

  if (error) {
    console.error('[odds-db] erro:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ ok: true, count: 0, odds: [], source: 'db-empty' });
  }

  // ── Agrupar por match_id → OddsSummary[] ────────────────────────────────────
  const matchMap = new Map<string, {
    match_id:    string;
    home_team:   string;
    away_team:   string;
    start_time:  string;
    league_name: string;
    league_id:   number;
    bookmakers:  Array<{
      slug: string; name: string;
      home: number; draw: number; away: number;
      url: string; is_pa: boolean; market_type: string;
    }>;
  }>();

  for (const row of data) {
    if (!matchMap.has(row.match_id)) {
      matchMap.set(row.match_id, {
        match_id:    row.match_id,
        home_team:   row.home_team,
        away_team:   row.away_team,
        start_time:  row.start_time ?? row.match_date ?? '',
        league_name: row.league_name ?? row.league_slug ?? '',
        league_id:   0,
        bookmakers:  [],
      });
    }

    const match = matchMap.get(row.match_id)!;
    const isPA  = row.market_type === '1x2_pa';

    // Evita duplicata do mesmo bookmaker + market_type
    const already = match.bookmakers.find(
      b => b.slug === row.bookmaker_slug && b.market_type === row.market_type
    );
    if (!already) {
      match.bookmakers.push({
        slug:        row.bookmaker_slug,
        name:        row.bookmaker_name ?? row.bookmaker_slug,
        home:        row.odd_home,
        draw:        row.odd_draw ?? 0,
        away:        row.odd_away,
        url:         row.match_url ?? '',
        is_pa:       isPA,
        market_type: row.market_type,
      });
    }
  }

  const odds = Array.from(matchMap.values());

  console.log(`[odds-db] ${odds.length} jogos · ${data.length} linhas · data=${dateParam}`);

  return NextResponse.json({
    ok:     true,
    count:  odds.length,
    source: 'supabase-db',
    odds,
  });
}
