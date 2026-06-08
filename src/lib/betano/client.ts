/**
 * Cliente Betano — API pública, sem autenticação.
 * Endpoint: /api/sport/futebol/{region}/{league}/{leagueId}r/?req=s,stnf,c
 *
 * Estrutura de resposta:
 *   data.blocks[].events[].markets[] (type=MR12 → 1X2)
 *   selections[0..2] → price decimal, name='1'|'X'|'2'
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE = 'https://www.betano.bet.br/api';

// Leagues conhecidas: [regionSlug, leagueSlug, leagueId]
const LEAGUES: [string, string, number][] = [
  ['brasil', 'brasileirao-serie-a',        10016],
  ['brasil', 'brasileirao-serie-b',        10017],
  ['brasil', 'copa-do-brasil',             10019],
  ['brasil', 'campeonato-carioca',         10020],
  ['brasil', 'campeonato-paulista',        10021],
  ['brasil', 'campeonato-gaucho',          10022],
  ['brasil', 'campeonato-mineiro',         10023],
  ['brasil', 'campeonato-pernambucano',    10034],
  ['mundial', 'copa-do-mundo-clubes-fifa', 10062],
  ['internacional', 'libertadores',        10024],
  ['internacional', 'sul-americana',       10025],
  ['europa', 'champions-league',           10001],
  ['europa', 'europa-league',              10002],
  ['europa', 'conference-league',          10003],
];

interface BetanoSelection {
  name:   string;   // '1' | 'X' | '2'
  price:  number;
}

interface BetanoMarket {
  type:       string;       // 'MR12' | 'MRES' | ...
  selections: BetanoSelection[];
}

interface BetanoParticipant {
  name: string;
}

interface BetanoEvent {
  id:          number;
  name:        string;
  startTime:   number; // ms timestamp
  leagueName?: string;
  leagueId?:   number;
  regionName?: string;
  markets:     BetanoMarket[];
  participants: BetanoParticipant[];
  url?:        string;
}

interface BetanoBlock {
  id:       number;
  name:     string;
  events:   BetanoEvent[];
}

interface BetanoResponse {
  data?: {
    blocks?: BetanoBlock[];
  };
}

async function fetchLeague(
  regionSlug: string,
  leagueSlug: string,
  leagueId:   number,
): Promise<BetanoEvent[]> {
  const url = `${BASE}/sport/futebol/${regionSlug}/${leagueSlug}/${leagueId}r/?req=s,stnf,c`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept:       'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer:      'https://www.betano.bet.br/',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) return [];

    const json: BetanoResponse = await res.json();
    const blocks = json?.data?.blocks ?? [];

    return blocks.flatMap(block =>
      block.events.map(ev => ({
        ...ev,
        leagueName: ev.leagueName ?? block.name,
        leagueId:   ev.leagueId  ?? block.id,
      }))
    );
  } catch {
    return [];
  }
}

function extract1X2(markets: BetanoMarket[]): { home: number; draw: number; away: number } | null {
  const mkt = markets.find(m => m.type === 'MR12' || m.type === 'MRES');
  if (!mkt || mkt.selections.length < 3) return null;

  const s1 = mkt.selections.find(s => s.name === '1');
  const sX = mkt.selections.find(s => s.name === 'X');
  const s2 = mkt.selections.find(s => s.name === '2');

  if (!s1 || !sX || !s2) return null;
  if (s1.price <= 1 || s2.price <= 1) return null;

  return { home: s1.price, draw: sX.price, away: s2.price };
}

export async function getBetanoOdds(): Promise<OddsSummary[]> {
  const results = await Promise.allSettled(
    LEAGUES.map(([region, slug, id]) => fetchLeague(region, slug, id))
  );

  const eventMap = new Map<string, OddsSummary>();

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const ev of r.value) {
      const odds = extract1X2(ev.markets);
      if (!odds) continue;

      const parts = ev.participants ?? [];
      const home  = parts[0]?.name ?? ev.name.split(' - ')[0] ?? '';
      const away  = parts[1]?.name ?? ev.name.split(' - ')[1] ?? '';

      if (!home || !away) continue;

      const key = `${ev.leagueId ?? 0}-${home}-${away}`;

      if (!eventMap.has(key)) {
        eventMap.set(key, {
          match_id:    String(ev.id),
          home_team:   home,
          away_team:   away,
          start_time:  new Date(ev.startTime).toISOString(),
          league_name: ev.leagueName ?? '',
          league_id:   ev.leagueId ?? 0,
          bookmakers:  [],
        });
      }

      const existing = eventMap.get(key)!;
      if (!existing.bookmakers.find(b => b.slug === 'betano')) {
        existing.bookmakers.push({
          slug:  'betano',
          name:  'Betano',
          home:  odds.home,
          draw:  odds.draw,
          away:  odds.away,
          url:   `https://www.betano.bet.br${ev.url ?? ''}`,
          is_pa: false, // Betano NÃO tem PA
        });
      }
    }
  }

  return Array.from(eventMap.values()).filter(e => e.bookmakers.length > 0);
}
