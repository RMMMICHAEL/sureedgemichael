/**
 * Cliente Betfair Brasil — betfair.bet.br
 *
 * Betfair BR usa a plataforma Flutter Entertainment.
 * Estratégia: tentar múltiplos endpoints possíveis com proxy residencial,
 * logar qual retorna dados para identificar a API real.
 *
 * is_pa: false — Betfair paga ao final do evento (Exchange)
 */

import type { OddsSummary } from '@/lib/altenar/client';
import { proxyFetch } from '@/lib/proxy/fetch';

const BASE    = 'https://www.betfair.bet.br';
const HEADERS = {
  'Content-Type': 'application/json',
  'Accept':       'application/json, text/plain, */*',
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Origin':       BASE,
  'Referer':      BASE + '/pt/',
};

// Endpoints candidatos para Betfair BR (Flutter Entertainment / SBtech)
// Listados do mais provável ao menos provável
const CANDIDATES = [
  // Flutter/SBtech REST API patterns
  { url: `${BASE}/api/sportsbook/v3/categories/soccer/events?limit=200&isLive=false`, label: 'sbtech-v3' },
  { url: `${BASE}/api/sportsbook/v2/categories/soccer/events?limit=200`, label: 'sbtech-v2' },
  { url: `${BASE}/api/v1/sports/football/events?isLive=false&limit=200`, label: 'generic-v1' },
  { url: `${BASE}/pt/sports/api/football/events`, label: 'pt-sports' },
  // Betfair Exchange API (requer app key — provavelmente não funciona sem auth)
  { url: `${BASE}/exchange/betting/rest/v1.0/listEvents/`, label: 'exchange', method: 'POST' as const,
    body: JSON.stringify({ filter: { eventTypeIds: ['1'] }, locale: 'pt_BR', maxResults: '200' }) },
];

interface FlutterEvent {
  id?:          string | number;
  eventId?:     string | number;
  name?:        string;
  title?:       string;
  homeTeam?:    string;
  awayTeam?:    string;
  startTime?:   string;
  startDate?:   string;
  competition?: { id?: number; name?: string };
  league?:      { id?: number; name?: string };
  category?:    { name?: string };
  markets?:     Array<{
    id?: number; name?: string; type?: string; status?: string;
    selections?: Array<{ id?: string; name?: string; price?: number; odds?: number; status?: string }>;
    outcomes?: Array<{ name?: string; price?: number; odds?: number }>;
  }>;
}

interface FlutterResponse {
  events?: FlutterEvent[];
  data?:   { events?: FlutterEvent[] } | FlutterEvent[];
  items?:  FlutterEvent[];
  result?: FlutterEvent[];
}

function extractTeams(ev: FlutterEvent): { home: string; away: string } {
  if (ev.homeTeam && ev.awayTeam) return { home: ev.homeTeam, away: ev.awayTeam };
  const name = ev.name ?? ev.title ?? '';
  const sep = name.match(/ v | x | vs | - /i);
  if (sep?.index) {
    return {
      home: name.slice(0, sep.index).trim(),
      away: name.slice(sep.index + sep[0].length).trim(),
    };
  }
  return { home: '', away: '' };
}

function extractOdds(ev: FlutterEvent): { home: number; draw: number; away: number } | null {
  const markets = ev.markets ?? [];

  // Procura mercado de resultado final / 1X2 / Match Odds
  const mkt = markets.find(m => {
    const n = (m.name ?? m.type ?? '').toLowerCase();
    return n.includes('resultado') || n.includes('1x2') ||
           n.includes('match odds') || n.includes('match result') ||
           n === 'result';
  });
  if (!mkt) return null;

  const sels = (mkt.selections ?? mkt.outcomes ?? []).filter(s => (s as {status?:string}).status !== 'REMOVED');
  if (sels.length < 3) return null;

  const val = (s: { price?: number; odds?: number }) => s.price ?? s.odds ?? 0;
  const [s1, sX, s2] = sels;
  const h = val(s1 as {price?:number;odds?:number});
  const d = val(sX as {price?:number;odds?:number});
  const a = val(s2 as {price?:number;odds?:number});

  if (h <= 1 || a <= 1) return null;
  return { home: h, draw: d, away: a };
}

function parseEvents(data: unknown): FlutterEvent[] {
  if (Array.isArray(data)) return data as FlutterEvent[];
  const r = data as FlutterResponse;
  if (Array.isArray(r.events)) return r.events;
  if (Array.isArray(r.items))  return r.items;
  if (Array.isArray(r.result)) return r.result;
  if (r.data) {
    if (Array.isArray(r.data)) return r.data;
    if (Array.isArray((r.data as {events?:FlutterEvent[]}).events)) return (r.data as {events:FlutterEvent[]}).events;
  }
  return [];
}

function toSlug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function getBetfairOdds(): Promise<OddsSummary[]> {
  for (const c of CANDIDATES) {
    try {
      const res = await proxyFetch(c.url, {
        method:  c.method ?? 'GET',
        headers: HEADERS,
        ...(c.body ? { body: c.body } : {}),
        cache: 'no-store',
      });

      console.log(`[betfair] ${c.label} → ${res.status}`);
      if (!res.ok) continue;

      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) { console.log(`[betfair] ${c.label} → não-JSON: ${ct}`); continue; }

      const json = await res.json() as unknown;
      const events = parseEvents(json);

      if (!events.length) { console.log(`[betfair] ${c.label} → 0 eventos`); continue; }

      console.log(`[betfair] ${c.label} → ${events.length} eventos ✓`);

      const results: OddsSummary[] = [];
      for (const ev of events) {
        const odds = extractOdds(ev);
        if (!odds) continue;
        const { home, away } = extractTeams(ev);
        if (!home || !away) continue;

        const id      = String(ev.id ?? ev.eventId ?? Math.random());
        const league  = ev.competition ?? ev.league ?? ev.category;
        const startStr = ev.startTime ?? ev.startDate ?? '';

        results.push({
          match_id:    id,
          home_team:   home,
          away_team:   away,
          start_time:  startStr,
          league_name: league?.name ?? '',
          league_id:   0,
          bookmakers: [{
            slug:  'betfair',
            name:  'Betfair',
            home:  odds.home,
            draw:  odds.draw,
            away:  odds.away,
            url:   `${BASE}/pt/sports/futebol/${toSlug(home)}-vs-${toSlug(away)}/${id}`,
            is_pa: false,
          }],
        });
      }

      if (results.length > 0) return results;
    } catch (e) {
      console.log(`[betfair] ${c.label} → erro: ${String(e).slice(0, 100)}`);
    }
  }

  console.log('[betfair] todos endpoints falharam');
  return [];
}
