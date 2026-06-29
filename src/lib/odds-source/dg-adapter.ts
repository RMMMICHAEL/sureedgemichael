/**
 * DGApiAdapter
 *
 * Consome a infraestrutura existente do DuploGreenEngine:
 *   - Snapshot inicial: REST do Supabase DG (bookmaker_odds)
 *   - Por match_id:     Edge Function get-match
 *
 * Todas as credenciais são públicas (anon key exposta no frontend do DG).
 */

import type { IOddsAdapter, OddsMatch, OddsBookmaker, OddsSourceOptions } from './types';
import { getCached, setCached, getCachedMatch, setCachedMatch } from './cache';

const DG_SUPABASE_URL  = 'https://db.duplogreenengine.com';
const DG_ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3Njg0MDM4LCJleHAiOjIwOTMwNDQwMzh9.9JN4OCzFRPvDhBdrd81PjZJzFnZs3EgZtdHFAuKENks';
const DG_API_URL       = 'https://api.duplogreenengine.com';

const DG_HEADERS = {
  'apikey':       DG_ANON_KEY,
  'Content-Type': 'application/json',
  'Accept':       'application/json',
};

interface DGOddsRow {
  match_id:       string;
  home_team:      string;
  away_team:      string;
  match_date:     string | null;
  start_time:     string | null;
  league_slug:    string | null;
  league_name:    string | null;
  bookmaker_slug: string;
  bookmaker_name: string | null;
  market_type:    string;
  odd_home:       number;
  odd_draw:       number | null;
  odd_away:       number;
  match_url:      string | null;
}

function todayISO(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000); // BRT
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function rowsToMatches(rows: DGOddsRow[]): OddsMatch[] {
  const map = new Map<string, OddsMatch>();

  for (const row of rows) {
    if (!map.has(row.match_id)) {
      map.set(row.match_id, {
        match_id:    row.match_id,
        home_team:   row.home_team,
        away_team:   row.away_team,
        start_time:  row.start_time  ?? row.match_date ?? '',
        match_date:  row.match_date  ?? '',
        league_name: row.league_name ?? row.league_slug ?? '',
        league_slug: row.league_slug ?? '',
        bookmakers:  [],
      });
    }

    const match = map.get(row.match_id)!;
    const already = match.bookmakers.find(
      b => b.slug === row.bookmaker_slug && b.market_type === row.market_type
    );
    if (!already) {
      const bk: OddsBookmaker = {
        slug:        row.bookmaker_slug,
        name:        row.bookmaker_name ?? row.bookmaker_slug,
        home:        row.odd_home,
        draw:        row.odd_draw ?? 0,
        away:        row.odd_away,
        url:         row.match_url ?? '',
        is_pa:       row.market_type === '1x2_pa',
        market_type: row.market_type,
      };
      match.bookmakers.push(bk);
    }
  }

  return Array.from(map.values());
}

export class DGApiAdapter implements IOddsAdapter {
  async fetchAll(opts: OddsSourceOptions = {}): Promise<OddsMatch[]> {
    const cached = getCached();
    if (cached) return cached;

    const fromDate = opts.fromDate ?? todayISO();
    const limit    = opts.limit ?? 2000;

    // Busca diretamente na tabela bookmaker_odds do Supabase DG
    const params = new URLSearchParams({
      select:    'match_id,home_team,away_team,match_date,start_time,league_slug,league_name,bookmaker_slug,bookmaker_name,market_type,odd_home,odd_draw,odd_away,match_url',
      match_date: `gte.${fromDate}`,
      order:     'match_date.asc,start_time.asc',
      limit:     String(limit),
    });

    const res = await fetch(
      `${DG_SUPABASE_URL}/rest/v1/bookmaker_odds?${params}`,
      { headers: DG_HEADERS, next: { revalidate: 0 } },
    );

    if (!res.ok) {
      throw new Error(`DG REST error ${res.status}: ${await res.text()}`);
    }

    const rows: DGOddsRow[] = await res.json();
    const matches = rowsToMatches(rows);
    setCached(matches);
    return matches;
  }

  async fetchMatch(matchId: string): Promise<OddsMatch | null> {
    const cached = getCachedMatch(matchId);
    if (cached) return cached;

    const url = `${DG_API_URL}/functions/v1/get-match?id=${encodeURIComponent(matchId)}&_t=${Date.now()}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 0 },
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (!json.success || !json.odds?.length) return null;

    // get-match retorna rows — converter para OddsMatch
    const matches = rowsToMatches(json.odds as DGOddsRow[]);
    const match   = matches.find(m => m.match_id === matchId) ?? null;
    if (match) setCachedMatch(match);
    return match;
  }
}
