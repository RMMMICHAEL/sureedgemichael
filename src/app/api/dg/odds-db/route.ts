/**
 * GET /api/dg/odds-db
 *
 * Lê odds da tabela bookmaker_odds (importadas via admin) e devolve
 * o mesmo formato de /api/dg/odds — OddsSummary[] com bookmakers agrupados.
 *
 * Query params:
 *   ?date=YYYY-MM-DD  → filtra por data (padrão: hoje BRT)
 *   ?all=1            → sem filtro de data
 *   ?ids=a,b,c        → só esses match_id (fetch por delta, usado pelo useOdds
 *                        após um broadcast — evita rebuscar a tabela inteira)
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

interface OddsSummaryOut {
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
}

// ── Agrupar linhas de bookmaker_odds por match_id → OddsSummary[] ────────────
function groupIntoMatches(data: DbRow[]): OddsSummaryOut[] {
  const matchMap = new Map<string, OddsSummaryOut>();

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

    // Mantém AMBAS as entradas (1x2 e 1x2_pa) por bookmaker.
    // 1x2_pa = mercado PA (odds menores, pagamento antecipado)
    // 1x2    = mercado regular (odds maiores, sem restrição de PA)
    // Dedup apenas dentro do mesmo slug + market_type para evitar duplicatas brutas.
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

  return Array.from(matchMap.values());
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  // ── Fetch por delta (?ids=a,b,c) ────────────────────────────────────────────
  // Usado após um broadcast de sync para buscar só os matches que mudaram, em
  // vez do refetch da tabela inteira — sem ETag aqui, o payload já é pequeno
  // por natureza (poucos match_id) e o chamador sempre quer os dados atuais.
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (idsParam) {
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, count: 0, odds: [], source: 'db-empty' });
    }

    const { data: rows, error } = await supabase
      .from('bookmaker_odds')
      .select('match_id,home_team,away_team,match_date,start_time,league_slug,league_name,bookmaker_slug,bookmaker_name,market_type,odd_home,odd_draw,odd_away,match_url,source_url')
      .in('match_id', ids)
      .returns<DbRow[]>();

    if (error) {
      console.error('[odds-db][ids] erro:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const odds = groupIntoMatches(rows ?? []);
    console.log(`[odds-db][ids] ${odds.length} jogos · ${(rows ?? []).length} linhas · ids=${ids.length}`);
    return NextResponse.json(
      { ok: true, count: odds.length, source: 'supabase-db-delta', odds },
      { headers: { 'Cache-Control': 'private, no-cache' } },
    );
  }

  // ETag baseado no MAX(updated_at) — evita retornar o payload inteiro quando nada mudou.
  // Um 304 tem 0 bytes no body, reduzindo bandwidth ~99% nas chamadas repetidas.
  const { data: latest } = await supabase
    .from('bookmaker_odds')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  const etag         = `"${new Date(latest?.updated_at ?? 0).getTime()}"`;
  const ifNoneMatch  = req.headers.get('if-none-match');
  const cacheHeaders = { 'ETag': etag, 'Cache-Control': 'private, no-cache' };

  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

  const showAll   = req.nextUrl.searchParams.get('all')  === '1';
  const dateParam = req.nextUrl.searchParams.get('date');
  const fromParam = req.nextUrl.searchParams.get('from') ?? todayBRT(); // padrão: a partir de hoje

  // ── Query ────────────────────────────────────────────────────────────────────
  // PostgREST limita a 1000 linhas por resposta por padrão — com a tabela hoje
  // passando disso, uma única chamada sem paginação trunca silenciosamente e,
  // como a ordenação é ascendente por data, trunca justo nas linhas mais
  // antigas (jogos já encerrados), fazendo o front achar que não há jogos.
  // Pagina em blocos de 1000 até esgotar o resultado.
  const PAGE_SIZE = 1000;
  const data: DbRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('bookmaker_odds')
      .select('match_id,home_team,away_team,match_date,start_time,league_slug,league_name,bookmaker_slug,bookmaker_name,market_type,odd_home,odd_draw,odd_away,match_url,source_url')
      .order('match_date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (!showAll) {
      if (dateParam) {
        // data exata
        query = query.eq('match_date', dateParam);
      } else {
        // padrão: a partir de hoje (inclui hoje + futuros)
        query = query.gte('match_date', fromParam);
      }
    }

    const { data: page, error } = await query.returns<DbRow[]>();

    if (error) {
      console.error('[odds-db] erro:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!page || page.length === 0) break;
    data.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (data.length === 0) {
    return NextResponse.json({ ok: true, count: 0, odds: [], source: 'db-empty' });
  }

  const odds = groupIntoMatches(data);

  console.log(`[odds-db] ${odds.length} jogos · ${data.length} linhas · data=${dateParam}`);

  return NextResponse.json(
    { ok: true, count: odds.length, source: 'supabase-db', odds },
    { headers: cacheHeaders },
  );
}
