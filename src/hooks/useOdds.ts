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
  deltaFetches:   number;   // refetches que usaram ?ids= (delta) em vez de full
  fullFetches:    number;   // refetches que precisaram buscar a tabela inteira
  notModified:    number;   // respostas 304 (nada mudou desde o último full fetch)
  errorCount:     number;   // fetches que falharam (rede, HTTP não-ok, etc.)
  staleDiscards:  number;   // respostas descartadas por chegar fora de ordem
  lastBytes:      number;   // tamanho (aprox., bytes) da última resposta aplicada
  totalBytes:     number;   // soma acumulada desde a montagem — útil pra comparar antes/depois
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

// Payload enviado pelo ingest via broadcast REST.
// upsertedIds/removedIds vêm undefined quando o lote passa de
// MAX_IDS_IN_BROADCAST no servidor — nesse caso cai pro full refetch.
interface BroadcastPayload {
  pluginId:     string;
  rowsWritten:  number;
  syncedAt:     number; // Date.now() no momento exato do db_commit
  batchId:      string; // rastreamento ponta a ponta
  upsertedIds?: string[];
  removedIds?:  string[];
}

// Trailing debounce: agrupa eventos até DEBOUNCE_MS de silêncio, depois 1 refetch
const DEBOUNCE_MS      = 2500;
// Fallback poll apenas quando Realtime estiver offline
const FALLBACK_POLL_MS = 30_000;

const EMPTY_METRICS: OddsRealtimeMetrics = {
  eventsReceived: 0, refetchCount: 0, reconnectCount: 0,
  lastEventAt: 0, lastRefetchAt: 0,
  lastLatencyMs: 0, avgLatencyMs: 0,
  fallbackPolls: 0, deltaFetches: 0, fullFetches: 0,
  notModified: 0, errorCount: 0, staleDiscards: 0,
  lastBytes: 0, totalBytes: 0,
  lastMatchCount: 0, lastOddsTotal: 0,
  lastBooksAvg: 0, lastBooksMin: 0, lastBooksMax: 0,
};

// Aplica um lote de matches atualizados + ids removidos sobre o estado atual,
// sem descartar o que não mudou — é o que evita rebuscar a tabela inteira.
// SUBSTITUI (nunca soma/anexa) o array de bookmakers de cada match afetado
// pelo que veio fresco do servidor — isso é o que garante que uma casa ou
// mercado removido no banco desapareça também no cliente, em vez de ficar
// "grudado" de uma resposta antiga.
function mergeOdds(current: OddsMatch[], updated: OddsMatch[], removedIds: string[]): OddsMatch[] {
  const removedSet = new Set(removedIds);
  const updatedMap = new Map(updated.map(m => [m.match_id, m]));
  const result: OddsMatch[] = [];
  for (const m of current) {
    if (removedSet.has(m.match_id)) continue;
    const fresh = updatedMap.get(m.match_id);
    if (fresh) { result.push(fresh); updatedMap.delete(m.match_id); }
    else result.push(m);
  }
  // O que sobrou no map são matches novos (não existiam no estado atual)
  for (const m of updatedMap.values()) result.push(m);
  return result;
}

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
  const lastEtagRef     = useRef<string | null>(null); // último ETag de um full fetch 200 OK

  // Contador de geração: cada fetch (full ou delta) reivindica um número ao
  // iniciar. Se, quando a resposta chega, um fetch MAIS NOVO já começou,
  // esta resposta é descartada — evita que uma resposta lenta e antiga
  // sobrescreva dados mais recentes que já chegaram (fora de ordem).
  // O AbortController já cancela a maioria desses casos, mas só é garantido
  // até o momento em que a resposta começa a ser lida; isto cobre o resto.
  const genRef = useRef(0);

  // Estado do debounce em ref — não causa re-renders, persiste entre renders
  const db = useRef<{
    timer:          ReturnType<typeof setTimeout> | null;
    events:         BroadcastPayload[];
    eventsReceived: number;
    refetchCount:   number;
    reconnectCount: number;
    fallbackPolls:  number;
    deltaFetches:   number;
    fullFetches:    number;
    notModified:    number;
    errorCount:     number;
    staleDiscards:  number;
    totalBytes:     number;
    latencies:      number[];
    lastIngestAt:   number;
  }>({
    timer: null, events: [], eventsReceived: 0, refetchCount: 0,
    reconnectCount: 0, fallbackPolls: 0, deltaFetches: 0, fullFetches: 0,
    notModified: 0, errorCount: 0, staleDiscards: 0, totalBytes: 0,
    latencies: [], lastIngestAt: 0,
  });

  // Aplica o resultado de um fetch (full ou delta) no estado + métricas.
  // `nextOdds` já vem pronto (substituído ou mesclado) — só registra estatísticas.
  const applyResult = useCallback((nextOdds: OddsMatch[], fetchStart: number, batchIds: string, bytes: number) => {
    const s = db.current;
    setOdds(nextOdds);
    setError(null);
    setLastUpdate(Date.now());
    s.totalBytes += bytes;

    const elapsed   = Date.now() - fetchStart;
    const latencyMs = s.lastIngestAt > 0 ? Date.now() - s.lastIngestAt : 0;
    if (latencyMs > 0 && latencyMs < 120_000) {
      s.latencies.push(latencyMs);
      if (s.latencies.length > 20) s.latencies.shift();
    }
    const avgLatency = s.latencies.length
      ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
      : 0;

    const matchCount    = nextOdds.length;
    const booksPerMatch = nextOdds.map(m => m.bookmakers?.length ?? 0);
    const oddsTotal     = booksPerMatch.reduce((a, b) => a + b, 0);
    const booksMin      = matchCount > 0 ? Math.min(...booksPerMatch) : 0;
    const booksMax      = matchCount > 0 ? Math.max(...booksPerMatch) : 0;
    const booksAvg      = matchCount > 0 ? Math.round(oddsTotal / matchCount) : 0;

    console.log(
      `[SureEdge] fetch_finished` +
      ` matches=${matchCount} total_odds=${oddsTotal}` +
      ` books_per_match min=${booksMin} avg=${booksAvg} max=${booksMax}` +
      ` bytes=${bytes} elapsed=${elapsed}ms latency_ingest_to_ui=${latencyMs}ms avg_latency=${avgLatency}ms` +
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
      deltaFetches:   s.deltaFetches,
      fullFetches:    s.fullFetches,
      notModified:    s.notModified,
      errorCount:     s.errorCount,
      staleDiscards:  s.staleDiscards,
      lastBytes:      bytes,
      totalBytes:     s.totalBytes,
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

    setRecentlyUpdated(prev => (prev.size > 0 ? new Set() : prev));
  }, []);

  // Full refetch — tabela inteira (mount, reconnect, fallback poll, ou lote
  // grande demais pra virar delta). Manda o ETag do último full fetch bem
  // sucedido como If-None-Match — se nada mudou desde então, o servidor
  // responde 304 sem corpo, economizando o payload inteiro no fallback poll.
  const fetchOdds = useCallback(async (batch?: BroadcastPayload[], isFallback = false) => {
    if (paused) return;

    abortRef.current?.abort();
    const ctrl  = new AbortController();
    abortRef.current = ctrl;
    const myGen = ++genRef.current;

    const s = db.current;
    const batchIds = batch?.map(e => e.batchId).join(',') ?? 'initial';
    const fetchStart = Date.now();
    s.fullFetches++;

    console.log(
      `[SureEdge] fetch_started reason=${isFallback ? 'fallback_poll' : (batch ? 'realtime_full' : 'mount')}` +
      ` batch_ids=${batchIds} events=${batch?.length ?? 0}`
    );

    try {
      const headers: Record<string, string> = {};
      if (lastEtagRef.current) headers['If-None-Match'] = lastEtagRef.current;

      const res = await fetch('/api/dg/odds-db?all=1', { signal: ctrl.signal, cache: 'no-cache', headers });

      if (myGen !== genRef.current) {
        s.staleDiscards++;
        console.log(`[SureEdge] fetch_discarded_stale (resposta antiga chegou depois de uma mais nova) batch_ids=${batchIds}`);
        return;
      }

      if (res.status === 304) {
        s.notModified++;
        console.log(`[SureEdge] fetch_304_not_modified batch_ids=${batchIds} — sem alterações`);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const etag = res.headers.get('etag');
      if (etag) lastEtagRef.current = etag;

      const bodyText = await res.text();
      const d = JSON.parse(bodyText) as { ok: boolean; odds?: OddsMatch[] };

      if (myGen !== genRef.current) {
        s.staleDiscards++;
        console.log(`[SureEdge] fetch_discarded_stale (pós-parse) batch_ids=${batchIds}`);
        return;
      }

      if (d.ok && d.odds) applyResult(d.odds, fetchStart, batchIds, bodyText.length);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      s.errorCount++;
      setError((e as Error).message);
      console.warn(`[SureEdge] fetch_finished error="${(e as Error).message}" batch_ids=${batchIds}`);
    } finally {
      setLoading(false);
    }
  }, [paused, applyResult]);

  // Delta refetch — só os match_id que o ingest reportou como alterados.
  // rowsWritten do broadcast pode cobrir dezenas de jogos; em vez de ~2MB
  // (tabela inteira), o payload aqui fica na casa de poucos KB por jogo.
  const fetchOddsDelta = useCallback(async (
    upsertIds: string[], removedIds: string[], batchIds: string,
  ) => {
    if (paused) return;

    abortRef.current?.abort();
    const ctrl  = new AbortController();
    abortRef.current = ctrl;
    const myGen = ++genRef.current;

    const s = db.current;
    const fetchStart = Date.now();
    s.deltaFetches++;

    console.log(
      `[SureEdge] fetch_started reason=delta batch_ids=${batchIds}` +
      ` upsert=${upsertIds.length} removed=${removedIds.length}`
    );

    try {
      if (upsertIds.length === 0) {
        // Só remoções — nenhum dado novo pra buscar, aplica local e pronto.
        if (myGen !== genRef.current) { s.staleDiscards++; return; }
        let merged: OddsMatch[] = [];
        setOdds(prev => { merged = mergeOdds(prev, [], removedIds); return merged; });
        applyResult(merged, fetchStart, batchIds, 0);
        return;
      }

      // POST (não query string): até 500 UUIDs na URL passariam de ~18KB,
      // arriscando estourar limites de tamanho de URL/header de proxies e CDNs.
      const res = await fetch('/api/dg/odds-db', {
        method:  'POST',
        signal:  ctrl.signal,
        cache:   'no-cache',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: upsertIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bodyText = await res.text();
      const d = JSON.parse(bodyText) as { ok: boolean; odds?: OddsMatch[] };

      if (myGen !== genRef.current) {
        s.staleDiscards++;
        console.log(`[SureEdge] fetch_discarded_stale (delta) batch_ids=${batchIds}`);
        return;
      }

      if (d.ok && d.odds) {
        // Qualquer id pedido que NÃO voltou na resposta não tem mais odds no
        // banco (todas as casas/mercados daquele jogo sumiram) — trata como
        // removido também, senão o jogo ficaria com dado velho pra sempre.
        const returned       = new Set(d.odds.map(m => m.match_id));
        const implicitRemoved = upsertIds.filter(id => !returned.has(id));
        const allRemoved      = removedIds.length || implicitRemoved.length
          ? [...removedIds, ...implicitRemoved]
          : removedIds;

        // setOdds funcional: sempre mescla sobre o estado mais recente,
        // nunca sobre um closure potencialmente desatualizado.
        let merged: OddsMatch[] = [];
        setOdds(prev => { merged = mergeOdds(prev, d.odds!, allRemoved); return merged; });
        applyResult(merged, fetchStart, batchIds, bodyText.length);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Falha no delta: cai pro full refetch pra não deixar o estado divergir.
      s.errorCount++;
      console.warn(`[SureEdge] delta_fetch_failed error="${(e as Error).message}" batch_ids=${batchIds} — caindo pro full refetch`);
      await fetchOdds(undefined, false);
    } finally {
      setLoading(false);
    }
  }, [paused, applyResult, fetchOdds]);

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
      const batchIds = batch.map(e => e.batchId).join(',');

      // Só vira delta se TODOS os eventos do lote trouxerem upsertedIds/removedIds
      // (o ingest omite os dois quando o lote passa de MAX_IDS_IN_BROADCAST).
      const canDelta = batch.every(e => e.upsertedIds !== undefined && e.removedIds !== undefined);

      if (canDelta) {
        // Resolve o estado final por id em ordem cronológica — se um match foi
        // removido e depois voltou (ou vice-versa) no mesmo lote, o último
        // evento decide. Isso garante que NENHUM evento do lote é perdido:
        // todos são dobrados numa única decisão final por id, em vez de só
        // olhar o último payload recebido.
        const state = new Map<string, 'upsert' | 'remove'>();
        for (const e of batch) {
          for (const id of e.upsertedIds ?? []) state.set(id, 'upsert');
          for (const id of e.removedIds  ?? []) state.set(id, 'remove');
        }
        const upsertIds: string[] = [];
        const removeIds: string[] = [];
        for (const [id, kind] of state) (kind === 'upsert' ? upsertIds : removeIds).push(id);

        if (upsertIds.length === 0 && removeIds.length === 0) return; // nada a fazer
        fetchOddsDelta(upsertIds, removeIds, batchIds);
      } else {
        fetchOdds(batch, false);
      }
    }, DEBOUNCE_MS);
  }, [paused, fetchOdds, fetchOddsDelta]);

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
            // Reconexão: pode ter perdido broadcasts enquanto estava caído —
            // sempre um full refetch de segurança, nunca delta, pra garantir
            // que o estado local reflita o banco por completo.
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
