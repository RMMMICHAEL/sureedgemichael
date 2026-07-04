'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { OddsMatch } from '@/lib/odds-source/types';

interface UseOddsOptions {
  matchId?: string;
  paused?:  boolean;
}

interface UseOddsResult {
  odds:            OddsMatch[];
  match:           OddsMatch | null;
  loading:         boolean;
  error:           string | null;
  connected:       boolean;
  lastUpdate:      number;
  recentlyUpdated: Set<string>;
}

const DG_API      = 'https://api.duplogreenengine.com/functions/v1/get-individual-odds';
const POLL_MS     = 3 * 60 * 1000; // re-busca a cada 3 minutos
const TIMEOUT_MS  = 15_000;

interface DGRow {
  match_id: string; home_team: string; away_team: string;
  match_date: string | null; start_time: string | null;
  league_slug: string | null; league_name: string | null;
  bookmaker_slug: string; bookmaker_name: string | null;
  market_type: string; odd_home: number; odd_draw: number | null;
  odd_away: number; match_url: string | null;
}

function rowsToMatches(rows: DGRow[]): OddsMatch[] {
  const map = new Map<string, OddsMatch>();
  for (const row of rows) {
    if (!map.has(row.match_id)) {
      map.set(row.match_id, {
        match_id: row.match_id, home_team: row.home_team, away_team: row.away_team,
        start_time: row.start_time ?? row.match_date ?? '',
        match_date: row.match_date ?? '',
        league_name: row.league_name ?? row.league_slug ?? '',
        league_slug: row.league_slug ?? '', bookmakers: [],
      });
    }
    const match = map.get(row.match_id)!;
    if (!match.bookmakers.find(b => b.slug === row.bookmaker_slug && b.market_type === row.market_type)) {
      match.bookmakers.push({
        slug: row.bookmaker_slug, name: row.bookmaker_name ?? row.bookmaker_slug,
        home: row.odd_home, draw: row.odd_draw ?? 0, away: row.odd_away,
        url: row.match_url ?? '', is_pa: row.market_type === '1x2_pa',
        market_type: row.market_type,
      });
    }
  }
  return Array.from(map.values());
}

export function useOdds(opts: UseOddsOptions = {}): UseOddsResult {
  const { matchId, paused = false } = opts;

  const [odds,       setOdds]       = useState<OddsMatch[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [connected,  setConnected]  = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const fetchOdds = useCallback(async () => {
    if (paused) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // 1. Busca token DG do servidor (renova se expirado)
      const tokenRes = await fetch('/api/dg/token', { signal: ctrl.signal });
      if (!tokenRes.ok) throw new Error('Não autenticado');
      const { token, anon } = await tokenRes.json() as { token: string; anon: string };

      const headers = {
        'Authorization': `Bearer ${token}`,
        'apikey': anon,
        'Origin':  'https://www.duplogreenengine.com',
        'Referer': 'https://www.duplogreenengine.com/',
      };

      // 2. Fetch direto do browser ao DG (IP residencial — sem proxy)
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const [r1, r2] = await Promise.allSettled([
        fetch(`${DG_API}?market=1x2`,    { signal: ctrl.signal, headers }),
        fetch(`${DG_API}?market=1x2_pa`, { signal: ctrl.signal, headers }),
      ]);
      clearTimeout(timer);

      const rows: DGRow[] = [];
      for (const r of [r1, r2]) {
        if (r.status !== 'fulfilled' || !r.value.ok) continue;
        try {
          const json = await r.value.json() as { odds?: DGRow[] } | DGRow[];
          const list: DGRow[] = Array.isArray(json) ? json : ((json as { odds?: DGRow[] }).odds ?? []);
          rows.push(...list);
        } catch { /* ignora parse errors */ }
      }

      if (rows.length === 0 && r1.status === 'fulfilled' && !r1.value.ok) {
        throw new Error(`DG HTTP ${r1.status === 'fulfilled' ? r1.value.status : 'erro'}`);
      }

      setOdds(rowsToMatches(rows));
      setConnected(true);
      setError(null);
      setLastUpdate(Date.now());
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setConnected(false);

      // Fallback: usa odds-db (importação manual)
      try {
        const fb = await fetch('/api/dg/odds-db?all=1');
        if (fb.ok) {
          const d = await fb.json() as { ok: boolean; odds?: OddsMatch[] };
          if (d.ok && d.odds?.length) {
            setOdds(d.odds);
            setConnected(false); // indica que é dado offline
          }
        }
      } catch { /* silencia */ }
    } finally {
      setLoading(false);
    }
  }, [paused]);

  useEffect(() => {
    fetchOdds();
    const id = setInterval(fetchOdds, POLL_MS);
    return () => { clearInterval(id); abortRef.current?.abort(); };
  }, [fetchOdds]);

  const match        = matchId ? (odds.find(m => m.match_id === matchId) ?? null) : null;
  const filteredOdds = matchId ? (match ? [match] : []) : odds;

  return { odds: filteredOdds, match, loading, error, connected, lastUpdate, recentlyUpdated: new Set() };
}
