/**
 * LocalAdapter — fallback que lê a tabela bookmaker_odds do Supabase local
 * (mesma lógica de /api/dg/odds-db).
 *
 * Usado quando o DG está indisponível ou como fonte primária em modo offline.
 */

import { createClient } from '@supabase/supabase-js';
import type { IOddsAdapter, OddsMatch, OddsBookmaker, OddsSourceOptions } from './types';
import { getCached, setCached } from './cache';

function todayISO(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export class LocalAdapter implements IOddsAdapter {
  async fetchAll(opts: OddsSourceOptions = {}): Promise<OddsMatch[]> {
    const cached = getCached();
    if (cached) return cached;

    const fromDate = opts.fromDate ?? todayISO();
    const limit    = opts.limit ?? 2000;
    const sb       = getAdmin();

    const { data, error } = await sb
      .from('bookmaker_odds')
      .select('match_id,home_team,away_team,match_date,start_time,league_slug,league_name,bookmaker_slug,bookmaker_name,market_type,odd_home,odd_draw,odd_away,match_url')
      .gte('match_date', fromDate)
      .order('match_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(limit);

    if (error) throw new Error(`LocalAdapter error: ${error.message}`);

    const matchMap = new Map<string, OddsMatch>();

    for (const row of data ?? []) {
      if (!matchMap.has(row.match_id)) {
        matchMap.set(row.match_id, {
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

      const match = matchMap.get(row.match_id)!;
      const isPA  = row.market_type === '1x2_pa';
      const already = match.bookmakers.find(
        (b: OddsBookmaker) => b.slug === row.bookmaker_slug && b.market_type === row.market_type
      );
      if (!already) {
        match.bookmakers.push({
          slug:        row.bookmaker_slug,
          name:        row.bookmaker_name ?? row.bookmaker_slug,
          home:        row.odd_home,
          draw:        row.odd_draw ?? 0,
          away:        row.odd_away,
          url:         row.match_url ?? '',
          is_pa:       isPA,
          market_type: row.market_type,
        });
      }
    }

    const matches = Array.from(matchMap.values());
    setCached(matches);
    return matches;
  }

  async fetchMatch(matchId: string): Promise<OddsMatch | null> {
    const all = await this.fetchAll();
    return all.find(m => m.match_id === matchId) ?? null;
  }
}
