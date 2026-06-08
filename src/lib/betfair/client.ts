/**
 * Cliente Betfair Brasil — BFF GraphQL API.
 * Betfair opera com Pagamento Antecipado (PA).
 *
 * A Betfair Brasil usa a plataforma Flutter e expõe um endpoint GraphQL
 * para buscar eventos de futebol pré-jogo com mercado Resultado Final (1X2).
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE    = 'https://www.betfair.bet.br';
const HEADERS = {
  'Content-Type': 'application/json',
  'Accept':       'application/json',
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':       BASE,
  'Referer':      BASE + '/',
};

// Betfair usa sistema de eventos via API pública (REST)
const SPORT_ID    = 'sr:sport:1';  // futebol BetradarID
const MARKET_TYPE = 'MATCH_ODDS';

interface BetfairSelection {
  id:          string;
  name:        string;
  price:       number;
  status:      string;
}

interface BetfairMarket {
  id:         string;
  name:       string;
  type:       string;
  status:     string;
  selections: BetfairSelection[];
}

interface BetfairEvent {
  id:          string;
  name:        string;
  startTime:   string;
  competition?: { id: string; name: string };
  markets:     BetfairMarket[];
}

interface BetfairResponse {
  events?: BetfairEvent[];
  data?: { events?: BetfairEvent[] };
}

// Endpoints conhecidos do Flutter/Betfair BR
const ENDPOINTS = [
  '/api/sports/football/events',
  '/api/v1/sports/football/events',
  '/api/bff/sports/football',
  '/betfair-gql/events',
];

async function tryFetchEvents(): Promise<BetfairEvent[]> {
  for (const path of ENDPOINTS) {
    try {
      const res = await fetch(`${BASE}${path}?sportId=1&market=${MARKET_TYPE}&inPlay=false`, {
        headers: HEADERS,
        cache:   'no-store',
      });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      const json: BetfairResponse = await res.json();
      const evs = json.events ?? json.data?.events;
      if (Array.isArray(evs) && evs.length > 0) return evs;
    } catch { /* tenta o próximo */ }
  }
  return [];
}

function toSlug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function getBetfairOdds(): Promise<OddsSummary[]> {
  const events = await tryFetchEvents();
  const results: OddsSummary[] = [];

  for (const ev of events) {
    const mkt = (ev.markets ?? []).find(m =>
      m.type === MARKET_TYPE && m.status === 'OPEN' && m.selections?.length === 3
    );
    if (!mkt) continue;

    const [s1, sX, s2] = mkt.selections;
    const homeOdds = s1?.price ?? 0;
    const drawOdds = sX?.price ?? 0;
    const awayOdds = s2?.price ?? 0;
    if (homeOdds <= 1 || awayOdds <= 1) continue;

    // nome do evento: "Time A v Time B" ou "Time A x Time B"
    const parts = ev.name.split(/ v | x | vs /i);
    const home  = parts[0]?.trim() ?? '';
    const away  = parts[1]?.trim() ?? '';
    if (!home || !away) continue;

    const slug = `${toSlug(home)}-x-${toSlug(away)}`;
    const url  = `${BASE}/apostas/futebol/${ev.competition?.name ? toSlug(ev.competition.name) + '/' : ''}${slug}/e-${ev.id}`;

    results.push({
      match_id:    ev.id,
      home_team:   home,
      away_team:   away,
      start_time:  ev.startTime,
      league_name: ev.competition?.name ?? '',
      league_id:   0,
      bookmakers: [{
        slug:  'betfair',
        name:  'Betfair',
        home:  homeOdds,
        draw:  drawOdds,
        away:  awayOdds,
        url,
        is_pa: true, // Betfair BR opera com PA
      }],
    });
  }

  return results;
}
