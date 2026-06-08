/**
 * Cliente bwin/CDS — API pública da Sportingbet Brasil.
 * Endpoint: cds-api/bettingoffer/fixtures
 * x-bwin-accessid: token público estático (não requer auth).
 *
 * Estrutura: fixtures[].optionMarkets[]
 *   1X2: name contém 'Resultado' (sem 'Total'), 3 options
 *   options[].price.odds → decimal
 *   participants[0]=home, [1]=away
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE       = 'https://www.sportingbet.bet.br/cds-api/bettingoffer';
const ACCESS_ID  = 'YTRhMjczYjctNTBlNy00MWZlLTliMGMtMWNkOWQxMThmZTI2';

const COMMON_PARAMS = new URLSearchParams({
  'x-bwin-accessid': ACCESS_ID,
  lang:              'pt-br',
  country:           'BR',
  userCountry:       'BR',
}).toString();

const HEADERS = {
  Accept:       'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Referer:      'https://www.sportingbet.bet.br/',
};

interface BwinOption {
  id:     number;
  status: string;
  name:   { value: string };
  price:  { odds: number; numerator: number; denominator: number };
}

interface BwinMarket {
  id:         number;
  name:       { value: string };
  status:     string;
  options:    BwinOption[];
  parameters?: { key: string; value: string }[];
}

interface BwinParticipant {
  id:             number;
  participantId:  number;
  name:           { value: string };
  properties:     { type: string };
}

interface BwinFixture {
  id:             string;
  name:           { value: string };
  startDate:      string;
  sport:          { name: { value: string } };
  competition?:   { name: { value: string }; id?: number };
  region?:        { name: { value: string } };
  participants:   BwinParticipant[];
  optionMarkets:  BwinMarket[];
  isOpenForBetting: boolean;
}

interface BwinFixturesResponse {
  fixtures:    BwinFixture[];
  totalCount?: number;
}

async function fetchFixtures(skip = 0, take = 100): Promise<BwinFixture[]> {
  const params = new URLSearchParams({
    'x-bwin-accessid':  ACCESS_ID,
    lang:               'pt-br',
    country:            'BR',
    userCountry:        'BR',
    fixtureTypes:       'Standard',
    state:              'Latest',
    offerMapping:       'Filtered',
    offerCategories:    'Gridable',
    fixtureCategories:  'Gridable,NonGridable,Other',
    sportIds:           '4',         // 4 = Football/Futebol
    isPriceBoost:       'false',
    statisticsModes:    'None',
    skip:               String(skip),
    take:               String(take),
    sortBy:             'Tags',
  });

  const url = `${BASE}/fixtures?${params}`;

  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } });
    if (!res.ok) return [];
    const json: BwinFixturesResponse = await res.json();
    return json.fixtures ?? [];
  } catch {
    return [];
  }
}

function find1X2Market(markets: BwinMarket[]): BwinMarket | null {
  for (const m of markets) {
    const name   = m.name?.value ?? '';
    const opts   = m.options ?? [];
    const status = m.status;

    if (status !== 'Visible') continue;
    if (opts.length !== 3) continue;
    // Deve ter "Resultado" no nome e NÃO ter "Total", "Marcador", "Handicap"
    if (!name.includes('Resultado') && !name.includes('Vencedor')) continue;
    if (name.includes('Total') || name.includes('Gols') || name.includes('Handicap')) continue;

    return m;
  }
  return null;
}

function getParticipant(fx: BwinFixture, type: 'HomeTeam' | 'AwayTeam'): string {
  const p = fx.participants.find(p => p.properties?.type === type);
  return p?.name?.value ?? '';
}

export async function getBwinOdds(): Promise<OddsSummary[]> {
  // Pega até 200 jogos (2 páginas)
  const [page1, page2] = await Promise.allSettled([
    fetchFixtures(0,   100),
    fetchFixtures(100, 100),
  ]);

  const fixtures = [
    ...(page1.status === 'fulfilled' ? page1.value : []),
    ...(page2.status === 'fulfilled' ? page2.value : []),
  ];

  const results: OddsSummary[] = [];

  for (const fx of fixtures) {
    if (!fx.isOpenForBetting) continue;

    const mkt = find1X2Market(fx.optionMarkets ?? []);
    if (!mkt) continue;

    const opts = mkt.options;
    const home = getParticipant(fx, 'HomeTeam');
    const away = getParticipant(fx, 'AwayTeam');
    if (!home || !away) continue;

    // Mapeia opções → 1/X/2 pela ordem
    const [o1, oX, o2] = opts;
    const homeOdds = o1?.price?.odds ?? 0;
    const drawOdds = oX?.price?.odds ?? 0;
    const awayOdds = o2?.price?.odds ?? 0;

    if (homeOdds <= 1 || awayOdds <= 1) continue;

    const leagueName = fx.competition?.name?.value ?? '';
    const leagueId   = fx.competition?.id          ?? 0;
    const sourceId   = fx.id.split(':')[1] ?? fx.id;

    results.push({
      match_id:    fx.id,
      home_team:   home,
      away_team:   away,
      start_time:  fx.startDate,
      league_name: leagueName,
      league_id:   Number(leagueId),
      bookmakers: [{
        slug: 'sportingbet',
        name: 'Sportingbet',
        home: homeOdds,
        draw: drawOdds,
        away: awayOdds,
        url:  `https://www.sportingbet.bet.br/pt-br/sports/eventos/-${sourceId}`,
      }],
    });
  }

  return results;
}
