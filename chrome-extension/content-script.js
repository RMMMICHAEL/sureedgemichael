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

// Recebe comando de busca do background e executa via injected.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'search') return false;

  // Pede ao injected.js para fazer a busca
  window.postMessage({ __sureedge_search__: true, query: msg.query }, '*');

  // Aguarda resposta do injected.js via postMessage
  const timeout = setTimeout(() => {
    window.removeEventListener('message', handler);
    sendResponse({ ok: false, error: 'Timeout na busca' });
  }, 12_000);

  function handler(e) {
    if (e.source !== window || !e.data?.__sureedge_result__) return;
    if (e.data.query !== msg.query) return;
    clearTimeout(timeout);
    window.removeEventListener('message', handler);
    sendResponse({ ok: e.data.ok, data: e.data.data, error: e.data.error });
  }

  window.addEventListener('message', handler);
  return true; // mantém sendResponse aberto (async)
});
