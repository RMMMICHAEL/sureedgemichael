import type { SportsEvent, SportKey } from './sportsdb';

// ── Live statuses ────────────────────────────────────────────────────────────
const LIVE_STATUSES = new Set([
  '1H','2H','HT','ET','P','Q1','Q2','Q3','Q4','OT',
  'IN1','IN2','IN3','IN4','IN5','IN6','IN7','IN8','IN9',
  'P1','P2','P3','LIVE',
]);

// ── Finished statuses ────────────────────────────────────────────────────────
const FINISHED_STATUSES = new Set(['FT','AET','PEN','AP','ABD','CANC','PPD','WO','AWD']);

export type EventStatus = 'live' | 'upcoming' | 'finished' | 'postponed';

export function getEventStatus(e: SportsEvent): EventStatus {
  const s = (e.strStatus ?? '').toUpperCase();
  if (!s || s === 'NS' || s === '') return 'upcoming';
  if (LIVE_STATUSES.has(s)) return 'live';
  if (s === 'PPD' || s === 'SUSP') return 'postponed';
  if (FINISHED_STATUSES.has(s)) return 'finished';
  // numeric minute e.g. "45+2" → live
  if (/^\d/.test(s)) return 'live';
  return 'upcoming';
}

// ── Priority leagues (higher index = lower priority) ────────────────────────
const PRIORITY_LEAGUES: Record<SportKey, string[]> = {
  soccer: [
    'UEFA Champions League',
    'UEFA Europa League',
    'UEFA Europa Conference League',
    'English Premier League',
    'La Liga',
    'Serie A',
    'Bundesliga',
    'Ligue 1',
    'Brazilian Série A',
    'Copa do Brasil',
    'Copa Libertadores',
    'Copa Sudamericana',
    'MLS',
  ],
  basketball: ['NBA', 'EuroLeague', 'NBB'],
  hockey:     ['NHL', 'KHL'],
  baseball:   ['MLB'],
  tennis:     ['ATP Masters', 'ATP Tour', 'WTA Tour', 'Grand Slam', 'Australian Open', 'Roland Garros', 'Wimbledon', 'US Open'],
};

function leaguePriority(league: string, sport: SportKey): number {
  const list = PRIORITY_LEAGUES[sport] ?? [];
  const idx = list.findIndex(l => league.toLowerCase().includes(l.toLowerCase()));
  return idx === -1 ? list.length : idx;
}

function statusOrder(status: EventStatus): number {
  if (status === 'live')      return 0;
  if (status === 'upcoming')  return 1;
  if (status === 'postponed') return 2;
  return 3; // finished
}

export function sortEvents(events: SportsEvent[], sport: SportKey): SportsEvent[] {
  return [...events].sort((a, b) => {
    const sa = getEventStatus(a), sb = getEventStatus(b);
    const so = statusOrder(sa) - statusOrder(sb);
    if (so !== 0) return so;

    // Both same status → league priority
    const la = leaguePriority(a.strLeague, sport);
    const lb = leaguePriority(b.strLeague, sport);
    if (la !== lb) return la - lb;

    // Then by time
    const ta = a.strTime ?? '99:99';
    const tb = b.strTime ?? '99:99';
    return ta.localeCompare(tb);
  });
}

export function groupByLeague(events: SportsEvent[]): Map<string, SportsEvent[]> {
  const map = new Map<string, SportsEvent[]>();
  for (const ev of events) {
    const key = ev.strLeague || 'Outros';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return map;
}
