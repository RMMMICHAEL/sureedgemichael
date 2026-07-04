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

const POLL_MS = 3 * 60 * 1000;

export function useOdds(opts: UseOddsOptions = {}): UseOddsResult {
  const { matchId, paused = false } = opts;

  const [odds,       setOdds]       = useState<OddsMatch[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const fetchOdds = useCallback(async () => {
    if (paused) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/dg/odds-db?all=1', { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { ok: boolean; odds?: OddsMatch[] };
      if (d.ok && d.odds) {
        setOdds(d.odds);
        setError(null);
        setLastUpdate(Date.now());
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
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

  return { odds: filteredOdds, match, loading, error, connected: false, lastUpdate, recentlyUpdated: new Set() };
}
