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
  hookObject('AppCrypto', 'freebet');

  // ── Filtro de data (aplicado após capturar recommendations) ─────────────────

  function applyDateFilter(recommendations, range) {
    if (!range || range === 'all' || !Array.isArray(recommendations)) return recommendations;
    const hoursMap = { '24h': 24, '48h': 48, '72h': 72, '5d': 120 };
    const maxHours = hoursMap[range];
    if (!maxHours) return recommendations;
    const now = Date.now();
    const cutoffMs = maxHours * 3600 * 1000;
    return recommendations.filter(rec => {
      const dateStr = rec?.event?.date || rec?.event_date || rec?.date;
      if (!dateStr) return true; // sem data = inclui
      const diff = new Date(dateStr).getTime() - now;
      return diff >= -3600000 && diff <= cutoffMs; // até 1h no passado até N horas à frente
    });
  }

  // ── Busca de odds (page=buscador) ───────────────────────────────────────────

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data?.__sureedge_search__) return;

    const query = e.data.query;
    console.log(`[SureEdge] 🔍 Buscando odds: "${query}"`);

    try {
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

  // ── Busca de freebet (page=converter-freebet) ────────────────────────────────

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data?.__sureedge_freebet__) return;

    const { bookmaker, value, min_odd, max_odd, pa_filter, date_range, reqId } = e.data;
    console.log(`[SureEdge] 🎁 Freebet: ${bookmaker} R$${value} odds ${min_odd}-${max_odd} pa=${pa_filter} range=${date_range}`);

    try {
      // Aguarda loadResults estar disponível (quizData é let/const — não vira window.*)
      let waited = 0;
      while (typeof window.loadResults !== 'function' && waited < 10000) {
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
      }

      if (typeof window.loadResults !== 'function') {
        throw new Error('loadResults não disponível — está na página converter-freebet?');
      }

      // Aguarda AppCrypto estar pronto
      if (window.AppCrypto && typeof window.AppCrypto.init === 'function') {
        await window.AppCrypto.init().catch(() => {});
      }

      // Configura estado via funções da página (têm closure sobre quizData)
      const fakeEl = { classList: { add: () => {}, remove: () => {} } };
      if (typeof window.selectBookmaker === 'function') window.selectBookmaker(bookmaker, fakeEl);
      if (typeof window.setFreebetValue === 'function') window.setFreebetValue(value);
      if (typeof window.setMinOdd === 'function') window.setMinOdd(min_odd);
      if (typeof window.setMaxOdd === 'function') window.setMaxOdd(max_odd);

      // Filtros de seleção no DOM
      const paSelect   = document.getElementById('paFilterSelect');
      const dateSelect = document.getElementById('dateRangeSelect');
      if (paSelect)   paSelect.value   = pa_filter   ?? 'all';
      if (dateSelect) dateSelect.value = date_range  ?? 'all';

      // ── Captura via sinal do AppCrypto.decrypt (mais confiável que hook em displayResults) ──
      // AppCrypto.decrypt dispara antes de displayResults e já tem os dados completos.
      // Usamos debounce de 1.5s: quando o sinal para de chegar, resolvemos com o último payload.
      const resultPromise = new Promise((resolve, reject) => {
        let lastPayload = null;
        let debounceTimer = null;

        const overallTimeout = setTimeout(() => {
          window.removeEventListener('message', signalHandler);
          if (debounceTimer) clearTimeout(debounceTimer);
          if (lastPayload) {
            // Temos dados mesmo com timeout — usa o que tiver
            const recs = applyDateFilter(lastPayload.recommendations ?? [], date_range);
            resolve({ recommendations: recs, count: recs.length });
          } else {
            reject(new Error('Timeout aguardando resultado do freebet (30s)'));
          }
        }, 30_000);

        function signalHandler(e) {
          if (e.source !== window || !e.data?.__sureedge__) return;
          if (e.data.source !== 'freebet') return;
          const payload = e.data.payload;
          if (!payload) return;

          lastPayload = payload;

          // Debounce: aguarda 1.5s sem novos sinais antes de resolver
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            clearTimeout(overallTimeout);
            window.removeEventListener('message', signalHandler);
            const recs = applyDateFilter(lastPayload.recommendations ?? [], date_range);
            resolve({ recommendations: recs, count: recs.length });
          }, 1500);
        }

        window.addEventListener('message', signalHandler);
      });

      // Dispara a busca
      window.loadResults().catch(() => {});

      const data = await resultPromise;
      console.log(`[SureEdge] ✅ Freebet: ${data.count} resultado(s) após filtro ${date_range}`);

      window.postMessage(
        { __sureedge_freebet_result__: true, reqId, ok: true, data },
        '*'
      );
    } catch (err) {
      console.error('[SureEdge] Erro no freebet:', err.message);
      window.postMessage(
        { __sureedge_freebet_result__: true, reqId, ok: false, error: err.message },
        '*'
      );
    }
  });
})();
