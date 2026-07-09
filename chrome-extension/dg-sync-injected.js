// dg-sync-injected.js — roda no MAIN world da página do DuploGreen Engine.
// Acha o QueryClient via React Fiber, observa o QueryCache, calcula deltas
// e repassa via postMessage pro content-script (dg-sync-content.js), que
// encaminha pro background.js, que fala com o SureEdge.
//
// Guard: evita dupla injeção.
if (window.__dgsync_injected__) {
  // já ativo, não faz nada
} else {
window.__dgsync_injected__ = true;

(function () {
  'use strict';
  const log = (tag) => (...args) => console.log(`[DG-Sync]${tag}`, ...args);

  // ============================================================
  // EventBus — desacopla Observer / Pipeline / Transport / Health
  // ============================================================
  function EventBus() {
    const listeners = new Map();
    return {
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return () => listeners.get(event)?.delete(fn);
      },
      emit(event, payload) {
        for (const fn of listeners.get(event) ?? []) {
          try { fn(payload); } catch (e) { console.error(`[DG-Sync][Bus] listener falhou em "${event}":`, e); }
        }
      },
    };
  }
  const bus = new EventBus();

  // ============================================================
  // Métricas observáveis — window.__DG_SYNC__
  // ============================================================
  const metrics = {
    startedAt: Date.now(), reconnects: 0, totalUpdates: 0, totalBatches: 0,
    rowsProcessed: 0, rowsDiscarded: 0, queueSize: 0,
    avgProcessMs: 0, maxProcessMs: 0, approxMemoryBytes: 0,
    lastError: null, lastSyncAt: null, lastCacheUpdateAt: null,
    status: 'booting',
    health: { restarts: 0, lastHeartbeatAgoMs: 0 },
  };
  let processTimes = [];
  function recordProcessTime(ms) {
    processTimes.push(ms);
    if (processTimes.length > 50) processTimes.shift();
    metrics.avgProcessMs = Math.round(processTimes.reduce((a, b) => a + b, 0) / processTimes.length);
    metrics.maxProcessMs = Math.max(metrics.maxProcessMs, ms);
  }

  // ============================================================
  // 1. Fiber Bootstrap
  // ============================================================
  const FiberBootstrap = (() => {
    function getInternalKey(el, prefix) { return Object.keys(el).find(k => k.startsWith(prefix)); }
    function findAnyFiber() {
      for (const sel of ['#root', '#app', 'body > div']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const k = getInternalKey(el, '__reactContainer$') || getInternalKey(el, '__reactFiber$');
        if (k) return el[k];
      }
      for (const el of document.querySelectorAll('*')) {
        const k = getInternalKey(el, '__reactContainer$') || getInternalKey(el, '__reactFiber$');
        if (k) return el[k];
      }
      return null;
    }
    function getFiberRoot(fiber) { let f = fiber; while (f.return) f = f.return; return f; }
    function walk(root, visitor, { maxNodes = 200000 } = {}) {
      const seen = new WeakSet();
      const stack = [{ fiber: root, depth: 0 }];
      let count = 0;
      while (stack.length && count < maxNodes) {
        const { fiber, depth } = stack.pop();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber); count++;
        visitor(fiber, depth);
        if (fiber.sibling) stack.push({ fiber: fiber.sibling, depth });
        if (fiber.child) stack.push({ fiber: fiber.child, depth: depth + 1 });
      }
      return count;
    }
    function* candidateValues(fiber) {
      if (fiber.memoizedProps) for (const v of Object.values(fiber.memoizedProps)) yield v;
      let hook = fiber.memoizedState, g = 0;
      while (hook && g++ < 50) { if (hook.memoizedState !== undefined) yield hook.memoizedState; hook = hook.next; }
      let ctx = fiber.dependencies?.firstContext, g2 = 0;
      while (ctx && g2++ < 20) { yield ctx.memoizedValue; ctx = ctx.next; }
    }
    return { findAnyFiber, getFiberRoot, walk, candidateValues };
  })();

  // ============================================================
  // 2. QueryClient Resolver
  // ============================================================
  const QueryClientResolver = (() => {
    const QC_SIGNATURE = [
      'getQueryCache', 'getMutationCache', 'getQueryData', 'getQueriesData', 'getQueryState',
      'setQueryData', 'setQueriesData', 'isFetching', 'isMutating', 'ensureQueryData',
      'removeQueries', 'mount', 'unmount', 'getDefaultOptions', 'setDefaultOptions',
      'getQueryDefaults', 'setQueryDefaults',
    ];
    function score(obj) {
      if (!obj || typeof obj !== 'object') return 0;
      return QC_SIGNATURE.reduce((s, m) => s + (typeof obj[m] === 'function' ? 1 : 0), 0);
    }
    function looksValid(obj, minScore = 8) {
      return score(obj) >= minScore && typeof obj.getQueryCache === 'function'
        && typeof obj.mount === 'function' && typeof obj.unmount === 'function';
    }
    function safeCount(client) { try { return client.getQueryCache().getAll().length; } catch { return -1; } }
    function discover({ minScore = 8 } = {}) {
      const entry = FiberBootstrap.findAnyFiber();
      if (!entry) return [];
      const root = FiberBootstrap.getFiberRoot(entry);
      const seen = new WeakSet();
      const found = new Map();
      FiberBootstrap.walk(root, (fiber) => {
        for (const val of FiberBootstrap.candidateValues(fiber)) {
          if (!val || typeof val !== 'object' || seen.has(val)) continue;
          seen.add(val);
          if (looksValid(val, minScore)) found.set(val, score(val));
        }
      });
      return [...found.entries()]
        .map(([client, s]) => ({ client, score: s, queries: safeCount(client) }))
        .sort((a, b) => b.queries - a.queries);
    }

    let current = null;
    function isAlive() { try { current?.getQueryCache(); return !!current; } catch { return false; } }
    function resolve({ retries = 10, delayMs = 1000 } = {}) {
      return new Promise((res) => {
        (function attempt(left) {
          if (isAlive()) return res(current);
          const found = discover();
          if (found.length) {
            current = found[0].client;
            log('[QC]')('QueryClient resolvido — score', found[0].score, ',', found[0].queries, 'queries');
            return res(current);
          }
          if (left <= 0) return res(null);
          setTimeout(() => attempt(left - 1), delayMs);
        })(retries);
      });
    }
    function invalidate() { current = null; }
    function getCurrent() { return current; }
    return { resolve, isAlive, invalidate, getCurrent };
  })();

  // ============================================================
  // 3. Query Discovery
  // ============================================================
  const QueryDiscovery = (() => {
    const KNOWN_KEY_PREFIXES = ['dashboard-markets', 'league-odds-markets', 'dg-opportunities', 'dg-opportunities-v2', 'match-detail'];
    function looksLikeOddsRow(row) {
      return row && typeof row === 'object' && typeof row.match_id === 'string' && typeof row.home_team === 'string'
        && (typeof row.odd_home === 'number' || typeof row.best_home === 'number');
    }
    function findOddsArray(data, depth = 0, maxDepth = 3) {
      if (!data || typeof data !== 'object' || depth > maxDepth) return null;
      if (Array.isArray(data)) return looksLikeOddsRow(data[0]) ? { path: '(root)', rows: data } : null;
      for (const key of Object.keys(data)) {
        const found = findOddsArray(data[key], depth + 1, maxDepth);
        if (found) return { path: key, rows: found.rows };
      }
      return null;
    }
    function listCandidates(client) {
      return client.getQueryCache().getAll().map(q => ({
        queryKey: q.queryKey, queryHash: q.queryHash, observers: q.observers.length,
        dataUpdatedAt: q.state.dataUpdatedAt, dataUpdateCount: q.state.dataUpdateCount,
        fetchStatus: q.state.fetchStatus,
        isKnown: KNOWN_KEY_PREFIXES.includes(String(q.queryKey[0] ?? '')),
      }));
    }
    return { KNOWN_KEY_PREFIXES, listCandidates, findOddsArray, looksLikeOddsRow };
  })();

  // ============================================================
  // 4. Observer — só emite bus.emit('query:updated', query)
  // ============================================================
  function QueryCacheObserver(client) {
    const lastCount = new Map();
    let unsubscribe = null;
    function relevantKey(queryKey) { return QueryDiscovery.KNOWN_KEY_PREFIXES.includes(String(queryKey[0] ?? '')); }
    function start() {
      unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated') return;
        const q = event.query;
        if (!relevantKey(q.queryKey)) return;
        if (q.state.fetchStatus === 'fetching') return;
        if (q.state.status !== 'success' || q.state.data == null) return;
        const count = q.state.dataUpdateCount;
        if (lastCount.get(q.queryHash) === count) return;
        lastCount.set(q.queryHash, count);
        metrics.totalUpdates++;
        metrics.lastCacheUpdateAt = q.state.dataUpdatedAt;
        bus.emit('query:updated', q);
      });
      log('[Observer]')('ativo');
    }
    function stop() { unsubscribe?.(); unsubscribe = null; }
    function forceResync() {
      for (const q of client.getQueryCache().getAll()) {
        if (relevantKey(q.queryKey)) { lastCount.delete(q.queryHash); bus.emit('query:updated', q); }
      }
    }
    return { start, stop, forceResync };
  }

  // ============================================================
  // 5. Extractor / 6. Validator / 7. Normalizer
  // ============================================================
  const Extractor = {
    fromQuery(query) {
      const name = String(query.queryKey[0] ?? '');
      let rows = null;
      if (name === 'dashboard-markets' || name === 'league-odds-markets') rows = query.state.data?.individualOdds ?? null;
      else if (name === 'match-detail') rows = query.state.data?.odds ?? query.state.data?.individualOdds ?? null;
      if (!rows) {
        const auto = QueryDiscovery.findOddsArray(query.state.data);
        if (auto) { rows = auto.rows; log('[Extractor]')(`fallback por forma (path: ${auto.path})`); }
      }
      return rows ?? [];
    },
  };

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const KNOWN_MARKETS = new Set(['1x2', '1x2_pa']);
  const Validator = {
    validate(rows) {
      const valid = []; let discarded = 0;
      for (const r of rows) {
        if (!r || typeof r !== 'object') { discarded++; continue; }
        if (!UUID_RE.test(r.match_id ?? '')) { discarded++; continue; }
        if (!r.home_team || !r.away_team || !r.bookmaker_slug) { discarded++; continue; }
        if (r.market_type && !KNOWN_MARKETS.has(r.market_type)) { discarded++; continue; }
        const home = Number(r.odd_home), away = Number(r.odd_away);
        if (!Number.isFinite(home) || home < 1 || !Number.isFinite(away) || away < 1) { discarded++; continue; }
        if (r.match_date && isNaN(Date.parse(r.match_date))) { discarded++; continue; }
        valid.push(r);
      }
      metrics.rowsProcessed += valid.length;
      metrics.rowsDiscarded += discarded;
      if (discarded) log('[Validator]')(`${discarded} linha(s) descartada(s) de ${rows.length}`);
      return valid;
    },
  };

  const Normalizer = {
    toMatches(rows) {
      const map = new Map();
      for (const row of rows) {
        if (!map.has(row.match_id)) {
          map.set(row.match_id, {
            match_id: row.match_id, home_team: row.home_team, away_team: row.away_team,
            start_time: row.start_time ?? row.match_date ?? '', match_date: row.match_date ?? '',
            league_name: row.league_name ?? row.league_slug ?? '', league_slug: row.league_slug ?? '',
            bookmakers: [],
          });
        }
        const match = map.get(row.match_id);
        if (!match.bookmakers.find(b => b.slug === row.bookmaker_slug && b.market_type === row.market_type)) {
          match.bookmakers.push({
            slug: row.bookmaker_slug, name: row.bookmaker_name ?? row.bookmaker_slug,
            home: row.odd_home, draw: row.odd_draw ?? 0, away: row.odd_away,
            url: row.match_url ?? '', is_pa: row.market_type === '1x2_pa', market_type: row.market_type,
            updated_at: row.updated_at ?? null,
          });
        }
      }
      return [...map.values()];
    },
  };

  // ============================================================
  // 8. Delta Engine — hash de conteúdo é a fonte da verdade;
  //    referência (structural sharing) é só atalho de performance
  // ============================================================
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  const DeltaEngine = (() => {
    const lastRowRef = new Map();
    const lastHash = new Map();
    function matchSignature(bookmakers) {
      return bookmakers.map(b => `${b.slug}:${b.market_type}:${b.home}:${b.draw}:${b.away}`).sort().join('|');
    }
    function diff(rawRows, matches) {
      const added = [], modified = [], removed = [];
      const seenIds = new Set();
      const rowsByMatch = new Map();
      for (const r of rawRows) (rowsByMatch.get(r.match_id) ?? rowsByMatch.set(r.match_id, []).get(r.match_id)).push(r);

      for (const match of matches) {
        seenIds.add(match.match_id);
        const rows = rowsByMatch.get(match.match_id) ?? [];
        const refUnchanged = rows.length > 0 && rows.every(r => lastRowRef.get(`${r.match_id}::${r.bookmaker_slug}::${r.market_type}`) === r);
        for (const r of rows) lastRowRef.set(`${r.match_id}::${r.bookmaker_slug}::${r.market_type}`, r);
        if (refUnchanged && lastHash.has(match.match_id)) continue;

        const hash = fnv1a(matchSignature(match.bookmakers));
        const prevHash = lastHash.get(match.match_id);
        if (prevHash === undefined) added.push(match);
        else if (prevHash !== hash) modified.push(match);
        lastHash.set(match.match_id, hash);
      }
      for (const id of [...lastHash.keys()]) if (!seenIds.has(id)) { removed.push(id); lastHash.delete(id); }
      return { added, modified, removed };
    }
    return { diff };
  })();

  // ============================================================
  // Pipeline — assina 'query:updated', publica 'delta:ready'
  // ============================================================
  bus.on('query:updated', (query) => {
    const t0 = performance.now();
    try {
      const rawRows = Extractor.fromQuery(query);
      if (!rawRows.length) return;
      const validRows = Validator.validate(rawRows);
      const matches = Normalizer.toMatches(validRows);
      const { added, modified, removed } = DeltaEngine.diff(validRows, matches);
      log('[Delta]')(`matches=${matches.length} odds=${validRows.length} · +${added.length} ~${modified.length} -${removed.length}`);
      if (added.length || modified.length || removed.length) {
        bus.emit('delta:ready', {
          type: 'odds-delta', queryKey: query.queryKey, queryHash: query.queryHash,
          dataUpdateCount: query.state.dataUpdateCount, ts: Date.now(), added, modified, removed,
        });
      }
    } catch (e) {
      metrics.lastError = String(e.message || e);
      log('[Pipeline]')('erro:', e);
    } finally {
      recordProcessTime(performance.now() - t0);
    }
  });

  // ============================================================
  // 9. Sync Queue
  // ============================================================
  function SyncQueue({ storageKey = 'dg_sync_queue_v2', maxItems = 5000, maxBytes = 5 * 1024 * 1024, batchSize = 200 } = {}) {
    let items = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; } })();
    let sending = false;
    function persist() {
      try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch (e) { log('[Queue]')('falha ao persistir:', e.message); }
      metrics.queueSize = items.length;
      metrics.approxMemoryBytes = items.reduce((n, it) => n + (it.__size || 0), 0);
    }
    function enqueue(payload) {
      const size = JSON.stringify(payload).length;
      const dedupeKey = payload.type + ':' + payload.queryHash + ':' + payload.dataUpdateCount + ':' + (payload.added?.[0]?.match_id ?? payload.modified?.[0]?.match_id ?? '');
      if (items.some(it => it.dedupeKey === dedupeKey)) return;
      items.push({ payload, dedupeKey, attempts: 0, nextAttemptAt: Date.now(), __size: size });
      while (items.length > maxItems || items.reduce((n, i) => n + i.__size, 0) > maxBytes) items.shift();
      persist();
    }
    async function flush(transport) {
      if (sending) return;
      sending = true;
      try {
        const now = Date.now();
        const batch = items.filter(it => it.nextAttemptAt <= now).slice(0, batchSize);
        if (!batch.length) return;
        const t0 = performance.now();
        try {
          await transport.send(batch.map(b => b.payload));
          items = items.filter(it => !batch.includes(it));
          metrics.totalBatches++; metrics.lastSyncAt = Date.now();
          log('[Transport]')(`batch de ${batch.length} enviado em ${(performance.now() - t0).toFixed(0)}ms`);
        } catch (e) {
          metrics.lastError = String(e.message || e);
          for (const it of batch) { it.attempts++; it.nextAttemptAt = Date.now() + Math.min(30000, 1000 * 2 ** it.attempts); }
          log('[Transport]')('falha no envio, reagendado:', e.message);
        }
        persist();
      } finally { sending = false; }
    }
    function inspect() { return items.map(({ payload, attempts, nextAttemptAt }) => ({ payload, attempts, nextAttemptAt })); }
    return { enqueue, flush, inspect };
  }

  // ============================================================
  // 10. Transport — cruza pro content-script via postMessage e
  //     aguarda um ack correlacionado por reqId (em vez de fetch direto,
  //     que sofreria CORS/CSP na página do DG)
  // ============================================================
  const Transport = (() => {
    let reqCounter = 0;
    const pending = new Map();

    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data?.__dgsync_ack__) return;
      const { reqId, ok, error } = e.data;
      const p = pending.get(reqId);
      if (!p) return;
      pending.delete(reqId);
      ok ? p.resolve() : p.reject(new Error(error || 'falha desconhecida'));
    });

    return {
      send(payloads) {
        const reqId = `dgsync_${Date.now()}_${reqCounter++}`;
        return new Promise((resolve, reject) => {
          pending.set(reqId, { resolve, reject });
          window.postMessage({ __dgsync_batch__: true, reqId, payloads }, '*');
          setTimeout(() => {
            if (pending.has(reqId)) { pending.delete(reqId); reject(new Error('timeout aguardando resposta da extensão')); }
          }, 15000);
        });
      },
    };
  })();

  const syncQueue = SyncQueue();
  bus.on('delta:ready', (payload) => syncQueue.enqueue(payload));

  // ============================================================
  // 11. Health Monitor + recuperação em 2 níveis
  // ============================================================
  let lastSeenAt = Date.now();
  bus.on('query:updated', () => { lastSeenAt = Date.now(); });

  let watcher = null;
  let degradedStreak = 0;
  const HEALTH_STALE_MS = 45000;

  setInterval(() => {
    const idleFor = Date.now() - lastSeenAt;
    metrics.health.lastHeartbeatAgoMs = idleFor;
    const client = QueryClientResolver.getCurrent();
    if (!client) return;
    const hasActiveObservers = QueryDiscovery.listCandidates(client).some(q => q.isKnown && q.observers > 0);
    if (hasActiveObservers && idleFor > HEALTH_STALE_MS) {
      degradedStreak++;
      metrics.reconnects++;
      metrics.health.restarts = degradedStreak;
      lastSeenAt = Date.now();
      if (degradedStreak <= 2) {
        log('[Health]')(`silêncio de ${idleFor}ms com observers ativos — re-inscrevendo watcher (tentativa ${degradedStreak})`);
        watcher?.stop();
        watcher = QueryCacheObserver(client);
        watcher.start();
      } else {
        log('[Health]')('re-inscrição não resolveu — reconstruindo QueryClient do zero via Fiber');
        QueryClientResolver.invalidate();
        bootAndWatch();
        degradedStreak = 0;
      }
    }
  }, 5000);

  async function bootAndWatch() {
    metrics.status = 'booting';
    const client = await QueryClientResolver.resolve();
    if (!client) { metrics.status = 'error'; metrics.lastError = 'QueryClient não encontrado'; return; }
    watcher?.stop();
    watcher = QueryCacheObserver(client);
    watcher.start();
    watcher.forceResync();
    lastSeenAt = Date.now();
    metrics.status = 'ready';
  }

  setInterval(() => {
    if (!QueryClientResolver.isAlive()) {
      metrics.status = 'degraded'; metrics.reconnects++;
      log('[QC]')('referência perdida — reconectando...');
      QueryClientResolver.invalidate();
      bootAndWatch();
    }
    syncQueue.flush(Transport);
  }, 3000);

  window.__DG_SYNC__ = {
    get metrics() { return { ...metrics, uptimeMs: Date.now() - metrics.startedAt }; },
    get queue() { return syncQueue.inspect(); },
    forceResync: () => watcher?.forceResync(),
  };

  bootAndWatch();
  log('[QC]')('camada v2 (extensão) iniciada — envio via content-script/background');
})();

} // fim do guard __dgsync_injected__
