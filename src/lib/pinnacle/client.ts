/**
 * Cliente Pinnacle Brasil — API pública REST.
 * Pinnacle NÃO opera com Pagamento Antecipado (is_pa: false).
 *
 * Endpoint: api.pinnacle.bet.br ou pinnacle.bet.br/api
 * Futebol = sportId 29 (padrão Pinnacle global)
 */

import type { OddsSummary } from '@/lib/altenar/client';
import { proxyFetch } from '@/lib/proxy/fetch';

const BASE    = 'https://pinnacle.bet.br';
const HEADERS = {
  Accept:       'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Origin:       BASE,
  Referer:      BASE + '/',
};

const SOCCER_ID = 29; // sportId padrão Pinnacle para futebol

interface PinnacleMatchup {
  id:            number;
  parentId?:     number;
  starts:        string;  // ISO timestamp
  league:        { id: number; name: string };
  home:          string;
  away:          string;
  status:        string;
  liveStatus?:   number;
}

interface PinnacleOdds {
  id:       number;
  periods:  Array<{
    number:  number;
    lineId:  number;
    moneyline?: { home: number; draw: number; away: number };
  }>;
}

interface PinnacleMatchupsResponse {
  matchups?: PinnacleMatchup[];
  events?:   PinnacleMatchup[];
  data?:     PinnacleMatchup[];
}

interface PinnacleOddsResponse {
  matchupIds?: PinnacleOdds[];
  odds?:       PinnacleOdds[];
  data?:       PinnacleOdds[];
}

// Tenta vários endpoints conhecidos do Pinnacle BR / global
const MATCHUP_PATHS = [
  `/api/v2/matchups?sportId=${SOCCER_ID}&isLive=false&acceptStaleData=true`,
  `/api/v1/fixtures?sportId=${SOCCER_ID}&isLive=false`,
  `/sportsbook-service/v2/matchups?sportId=${SOCCER_ID}`,
];
const ODDS_PATHS = [
  `/api/v2/odds?sportId=${SOCCER_ID}&oddsFormat=Decimal&isLive=false`,
  `/api/v1/odds?sportId=${SOCCER_ID}&oddsFormat=Decimal`,
];

async function tryFetch<T>(paths: string[]): Promise<T | null> {
  for (const path of paths) {
    try {
      const res = await proxyFetch(`${BASE}${path}`, { headers: HEADERS, cache: 'no-store' });
      if (!res.ok) { console.log(`[pinnacle] ${path} → ${res.status}`); continue; }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) { console.log(`[pinnacle] ${path} → não-JSON: ${ct}`); continue; }
      return res.json() as Promise<T>;
    } catch (e) { console.log(`[pinnacle] ${path} → erro: ${e}`); }
  }
  return null;
}

function toSlug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function getPinnacleOdds(): Promise<OddsSummary[]> {
  const [matchupsRaw, oddsRaw] = await Promise.all([
    tryFetch<PinnacleMatchupsResponse>(MATCHUP_PATHS),
    tryFetch<PinnacleOddsResponse>(ODDS_PATHS),
  ]);

  if (!matchupsRaw || !oddsRaw) return [];

  const matchups: PinnacleMatchup[] = matchupsRaw.matchups ?? matchupsRaw.events ?? matchupsRaw.data ?? [];
  const allOdds: PinnacleOdds[]     = oddsRaw.matchupIds ?? oddsRaw.odds ?? oddsRaw.data ?? [];

  if (!matchups.length) return [];

  // Cria mapa odds por matchupId
  const oddsMap = new Map<number, { home: number; draw: number; away: number }>();
  for (const o of allOdds) {
    const period0 = o.periods?.find(p => p.number === 0);
    const ml      = period0?.moneyline;
    if (ml && ml.home > 1 && ml.away > 1) {
      oddsMap.set(o.id, { home: ml.home, draw: ml.draw, away: ml.away });
    }
  }

  const results: OddsSummary[] = [];

  for (const m of matchups) {
    // Apenas pré-jogo sem pai (sem período específico)
    if (m.parentId)           continue;
    // Pinnacle status: 'O' = Open (aceita apostas), 'I' = Inactivated, 'H' = Hidden
    if (m.status !== 'O')     continue;
    if (m.liveStatus === 1)   continue; // ao vivo

    const odds = oddsMap.get(m.id);
    if (!odds) continue;

    const leagueName = m.league?.name ?? '';
    const url = `${BASE}/sportsbook/standard/soccer/${toSlug(leagueName)}/${toSlug(m.home)}-vs-${toSlug(m.away)}/${m.id}`;

    results.push({
      match_id:    String(m.id),
      home_team:   m.home,
      away_team:   m.away,
      start_time:  m.starts,
      league_name: leagueName,
      league_id:   m.league?.id ?? 0,
      bookmakers: [{
        slug:  'pinnacle',
        name:  'Pinnacle',
        home:  odds.home,
        draw:  odds.draw,
        away:  odds.away,
        url,
        is_pa: false, // Pinnacle NÃO tem PA
      }],
    });
  }

  return results;
}
