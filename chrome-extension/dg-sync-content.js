// dg-sync-content.js — isolated world, ponte entre a página do DuploGreen Engine
// (dg-sync-injected.js, MAIN world) e o background.js (que fala com o SureEdge).
//
// Guard: evita dupla injeção (acontece se o background reinjetar via chrome.scripting.executeScript).
if (window.__dgsync_cs__) {
  // já está ativo — não faz nada
} else {
  window.__dgsync_cs__ = true;

  // Injeta o sync layer no contexto real da página (precisa do MAIN world pra
  // enxergar o mesmo objeto QueryClient que o React da página usa).
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('dg-sync-injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // Recebe um lote de deltas do injected.js e repassa pro background,
  // devolvendo o ack (ok/erro) correlacionado por reqId.
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__dgsync_batch__) return;
    const { reqId, payloads } = e.data;

    chrome.runtime.sendMessage({ type: 'dg-sync-batch', payloads }, (response) => {
      const err = chrome.runtime.lastError;
      window.postMessage({
        __dgsync_ack__: true,
        reqId,
        ok: !err && !!response?.ok,
        error: err?.message || response?.error,
      }, '*');
    });
  });
}
