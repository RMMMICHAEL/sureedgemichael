/**
 * Fila persistente no IndexedDB com prioridades.
 * CRITICAL=0, HIGH=1, NORMAL=2, LOW=3
 */

const DB_NAME    = 'sureedge_sync';
const DB_VERSION = 1;
const STORE_QUEUE     = 'queue';
const STORE_SNAPSHOTS = 'snapshots';
const STORE_REPLAY    = 'replay';
const STORE_SEQ       = 'sequences';

const PRIORITY_MAP = { critical: 0, high: 1, normal: 2, low: 3 };
const MAX_RETRIES  = 5;
const REPLAY_MAX   = 50;

let _db = null;

async function getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const qs = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        qs.createIndex('priority', 'priority');
        qs.createIndex('nextRetryAt', 'nextRetryAt');
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'pluginId' });
      }
      if (!db.objectStoreNames.contains(STORE_REPLAY)) {
        const rs = db.createObjectStore(STORE_REPLAY, { keyPath: 'id', autoIncrement: true });
        rs.createIndex('pluginId', 'pluginId');
      }
      if (!db.objectStoreNames.contains(STORE_SEQ)) {
        db.createObjectStore(STORE_SEQ, { keyPath: 'pluginId' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return getDB().then(db => new Promise((resolve, reject) => {
    const t  = db.transaction(store, mode);
    const s  = Array.isArray(store) ? store.map(n => t.objectStore(n)) : t.objectStore(store);
    const req = fn(s);
    if (req && req.onsuccess !== undefined) {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    } else {
      t.oncomplete = () => resolve();
      t.onerror    = () => reject(t.error);
    }
  }));
}

// ─── Fila ────────────────────────────────────────────────────────────────────

export async function enqueue(item) {
  const db  = await getDB();
  const seq = await nextSequenceId(item.pluginId);
  const record = {
    id:          crypto.randomUUID(),
    pluginId:    item.pluginId,
    priority:    PRIORITY_MAP[item.priority] ?? 2,
    sequenceId:  seq,
    payload:     item.payload,
    attempts:    0,
    nextRetryAt: Date.now(),
    createdAt:   Date.now(),
  };
  await new Promise((res, rej) => {
    const t = db.transaction(STORE_QUEUE, 'readwrite');
    t.objectStore(STORE_QUEUE).add(record).onsuccess = res;
    t.onerror = rej;
  });
  return record;
}

export async function dequeueNext() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_QUEUE, 'readwrite');
    const idx = t.objectStore(STORE_QUEUE).index('priority');
    const req = idx.openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { resolve(null); return; }
      const item = cursor.value;
      if (item.nextRetryAt > Date.now()) { cursor.continue(); return; }
      cursor.delete();
      resolve(item);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function requeueWithBackoff(item) {
  if (item.attempts >= MAX_RETRIES) return; // descarta após max tentativas
  const backoffs = [5000, 15000, 60000, 300000, 1800000];
  const delay    = backoffs[Math.min(item.attempts, backoffs.length - 1)];
  const record   = { ...item, attempts: item.attempts + 1, nextRetryAt: Date.now() + delay };
  const db       = await getDB();
  await new Promise((res, rej) => {
    const t = db.transaction(STORE_QUEUE, 'readwrite');
    t.objectStore(STORE_QUEUE).put(record).onsuccess = res;
    t.onerror = rej;
  });
}

export async function queueDepth() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_QUEUE, 'readonly');
    const req = t.objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => {
      const items = req.result;
      resolve({
        critical: items.filter(i => i.priority === 0).length,
        high:     items.filter(i => i.priority === 1).length,
        normal:   items.filter(i => i.priority === 2).length,
        low:      items.filter(i => i.priority === 3).length,
        total:    items.length,
      });
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export async function getSnapshot(pluginId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_SNAPSHOTS, 'readonly');
    const req = t.objectStore(STORE_SNAPSHOTS).get(pluginId);
    req.onsuccess = () => resolve(req.result?.rows ?? []);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveSnapshot(pluginId, rows) {
  const db = await getDB();
  await new Promise((res, rej) => {
    const t = db.transaction(STORE_SNAPSHOTS, 'readwrite');
    t.objectStore(STORE_SNAPSHOTS).put({ pluginId, rows, savedAt: Date.now() }).onsuccess = res;
    t.onerror = rej;
  });
}

// ─── Replay buffer ───────────────────────────────────────────────────────────

export async function saveReplay(pluginId, url, body) {
  const db = await getDB();
  await new Promise((res, rej) => {
    const t  = db.transaction(STORE_REPLAY, 'readwrite');
    const st = t.objectStore(STORE_REPLAY);
    // Limita a REPLAY_MAX por plugin (FIFO)
    const idx = st.index('pluginId');
    const cnt = idx.count(pluginId);
    cnt.onsuccess = () => {
      if (cnt.result >= REPLAY_MAX) {
        const cursor = idx.openCursor(pluginId);
        cursor.onsuccess = e => { if (e.target.result) e.target.result.delete(); };
      }
      st.add({ pluginId, url, body, savedAt: Date.now() }).onsuccess = res;
    };
    t.onerror = rej;
  });
}

export async function getReplayItems(pluginId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_REPLAY, 'readonly');
    const req = t.objectStore(STORE_REPLAY).index('pluginId').getAll(pluginId);
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ─── Sequence IDs ─────────────────────────────────────────────────────────────

async function nextSequenceId(pluginId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_SEQ, 'readwrite');
    const st  = t.objectStore(STORE_SEQ);
    const req = st.get(pluginId);
    req.onsuccess = () => {
      const next = (req.result?.seq ?? 0) + 1;
      st.put({ pluginId, seq: next });
      resolve(next);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getLastSequenceId(pluginId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_SEQ, 'readonly');
    const req = t.objectStore(STORE_SEQ).get(pluginId);
    req.onsuccess = () => resolve(req.result?.seq ?? 0);
    req.onerror   = () => reject(req.error);
  });
}

// ─── Limpeza automática ───────────────────────────────────────────────────────

/**
 * Remove itens obsoletos do IndexedDB.
 * Chamado pelo alarm 'cleanup_stale' a cada 6 horas.
 *
 * @param opts.queueMaxAgeHours  Remove itens da fila mais antigos que N horas (padrão 24h)
 * @param opts.replayMaxAgeHours Remove entradas do replay buffer mais antigas que N horas (padrão 6h)
 * @returns { queue, replay } — quantidade de itens deletados
 */
export async function cleanupStale(opts = { queueMaxAgeHours: 24, replayMaxAgeHours: 6 }) {
  const db          = await getDB();
  const cutoffQueue  = Date.now() - opts.queueMaxAgeHours  * 3_600_000;
  const cutoffReplay = Date.now() - opts.replayMaxAgeHours * 3_600_000;
  const deleted      = { queue: 0, replay: 0 };

  // Fila: remove itens expirados (max tentativas atingido) ou muito antigos
  await new Promise((res, rej) => {
    const t   = db.transaction(STORE_QUEUE, 'readwrite');
    const req = t.objectStore(STORE_QUEUE).openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { res(); return; }
      const { attempts, createdAt } = cursor.value;
      if (attempts >= MAX_RETRIES || createdAt < cutoffQueue) {
        cursor.delete();
        deleted.queue++;
      }
      cursor.continue();
    };
    req.onerror = () => rej(req.error);
  });

  // Replay buffer: remove entradas antigas (preserva as recentes para diagnóstico)
  await new Promise((res, rej) => {
    const t   = db.transaction(STORE_REPLAY, 'readwrite');
    const req = t.objectStore(STORE_REPLAY).openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { res(); return; }
      if (cursor.value.savedAt < cutoffReplay) {
        cursor.delete();
        deleted.replay++;
      }
      cursor.continue();
    };
    req.onerror = () => rej(req.error);
  });

  return deleted;
}

/**
 * Retorna o tamanho estimado do IndexedDB em bytes (somando snapshots e replay).
 * Útil para detectar crescimento anormal em testes de 24h.
 */
export async function estimateStorageSize() {
  const [snapshots, replay] = await Promise.all([
    new Promise((res, rej) => {
      getDB().then(db => {
        const t   = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const req = t.objectStore(STORE_SNAPSHOTS).getAll();
        req.onsuccess = () => {
          const bytes = JSON.stringify(req.result).length;
          res({ count: req.result.length, bytes });
        };
        req.onerror = () => rej(req.error);
      });
    }),
    new Promise((res, rej) => {
      getDB().then(db => {
        const t   = db.transaction(STORE_REPLAY, 'readonly');
        const req = t.objectStore(STORE_REPLAY).getAll();
        req.onsuccess = () => {
          const bytes = JSON.stringify(req.result).length;
          res({ count: req.result.length, bytes });
        };
        req.onerror = () => rej(req.error);
      });
    }),
  ]);
  return { snapshots, replay };
}
