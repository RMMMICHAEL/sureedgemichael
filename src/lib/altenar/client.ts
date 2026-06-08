/**
 * Cliente Altenar — API pública, sem autenticação, sem Cloudflare.
 * Todas as casas abaixo compartilham o mesmo servidor Altenar.
 *
 * Estrutura da resposta GetEvents:
 *  - events[]       → metadados do jogo (id, champId, startDate, competitorIds[], marketIds[])
 *  - competitors[]  → id → nome do time
 *  - markets[]      → id, typeId (1 = 1X2), oddIds[]
 *  - odds[]         → id, price (decimal)
 *  - champs[]       → id, name (nome da liga) — top-level
 */

const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget';

const INTEGRATIONS: Record<string, string> = {
  // ── Confirmadas via GetSportMenu ──────────────────────────────────────────
  estrelabet:   'EstrelaBet',
  br4bet:       'Br4.bet',
  esportivabet: 'EsportivaBet',
  jogodeouro:   'Jogo de Ouro',
  vaidebet:     'VaideBet',
  sortenabet:   'SortenasBet',
  lotogreen:    'LotoGreen',
  betpix365:    'BetPix365',
  f12:          'F12.bet',
  vupi:         'VupiBet',
};

const DEFAULT_PARAMS = {
  culture:        'pt-BR',
  timezoneOffset: '180',
  deviceType:     '1',
  numFormat:      'en-GB',
  countryCode:    'BR',
};

export interface OddsSummary {
  match_id:    string;
  home_team:   string;
  away_team:   string;
  start_time:  string;
  league_name: string;
  league_id:   number;
  bookmakers:  BookmakerOdds[];
}

export interface BookmakerOdds {
  slug:  string;
  name:  string;
  home:  number;
  draw:  number;
  away:  number;
  url:   string;
  /** true = Pagamento Antecipado (PA); false = pagamento normal pós-jogo */
  is_pa: boolean;
}

// ── Raw API types ─────────────────────────────────────────────────────────────

interface RawEvent {
  id:            number;
  champId:       number;
  sportId:       number;
  startDate:     string;
  competitorIds: number[];
  marketIds:     number[];
}

interface RawChamp {
  id:   number;
  name: string;
}

interface RawCompetitor {
  id:   number;
  name: string;
}

interface RawMarket {
  id:     number;
  typeId: number; // 1 = Vencedor do encontro (1X2)
  oddIds: number[];
}

interface RawOdd {
  id:    number;
  price: number;
}

interface ParsedEvent {
  id:         number;
  champId:    number;
  champName:  string;
  startDate:  string;
  team1Name:  string;
  team2Name:  string;
  odds1:      number;
  oddsX:      number;
  odds2:      number;
}

interface AltenarEventsResponse {
  events:      RawEvent[];
  competitors: RawCompetitor[];
  markets:     RawMarket[];
  odds:        RawOdd[];
  champs:      RawChamp[];
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Busca eventos Altenar e resolve nomes de times + odds 1X2.
 * sportId=66 retorna todos os jogos de futebol de uma vez.
 * champIds filtra por liga específica.
 */
async function fetchAndParseEvents(
  integration: string,
  opts: { sportId?: number; champIds?: number[] } = {},
): Promise<ParsedEvent[]> {
  const params = new URLSearchParams({
    ...DEFAULT_PARAMS,
    integration,
    eventCount: '0',
    sportId:    String(opts.sportId ?? 0),
    ...(opts.champIds?.length ? { champIds: opts.champIds.join(',') } : {}),
  });

  const res = await fetch(`${BASE}/GetEvents?${params}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) return [];

  const data: AltenarEventsResponse = await res.json();

  const competitorMap = new Map<number, string>(
    (data.competitors ?? []).map(c => [c.id, c.name])
  );
  const oddsMap = new Map<number, number>(
    (data.odds ?? []).map(o => [o.id, o.price])
  );
  const marketMap = new Map<number, RawMarket>(
    (data.markets ?? []).map(m => [m.id, m])
  );
  const champMap = new Map<number, string>(
    (data.champs ?? []).map(c => [c.id, c.name])
  );

  const result: ParsedEvent[] = [];

  for (const ev of data.events ?? []) {
    const team1Name = competitorMap.get(ev.competitorIds?.[0]) ?? '';
    const team2Name = competitorMap.get(ev.competitorIds?.[1]) ?? '';
    if (!team1Name || !team2Name) continue;

    let odds1 = 0, oddsX = 0, odds2 = 0;
    for (const mId of ev.marketIds ?? []) {
      const m = marketMap.get(mId);
      if (!m || m.typeId !== 1) continue;
      odds1 = oddsMap.get(m.oddIds[0]) ?? 0;
      oddsX = oddsMap.get(m.oddIds[1]) ?? 0;
      odds2 = oddsMap.get(m.oddIds[2]) ?? 0;
      break;
    }

    if (odds1 <= 1 || odds2 <= 1) continue;

    result.push({
      id:        ev.id,
      champId:   ev.champId,
      champName: champMap.get(ev.champId) ?? '',
      startDate: ev.startDate,
      team1Name,
      team2Name,
      odds1,
      oddsX,
      odds2,
    });
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Odds comparadas de todas as casas Altenar para uma liga específica.
 */
export async function getOddsByLeague(champId: number): Promise<OddsSummary[]> {
  const integrations = Object.keys(INTEGRATIONS);

  const results = await Promise.all(
    integrations.map(intg => fetchAndParseEvents(intg, { champIds: [champId] }))
  );

  return buildOddsSummary(integrations, results);
}

/**
 * Todos os jogos de futebol de todas as casas Altenar.
 * Faz 4 chamadas em paralelo (uma por integração) com sportId=66.
 */
export async function getAllFootballOdds(): Promise<OddsSummary[]> {
  const integrations = Object.keys(INTEGRATIONS);

  const results = await Promise.all(
    integrations.map(intg => fetchAndParseEvents(intg, { sportId: 66 }))
  );

  return buildOddsSummary(integrations, results);
}

function buildOddsSummary(
  integrations: string[],
  results: ParsedEvent[][],
): OddsSummary[] {
  const eventMap = new Map<number, OddsSummary>();

  for (let i = 0; i < integrations.length; i++) {
    const intg   = integrations[i];
    const name   = INTEGRATIONS[intg];
    const events = results[i];

    for (const ev of events) {
      if (!eventMap.has(ev.id)) {
        eventMap.set(ev.id, {
          match_id:    String(ev.id),
          home_team:   ev.team1Name,
          away_team:   ev.team2Name,
          start_time:  ev.startDate,
          league_name: ev.champName,
          league_id:   ev.champId,
          bookmakers:  [],
        });
      }

      const baseUrl = intg === 'br4bet'
        ? `https://br4.bet.br/sports/futebol/e-${ev.id}`
        : `https://${intg}.bet.br/sports/futebol/e-${ev.id}`;

      eventMap.get(ev.id)!.bookmakers.push({
        slug:  intg,
        name,
        home:  ev.odds1,
        draw:  ev.oddsX,
        away:  ev.odds2,
        url:   baseUrl,
        is_pa: true, // todas as casas Altenar operam com Pagamento Antecipado
      });
    }
  }

  return Array.from(eventMap.values()).filter(e => e.bookmakers.length > 0);
}

export { INTEGRATIONS };
