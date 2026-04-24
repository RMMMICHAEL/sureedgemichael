// TheSportsDB API wrapper — server-side only
// Free key: 123 | Base: https://www.thesportsdb.com/api/v1/json/123/

export type SportKey = 'soccer' | 'tennis' | 'basketball' | 'baseball' | 'hockey';

const SPORTS_MAP: Record<SportKey, string> = {
  soccer:     'Soccer',
  tennis:     'Tennis',
  basketball: 'Basketball',
  baseball:   'Baseball',
  hockey:     'Ice+Hockey',
};

export interface SportsEvent {
  idEvent:            string;
  strEvent:           string;
  strHomeTeam:        string;
  strAwayTeam:        string;
  strHomeTeamBadge:   string | null;
  strAwayTeamBadge:   string | null;
  strLeague:          string;
  strLeagueBadge:     string | null;
  strCountry:         string | null;
  strVenue:           string | null;
  dateEvent:          string;
  strTime:            string | null;
  strStatus:          string | null;
  intHomeScore:       string | null;
  intAwayScore:       string | null;
  strProgress:        string | null;
}

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json/123';

export async function fetchSportEvents(sport: SportKey, date: string): Promise<SportsEvent[]> {
  const sportParam = SPORTS_MAP[sport];
  const url = `${BASE_URL}/eventsday.php?d=${date}&s=${sportParam}`;
  const res = await fetch(url, {
    next: { revalidate: 0 },
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`TheSportsDB error: ${res.status}`);
  const data = await res.json();
  return (data?.events ?? []) as SportsEvent[];
}
