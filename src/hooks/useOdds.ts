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
  reconnectCount: number;   // reconexões Realtime (útil para detectar instabilidade)
  lastEventAt:    number;   // timestamp do último broadcast (ms)
  lastRefetchAt:  number;   // timestamp do último refetch (ms)
  lastLatencyMs:  number;   // ingest → UI renderizada
  avgLatencyMs:   number;   // média das últimas 20 latências
  fallbackPolls:  number;   // vezes que o fallback de 30s foi acionado
  // Estatísticas da última resposta da API
  lastMatchCount: number;   // 82 partidas (jogos, não odds)
  lastOddsTotal:  number;   // ~4186 linhas no DB
  lastBooksAvg:   number;   // média de bookmakers por partida
  lastBooksMin:   number;
  lastBooksMax:   number;
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

// Payload enviado pelo ingest via broadcast REST
interface BroadcastPayload {
  pluginId:    string;
  rowsWritten: number;
  syncedAt:    number; // Date.now() no momento exato do db_commit
  batchId:     string; // rastreamento ponta a ponta
}

// Trailing debounce: agrupa eventos até DEBOUNCE_MS de silêncio, depois 1 refetch
const DEBOUNCE_MS      = 2500;
// Fallback poll apenas quando Realtime estiver offline
const FALLBACK_POLL_MS = 30_000;

const EMPTY_METRICS: OddsRealtimeMetrics = {
  eventsReceived: 0, refetchCount: 0, reconnectCount: 0,
  lastEventAt: 0, lastRefetchAt: 0,
  lastLatencyMs: 0, avgLatencyMs: 0,
  fallbackPolls: 0,
  lastMatchCount: 0, lastOddsTotal: 0,
  lastBooksAvg: 0, lastBooksMin: 0, lastBooksMax: 0,
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

  const abortRef        = useRef<AbortController | null>(null);
  const connectedRef    = useRef(false);
  const hasConnectedRef = useRef(false); // distingue 1ª conexão de reconexão

  // Estado do debounce em ref — não causa re-renders, persiste entre renders
  const db = useRef<{
    timer:          ReturnType<typeof setTimeout> | null;
    events:         BroadcastPayload[];
    eventsReceived: number;
    refetchCount:   number;
    reconnectCount: number;
    fallbackPolls:  number;
    latencies:      number[];
    lastIngestAt:   number;
  }>({
    timer: null, events: [], eventsReceived: 0, refetchCount: 0,
    reconnectCount: 0, fallbackPolls: 0, latencies: [], lastIngestAt: 0,
  });

  const fetchOdds = useCallback(async (batch?: BroadcastPayload[], isFallback = false) => {
    if (paused) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const s = db.current;
    const batchIds = batch?.map(e => e.batchId).join(',') ?? 'initial';
    const fetchStart = Date.now();

    console.log(
      `[SureEdge] fetch_started reason=${isFallback ? 'fallback_poll' : (batch ? 'realtime' : 'mount')}` +
      ` batch_ids=${batchIds} events=${batch?.length ?? 0}`
    );

    try {
      const res = await fetch('/api/dg/odds-db?all=1', { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { ok: boolean; odds?: OddsMatch[] };

      if (d.ok && d.odds) {
        setOdds(d.odds);
        setError(null);
        setLastUpdate(Date.now());

        const elapsed    = Date.now() - fetchStart;
        const latencyMs  = s.lastIngestAt > 0 ? Date.now() - s.lastIngestAt : 0;
        if (latencyMs > 0 && latencyMs < 120_000) {
          s.latencies.push(latencyMs);
          if (s.latencies.length > 20) s.latencies.shift();
        }
        const avgLatency = s.latencies.length
          ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
          : 0;

        // Estatísticas de integridade dos dados
        const matchCount   = d.odds.length;
        const booksPerMatch = d.odds.map(m => m.bookmakers?.length ?? 0);
        const oddsTotal    = booksPerMatch.reduce((a, b) => a + b, 0);
        const booksMin     = matchCount > 0 ? Math.min(...booksPerMatch) : 0;
        const booksMax     = matchCount > 0 ? Math.max(...booksPerMatch) : 0;
        const booksAvg     = matchCount > 0 ? Math.round(oddsTotal / matchCount) : 0;

        // Log ponta a ponta — confirma que "82" são partidas, não odds
        console.log(
          `[SureEdge] fetch_finished` +
          ` matches=${matchCount} total_odds=${oddsTotal}` +
          ` books_per_match min=${booksMin} avg=${booksAvg} max=${booksMax}` +
          ` elapsed=${elapsed}ms latency_ingest_to_ui=${latencyMs}ms avg_latency=${avgLatency}ms` +
          ` reason=${isFallback ? 'fallback_poll' : (batch ? 'realtime' : 'mount')}` +
          ` batch_ids=${batchIds}`
        );

        const m: OddsRealtimeMetrics = {
          eventsReceived: s.eventsReceived,
          refetchCount:   s.refetchCount,
          reconnectCount: s.reconnectCount,
          lastEventAt:    s.lastIngestAt,
          lastRefetchAt:  Date.now(),
          lastLatencyMs:  latencyMs,
          avgLatencyMs:   avgLatency,
          fallbackPolls:  s.fallbackPolls,
          lastMatchCount: matchCount,
          lastOddsTotal:  oddsTotal,
          lastBooksAvg:   booksAvg,
          lastBooksMin:   booksMin,
          lastBooksMax:   booksMax,
        };
        setRtMetrics(m);

        if (typeof window !== 'undefined') {
          (window as Window & { __sureedge_rt?: OddsRealtimeMetrics }).__sureedge_rt = m;
        }

        if (recentlyUpdated.size > 0) setRecentlyUpdated(new Set());
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      console.warn(`[SureEdge] fetch_finished error="${(e as Error).message}" batch_ids=${batchIds}`);
    } finally {
      setLoading(false);
    }
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trailing debounce: reinicia o timer a cada evento, dispara 1 refetch após silêncio
  const handleBroadcast = useCallback((payload: BroadcastPayload) => {
    if (paused) return;
    const s = db.current;
    s.eventsReceived++;
    s.events.push(payload);
    if (payload.syncedAt > s.lastIngestAt) s.lastIngestAt = payload.syncedAt;

    console.log(
      `[SureEdge] broadcast_received batch_id=${payload.batchId}` +
      ` plugin=${payload.pluginId} rows_written=${payload.rowsWritten}` +
      ` total_pending=${s.events.length} debounce_restarts=${s.eventsReceived}`
    );

    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      s.refetchCount++;
      const batch = [...s.events];
      s.events    = [];
      s.timer     = null;
      fetchOdds(batch, false);
    }, DEBOUNCE_MS);
  }, [paused, fetchOdds]);

  useEffect(() => {
    fetchOdds(); // carga inicial (não conta como refetch)

    const supabase = getSupabaseClient();

    const channel = supabase
      .channel('odds_updates', { config: { broadcast: { ack: false } } })
      .on<{ payload: BroadcastPayload }>(
        'broadcast',
        { event: 'odds_updated' },
        ({ payload }) => {
          if (payload) handleBroadcast(payload as unknown as BroadcastPayload);
        }
      )
      .subscribe((status) => {
        const wasConnected = connectedRef.current;
        const ok           = status === 'SUBSCRIBED';
        connectedRef.current = ok;
        setConnected(ok);

        if (ok) {
          if (hasConnectedRef.current) {
            db.current.reconnectCount++;
            console.log(
              `[SureEdge] realtime=RECONNECTED reconnect_count=${db.current.reconnectCount}` +
              ` → fetch_started reason=reconnect_catchup`
            );
            fetchOdds(undefined, false);
          } else {
            console.log('[SureEdge] realtime=SUBSCRIBED (conexão inicial)');
          }
          hasConnectedRef.current = true;
        } else {
          console.warn(
            `[SureEdge] realtime=${status} — fallback_poll ativo (30s)`
          );
        }

        void wasConnected; // satisfaz linter
      });

    // Fallback: poll a cada 30s apenas quando Realtime estiver offline
    // Registra quando dispara para identificar falhas do canal
    const pollId = setInterval(() => {
      if (!connectedRef.current) {
        const s = db.current;
        s.fallbackPolls++;
        console.warn(
          `[SureEdge] fallback_poll #${s.fallbackPolls} fired — Realtime offline` +
          ` (total_events_missed_estimate=unknown)`
        );
        fetchOdds(undefined, true);
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
