/**
 * Cliente Altenar — API pública, sem autenticação, sem Cloudflare.
 * Cobre: EstrelaBet, Br4bet, EsportivaBet, Jogo de Ouro (mesmo servidor).
 *
 * Estrutura da resposta GetEvents:
 *  - events[]     → metadados do jogo (id, champId, startDate, competitorIds[], marketIds[])
 *  - competitors[] → id → nome do time
 *  - markets[]    → id, typeId (1 = 1X2), oddIds[]
 *  - odds[]       → id, price (decimal)
 */

const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget';

const INTEGRATIONS: Record<string, string> = {
  estrelabet:   'EstrelaBet',
  br4bet:       'Br4.bet',
  esportivabet: 'EsportivaBet',
  jogodeouro:   'Jogo de Ouro',
};

const DEFAULT_PARAMS = {
  culture:        'pt-BR',
  timezoneOffset: '180',
  deviceType:     '1',
  numFormat:      'en-GB',
  countryCode:    'BR',
};

export interface AltenarEvent {
  id:         number;
  team1Name:  string;
  team2Name:  string;
  startDate:  string; // ISO
  champId:    number;
  champName:  string;
  sportId:    number;
  odds1:      number; // home
  oddsX:      number; // draw
  odds2:      number; // away
}

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
}

export interface SportLeague {
  champId:    number;
  champName:  string;
  sportId:    number;
  sportName:  string;
  eventCount: number;
}

// ── Raw API types ─────────────────────────────────────────────────────────────

interface RawEvent {
  id:            number;
  champId:       number;
  champName:     string;
  sportId:       number;
  startDate:     string;
  competitorIds: number[];
  marketIds:     number[];
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

interface AltenarEventsResponse {
  events:      RawEvent[];
  competitors: RawCompetitor[];
  markets:     RawMarket[];
  odds:        RawOdd[];
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchEvents(integration: string, champIds?: number[]): Promise<AltenarEvent[]> {
  const params = new URLSearchParams({
    ...DEFAULT_PARAMS,
    integration,
    eventCount: '0',
    sportId:    '0',
    ...(champIds?.length ? { champIds: champIds.join(',') } : {}),
  });

  const res = await fetch(`${BASE}/GetEvents?${params}`, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 60 },
  });

  if (!res.ok) return [];

  const data: AltenarEventsResponse = await res.json();

  // Build lookup maps
  const competitorMap = new Map<number, string>(
    (data.competitors ?? []).map(c => [c.id, c.name])
  );

  const oddsMap = new Map<number, number>(
    (data.odds ?? []).map(o => [o.id, o.price])
  );

  // Index markets by id for O(1) lookup
  const marketMap = new Map<number, RawMarket>(
    (data.markets ?? []).map(m => [m.id, m])
  );

  const result: AltenarEvent[] = [];

  for (const ev of data.events ?? []) {
    const team1Name = competitorMap.get(ev.competitorIds?.[0]) ?? '';
    const team2Name = competitorMap.get(ev.competitorIds?.[1]) ?? '';

    if (!team1Name || !team2Name) continue;

    // Find 1X2 market (typeId = 1)
    let odds1 = 0, oddsX = 0, odds2 = 0;
    for (const mId of ev.marketIds ?? []) {
      const market = marketMap.get(mId);
      if (!market || market.typeId !== 1) continue;
      odds1 = oddsMap.get(market.oddIds[0]) ?? 0;
      oddsX = oddsMap.get(market.oddIds[1]) ?? 0;
      odds2 = oddsMap.get(market.oddIds[2]) ?? 0;
      break;
    }

    if (odds1 <= 1 || odds2 <= 1) continue; // skip suspended/no odds

    result.push({
      id: ev.id,
      team1Name,
      team2Name,
      startDate:  ev.startDate,
      champId:    ev.champId,
      champName:  ev.champName,
      sportId:    ev.sportId,
      odds1,
      oddsX,
      odds2,
    });
  }

  return result;
}

// ── Sport menu ────────────────────────────────────────────────────────────────

export async function fetchSportMenu(integration = 'estrelabet'): Promise<SportLeague[]> {
  const params = new URLSearchParams({ ...DEFAULT_PARAMS, integration, period: '0' });
  const res = await fetch(`${BASE}/GetSportMenu?${params}`, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const data = await res.json();

  const leagues: SportLeague[] = [];
  for (const sport of data?.sports ?? []) {
    for (const champ of sport?.champs ?? []) {
      if ((champ.eventCount ?? 0) > 0) {
        leagues.push({
          champId:    champ.id,
          champName:  champ.name,
          sportId:    sport.id,
          sportName:  sport.name,
          eventCount: champ.eventCount,
        });
      }
    }
  }
  return leagues;
}

// ── Odds by league ────────────────────────────────────────────────────────────

export async function getOddsByLeague(champId: number): Promise<OddsSummary[]> {
  const integrations = Object.keys(INTEGRATIONS);

  const results = await Promise.all(
    integrations.map(intg => fetchEvents(intg, [champId]))
  );

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
        slug: intg,
        name,
        home: ev.odds1,
        draw: ev.oddsX,
        away: ev.odds2,
        url:  baseUrl,
      });
    }
  }

  return Array.from(eventMap.values()).filter(e => e.bookmakers.length > 0);
}

// ── All football odds ─────────────────────────────────────────────────────────

export async function getAllFootballOdds(): Promise<OddsSummary[]> {
  const leagues  = await fetchSportMenu('estrelabet');
  const football = leagues.filter(l => l.sportId === 66).slice(0, 15);

  // Fetch in chunks of 5 to avoid overwhelming the API
  const all: OddsSummary[] = [];
  for (let i = 0; i < football.length; i += 5) {
    const chunk   = football.slice(i, i + 5);
    const results = await Promise.all(chunk.map(l => getOddsByLeague(l.champId)));
    results.forEach(r => all.push(...r));
  }

  // Deduplicate by match_id
  const seen = new Set<string>();
  return all.filter(e => {
    if (seen.has(e.match_id)) return false;
    seen.add(e.match_id);
    return true;
  });
}

export { fetchEvents, INTEGRATIONS };
