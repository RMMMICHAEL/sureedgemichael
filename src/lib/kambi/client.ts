/**
 * Cliente Kambi — API pública, sem autenticação.
 * Casas confirmadas via teste direto na API Kambi CDN:
 *  - KTO       (us.offering-api.kambicdn.com / client: ktobr)
 *  - Sportingbet (eu-offering-api.kambicdn.com / client: sportingbet)
 *  - Superbet  (eu-offering-api.kambicdn.com / client: superbet)
 */

import type { OddsSummary } from '@/lib/altenar/client';
import { proxyFetch } from '@/lib/proxy/fetch';

const BASE_US = 'https://us.offering-api.kambicdn.com/offering/v2018';
const BASE_EU = 'https://eu-offering-api.kambicdn.com/offering/v2018';

interface KambiClientDef {
  id:     string;
  name:   string;
  base:   string;
  origin: string;
  is_pa:  boolean;
  url:    (id: number) => string;
}

// KTO usa Kambi US CDN — bloqueado por Vercel IP, usa proxyFetch.
// Sportingbet já é coberta pelo cliente bwin/CDS (200+ eventos), não duplicar.
const CLIENTS: KambiClientDef[] = [
  {
    id:     'ktobr',
    name:   'KTO',
    base:   BASE_US,
    origin: 'https://www.kto.bet.br',
    is_pa:  false, // KTO não opera com Pagamento Antecipado
    url:    (id) => `https://www.kto.bet.br/p/sports/event/#/football/event/${id}`,
  },
];

// Palavras que identificam e-sports / futebol virtual — excluir
const VIRTUAL_KEYWORDS = ['cyber', 'virtual', 'esoccer', 'e-soccer', 'inplay arena', 'cla (', 'live arena'];

function isVirtualLeague(groupName: string): boolean {
  const g = groupName.toLowerCase();
  return VIRTUAL_KEYWORDS.some(k => g.includes(k));
}

interface KambiEvent {
  id:        number;
  homeName:  string;
  awayName:  string;
  start:     string;
  group:     string;   // campo real da API Kambi (não groupName)
  groupId:   number;
  betOffers: KambiBetOffer[];
}

interface KambiBetOffer {
  betOfferType: { name: string };
  outcomes:     Array<{ label: string; odds: number }>;
  suspended?:   boolean;
}

interface KambiListResponse {
  events?: Array<{ event: KambiEvent; betOffers?: KambiBetOffer[] }>;
}

function decimalOdds(raw: number): number {
  return raw > 100 ? raw / 1000 : raw; // Kambi usa millodds (×1000)
}

async function fetchKambiFootball(client: KambiClientDef): Promise<KambiEvent[]> {
  const url = `${client.base}/${client.id}/listView/football.json?lang=pt_BR&market=BR&client_id=200&channel_id=3&useCombined=true&ncid=${Date.now()}`;

  try {
    const res = await proxyFetch(url, {
      headers: {
        Accept:       'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Origin:       client.origin,
        Referer:      client.origin + '/',
      },
      cache: 'no-store',
    });

    if (!res.ok) return [];

    const data: KambiListResponse = await res.json();
    return (data.events ?? []).map(e => ({
      ...e.event,
      betOffers: e.betOffers ?? e.event.betOffers ?? [],
    }));
  } catch {
    return [];
  }
}

function extractMatchOdds(betOffers: KambiBetOffer[]): { home: number; draw: number; away: number } | null {
  const offer = betOffers.find(bo =>
    !bo.suspended &&
    (bo.betOfferType.name === 'Match' ||
     bo.betOfferType.name === 'Match Result' ||
     bo.betOfferType.name === 'Result')
  );

  if (!offer || offer.outcomes.length < 3) return null;

  const [o1, oX, o2] = offer.outcomes;
  const home = decimalOdds(o1?.odds ?? 0);
  const draw = decimalOdds(oX?.odds ?? 0);
  const away = decimalOdds(o2?.odds ?? 0);

  if (home <= 1 || away <= 1) return null;
  return { home, draw, away };
}

export async function getKambiOdds(): Promise<OddsSummary[]> {
  const results = await Promise.all(
    CLIENTS.map(async (client) => {
      const events = await fetchKambiFootball(client);
      return { client, events };
    })
  );

  const eventMap = new Map<string, OddsSummary>();

  for (const { client, events } of results) {
    for (const ev of events) {
      // Exclui e-sports / futebol virtual
      if (isVirtualLeague(ev.group)) continue;

      const odds = extractMatchOdds(ev.betOffers);
      if (!odds) continue;

      const key = `${ev.groupId}-${ev.homeName}-${ev.awayName}`;

      if (!eventMap.has(key)) {
        eventMap.set(key, {
          match_id:    String(ev.id),
          home_team:   ev.homeName,
          away_team:   ev.awayName,
          start_time:  ev.start,
          league_name: ev.group,
          league_id:   ev.groupId,
          bookmakers:  [],
        });
      }

      eventMap.get(key)!.bookmakers.push({
        slug:  client.id,
        name:  client.name,
        home:  odds.home,
        draw:  odds.draw,
        away:  odds.away,
        url:   client.url(ev.id),
        is_pa: client.is_pa,
      });
    }
  }

  return Array.from(eventMap.values()).filter(e => e.bookmakers.length > 0);
}
