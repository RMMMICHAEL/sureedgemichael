'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { OddsMatch, OddsUpdateEvent } from '@/lib/odds-source/types';

interface UseOddsOptions {
  matchId?: string;
  paused?: boolean;
}

interface UseOddsResult {
  odds:             OddsMatch[];
  match:            OddsMatch | null;
  loading:          boolean;
  error:            string | null;
  connected:        boolean;
  lastUpdate:       number;
  recentlyUpdated:  Set<string>;
}

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS  = 30_000;
const RECONNECT_BACKOFF = 1.5;
const FLASH_DURATION_MS = 2_000;

export function useOdds(opts: UseOddsOptions = {}): UseOddsResult {
  const { matchId, paused = false } = opts;

  const [odds,            setOdds]            = useState<OddsMatch[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [connected,       setConnected]       = useState(false);
  const [lastUpdate,      setLastUpdate]      = useState(0);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());

  const esRef      = useRef<EventSource | null>(null);
  const retryMsRef = useRef(RECONNECT_BASE_MS);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted  = useRef(false);

  const flash = useCallback((matchId: string) => {
    setRecentlyUpdated(prev => new Set([...prev, matchId]));
    setTimeout(() => {
      if (unmounted.current) return;
      setRecentlyUpdated(prev => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }, FLASH_DURATION_MS);
  }, []);

  const connect = useCallback(() => {
    if (unmounted.current || paused) return;

    esRef.current?.close();
    const es = new EventSource('/api/odds/stream');
    esRef.current = es;

    es.addEventListener('odds', (e: MessageEvent) => {
      if (unmounted.current) return;
      try {
        const event = JSON.parse(e.data) as OddsUpdateEvent;

        if (event.type === 'error') {
          setError(event.error ?? 'Erro desconhecido');
          return;
        }

        if (event.type === 'heartbeat') return;

        if (event.type === 'snapshot') {
          setOdds(event.data as OddsMatch[]);
          setLoading(false);
          setConnected(true);
          setError(null);
          retryMsRef.current = RECONNECT_BASE_MS;
          setLastUpdate(event.ts);
          return;
        }

        if (event.type === 'update' && event.data) {
          const updated = event.data as OddsMatch;
          setOdds(prev => {
            const idx = prev.findIndex(m => m.match_id === updated.match_id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx]  = updated;
              return next;
            }
            return [...prev, updated];
          });
          setLastUpdate(event.ts);
          flash(updated.match_id);
        }
      } catch { /* JSON parse error */ }
    });

    es.onerror = () => {
      if (unmounted.current) return;
      setConnected(false);
      es.close();

      retryTimer.current = setTimeout(() => {
        retryMsRef.current = Math.min(retryMsRef.current * RECONNECT_BACKOFF, RECONNECT_MAX_MS);
        connect();
      }, retryMsRef.current);
    };
  }, [paused, flash]);

  useEffect(() => {
    unmounted.current = false;
    if (!paused) connect();

    return () => {
      unmounted.current = true;
      esRef.current?.close();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [connect, paused]);

  const match       = matchId ? (odds.find(m => m.match_id === matchId) ?? null) : null;
  const filteredOdds = matchId ? (match ? [match] : []) : odds;

  return { odds: filteredOdds, match, loading, error, connected, lastUpdate, recentlyUpdated };
}
