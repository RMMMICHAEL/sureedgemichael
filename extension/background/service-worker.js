/**
 * SureEdge Sync Bridge — Service Worker principal (MV3)
 * Coordena: recepção de mensagens, processamento de plugins,
 * fila, envio ao SureEdge e heartbeat.
 */

import { matchPlugin, getAllPlugins } from '../plugins/registry.js';
import { runActiveFetch }            from './active-fetch.js';
import { computeDiff, hasDiff }      from '../core/diff-engine.js';
import { SchemaMonitor }             from '../core/schema-validator.js';
import {
  enqueue, dequeueNext, markComplete, requeueWithBackoff, resetStaleFlight,
  getSnapshot, saveSnapshot, saveReplay, queueDepth,
  cleanupStale, estimateStorageSize,
} from './queue.js';
import { getDeviceId, signPayload, sendToSureEdge } from './crypto.js';
import { sendHeartbeat }  from './heartbeat.js';
import { getConfig, isPluginEnabled, getPluginPriority } from './config.js';

// ─── Estado em memória (reiniciado a cada cold start do SW) ──────────────────
const schemaMonitors  = new Map();
let   deviceId        = null;
let   lastSyncAt      = null;
let   isProcessing    = false;
let   activeFetching  = false;
let   sessionHeaders  = null;

// Endpoints desconhecidos (descoberta automática)
const unknownEndpoints = new Map();

// ─── Métricas de operação do SW (persistem enquanto SW viver) ────────────────
const swMetrics = {
  startedAt:        Date.now(),
  totalBatchesSent: 0,   // lotes enviados ao ingest
  ingestOk:         0,   // respostas 2xx
  ingestFail:       0,   // respostas 4xx/5xx ou erro de rede
  ingestTimes:      [],  // últimos 20 tempos de ingest (ms)
  broadcastsTotal:  0,   // broadcasts contados via batch_id na resposta do ingest
  broadcastsFailed: 0,   // quando a resposta não tem batch_id (broadcast provavelmente falhou)
  queueDepthSamples:[], // últimas 20 amostras de profundidade da fila
};

// ─── Inicialização ────────────────────────────────────────────────────────────
async function init() {
  deviceId = await getDeviceId();

  // Verifica se foi revogado
  const { revoked } = await chrome.storage.local.get('revoked');
  if (revoked) { console.warn('[SureEdge] dispositivo revogado — sync desabilitado'); return; }

  // Inicializa schema monitors
  for (const plugin of getAllPlugins()) {
    schemaMonitors.set(plugin.id, new SchemaMonitor(
      plugin.id,
      plugin.expectedSchema,
      onSchemaAlert,
    ));
  }

  // Recupera itens in_flight órfãos de ciclos anteriores do SW (crash/sleep)
  const recovered = await resetStaleFlight(45_000);
  if (recovered > 0) processQueue().catch(console.error);

  console.log('[SureEdge] service worker iniciado, device:', deviceId);
}

// ─── Listener: mensagens do content script ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.kind === 'intercept' && msg.type === 'session_captured') {
    sessionHeaders = msg.data.headers;
    triggerActiveFetch().catch(console.error);
    sendResponse({ ok: true });
    return;
  }
  if (msg.kind === 'intercept') {
    handleIntercept(msg).catch(console.error);
    sendResponse({ ok: true });
  }
  if (msg.kind === 'get_status') {
    getStatus().then(sendResponse);
    return true; // async
  }
  if (msg.kind === 'get_metrics') {
    getSWMetrics().then(sendResponse);
    return true; // async
  }
  if (msg.kind === 'get_unknown_endpoints') {
    sendResponse({ endpoints: Array.from(unknownEndpoints.values()) });
  }
  if (msg.kind === 'force_sync') {
    processQueue().catch(console.error);
    sendResponse({ ok: true });
  }
  if (msg.kind === 'clear_snapshots') {
    Promise.all(getAllPlugins().map(p => saveSnapshot(p.id, [])))
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async
  }
  if (msg.kind === 'get_tab_id') {
    sendResponse({ tabId: _sender?.tab?.id ?? null });
  }
});

// ─── Fetch ativo (dispara ao capturar sessão) ─────────────────────────────────
async function triggerActiveFetch() {
  if (activeFetching || !sessionHeaders) return;
  activeFetching = true;
  try {
    await runActiveFetch(sessionHeaders, (data) => {
      handleIntercept({ type: 'fetch', data }).catch(console.error);
    });
  } finally {
    activeFetching = false;
  }
}

// ─── Processamento de interceptação ──────────────────────────────────────────
async function handleIntercept({ type, data }) {
  if (!deviceId) await init();

  const { url, endpoint, body, size } = data;
  const plugin = matchPlugin(url);

  // Endpoint desconhecido → log de descoberta
  if (!plugin) {
    trackUnknown(url, body, size);
    return;
  }

  const config = await getConfig();
  if (!isPluginEnabled(config, plugin.id)) return;

  // Salva no replay buffer
  await saveReplay(plugin.id, url, body).catch(() => {});

  // Valida schema
  const monitor = schemaMonitors.get(plugin.id);
  if (monitor) {
    const rows = Array.isArray(body) ? body : (body?.data ?? body?.odds ?? []);
    monitor.check(rows);
  }

  // [DIAG-1] Parse
  const parsed = plugin.parse(body);
  console.log(`[DIAG] ${plugin.id} parse: body=${Array.isArray(body) ? body.length : typeof body} → parsed=${parsed?.length ?? 0}`);
  if (!parsed || parsed.length === 0) { console.warn(`[DIAG] ${plugin.id} parse vazio — abortando`); return; }

  // [DIAG-2] Snapshot + Diff
  const snapshot = await getSnapshot(plugin.id);
  console.log(`[DIAG] ${plugin.id} snapshot atual: ${snapshot.length} rows`);
  const diff = computeDiff(snapshot, parsed, plugin.diffKey);
  console.log(`[DIAG] ${plugin.id} diff: +${diff.added.length} ~${diff.modified.length} -${diff.removed.length} =${diff.unchanged}`);

  if (!hasDiff(diff)) { console.log(`[DIAG] ${plugin.id} sem diff — nada a enviar`); return; }

  // [DIAG-3] Snapshot novo
  const newSnapshot = [
    ...snapshot.filter(r => !diff.removed.some(rem => rem[plugin.diffKey] === r[plugin.diffKey])),
    ...diff.added,
    ...diff.modified.map(m => ({ ...snapshot.find(s => s[plugin.diffKey] === m[plugin.diffKey]), ...m })),
  ];
  console.log(`[DIAG] ${plugin.id} novo snapshot calculado: ${newSnapshot.length} rows`);

  // Plugins com skipIngest não enviam ao servidor — salva snapshot local e para
  if (plugin.skipIngest) {
    await saveSnapshot(plugin.id, newSnapshot);
    console.log(`[DIAG] ${plugin.id} skipIngest — snapshot local atualizado: ${newSnapshot.length} rows`);
    return;
  }

  // [DIAG-4] Batching
  const BATCH = 100;
  const priority = getPluginPriority(config, plugin.id, plugin.priority);
  const allAdded    = diff.added;
  const allModified = diff.modified;
  const allRemoved  = diff.removed.map(r => r[plugin.diffKey]);
  const totalBatches = Math.max(1, Math.ceil((allAdded.length + allModified.length) / BATCH));
  console.log(`[DIAG] ${plugin.id} batches: ${totalBatches} (${allAdded.length} added, ${allModified.length} modified, ${allRemoved.length} removed)`);

  for (let i = 0; i < totalBatches; i++) {
    const batchAdded    = allAdded.slice(i * BATCH, (i + 1) * BATCH);
    const batchModified = allModified.slice(
      Math.max(0, i * BATCH - allAdded.length),
      Math.max(0, (i + 1) * BATCH - allAdded.length),
    );
    // [DIAG-5] Enqueue
    console.log(`[DIAG] ${plugin.id} enqueue batch ${i + 1}/${totalBatches}: +${batchAdded.length} ~${batchModified.length}`);
    await enqueue({
      pluginId: plugin.id,
      priority,
      snapshotOnSuccess: i === totalBatches - 1 ? newSnapshot : null,
      payload: {
        pluginId: plugin.id,
        diff: {
          added:    batchAdded,
          modified: batchModified,
          removed:  i === 0 ? allRemoved : [],
        },
        stats: {
          total:     parsed.length,
          added:     batchAdded.length,
          modified:  batchModified.length,
          removed:   i === 0 ? allRemoved.length : 0,
          unchanged: diff.unchanged,
          sizeBytes: size,
        },
        capturedAt: Date.now(),
      },
    });
  }

  // Processa fila imediatamente para itens críticos
  if (priority === 'critical') {
    processQueue().catch(console.error);
  }
}

// ─── Processamento da fila ────────────────────────────────────────────────────
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let item;
    while ((item = await dequeueNext()) !== null) {
      try {
        const payloadJson = JSON.stringify(item.payload);
        const ingestStart = Date.now();
        swMetrics.totalBatchesSent++;

        console.log(`[DIAG] processQueue: enviando ${item.pluginId} +${item.payload.diff?.added?.length} ~${item.payload.diff?.modified?.length} | body=${payloadJson.length} bytes`);
        const res = await sendToSureEdge('/api/sync/ingest', item.payload, deviceId);
        const ingestElapsed = Date.now() - ingestStart;

        // Registra tempo de ingest (janela de 20)
        swMetrics.ingestTimes.push(ingestElapsed);
        if (swMetrics.ingestTimes.length > 20) swMetrics.ingestTimes.shift();

        console.log(`[DIAG] processQueue: resposta ${res.status} para ${item.pluginId} elapsed=${ingestElapsed}ms`);
        if (res.ok) {
          swMetrics.ingestOk++;
          const resBody = await res.json().catch(() => ({}));
          // Detecta se broadcast foi emitido (batch_id presente na resposta)
          if (resBody.batch_id) {
            swMetrics.broadcastsTotal++;
          } else if (item.pluginId === 'odds-1x2' || item.pluginId === 'odds-pa') {
            swMetrics.broadcastsFailed++; // ingest ok mas sem broadcast
          }
          console.log(`[DIAG] processQueue: ingest ok batch_id=${resBody.batch_id ?? 'none'} ingest_ms=${ingestElapsed}`);
          // Remove o item da fila APÓS confirmar sucesso (sem risco de perda por crash)
          await markComplete(item.id);
          lastSyncAt = Date.now();
          await chrome.storage.local.set({ last_sync_at: lastSyncAt });
          if (item.snapshotOnSuccess) {
            await saveSnapshot(item.pluginId, item.snapshotOnSuccess);
            console.log(`[DIAG] snapshot salvo para ${item.pluginId}`);
          }
        } else if (res.status === 403) {
          swMetrics.ingestFail++;
          console.warn('[SureEdge] ingest 403 — verificando revogação');
          break;
        } else {
          swMetrics.ingestFail++;
          const errBody = await res.text().catch(() => '');
          console.error(`[DIAG] ingest ${res.status} para ${item.pluginId}:`, errBody.slice(0, 300));
          await requeueWithBackoff(item);
        }
      } catch (e) {
        swMetrics.ingestFail++;
        console.error(`[DIAG] processQueue erro rede:`, e.message);
        await requeueWithBackoff(item);
        break; // sem conexão — para de tentar
      }
    }
  } finally {
    isProcessing = false;
  }
}

// ─── Descoberta automática de endpoints ──────────────────────────────────────
function trackUnknown(url, body, size) {
  try {
    const u      = new URL(url);
    const name   = u.pathname.split('/').pop() + u.search.slice(0, 60);
    const rows   = Array.isArray(body) ? body : (body?.data ?? []);
    const shape  = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Cap para evitar crescimento ilimitado em memória
    if (!unknownEndpoints.has(name) && unknownEndpoints.size >= 200) {
      const oldest = unknownEndpoints.keys().next().value;
      unknownEndpoints.delete(oldest);
    }
    const existing = unknownEndpoints.get(name) ?? {
      url, name, shape, firstSeen: Date.now(), count: 0, size,
    };
    existing.count++;
    existing.lastSeen = Date.now();
    unknownEndpoints.set(name, existing);
  } catch { /* ignora */ }
}

// ─── Alert de schema ──────────────────────────────────────────────────────────
async function onSchemaAlert(alert) {
  console.warn('[SureEdge] schema mismatch:', alert.pluginId, alert.missingFields);
  try {
    await fetch('https://www.sureedge.com.br/api/sync/schema-alert', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-ID': deviceId },
      body:    JSON.stringify({ deviceId, ...alert, ts: Date.now() }),
    });
  } catch { /* ignora */ }
}

// ─── Métricas completas do SW (expostas via get_metrics) ─────────────────────
async function getSWMetrics() {
  const depth      = await queueDepth();
  const storage    = await estimateStorageSize().catch(() => null);
  const avgIngest  = swMetrics.ingestTimes.length
    ? Math.round(swMetrics.ingestTimes.reduce((a, b) => a + b, 0) / swMetrics.ingestTimes.length)
    : 0;
  const successRate = swMetrics.totalBatchesSent > 0
    ? Math.round(swMetrics.ingestOk / swMetrics.totalBatchesSent * 100)
    : 100;
  const broadcastSuccessRate = (swMetrics.broadcastsTotal + swMetrics.broadcastsFailed) > 0
    ? Math.round(swMetrics.broadcastsTotal / (swMetrics.broadcastsTotal + swMetrics.broadcastsFailed) * 100)
    : 100;

  return {
    uptimeMs:              Date.now() - swMetrics.startedAt,
    uptimeHuman:           formatUptime(Date.now() - swMetrics.startedAt),
    totalBatchesSent:      swMetrics.totalBatchesSent,
    ingestOk:              swMetrics.ingestOk,
    ingestFail:            swMetrics.ingestFail,
    ingestSuccessRate:     `${successRate}%`,
    avgIngestTimeMs:       avgIngest,
    broadcastsTotal:       swMetrics.broadcastsTotal,
    broadcastsFailed:      swMetrics.broadcastsFailed,
    broadcastSuccessRate:  `${broadcastSuccessRate}%`,
    currentQueueDepth:     depth.total,
    queueByPriority:       depth,
    storageSizeBytes:      storage
      ? (storage.snapshots.bytes + storage.replay.bytes)
      : null,
    snapshotCount:         storage?.snapshots.count ?? null,
    replayCount:           storage?.replay.count    ?? null,
  };
}

function formatUptime(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h${m}m`;
}

// ─── Status para popup ────────────────────────────────────────────────────────
async function getStatus() {
  const depth      = await queueDepth();
  const { last_sync_at } = await chrome.storage.local.get('last_sync_at');
  const { revoked }      = await chrome.storage.local.get('revoked');
  const tabs = await chrome.tabs.query({
    url: ['*://www.duplogreenengine.com/*', '*://duplogreenengine.com/*'],
  });

  return {
    deviceId,
    revoked:         !!revoked,
    dgOpen:          tabs.length > 0,
    lastSyncAt:      last_sync_at ?? null,
    queueDepth:      depth,
    unknownEndpoints: unknownEndpoints.size,
    extensionVersion: chrome.runtime.getManifest().version,
  };
}

// ─── Alarms (heartbeat + processamento periódico) ─────────────────────────────
chrome.alarms.create('heartbeat',      { periodInMinutes: 1 });
chrome.alarms.create('process_queue',  { periodInMinutes: 0.5 });
chrome.alarms.create('refresh_config', { periodInMinutes: 5 });
chrome.alarms.create('refresh_odds',   { periodInMinutes: 10 });
chrome.alarms.create('cleanup_stale',  { periodInMinutes: 360 }); // a cada 6h

chrome.alarms.onAlarm.addListener(async alarm => {
  if (!deviceId) await init();
  const { revoked } = await chrome.storage.local.get('revoked');
  if (revoked) return;

  if (alarm.name === 'heartbeat') {
    const depth = await queueDepth();
    const { last_sync_at } = await chrome.storage.local.get('last_sync_at');
    await sendHeartbeat(deviceId, depth, last_sync_at);
  }

  if (alarm.name === 'process_queue') {
    await processQueue();
  }

  if (alarm.name === 'refresh_config') {
    await getConfig(); // força refresh
  }

  if (alarm.name === 'refresh_odds') {
    if (sessionHeaders) {
      console.log('[SureEdge] refresh_odds: re-disparando active fetch');
      activeFetching = false;
      triggerActiveFetch().catch(console.error);
    } else {
      console.log('[SureEdge] refresh_odds: sem session headers — aguardando captura');
    }
  }

  if (alarm.name === 'cleanup_stale') {
    const t0 = Date.now();
    const deleted = await cleanupStale({ queueMaxAgeHours: 24, replayMaxAgeHours: 6 });
    const storage = await estimateStorageSize().catch(() => null);
    console.log(
      `[SureEdge] cleanup_stale: removidos queue=${deleted.queue} replay=${deleted.replay}` +
      ` elapsed=${Date.now()-t0}ms` +
      (storage ? ` storage_approx=${Math.round((storage.snapshots.bytes + storage.replay.bytes)/1024)}KB` : '')
    );
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => { init().catch(console.error); });
chrome.runtime.onStartup.addListener(()    => { init().catch(console.error); });
init().catch(console.error);
