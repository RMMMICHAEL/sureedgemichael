/**
 * Cliente Kambi — API pública, sem autenticação.
 * Cobre: Sportingbet (mesmo servidor Kambi usado por várias casas globais).
 * Endpoint padrão: eu-offering-api.kambicdn.com/offering/v2018/{client}/listView/football.json
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE = 'https://eu-offering-api.kambicdn.com/offering/v2018';

const CLIENTS: Record<string, string> = {
  sportingbet: 'Sportingbet',
};

interface KambiEvent {
  id:          number;
  homeName:    string;
  awayName:    string;
  start:       string; // ISO
  groupName:   string; // league
  groupId:     number;
  betOffers:   KambiBetOffer[];
}

interface KambiBetOffer {
  betOfferType: { name: string };
  outcomes:     Array<{ label: string; odds: number; oddsFractional?: string }>;
  suspended?:   boolean;
}

interface KambiListResponse {
  events?: Array<{ event: KambiEvent; betOffers?: KambiBetOffer[] }>;
}

function decimalOdds(raw: number): number {
  // Kambi returns odds * 1000 (millodds format)
  return raw > 100 ? raw / 1000 : raw;
}

async function fetchKambiFootball(clientId: string): Promise<KambiEvent[]> {
  const url = `${BASE}/${clientId}/listView/football.json?lang=pt_BR&market=BR&useCombined=true&ncid=${Date.now()}`;

  const res = await fetch(url, {
    headers: {
      'Accept':     'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible)',
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) return [];

  const data: KambiListResponse = await res.json();
  return (data.events ?? []).map(e => ({
    ...e.event,
    betOffers: e.betOffers ?? e.event.betOffers ?? [],
  }));
}

function extractMatchOdds(betOffers: KambiBetOffer[]): { home: number; draw: number; away: number } | null {
  // Kambi bet offer type for 1X2 is "Match" or "Match Result"
  const matchOffer = betOffers.find(bo =>
    !bo.suspended &&
    (bo.betOfferType.name === 'Match' ||
     bo.betOfferType.name === 'Match Result' ||
     bo.betOfferType.name === 'Result')
  );

  if (!matchOffer || matchOffer.outcomes.length < 3) return null;

  const [o1, oX, o2] = matchOffer.outcomes;
  const home = decimalOdds(o1?.odds ?? 0);
  const draw = decimalOdds(oX?.odds ?? 0);
  const away = decimalOdds(o2?.odds ?? 0);

  if (home <= 1 || away <= 1) return null;
  return { home, draw, away };
}

export async function getKambiOdds(): Promise<OddsSummary[]> {
  const results = await Promise.all(
    Object.entries(CLIENTS).map(async ([clientId, name]) => {
      const events = await fetchKambiFootball(clientId);
      return { clientId, name, events };
    })
  );

  const eventMap = new Map<string, OddsSummary>();

  for (const { clientId, name, events } of results) {
    for (const ev of events) {
      const odds = extractMatchOdds(ev.betOffers);
      if (!odds) continue;

      const key = `${ev.groupId}-${ev.homeName}-${ev.awayName}`;

      if (!eventMap.has(key)) {
        eventMap.set(key, {
          match_id:    String(ev.id),
          home_team:   ev.homeName,
          away_team:   ev.awayName,
          start_time:  ev.start,
          league_name: ev.groupName,
          league_id:   ev.groupId,
          bookmakers:  [],
        });
      }

      eventMap.get(key)!.bookmakers.push({
        slug: clientId,
        name,
        home: odds.home,
        draw: odds.draw,
        away: odds.away,
        url:  `https://sports.sportingbet.com/sports/futebol/evento/${ev.id}`,
      });
    }
  }

  return Array.from(eventMap.values()).filter(e => e.bookmakers.length > 0);
}
