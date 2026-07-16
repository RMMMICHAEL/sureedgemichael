/**
 * GET /api/dg/odds-db
 *
 * Lê odds da tabela bookmaker_odds (importadas via admin) e devolve
 * o mesmo formato de /api/dg/odds — OddsSummary[] com bookmakers agrupados.
 *
 * Query params (GET):
 *   ?date=YYYY-MM-DD  → filtra por data (padrão: hoje BRT)
 *   ?all=1            → sem filtro de data
 *
 * POST /api/dg/odds-db  { ids: string[] }
 *   Fetch por delta — só esses match_id (usado pelo useOdds após um
 *   broadcast, evita rebuscar a tabela inteira). É POST (não query string)
 *   de propósito: até 500 UUIDs na URL passariam de ~18KB, arriscando
 *   estourar limites de tamanho de URL/header de proxies e CDNs.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }   from 'next/server';
import { cookies }                     from 'next/headers';
import { createSupabaseServerClient }  from '@/lib/supabase/server';

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

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
}

const ROW_SELECT = 'match_id,home_team,away_team,match_date,start_time,league_slug,league_name,bookmaker_slug,bookmaker_name,market_type,odd_home,odd_draw,odd_away,match_url';

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

// PostgREST limita a 1000 linhas por resposta por padrão. Com ~8
// bookmakers/mercado por jogo, até uma lista de match_id relativamente
// pequena (150+) já pode passar disso — então TODA busca (full ou por
// ids) precisa paginar, não só a full como antes.
const PAGE_SIZE = 1000;

interface RangeableQuery {
  range(from: number, to: number): RangeableQuery;
  returns<T>(): Promise<{ data: T[] | null; error: { message: string } | null }>;
}

async function fetchAllPages(
  buildQuery: (from: number, to: number) => RangeableQuery,
): Promise<{ rows: DbRow[]; error: string | null }> {
  const rows: DbRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await buildQuery(from, from + PAGE_SIZE - 1).returns<DbRow>();
    if (error) return { rows, error: error.message };
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500; // bem acima do limite de broadcast (300) — headroom de sobra

async function handleDeltaByIds(supabase: SupabaseServerClient, rawIds: unknown) {
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ ok: false, error: '"ids" precisa ser um array' }, { status: 400 });
  }

  // Ids fora do formato UUID são descartados em vez de irem pra query —
  // evita string arbitrária/malformada chegando no `.in()`.
  const ids = [...new Set(
    rawIds.filter((id): id is string => typeof id === 'string').map(s => s.trim()).filter(id => UUID_RE.test(id))
  )];

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, count: 0, odds: [], source: 'db-empty' });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { ok: false, error: `ids demais (${ids.length} > ${MAX_IDS}) — use ?all=1 para um refetch completo` },
      { status: 400 },
    );
  }

  const { rows, error } = await fetchAllPages((from, to) =>
    supabase
      .from('bookmaker_odds')
      .select(ROW_SELECT)
      .in('match_id', ids)
      .range(from, to) as unknown as RangeableQuery
  );

  if (error) {
    console.error('[odds-db][ids] erro:', error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  const odds = groupIntoMatches(rows);
  console.log(`[odds-db][ids] ${odds.length} jogos · ${rows.length} linhas · ids=${ids.length}`);
  return NextResponse.json(
    { ok: true, count: odds.length, source: 'supabase-db-delta', odds },
    { headers: { 'Cache-Control': 'private, no-cache' } },
  );
}

// Fetch por delta — ver comentário no topo do arquivo sobre por que é POST.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  let body: { ids?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  return handleDeltaByIds(supabase, body.ids);
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  // ETag = contagem de linhas + MAX(updated_at). Usar só o MAX(updated_at)
  // não pega DELETEs puros (uma remoção não muda o timestamp das linhas que
  // sobraram) — o cliente ficaria recebendo 304 mesmo depois de um jogo
  // sumir do banco. A contagem muda em qualquer INSERT/DELETE, fechando
  // esse buraco sem precisar de uma coluna de versão dedicada.
  const [{ data: latest }, { count }] = await Promise.all([
    supabase.from('bookmaker_odds').select('updated_at').order('updated_at', { ascending: false }).limit(1).single(),
    supabase.from('bookmaker_odds').select('*', { count: 'exact', head: true }),
  ]);
  const etag         = `"${count ?? 0}-${new Date(latest?.updated_at ?? 0).getTime()}"`;
  const ifNoneMatch  = req.headers.get('if-none-match');
  const cacheHeaders = { 'ETag': etag, 'Cache-Control': 'private, no-cache' };

  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

  const showAll   = req.nextUrl.searchParams.get('all')  === '1';
  const dateParam = req.nextUrl.searchParams.get('date');
  const fromParam = req.nextUrl.searchParams.get('from') ?? todayBRT(); // padrão: a partir de hoje

  // PostgREST limita a 1000 linhas por resposta por padrão — com a tabela hoje
  // passando disso, uma única chamada sem paginação trunca silenciosamente e,
  // como a ordenação é ascendente por data, trunca justo nas linhas mais
  // antigas (jogos já encerrados), fazendo o front achar que não há jogos.
  const { rows: data, error } = await fetchAllPages((from, to) => {
    let query = supabase
      .from('bookmaker_odds')
      .select(ROW_SELECT)
      .order('match_date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(from, to);

    if (!showAll) {
      query = dateParam ? query.eq('match_date', dateParam) : query.gte('match_date', fromParam);
    }
    return query as unknown as RangeableQuery;
  });

  if (error) {
    console.error('[odds-db] erro:', error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
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
