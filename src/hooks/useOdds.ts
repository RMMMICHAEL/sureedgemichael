'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { OddsMatch } from '@/lib/odds-source/types';
import { getSupabaseClient } from '@/lib/supabase/client';

interface UseOddsOptions {
  matchId?: string;
  paused?:  boolean;
}

export interface OddsRealtimeMetrics {
  eventsReceived: number;   // broadcasts recebidos desde montagem
  refetchCount:   number;   // refetches executados
  lastEventAt:    number;   // timestamp do último broadcast (ms)
  lastRefetchAt:  number;   // timestamp do último refetch (ms)
  lastLatencyMs:  number;   // ingest → UI renderizada
  avgLatencyMs:   number;   // média das últimas 20 latências
}

interface UseOddsResult {
  odds:            OddsMatch[];
  match:           OddsMatch | null;
  loading:         boolean;
  error:           string | null;
  connected:       boolean;
  lastUpdate:      number;
  recentlyUpdated: Set<string>;
  rtMetrics:       OddsRealtimeMetrics;
}

// Payload do broadcast enviado pelo ingest
interface BroadcastPayload {
  pluginId:    string;
  rowsWritten: number;
  syncedAt:    number; // Date.now() no momento exato do upsert
}

const DEBOUNCE_MS      = 2500;   // silêncio necessário antes de disparar refetch
const FALLBACK_POLL_MS = 30_000; // polling quando Realtime estiver offline

const EMPTY_METRICS: OddsRealtimeMetrics = {
  eventsReceived: 0, refetchCount: 0,
  lastEventAt: 0, lastRefetchAt: 0,
  lastLatencyMs: 0, avgLatencyMs: 0,
};

export function useOdds(opts: UseOddsOptions = {}): UseOddsResult {
  const { matchId, paused = false } = opts;

  const [odds,            setOdds]           = useState<OddsMatch[]>([]);
  const [loading,         setLoading]        = useState(true);
  const [error,           setError]          = useState<string | null>(null);
  const [lastUpdate,      setLastUpdate]     = useState(0);
  const [connected,       setConnected]      = useState(false);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());
  const [rtMetrics,       setRtMetrics]      = useState<OddsRealtimeMetrics>(EMPTY_METRICS);

  // Refs — não causam re-renders, persistem entre renders
  const abortRef     = useRef<AbortController | null>(null);
  const connectedRef = useRef(false);

  // Estado do debounce em ref: evita capturas de closure obsoletas
  const db = useRef<{
    timer:          ReturnType<typeof setTimeout> | null;
    events:         BroadcastPayload[];
    eventsReceived: number;
    refetchCount:   number;
    latencies:      number[];
    lastIngestAt:   number;
  }>({ timer: null, events: [], eventsReceived: 0, refetchCount: 0, latencies: [], lastIngestAt: 0 });

  const fetchOdds = useCallback(async (batch?: BroadcastPayload[]) => {
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

        // Calcula latência: momento do ingest → UI renderizada
        const s = db.current;
        const latencyMs = s.lastIngestAt > 0 ? Date.now() - s.lastIngestAt : 0;
        if (latencyMs > 0 && latencyMs < 120_000) { // ignora outliers
          s.latencies.push(latencyMs);
          if (s.latencies.length > 20) s.latencies.shift();
        }
        const avgLatency = s.latencies.length
          ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
          : 0;

        const m: OddsRealtimeMetrics = {
          eventsReceived: s.eventsReceived,
          refetchCount:   s.refetchCount,
          lastEventAt:    s.lastIngestAt,
          lastRefetchAt:  Date.now(),
          lastLatencyMs:  latencyMs,
          avgLatencyMs:   avgLatency,
        };
        setRtMetrics(m);

        // Expõe métricas no window para debug rápido no console
        if (typeof window !== 'undefined') {
          (window as Window & { __sureedge_rt?: OddsRealtimeMetrics }).__sureedge_rt = m;
        }

        if (batch?.length) {
          const totalRows = batch.reduce((s, e) => s + (e.rowsWritten ?? 0), 0);
          console.debug(
            `[SureEdge] refetch #${s.refetchCount}: ${batch.length} evento(s) → ${totalRows} linhas | ` +
            `latência ${latencyMs}ms | avg ${avgLatency}ms`
          );
        }

        if (recentlyUpdated.size > 0) {
          setRecentlyUpdated(new Set());
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce: acumula eventos até DEBOUNCE_MS de silêncio, depois 1 refetch
  const handleBroadcast = useCallback((payload: BroadcastPayload) => {
    if (paused) return;
    const s = db.current;
    s.eventsReceived++;
    s.events.push(payload);
    // Guarda o syncedAt mais recente como referência de latência
    if (payload.syncedAt > s.lastIngestAt) s.lastIngestAt = payload.syncedAt;

    // Reinicia timer a cada novo evento (trailing debounce)
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      s.refetchCount++;
      const batch = [...s.events];
      s.events = [];
      s.timer  = null;
      fetchOdds(batch);
    }, DEBOUNCE_MS);
  }, [paused, fetchOdds]);

  useEffect(() => {
    fetchOdds(); // carga inicial

    const supabase = getSupabaseClient();

    // Canal de broadcast dedicado — 1 mensagem por batch de ingest (100 linhas)
    // Volume: ~36 mensagens por sync completo vs 3.600+ eventos de postgres_changes
    const channel = supabase
      .channel('odds_updates', { config: { broadcast: { ack: false } } })
      .on<{ payload: BroadcastPayload }>(
        'broadcast',
        { event: 'odds_updated' },
        ({ payload }) => { if (payload) handleBroadcast(payload as unknown as BroadcastPayload); }
      )
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        connectedRef.current = ok;
        setConnected(ok);
        if (status === 'CHANNEL_ERROR') {
          console.warn('[SureEdge] Realtime desconectado — fallback 30s ativo');
        }
      });

    // Fallback: polling a cada 30s apenas quando Realtime estiver offline
    const pollId = setInterval(() => {
      if (!connectedRef.current) {
        console.debug('[SureEdge] fallback poll (Realtime offline)');
        fetchOdds();
      }
    }, FALLBACK_POLL_MS);

    return () => {
      clearInterval(pollId);
      abortRef.current?.abort();
      const { timer } = db.current;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchOdds, handleBroadcast]);

  const match        = matchId ? (odds.find(m => m.match_id === matchId) ?? null) : null;
  const filteredOdds = matchId ? (match ? [match] : []) : odds;

  return { odds: filteredOdds, match, loading, error, connected, lastUpdate, recentlyUpdated, rtMetrics };
}
