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

const POLL_INTERVAL_MS = 3 * 60 * 1000; // re-busca a cada 3 minutos

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
      const res  = await fetch('/api/dg/odds-live', { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ok: boolean; odds?: OddsMatch[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? 'Erro na API');

      setOdds(data.odds ?? []);
      setConnected(true);
      setError(null);
      setLastUpdate(Date.now());
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [paused]);

  useEffect(() => {
    fetchOdds();
    const id = setInterval(fetchOdds, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchOdds]);

  const match        = matchId ? (odds.find(m => m.match_id === matchId) ?? null) : null;
  const filteredOdds = matchId ? (match ? [match] : []) : odds;

  // recentlyUpdated não se aplica ao polling — sempre vazio
  const recentlyUpdated = new Set<string>();

  return { odds: filteredOdds, match, loading, error, connected, lastUpdate, recentlyUpdated };
}
