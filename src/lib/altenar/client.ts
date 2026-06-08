/**
 * Cliente Altenar — API pública, sem autenticação, sem Cloudflare.
 * Cobre: EstrelaBet, Br4bet, EsportivaBet, Jogo de Ouro (mesmo servidor).
 */

const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget';

const INTEGRATIONS: Record<string, string> = {
  estrelabet:   'EstrelaBet',
  br4bet:       'Br4.bet',
  esportivabet: 'EsportivaBet',
  jogodeouro:   'Jogo de Ouro',
};

const DEFAULT_PARAMS = {
  culture:      'pt-BR',
  timezoneOffset: '180',
  deviceType:   '1',
  numFormat:    'en-GB',
  countryCode:  'BR',
};

export interface AltenarEvent {
  id:         number;
  name:       string;
  team1Name:  string;
  team2Name:  string;
  startDate:  string; // ISO
  champId:    number;
  champName:  string;
  sportId:    number;
}

export interface AltenarMarket {
  name: string;
  selections: Array<{ name: string; odds: number }>;
}

export interface AltenarEventDetail extends AltenarEvent {
  markets: AltenarMarket[];
}

export interface OddsSummary {
  match_id:    string; // "champId-id"
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

/** Busca eventos de um campeonato específico (ou todos com sportId=66 futebol) */
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
    next: { revalidate: 60 }, // cache 60s no Next.js
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data?.events ?? [];
}

/** Busca detalhes de um evento (mercados + odds) */
async function fetchEventDetail(integration: string, eventId: number): Promise<AltenarEventDetail | null> {
  const params = new URLSearchParams({
    ...DEFAULT_PARAMS,
    integration,
    eventId: String(eventId),
  });

  const res = await fetch(`${BASE}/GetEventDetails?${params}&showNonBoosts`, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 30 },
  });

  if (!res.ok) return null;
  const data = await res.json();
  const ev   = data?.event;
  if (!ev) return null;

  const markets: AltenarMarket[] = (data.markets ?? []).map((m: { name: string; selections: Array<{ name: string; price: number }> }) => ({
    name:       m.name,
    selections: (m.selections ?? []).map((s: { name: string; price: number }) => ({
      name: s.name,
      odds: s.price,
    })),
  }));

  return { ...ev, markets };
}

/** Menu completo de esportes — retorna todas as ligas com contagem de eventos */
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

export interface SportLeague {
  champId:    number;
  champName:  string;
  sportId:    number;
  sportName:  string;
  eventCount: number;
}

/**
 * Retorna odds comparadas de todas as casas Altenar para um campeonato.
 * Uma chamada por casa, em paralelo.
 */
export async function getOddsByLeague(champId: number): Promise<OddsSummary[]> {
  const integrations = Object.keys(INTEGRATIONS);

  // Busca eventos de todas as casas em paralelo
  const results = await Promise.all(
    integrations.map(intg => fetchEvents(intg, [champId]))
  );

  // Indexa eventos por id
  const eventMap = new Map<number, OddsSummary>();

  for (let i = 0; i < integrations.length; i++) {
    const intg   = integrations[i];
    const name   = INTEGRATIONS[intg];
    const events = results[i];

    for (const ev of events) {
      const key = ev.id;

      if (!eventMap.has(key)) {
        eventMap.set(key, {
          match_id:    String(ev.id),
          home_team:   ev.team1Name,
          away_team:   ev.team2Name,
          start_time:  ev.startDate,
          league_name: ev.champName,
          league_id:   ev.champId,
          bookmakers:  [],
        });
      }

      // Extrai odds 1x2 do evento (campo markets não vem no GetEvents — só home/draw/away direto)
      const home = (ev as unknown as Record<string, number>).odds1 ?? 0;
      const draw = (ev as unknown as Record<string, number>).oddsX ?? 0;
      const away = (ev as unknown as Record<string, number>).odds2 ?? 0;

      if (home > 0 && away > 0) {
        eventMap.get(key)!.bookmakers.push({
          slug: intg,
          name,
          home,
          draw,
          away,
          url: `https://${intg === 'br4bet' ? 'br4.bet.br' : intg + '.bet.br'}/sports/futebol/e-${ev.id}`,
        });
      }
    }
  }

  return Array.from(eventMap.values()).filter(e => e.bookmakers.length > 0);
}

/**
 * Retorna todas as odds de futebol (Brasileirão A, Copa do Brasil, Libertadores etc.)
 * usando o sport menu para descobrir quais ligas têm eventos.
 */
export async function getAllFootballOdds(): Promise<OddsSummary[]> {
  // Sport menu tem as ligas com eventos — usa estrelabet como referência
  const leagues = await fetchSportMenu('estrelabet');
  const football = leagues.filter(l => l.sportId === 66).slice(0, 15); // top 15 ligas

  // Busca em paralelo (limita a 5 simultâneas para não sobrecarregar)
  const chunks: SportLeague[][] = [];
  for (let i = 0; i < football.length; i += 5) {
    chunks.push(football.slice(i, i + 5));
  }

  const all: OddsSummary[] = [];
  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(l => getOddsByLeague(l.champId)));
    results.forEach(r => all.push(...r));
  }

  // Remove duplicatas por match_id
  const seen = new Set<string>();
  return all.filter(e => {
    if (seen.has(e.match_id)) return false;
    seen.add(e.match_id);
    return true;
  });
}

export { fetchEventDetail, INTEGRATIONS };
