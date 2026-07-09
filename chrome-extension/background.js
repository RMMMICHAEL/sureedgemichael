// Service worker — escuta search_queue no Supabase e aciona busca via página ativa

const SUPABASE_URL = 'https://iclzwnrpwkojhxhnclhc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljbHp3bnJwd2tvamh4aG5jbGhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1NDA0NiwiZXhwIjoyMDkxMjMwMDQ2fQ.HUK-Rdu3KXCR9gBKqNEPik6Y49fn5MLGDZE7fj-aoVc';

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
      ...(opts.headers ?? {}),
    },
  });
  return res;
}

async function getPendingSearch() {
  const res = await sbFetch(
    'search_queue?status=eq.pending&order=created_at.asc&limit=1',
    { headers: { 'Prefer': 'return=representation' } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function updateSearch(id, status, result = null, error = null) {
  await sbFetch(`search_queue?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      status,
      result,
      error,
      updated_at: new Date().toISOString(),
    }),
  });
}

// ── Helpers de aba ───────────────────────────────────────────────────────────

const SM_BASE    = 'https://painel.supermonitor.pro';
const URL_BUSCA  = `${SM_BASE}/index.php?page=buscador`;
const URL_FB     = `${SM_BASE}/index.php?page=converter-freebet`;

/**
 * Retorna a aba do SuperMonitor para a página solicitada.
 * Se existir uma aba na URL correta → reutiliza.
 * Se existir aba em outra página do SM → NÃO navega ela (pode ser a outra função).
 * Se não existir nenhuma aba do SM → cria nova aba na URL desejada.
 */
async function getOrCreateTab(targetUrl) {
  const allSm = await chrome.tabs.query({ url: `${SM_BASE}/*` });

  // Já existe aba nessa URL exata?
  const exact = allSm.find(t => t.url?.includes(targetUrl.split('page=')[1]));
  if (exact) return exact.id;

  // Tem alguma aba do SM que não está sendo usada para a OUTRA função?
  const otherPage = targetUrl.includes('buscador') ? 'converter-freebet' : 'buscador';
  const free = allSm.find(t => !t.url?.includes(otherPage));
  if (free) {
    await chrome.tabs.update(free.id, { url: targetUrl });
    await waitTabLoad(free.id);
    return free.id;
  }

  // Cria nova aba
  const tab = await chrome.tabs.create({ url: targetUrl, active: false });
  await waitTabLoad(tab.id);
  return tab.id;
}

/**
 * Envia mensagem para uma aba com injeção automática do content-script como fallback.
 * Se "Receiving end does not exist" → injeta content-script programaticamente e tenta de novo.
 */
async function sendMessageSafe(tabId, msg, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (err) {
      if (!err.message?.includes('Receiving end does not exist')) throw err;
      if (i === retries - 1) throw err;

      console.log(`[SureEdge BG] Content-script ausente na aba ${tabId} — injetando (tentativa ${i + 1})...`);
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
      } catch (injectErr) {
        console.warn('[SureEdge BG] Injeção falhou:', injectErr.message);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

function waitTabLoad(tabId, timeout = 8000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// FIX 4: keepalive via chrome.alarms — evita que o service worker MV3 durma e pare o polling
// Keepalive do service worker MV3 — apenas acorda o SW, sem contato com o SM
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 }); // ~24s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') { /* mantém SW vivo */ }
});

// ── Freebet queue helpers ─────────────────────────────────────────────────────

async function getPendingFreebet() {
  const res = await sbFetch(
    'freebet_queue?status=eq.pending&order=created_at.asc&limit=1',
    { headers: { 'Prefer': 'return=representation' } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function updateFreebet(id, status, result = null, error = null) {
  await sbFetch(`freebet_queue?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      status,
      result,
      error_msg: error,
      updated_at: new Date().toISOString(),
    }),
  });
}

// ── Detecta erro de nonce/sessão recuperável ──────────────────────────────────

function isNonceError(msg) {
  if (!msg) return false;
  const s = String(msg).toLowerCase();
  return s.includes('nonce') || s.includes('session') || s.includes('invalid') ||
         s.includes('retry') || s.includes('token') || s.includes('auth');
}

// ── Polling das filas ─────────────────────────────────────────────────────────

let _processingSearch  = false;
let _processingFreebet = false;

// ── Busca de odds ─────────────────────────────────────────────────────────────

async function pollSearchQueue() {
  if (_processingSearch) return;

  const row = await getPendingSearch();
  if (!row) return;

  _processingSearch = true;
  console.log(`[SureEdge BG] 🔍 Busca odds: "${row.query}"`);

  try {
    const allSm = await chrome.tabs.query({ url: `${SM_BASE}/*` });
    if (!allSm.length) {
      await updateSearch(row.id, 'error', null, 'Brave com o painel não está aberto');
      _processingSearch = false;
      return;
    }

    // Tenta usar aba que já está no buscador; se não, cria/redireciona
    let tabId;
    const buscadorTab = allSm.find(t => t.url?.includes('page=buscador'));
    if (buscadorTab) {
      tabId = buscadorTab.id;
    } else {
      tabId = await getOrCreateTab(URL_BUSCA);
      await new Promise(r => setTimeout(r, 2000)); // aguarda página carregar
    }

    // Injeta content-script proativamente (guard interno evita dupla injeção)
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
      await new Promise(r => setTimeout(r, 600));
    } catch { /* já injetado — ok */ }

    // FIX 3: auto-retry em erros de nonce no nível do background
    let result = await sendMessageSafe(tabId, { type: 'search', query: row.query });

    // Se injected.js retornou erro de nonce, espera 2s e tenta mais uma vez
    if (!result?.ok && isNonceError(result?.error)) {
      console.log(`[SureEdge BG] Nonce error detectado — retry em 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      result = await sendMessageSafe(tabId, { type: 'search', query: row.query });
    }

    if (result?.ok) {
      await updateSearch(row.id, 'done', result.data, null);
      console.log(`[SureEdge BG] ✅ Odds salvas: "${row.query}"`);
    } else {
      const errMsg = result?.error ?? 'Erro desconhecido na busca';
      console.warn(`[SureEdge BG] ❌ Busca falhou: ${errMsg}`);
      await updateSearch(row.id, 'error', null, errMsg);
    }
  } catch (e) {
    console.error('[SureEdge BG] Erro odds:', e.message);
    await updateSearch(row.id, 'error', null, e.message);
  }

  _processingSearch = false;
}

// ── Busca de freebet ──────────────────────────────────────────────────────────

async function pollFreebetQueue() {
  if (_processingFreebet) return;

  const row = await getPendingFreebet();
  if (!row) return;

  _processingFreebet = true;
  console.log(`[SureEdge BG] 🎁 Freebet: ${row.bookmaker} R$${row.value}`);

  try {
    const allSm = await chrome.tabs.query({ url: `${SM_BASE}/*` });
    if (!allSm.length) {
      await updateFreebet(row.id, 'error', null, 'Brave com o painel não está aberto');
      _processingFreebet = false;
      return;
    }

    // Tenta aba já no converter-freebet; se não, cria/redireciona uma aba livre
    let tabId;
    const fbTab = allSm.find(t => t.url?.includes('page=converter-freebet'));
    if (fbTab) {
      tabId = fbTab.id;
    } else {
      tabId = await getOrCreateTab(URL_FB);
      await new Promise(r => setTimeout(r, 4000)); // aguarda página carregar
    }

    // Injeta content-script proativamente (guard interno evita dupla injeção)
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
      await new Promise(r => setTimeout(r, 600));
    } catch { /* já injetado — ok */ }

    const reqId = row.id;
    const msg = {
      type:       'freebet',
      reqId,
      bookmaker:  row.bookmaker,
      value:      row.value,
      min_odd:    row.min_odd    ?? 1.5,
      max_odd:    row.max_odd    ?? 50,
      pa_filter:  row.pa_filter  ?? 'all',
      date_range: row.date_range ?? 'all',
    };

    const result = await sendMessageSafe(tabId, msg);

    if (result?.ok) {
      await updateFreebet(row.id, 'done', result.data, null);
      console.log(`[SureEdge BG] ✅ Freebet salvo: ${row.bookmaker}`);
    } else {
      const errMsg = result?.error ?? 'Erro desconhecido no freebet';
      console.warn(`[SureEdge BG] ❌ Freebet falhou: ${errMsg}`);
      await updateFreebet(row.id, 'error', null, errMsg);
    }
  } catch (e) {
    console.error('[SureEdge BG] Erro freebet:', e.message);
    await updateFreebet(row.id, 'error', null, e.message);
  }

  _processingFreebet = false;
}

// Polling a cada 500ms — ambas as filas em paralelo
setInterval(pollSearchQueue,  500);
setInterval(pollFreebetQueue, 600); // offset leve para não colidir

// ── Recebe sinais capturados passivamente ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'signal') {
    const { source, payload } = msg.data ?? {};
    // Filtra ruído: RENEW_NONCE e INVALID_SESSION são ciclos internos normais do painel
    if (payload?.code === 'RENEW_NONCE' || payload?.code === 'INVALID_SESSION') return false;
    console.log(`[SureEdge BG] Sinal (${source}):`, JSON.stringify(payload)?.slice(0, 200));
  }
  return false;
});

// ── DG Sync — repassa lotes de odds do DuploGreen Engine pro SureEdge ─────────
// Vem do dg-sync-content.js (que só faz ponte de postMessage), nunca fala com
// o Supabase direto — quem tem a service_role key é o endpoint Next.js.

const DG_SYNC_ENDPOINT = 'https://www.sureedge.com.br/api/dg-sync/ingest';
// Mesmo valor da env var DG_SYNC_SECRET configurada no Vercel/`.env.local` do SureEdge.
const DG_SYNC_SECRET = 'f65ec5a64997ccbb4de69e5b589085cc15ccdd2ce727cd18ae24648db2f3dbc2';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'dg-sync-batch') return false;

  (async () => {
    try {
      const res = await fetch(DG_SYNC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dg-sync-secret': DG_SYNC_SECRET,
        },
        body: JSON.stringify({ source: 'dg-sync-extension', batch: msg.payloads }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`[SureEdge BG][DG-Sync] HTTP ${res.status}: ${text.slice(0, 200)}`);
        sendResponse({ ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` });
        return;
      }

      const json = await res.json().catch(() => ({}));
      console.log(`[SureEdge BG][DG-Sync] lote enviado — upserted=${json.upserted ?? '?'} deleted=${json.deleted ?? '?'}`);
      sendResponse({ ok: true });
    } catch (e) {
      console.error('[SureEdge BG][DG-Sync] falha no envio:', e.message);
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // resposta assíncrona
});
