'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { OddsMatch } from '@/lib/odds-source/types';
import { getSupabaseClient } from '@/lib/supabase/client';

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

// Fallback se Realtime desconectar
const FALLBACK_POLL_MS = 30 * 1000;

export function useOdds(opts: UseOddsOptions = {}): UseOddsResult {
  const { matchId, paused = false } = opts;

  const [odds,             setOdds]            = useState<OddsMatch[]>([]);
  const [loading,          setLoading]         = useState(true);
  const [error,            setError]           = useState<string | null>(null);
  const [lastUpdate,       setLastUpdate]      = useState(0);
  const [connected,        setConnected]       = useState(false);
  const [recentlyUpdated,  setRecentlyUpdated] = useState<Set<string>>(new Set());

  const abortRef      = useRef<AbortController | null>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changedIdsRef = useRef<Set<string>>(new Set());

  const fetchOdds = useCallback(async (updatedIds?: Set<string>) => {
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
        if (updatedIds && updatedIds.size > 0) {
          setRecentlyUpdated(new Set(updatedIds));
          setTimeout(() => setRecentlyUpdated(new Set()), 3000);
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [paused]);

  // Debounce para agrupar eventos em rajada (ex: 36 batches de um sync completo)
  const scheduleRefetch = useCallback((mId: string) => {
    changedIdsRef.current.add(mId);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const ids = new Set(changedIdsRef.current);
      changedIdsRef.current.clear();
      fetchOdds(ids);
    }, 2000); // 2s para acumular todos os batches do mesmo ciclo
  }, [fetchOdds]);

  useEffect(() => {
    fetchOdds();

    const supabase = getSupabaseClient();

    // Supabase Realtime: escuta INSERT e UPDATE em bookmaker_odds
    const channel = supabase
      .channel('bookmaker_odds_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookmaker_odds' },
        (payload) => {
          const record = (payload.new ?? payload.old) as { match_id?: string } | null;
          scheduleRefetch(record?.match_id ?? '');
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR') {
          // Realtime falhou — o fallback de 30s cobre
          console.warn('[SureEdge] Realtime desconectado, usando polling de 30s');
        }
      });

    // Fallback polling (garante atualização mesmo se Realtime cair)
    const pollId = setInterval(() => fetchOdds(), FALLBACK_POLL_MS);

    return () => {
      clearInterval(pollId);
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchOdds, scheduleRefetch]);

  const match        = matchId ? (odds.find(m => m.match_id === matchId) ?? null) : null;
  const filteredOdds = matchId ? (match ? [match] : []) : odds;

  return { odds: filteredOdds, match, loading, error, connected, lastUpdate, recentlyUpdated };
}
