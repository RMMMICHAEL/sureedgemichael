/**
 * Cliente BetNacional — Bet6 API pública.
 * BetNacional NÃO opera com Pagamento Antecipado (is_pa: false).
 *
 * Plataforma Bet6: endpoint de eventos pré-jogo de futebol.
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE    = 'https://www.betnacional.bet.br';
const HEADERS = {
  Accept:       'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Origin:       BASE,
  Referer:      BASE + '/',
};

interface Bet6Outcome {
  name:   string;  // '1' | 'X' | '2' ou 'Casa' | 'Empate' | 'Fora'
  odds:   number;
  active: boolean;
}

interface Bet6Market {
  id:       number;
  name:     string;
  outcomes: Bet6Outcome[];
}

interface Bet6Event {
  id:          number;
  name:        string;
  startDate:   string;
  competition: { id: number; name: string };
  markets:     Bet6Market[];
}

interface Bet6Response {
  events?: Bet6Event[];
  data?:   Bet6Event[];
  items?:  Bet6Event[];
}

const PATHS = [
  '/api/v1/sports/1/events?isLive=false&limit=200',
  '/api/sports/football/prematch?limit=200',
  '/api/v1/events?sportId=1&isLive=false&limit=200',
  '/pt/api/sports/1/events?limit=200',
];

async function fetchEvents(): Promise<Bet6Event[]> {
  for (const path of PATHS) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: HEADERS, cache: 'no-store' });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      const json: Bet6Response = await res.json();
      const evs = json.events ?? json.data ?? json.items;
      if (Array.isArray(evs) && evs.length > 0) return evs;
    } catch { /* tenta próximo */ }
  }
  return [];
}

function find1X2(markets: Bet6Market[]): Bet6Market | null {
  return markets.find(m => {
    const n = m.name?.toLowerCase() ?? '';
    return (n.includes('resultado') || n.includes('vencedor') || n === '1x2') &&
           m.outcomes?.length === 3;
  }) ?? null;
}

export async function getBetNacionalOdds(): Promise<OddsSummary[]> {
  const events = await fetchEvents();
  const results: OddsSummary[] = [];

  for (const ev of events) {
    const mkt = find1X2(ev.markets ?? []);
    if (!mkt) continue;

    const outs = mkt.outcomes.filter(o => o.active);
    if (outs.length < 3) continue;

    // Outcomes: 1, X, 2 (ou Casa, Empate, Fora)
    const o1 = outs[0]?.odds ?? 0;
    const oX = outs[1]?.odds ?? 0;
    const o2 = outs[2]?.odds ?? 0;
    if (o1 <= 1 || o2 <= 1) continue;

    // Nome do evento: "Time A x Time B" ou "Time A - Time B"
    const parts = ev.name.split(/ x | - | vs /i);
    const home  = parts[0]?.trim() ?? '';
    const away  = parts[1]?.trim() ?? '';
    if (!home || !away) continue;

    results.push({
      match_id:    String(ev.id),
      home_team:   home,
      away_team:   away,
      start_time:  ev.startDate,
      league_name: ev.competition?.name ?? '',
      league_id:   ev.competition?.id   ?? 0,
      bookmakers: [{
        slug:  'betnacional',
        name:  'BetNacional',
        home:  o1,
        draw:  oX,
        away:  o2,
        url:   `${BASE}/event/1/0/${ev.id}`,
        is_pa: false,
      }],
    });
  }

  return results;
}
