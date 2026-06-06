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

// ── Polling da fila ───────────────────────────────────────────────────────────

let _processing = false;

async function pollQueue() {
  if (_processing) return;

  const row = await getPendingSearch();
  if (!row) return;

  _processing = true;
  console.log(`[SureEdge BG] Busca recebida: "${row.query}" (${row.id})`);

  try {
    // Encontra aba do SuperMonitor
    let tabs = await chrome.tabs.query({ url: 'https://painel.supermonitor.pro/*' });
    if (!tabs.length) {
      await updateSearch(row.id, 'error', null, 'Brave com SuperMonitor não está aberto');
      _processing = false;
      return;
    }

    let tabId = tabs[0].id;

    // Se não está na página do buscador, navega para lá
    if (!tabs[0].url?.includes('page=buscador')) {
      await chrome.tabs.update(tabId, {
        url: 'https://painel.supermonitor.pro/index.php?page=buscador',
      });
      // Aguarda a página carregar (content-script reinicia)
      await new Promise(r => setTimeout(r, 3000));
    }

    // Aciona a busca via content-script
    const result = await chrome.tabs.sendMessage(tabId, {
      type: 'search',
      query: row.query,
    });

    if (result?.ok) {
      await updateSearch(row.id, 'done', result.data, null);
      console.log(`[SureEdge BG] ✅ Resultado salvo para "${row.query}"`);
    } else {
      await updateSearch(row.id, 'error', null, result?.error ?? 'Erro desconhecido');
    }
  } catch (e) {
    console.error('[SureEdge BG] Erro:', e.message);
    await updateSearch(row.id, 'error', null, e.message);
  }

  _processing = false;
}

// Inicia polling a cada 500ms
setInterval(pollQueue, 500);

// ── Recebe sinais capturados (duplo green, etc) ───────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'signal') {
    const { source, payload } = msg.data ?? {};
    console.log(`[SureEdge BG] Sinal recebido (${source}):`, JSON.stringify(payload)?.slice(0, 200));
  }
  // search_result vem do content-script após busca
  return false;
});
