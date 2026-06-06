// Injeta o script no contexto da página
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Recebe dados via postMessage (único canal que cruza isolated-world → content-script)
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data?.__sureedge__) return;
  chrome.runtime.sendMessage({ type: 'signal', data: e.data });
});

// Recebe comandos do background e executa via injected.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // ── Busca de odds ──────────────────────────────────────────────────────────
  if (msg.type === 'search') {
    window.postMessage({ __sureedge_search__: true, query: msg.query }, '*');

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      sendResponse({ ok: false, error: 'Timeout na busca de odds' });
    }, 12_000);

    function handler(e) {
      if (e.source !== window || !e.data?.__sureedge_result__) return;
      if (e.data.query !== msg.query) return;
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      sendResponse({ ok: e.data.ok, data: e.data.data, error: e.data.error });
    }

    window.addEventListener('message', handler);
    return true;
  }

  // ── Busca de freebet ───────────────────────────────────────────────────────
  if (msg.type === 'freebet') {
    const reqId = msg.reqId;
    window.postMessage({ __sureedge_freebet__: true, ...msg }, '*');

    const timeout = setTimeout(() => {
      window.removeEventListener('message', fbHandler);
      sendResponse({ ok: false, error: 'Timeout na busca de freebet' });
    }, 25_000);

    function fbHandler(e) {
      if (e.source !== window || !e.data?.__sureedge_freebet_result__) return;
      if (e.data.reqId !== reqId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', fbHandler);
      sendResponse({ ok: e.data.ok, data: e.data.data, error: e.data.error });
    }

    window.addEventListener('message', fbHandler);
    return true;
  }

  return false;
});
