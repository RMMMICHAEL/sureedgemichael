// Roda no contexto da página — tem acesso aos objetos de crypto reais
(function () {
  'use strict';

  // ── Hook nos objetos de crypto ──────────────────────────────────────────────

  function hookObject(name, source) {
    if (!window[name]) {
      setTimeout(() => hookObject(name, source), 100);
      return;
    }

    const orig = window[name].decrypt;
    window[name].decrypt = async function (o) {
      const result = await orig.call(this, o);

      if (result && typeof result === 'object') {
        window.postMessage(
          { __sureedge__: true, source, ts: Date.now(), payload: result },
          '*'
        );
      }

      return result;
    };

    console.log(`[SureEdge] ✅ Hook ativo no ${name}.decrypt`);
  }

  hookObject('ScannerCrypto', 'scanner');
  hookObject('BuscadorCrypto', 'buscador');

  // ── Busca ativa (acionada pelo background via content-script) ───────────────

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data?.__sureedge_search__) return;

    const query = e.data.query;
    console.log(`[SureEdge] 🔍 Buscando: "${query}"`);

    try {
      // iframeFetch já está exposto pelo buscador-sse.js
      // Faz tudo: iframe, handshake, decrypt — retorna resultado limpo
      if (!window.iframeFetch) throw new Error('iframeFetch não disponível — está na página do buscador?');

      const data = await window.iframeFetch('search', { q: query, type: 'all' });

      window.postMessage(
        { __sureedge_result__: true, query, ok: true, data },
        '*'
      );
    } catch (err) {
      console.error('[SureEdge] Erro na busca:', err.message);
      window.postMessage(
        { __sureedge_result__: true, query, ok: false, error: err.message },
        '*'
      );
    }
  });
})();
