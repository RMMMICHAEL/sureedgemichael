/**
 * Cliente Novibet — API pública (sem autenticação além de headers de domínio).
 * Endpoint: /spt/feed/marketviews/location/v2/{locationId}/{viewGroupId}/
 *
 * locationId=4324  → Brasil
 * viewGroupId=6051394 → Live Events (Home In Play)
 *
 * Estrutura: betViews[].competitions[].events[].markets[]
 *   market.betTypeSysname === 'SOCCER_MATCH_RESULT' → betItems[0..2]
 *   betItems: code='1'|'X'|'2', price decimal
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE       = 'https://www.novibet.bet.br';
const LOCATION   = 4324;   // Brazil
// Known view group IDs: live=6051394, prematch pode ser diferente
const VIEW_GROUPS = [6051394];

const HEADERS = {
  Accept:           'application/json, text/plain, */*',
  'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'x-gw-cms-key':  '_BR',
  'x-gw-domain-key': '_BR',
  Referer:          'https://www.novibet.bet.br/',
};

interface NovibetBetItem {
  code:        string;   // '1' | 'X' | '2'
  price:       number;
  isAvailable: boolean;
}

interface NovibetMarket {
  betTypeSysname: string;
  betItems:       NovibetBetItem[];
}

interface NovibetAdditionalCaptions {
  competitor1?: string;
  competitor2?: string;
}

interface NovibetEvent {
  betContextId:       number;
  path?:              string;
  additionalCaptions: NovibetAdditionalCaptions;
  liveData?:          { isLive?: boolean };
  markets:            NovibetMarket[];
  metadata?:          { tournamentRound?: string };
}

interface NovibetCompetition {
  betContextId: number;
  caption:      string;
  events:       NovibetEvent[];
}

interface NovibetBetView {
  betViewKey:   string;
  competitions: NovibetCompetition[];
}

interface NovibetViewGroup {
  betViews: NovibetBetView[];
}

async function fetchViewGroup(viewGroupId: number): Promise<NovibetViewGroup | null> {
  const ts  = Date.now();
  const url = `${BASE}/spt/feed/marketviews/location/v2/${LOCATION}/${viewGroupId}/?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}`;

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json: NovibetViewGroup[] = await res.json();
    return Array.isArray(json) ? json[0] ?? null : null;
  } catch {
    return null;
  }
}

function extract1X2(markets: NovibetMarket[]): { home: number; draw: number; away: number } | null {
  const mkt = markets.find(m => m.betTypeSysname === 'SOCCER_MATCH_RESULT');
  if (!mkt) return null;

  const items = mkt.betItems.filter(b => b.isAvailable);
  const i1 = items.find(b => b.code === '1');
  const iX = items.find(b => b.code === 'X');
  const i2 = items.find(b => b.code === '2');

  if (!i1 || !iX || !i2) return null;
  if (i1.price <= 1 || i2.price <= 1) return null;

  return { home: i1.price, draw: iX.price, away: i2.price };
}

export async function getNovibetOdds(): Promise<OddsSummary[]> {
  const results = await Promise.allSettled(VIEW_GROUPS.map(fetchViewGroup));

  const eventMap = new Map<string, OddsSummary>();

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;

    for (const betView of r.value.betViews ?? []) {
      if (!betView.betViewKey.startsWith('SOCCER')) continue;

      for (const comp of betView.competitions ?? []) {
        for (const ev of comp.events ?? []) {
          const odds = extract1X2(ev.markets);
          if (!odds) continue;

          const ac   = ev.additionalCaptions ?? {};
          const home = ac.competitor1 ?? '';
          const away = ac.competitor2 ?? '';
          if (!home || !away) continue;

          const key = `${comp.betContextId}-${home}-${away}`;
          if (!eventMap.has(key)) {
            eventMap.set(key, {
              match_id:    String(ev.betContextId),
              home_team:   home,
              away_team:   away,
              start_time:  new Date().toISOString(),
              league_name: comp.caption,
              league_id:   comp.betContextId,
              bookmakers:  [],
            });
          }

          const existing = eventMap.get(key)!;
          if (!existing.bookmakers.find(b => b.slug === 'novibet')) {
            existing.bookmakers.push({
              slug: 'novibet',
              name: 'Novibet',
              home: odds.home,
              draw: odds.draw,
              away: odds.away,
              url:  `https://www.novibet.bet.br/apostas/${ev.path ?? ''}`,
            });
          }
        }
      }
    }
  }

  return Array.from(eventMap.values()).filter(e => e.bookmakers.length > 0);
}
