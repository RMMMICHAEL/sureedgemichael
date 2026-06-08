/**
 * Cliente VivaSorte — API pública REST.
 * VivaSorte NÃO opera com Pagamento Antecipado (is_pa: false).
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE    = 'https://vivasorte.bet.br';
const HEADERS = {
  Accept:       'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Origin:       BASE,
  Referer:      BASE + '/',
};

interface VivaEvent {
  id:          number | string;
  name?:       string;
  homeTeam?:   string;
  awayTeam?:   string;
  startTime?:  string;
  startDate?:  string;
  competition?: { id: number; name: string };
  league?:      { id: number; name: string };
  markets?:    Array<{
    id: number;
    name: string;
    odds?: Array<{ name: string; value: number; active?: boolean }>;
    outcomes?: Array<{ name: string; odds: number; active?: boolean }>;
  }>;
}

interface VivaResponse {
  events?: VivaEvent[];
  data?:   VivaEvent[];
  items?:  VivaEvent[];
}

const PATHS = [
  '/apostas-esportivas/futebol/api/events?isLive=false&limit=200',
  '/api/v1/sports/football/events?isLive=false&limit=200',
  '/api/sports/1/events?limit=200',
  '/api/v1/events?sportId=1&limit=200',
];

async function fetchEvents(): Promise<VivaEvent[]> {
  for (const path of PATHS) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: HEADERS, cache: 'no-store' });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      const json: VivaResponse = await res.json();
      const evs = json.events ?? json.data ?? json.items;
      if (Array.isArray(evs) && evs.length > 0) return evs;
    } catch { /* tenta próximo */ }
  }
  return [];
}

function extractOdds(ev: VivaEvent): { home: number; draw: number; away: number } | null {
  const markets = ev.markets ?? [];
  const mkt = markets.find(m => {
    const n = m.name?.toLowerCase() ?? '';
    return n.includes('resultado') || n.includes('1x2') || n.includes('vencedor');
  });
  if (!mkt) return null;

  const rawOuts = (mkt.outcomes ?? mkt.odds ?? []).filter(o => o.active !== false);
  if (rawOuts.length < 3) return null;

  const val = (o: { odds?: number; value?: number }) => o.odds ?? o.value ?? 0;
  const h = val(rawOuts[0] as { odds?: number; value?: number });
  const d = val(rawOuts[1] as { odds?: number; value?: number });
  const a = val(rawOuts[2] as { odds?: number; value?: number });
  if (h <= 1 || a <= 1) return null;
  return { home: h, draw: d, away: a };
}

export async function getVivaSorteOdds(): Promise<OddsSummary[]> {
  const events = await fetchEvents();
  const results: OddsSummary[] = [];

  for (const ev of events) {
    const odds = extractOdds(ev);
    if (!odds) continue;

    let home = ev.homeTeam ?? '';
    let away = ev.awayTeam ?? '';

    // Fallback: nome do evento
    if (!home || !away) {
      const parts = (ev.name ?? '').split(/ x | - | vs /i);
      home = parts[0]?.trim() ?? '';
      away = parts[1]?.trim() ?? '';
    }
    if (!home || !away) continue;

    const league   = ev.competition ?? ev.league;
    const startStr = ev.startTime ?? ev.startDate ?? '';

    results.push({
      match_id:    String(ev.id),
      home_team:   home,
      away_team:   away,
      start_time:  startStr,
      league_name: league?.name ?? '',
      league_id:   league?.id   ?? 0,
      bookmakers: [{
        slug:  'vivasorte',
        name:  'VivaSorte',
        home:  odds.home,
        draw:  odds.draw,
        away:  odds.away,
        url:   `${BASE}/apostas-esportivas/futebol/competicoes/${league?.name ?? 'futebol'}-${league?.id ?? 0}/${home.toLowerCase().replace(/\s/g,'-')}-vs-${away.toLowerCase().replace(/\s/g,'-')}-${ev.id}`,
        is_pa: false,
      }],
    });
  }

  return results;
}
