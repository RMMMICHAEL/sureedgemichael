/**
 * Relay — roda no mundo ISOLATED.
 * Escuta CustomEvents do interceptor (MAIN world) e repassa
 * ao service worker via chrome.runtime.sendMessage.
 *
 * Eleição de líder via chrome.storage.session:
 *   Apenas uma aba é eleita "líder" a cada vez.
 *   Somente o líder repassa eventos ao SW — as demais abas descartam,
 *   evitando ingestos duplicados em sessões multi-tab.
 */

const LEADER_KEY      = 'sync_leader_tab_id';
const LEADER_TTL_MS   = 15_000; // líder precisa renovar a cada 12s (com folga de 3s)
const RENEW_INTERVAL  = 12_000;

let _tabId        = null;
let _isLeader     = false;
let _renewTimer   = null;

/** Obtém o tabId desta aba de forma lazy */
async function getTabId() {
  if (_tabId !== null) return _tabId;
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ kind: 'get_tab_id' }, res => {
      _tabId = res?.tabId ?? `${Date.now()}-${Math.random()}`;
      resolve(_tabId);
    });
  });
}

/** Tenta eleger esta aba como líder. Retorna true se esta aba é o líder. */
async function tryBecomeLeader() {
  const tabId = await getTabId();
  const now   = Date.now();

  const stored = await chrome.storage.session.get(LEADER_KEY).catch(() => ({}));
  const entry  = stored[LEADER_KEY];

  // Vira líder se: não há líder, o líder expirou, ou somos o líder atual
  if (!entry || entry.expiresAt < now || entry.tabId === tabId) {
    await chrome.storage.session.set({
      [LEADER_KEY]: { tabId, expiresAt: now + LEADER_TTL_MS },
    }).catch(() => {});
    _isLeader = true;
  } else {
    _isLeader = (entry.tabId === tabId);
  }
  return _isLeader;
}

/** Renova o lease do líder periodicamente enquanto a aba estiver aberta */
async function startLeaderRenewal() {
  if (_renewTimer) return;
  _renewTimer = setInterval(async () => {
    if (_isLeader) {
      const tabId = await getTabId();
      await chrome.storage.session.set({
        [LEADER_KEY]: { tabId, expiresAt: Date.now() + LEADER_TTL_MS },
      }).catch(() => {});
    } else {
      // Tenta assumir liderança se o líder anterior expirou
      await tryBecomeLeader();
    }
  }, RENEW_INTERVAL);
}

// Garante que ao fechar/navegar a aba o lease seja liberado
window.addEventListener('pagehide', async () => {
  if (!_isLeader) return;
  await chrome.storage.session.remove(LEADER_KEY).catch(() => {});
  _isLeader = false;
});

// Inicializa eleição na carga da página
tryBecomeLeader().then(() => {
  startLeaderRenewal();
  console.log(`[SureEdge] relay leader=${_isLeader} tab=${_tabId}`);
}).catch(console.error);

// Repassa eventos ao SW apenas se esta aba for líder
window.addEventListener('__sureedge_intercept', async (event) => {
  if (!_isLeader) {
    // Tenta re-eleger (líder pode ter fechado a aba)
    await tryBecomeLeader();
    if (!_isLeader) return; // ainda não é líder — descarta
  }
  chrome.runtime.sendMessage({ kind: 'intercept', ...event.detail });
});
