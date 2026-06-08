/**
 * Cliente Superbet — API pública via Fastly CDN.
 * Fluxo:
 *   1. GET getBetbuilderEvents → lista de eventIds (string[])
 *   2. GET /v2/pt-BR/events/{eventId} → dados + odds[]
 *
 * Odds relevantes: odds[].marketName === 'Resultado Final'
 *   code '1' | 'X' | '2', price decimal, status 'active'
 */

import type { OddsSummary } from '@/lib/altenar/client';

const OFFER_BASE = 'https://production-superbet-offer-br.freetls.fastly.net';
const BMB_BASE   = 'https://production-superbet-bmb.freetls.fastly.net';

const HEADERS = {
  Accept:       'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Origin:       'https://superbet.bet.br',
  Referer:      'https://superbet.bet.br/',
};

// A lista betbuilder tem ~2200 IDs. Os eventos de hoje ficam nos últimos
// ~600 IDs. Pegamos os últimos 250: suficiente para hoje com margem,
// e ~3s de fetch paralelo no Vercel (testado: 200 IDs = 3s).
const SLICE_START = -250;
const SLICE_END   = undefined; // até o fim

interface SuperbetOdd {
  code:        string;   // '1' | 'X' | '2'
  price:       number;
  status:      string;   // 'active'
  marketName:  string;
  marketId:    number;
}

interface SuperbetEvent {
  eventId:      number;
  matchDate:    string;  // 'YYYY-MM-DD HH:MM:SS'
  matchName?:   string;
  homeTeamId?:  string;
  awayTeamId?:  string;
  tournamentId?: number;
  sportId?:     number;
  odds:         SuperbetOdd[];
  oddsResults?: unknown;
}

interface SuperbetEventResponse {
  error: boolean;
  data:  SuperbetEvent[];
}

interface BetbuilderEventsResponse {
  events: string[];
}

async function fetchEventIds(): Promise<string[]> {
  try {
    const res = await fetch(`${BMB_BASE}/betbuilder/v2/getBetbuilderEvents?target=SB_BR`, {
      headers: HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json: BetbuilderEventsResponse = await res.json();
    // Os jogos de hoje ficam no range SLICE_START..SLICE_END da lista
    const all = json.events ?? [];
    return all.slice(SLICE_START, SLICE_END);
  } catch {
    return [];
  }
}

async function fetchEvent(eventId: string): Promise<SuperbetEvent | null> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000); // timeout 6s por evento
    const res = await fetch(`${OFFER_BASE}/v2/pt-BR/events/${eventId}`, {
      headers: HEADERS,
      cache: 'no-store',
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json: SuperbetEventResponse = await res.json();
    if (json.error || !json.data?.length) return null;
    return json.data[0];
  } catch {
    return null;
  }
}

function extract1X2(odds: SuperbetOdd[]): { home: number; draw: number; away: number } | null {
  const market = odds.filter(
    o => o.status === 'active' && o.marketName === 'Resultado Final'
  );

  const o1 = market.find(o => o.code === '1');
  const oX = market.find(o => o.code === 'X');
  const o2 = market.find(o => o.code === '2');

  if (!o1 || !oX || !o2) return null;
  if (o1.price <= 1 || o2.price <= 1) return null;

  return { home: o1.price, draw: oX.price, away: o2.price };
}

// Superbet usa '·' como separador de times na maioria dos eventos.
// Esports tem nomes no formato "Time (playerNick)·Time2 (nick2)" — excluídos abaixo.
function parseMatchName(ev: SuperbetEvent): { home: string; away: string } {
  const name = ev.matchName ?? '';
  // Exclui esports (nomes com parentheses de jogador)
  if (name.includes('(')) return { home: '', away: '' };
  // Tenta separador '·' primeiro, depois ' x '
  const sep = name.includes('·') ? '·' : ' x ';
  const parts = name.split(sep);
  return {
    home: parts[0]?.trim() ?? '',
    away: parts[1]?.trim() ?? '',
  };
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

export async function getSuperbetOdds(): Promise<OddsSummary[]> {
  const eventIds = await fetchEventIds();
  if (!eventIds.length) return [];

  // Todos em paralelo (~500 requests, ~5-8s no Vercel)
  const results: OddsSummary[] = [];
  const fetched = await Promise.allSettled(eventIds.map(fetchEvent));

  for (const r of fetched) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const ev = r.value;

      // Filtra apenas futebol (sportId=5 na Superbet)
      if (ev.sportId && ev.sportId !== 5) continue;

      const odds = extract1X2(ev.odds ?? []);
      if (!odds) continue;

      const { home, away } = parseMatchName(ev);
      if (!home || !away) continue;

      const startTime = ev.matchDate
        ? new Date(ev.matchDate.replace(' ', 'T') + 'Z').toISOString()
        : new Date().toISOString();

      // URL: /odds/futebol/{home-slug}-x-{away-slug}-{eventId}
      const eventUrl = `https://superbet.bet.br/odds/futebol/${toSlug(home)}-x-${toSlug(away)}-${ev.eventId}`;

      results.push({
        match_id:    String(ev.eventId),
        home_team:   home,
        away_team:   away,
        start_time:  startTime,
        league_name: '',
        league_id:   ev.tournamentId ?? 0,
        bookmakers: [{
          slug:  'superbet',
          name:  'Superbet',
          home:  odds.home,
          draw:  odds.draw,
          away:  odds.away,
          url:   eventUrl,
          is_pa: true,
        }],
      });
  }

  return results;
}
