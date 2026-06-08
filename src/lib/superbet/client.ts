/**
 * Cliente Superbet — API pública.
 *
 * Estratégia (em ordem de prioridade):
 *   1. POST api-gw/events/produce  → retorna lista de eventos com odds (domínio betler, não Fastly)
 *   2. Static sportTournamentMap   → busca por torneio via offer API
 *   3. getBetbuilderEvents + fetch individual (fallback legado, lento no Vercel)
 *
 * is_pa: true (Superbet opera com Pagamento Antecipado)
 */

import type { OddsSummary } from '@/lib/altenar/client';
import { proxyFetch } from '@/lib/proxy/fetch';

const BETLER_BASE = 'https://api.web.production.betler.superbet.bet.br';
const OFFER_BASE  = 'https://production-superbet-offer-br.freetls.fastly.net';
const BMB_BASE    = 'https://production-superbet-bmb.freetls.fastly.net';
const STATIC_BASE = 'https://superbet.bet.br';

const HEADERS = {
  Accept:         'application/json',
  'Content-Type': 'application/json',
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Origin:         'https://superbet.bet.br',
  Referer:        'https://superbet.bet.br/',
};

const FOOTBALL_SPORT_ID = 5;
const SLICE_START = -250;

// ─── interfaces ────────────────────────────────────────────────────────────

interface SuperbetOdd {
  code:       string;  // '1' | 'X' | '2'
  price:      number;
  status:     string;  // 'active'
  marketName: string;
  marketId:   number;
}

interface SuperbetEvent {
  eventId:       number;
  matchDate:     string;  // 'YYYY-MM-DD HH:MM:SS'
  matchName?:    string;
  tournamentId?: number;
  sportId?:      number;
  odds:          SuperbetOdd[];
}

interface SuperbetEventResponse {
  error: boolean;
  data:  SuperbetEvent[];
}

interface BetbuilderEventsResponse {
  events: string[];
}

// ─── helpers ───────────────────────────────────────────────────────────────

function extract1X2(odds: SuperbetOdd[]): { home: number; draw: number; away: number } | null {
  const market = odds.filter(o => o.status === 'active' && o.marketName === 'Resultado Final');
  const o1 = market.find(o => o.code === '1');
  const oX = market.find(o => o.code === 'X');
  const o2 = market.find(o => o.code === '2');
  if (!o1 || !oX || !o2) return null;
  if (o1.price <= 1 || o2.price <= 1) return null;
  return { home: o1.price, draw: oX.price, away: o2.price };
}

function parseMatchName(ev: SuperbetEvent): { home: string; away: string } {
  const name = ev.matchName ?? '';
  if (name.includes('(')) return { home: '', away: '' };
  const sep = name.includes('·') ? '·' : ' x ';
  const parts = name.split(sep);
  return { home: parts[0]?.trim() ?? '', away: parts[1]?.trim() ?? '' };
}

function toSlug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function eventsToSummary(events: SuperbetEvent[]): OddsSummary[] {
  const results: OddsSummary[] = [];
  for (const ev of events) {
    if (ev.sportId && ev.sportId !== FOOTBALL_SPORT_ID) continue;
    const odds = extract1X2(ev.odds ?? []);
    if (!odds) continue;
    const { home, away } = parseMatchName(ev);
    if (!home || !away) continue;
    const startTime = ev.matchDate
      ? new Date(ev.matchDate.replace(' ', 'T') + 'Z').toISOString()
      : new Date().toISOString();
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
        url:   `https://superbet.bet.br/odds/futebol/${toSlug(home)}-x-${toSlug(away)}-${ev.eventId}`,
        is_pa: true,
      }],
    });
  }
  return results;
}

// ─── estratégia 1: betler api-gw/events/produce ────────────────────────────

async function tryBetlerEventsApi(): Promise<OddsSummary[]> {
  // Tenta variações do payload para o endpoint events/produce
  const payloads = [
    { sportId: FOOTBALL_SPORT_ID, isLive: false, lang: 'pt-BR' },
    { sport: FOOTBALL_SPORT_ID, live: false },
    { sportIds: [FOOTBALL_SPORT_ID], isLive: false },
    { filters: { sportId: FOOTBALL_SPORT_ID, isLive: false } },
    {},  // sem filtro — pode retornar tudo
  ];

  for (const body of payloads) {
    try {
      const res = await proxyFetch(`${BETLER_BASE}/api-gw/events/produce`, {
        method:  'POST',
        headers: HEADERS,
        body:    JSON.stringify(body),
      });
      console.log(`[superbet] betler status=${res.status} payload=${JSON.stringify(body)}`);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.log(`[superbet] betler error body:`, errText.slice(0, 200));
        continue;
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) {
        console.log(`[superbet] betler non-json content-type:`, ct);
        continue;
      }
      const json = await res.json() as { data?: SuperbetEvent[]; events?: SuperbetEvent[]; items?: SuperbetEvent[] } | SuperbetEvent[];
      console.log(`[superbet] betler keys:`, Array.isArray(json) ? 'array' : Object.keys(json as object));
      const events: SuperbetEvent[] = Array.isArray(json)
        ? json
        : (json as { data?: SuperbetEvent[]; events?: SuperbetEvent[]; items?: SuperbetEvent[] }).data
          ?? (json as { data?: SuperbetEvent[]; events?: SuperbetEvent[]; items?: SuperbetEvent[] }).events
          ?? (json as { data?: SuperbetEvent[]; events?: SuperbetEvent[]; items?: SuperbetEvent[] }).items
          ?? [];
      console.log(`[superbet] betler events count:`, events.length);
      if (events.length > 0) return eventsToSummary(events);
    } catch (e) {
      console.log(`[superbet] betler exception:`, String(e));
    }
  }
  return [];
}

// ─── estratégia 2: static sportTournamentMap + offer por torneio ────────────

async function tryTournamentMap(): Promise<OddsSummary[]> {
  try {
    const res = await proxyFetch(`${STATIC_BASE}/static/offerMappings/sportTournamentMap_pt-BR.json`, {
      headers: { ...HEADERS, 'Content-Type': '' },
    });
    if (!res.ok) return [];
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return [];

    // Estrutura esperada: { [sportId]: { tournaments: number[] } }
    // ou { sports: [{ id, tournaments: [...] }] }
    const map = await res.json() as Record<string, unknown>;

    // Tenta extrair IDs de torneio para futebol (sportId=5)
    let tournamentIds: number[] = [];
    if (map[String(FOOTBALL_SPORT_ID)]) {
      const sport = map[String(FOOTBALL_SPORT_ID)] as { tournaments?: number[] };
      tournamentIds = sport.tournaments ?? [];
    } else if (Array.isArray(map)) {
      const football = (map as Array<{ id?: number; sportId?: number; tournaments?: number[] }>)
        .find(s => s.id === FOOTBALL_SPORT_ID || s.sportId === FOOTBALL_SPORT_ID);
      tournamentIds = football?.tournaments ?? [];
    }

    if (!tournamentIds.length) return [];

    // Busca eventos por torneio (pega os primeiros 20 torneios para não timeout)
    const topTournaments = tournamentIds.slice(0, 20);
    const fetched = await Promise.allSettled(topTournaments.map(tid =>
      proxyFetch(`${OFFER_BASE}/v2/pt-BR/tournaments/${tid}/events?lang=pt-BR&status=0`, {
        headers: HEADERS,
      }).then(r => r.ok ? r.json() as Promise<SuperbetEventResponse> : null)
    ));

    const all: SuperbetEvent[] = [];
    for (const r of fetched) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const data = (r.value as SuperbetEventResponse).data ?? [];
      all.push(...data);
    }
    return eventsToSummary(all);
  } catch {
    return [];
  }
}

// ─── estratégia 3: fallback legado (betbuilder + individual fetches) ─────────

async function fetchEventIds(): Promise<string[]> {
  try {
    const res = await proxyFetch(`${BMB_BASE}/betbuilder/v2/getBetbuilderEvents?target=SB_BR`, {
      headers: HEADERS,
    });
    if (!res.ok) return [];
    const json: BetbuilderEventsResponse = await res.json();
    return (json.events ?? []).slice(SLICE_START);
  } catch {
    return [];
  }
}

async function fetchEvent(eventId: string): Promise<SuperbetEvent | null> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await proxyFetch(`${OFFER_BASE}/v2/pt-BR/events/${eventId}`, {
      headers: HEADERS,
      signal:  ac.signal,
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

async function tryBetbuilderFallback(): Promise<OddsSummary[]> {
  const eventIds = await fetchEventIds();
  if (!eventIds.length) return [];
  const fetched = await Promise.allSettled(eventIds.map(fetchEvent));
  const events: SuperbetEvent[] = fetched
    .filter((r): r is PromiseFulfilledResult<SuperbetEvent> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
  return eventsToSummary(events);
}

// ─── export principal ──────────────────────────────────────────────────────

export async function getSuperbetOdds(): Promise<OddsSummary[]> {
  // Tenta estratégias em ordem: betler API → tournament map → fallback legado
  let results = await tryBetlerEventsApi();
  if (results.length > 0) return results;

  results = await tryTournamentMap();
  if (results.length > 0) return results;

  return tryBetbuilderFallback();
}
