/**
 * SureEdge Sync Bridge — Interceptor Universal
 * Roda no mundo MAIN (contexto da página) para ter acesso direto a
 * window.fetch, XMLHttpRequest, WebSocket e EventSource.
 * Nunca interfere no comportamento original — apenas observa.
 *
 * DIAGNÓSTICO: rastreia TODOS os canais de rede sem filtro de domínio.
 * Execute window.__sureedge_diag() no console do DG para ver relatório.
 */
(function () {
  'use strict';

  if (window.__sureedge_interceptor_loaded) return;
  window.__sureedge_interceptor_loaded = true;

  // ─── Filtro DG (para dispatch ao service worker) ───────────────────────────
  const DG_API_PATTERNS = [
    /duplogreenengine\.com\/functions\/v1\//,
    /duplogreenengine\.com\/rest\/v1\//,
  ];
  function isDGUrl(url) {
    if (!url) return false;
    return DG_API_PATTERNS.some(p => p.test(url));
  }
  function extractEndpointName(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      const name = parts[parts.length - 1] || parts[parts.length - 2];
      return name + (u.search ? u.search.slice(0, 80) : '');
    } catch { return url.slice(0, 100); }
  }

  // ─── Diagnóstico: rastreia TODOS os canais ────────────────────────────────
  const __diag = {
    ws:    new Map(), // url → {count, first, last, openAt, samples, hasDgOdds}
    sse:   new Map(), // url → {count, first, last, samples}
    fetch: new Map(), // endpoint → {count, first, last, domains}
    xhr:   new Map(), // endpoint → {count, first, last}
  };

  function diagTrack(type, url, payload) {
    const map = __diag[type];
    const key = url.length > 120 ? url.slice(0, 120) + '…' : url;
    let entry = map.get(key);
    if (!entry) {
      entry = { url: key, count: 0, first: Date.now(), last: 0, samples: [], hasDgOdds: false };
      map.set(key, entry);
    }
    entry.count++;
    entry.last = Date.now();
    if (payload && entry.samples.length < 3) {
      const sample = typeof payload === 'string' ? payload.slice(0, 300) : JSON.stringify(payload).slice(0, 300);
      entry.samples.push(sample);
    }
    // Marca se parece payload de odds do DG
    if (payload && !entry.hasDgOdds) {
      const s = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (s.includes('bookmaker_slug') || s.includes('odd_home') || s.includes('match_id') ||
          s.includes('odd_away') || s.includes('get-individual-odds')) {
        entry.hasDgOdds = true;
      }
    }
  }

  function sinceMs(ts) {
    if (!ts) return '—';
    const s = Math.floor((Date.now() - ts) / 1000);
    return s < 60 ? `${s}s atrás` : `${Math.floor(s / 60)}min atrás`;
  }

  window.__sureedge_diag = function () {
    console.group('%c[SureEdge] Diagnóstico de canais de rede', 'color:#3FFF21;font-weight:900;font-size:14px');

    // WebSocket
    console.group(`%c🔌 WebSocket (${__diag.ws.size} conexão/ões)`, 'color:#4DA6FF;font-weight:700');
    if (__diag.ws.size === 0) {
      console.log('  (nenhuma conexão WebSocket detectada)');
    }
    for (const [, e] of __diag.ws) {
      const tag = e.hasDgOdds ? '⚡ TEM ODDS DG' : '';
      console.log(`  %c${e.url}`, 'color:#94a3b8');
      console.log(`    mensagens: ${e.count} | última: ${sinceMs(e.last)} | aberta: ${sinceMs(e.openAt)} ${tag}`);
      if (e.samples[0]) console.log('    sample[0]:', e.samples[0].slice(0, 200));
    }
    console.groupEnd();

    // SSE (EventSource)
    console.group(`%c📡 SSE / EventSource (${__diag.sse.size} conexão/ões)`, 'color:#A78BFA;font-weight:700');
    if (__diag.sse.size === 0) {
      console.log('  (nenhuma conexão SSE detectada)');
    }
    for (const [, e] of __diag.sse) {
      const tag = e.hasDgOdds ? '⚡ TEM ODDS DG' : '';
      console.log(`  %c${e.url}`, 'color:#94a3b8');
      console.log(`    eventos: ${e.count} | último: ${sinceMs(e.last)} ${tag}`);
      if (e.samples[0]) console.log('    sample[0]:', e.samples[0].slice(0, 200));
    }
    console.groupEnd();

    // Fetch
    console.group(`%c🌐 Fetch HTTP (${__diag.fetch.size} endpoint/s)`, 'color:#f59e0b;font-weight:700');
    const fetchSorted = [...__diag.fetch.values()].sort((a, b) => b.count - a.count);
    for (const e of fetchSorted) {
      const tag = e.hasDgOdds ? ' ⚡TEM ODDS' : '';
      console.log(`  [${e.count}x] ${e.url}${tag} — última: ${sinceMs(e.last)}`);
    }
    console.groupEnd();

    // XHR
    console.group(`%c📦 XMLHttpRequest (${__diag.xhr.size} endpoint/s)`, 'color:#f87171;font-weight:700');
    if (__diag.xhr.size === 0) console.log('  (nenhum XHR detectado)');
    for (const [, e] of __diag.xhr) {
      console.log(`  [${e.count}x] ${e.url} — última: ${sinceMs(e.last)}`);
    }
    console.groupEnd();

    console.log('%c💡 Dica: observe "⚡ TEM ODDS DG" para saber qual canal carrega as odds', 'color:#3FFF21;font-style:italic');
    console.groupEnd();

    return {
      ws:    [...__diag.ws.values()],
      sse:   [...__diag.sse.values()],
      fetch: fetchSorted,
      xhr:   [...__diag.xhr.values()],
    };
  };

  // ─── Dispatch para service worker ─────────────────────────────────────────
  function dispatch(type, data) {
    window.dispatchEvent(new CustomEvent('__sureedge_intercept', {
      detail: { type, data, ts: Date.now() }
    }));
  }

  // ─── 1. Interceptar fetch ──────────────────────────────────────────────────
  let sessionCaptured    = false;
  let lastCapturedHeaders = {};

  function extractHeaders(init) {
    const h = init?.headers;
    if (!h) return {};
    const out = {};
    if (h instanceof Headers) h.forEach((v, k) => { out[k] = v; });
    else if (typeof h === 'object') Object.assign(out, h);
    return out;
  }

  window.__sureedge_force_fetch = function () {
    if (typeof window.__sureedge_run_active_fetch === 'function') {
      // Não loga headers brutos — podem conter Authorization Bearer ou cookies
      const safe = Object.fromEntries(
        Object.entries(lastCapturedHeaders ?? {})
          .filter(([k]) => !/^(authorization|cookie|x-signature)$/i.test(k))
          .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 40) : v])
      );
      console.log('[SureEdge] forçando fetch ativo headers_safe:', safe);
      window.__sureedge_run_active_fetch(lastCapturedHeaders).catch(console.error);
    } else {
      console.warn('[SureEdge] active-fetch ainda não carregado');
    }
  };

  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input
      : (input instanceof Request ? input.url : String(input));
    const response = await _fetch(input, init);

    // Diagnóstico: rastreia TODOS os fetches
    const endpoint = extractEndpointName(url);
    diagTrack('fetch', endpoint, null);

    if (isDGUrl(url)) {
      const captured = extractHeaders(init);
      const isFunctionCall = url.includes('/functions/v1/');

      if (isFunctionCall && (captured.Authorization || captured.authorization)) {
        lastCapturedHeaders = { ...lastCapturedHeaders, ...captured };
        if (!sessionCaptured) {
          sessionCaptured = true;
          console.log('[SureEdge] sessão capturada (functions/v1), iniciando fetch ativo');
          if (typeof window.__sureedge_run_active_fetch === 'function') {
            window.__sureedge_run_active_fetch(lastCapturedHeaders).catch(console.error);
          }
        }
      }

      try {
        const clone = response.clone();
        clone.text().then(body => {
          try {
            const json = JSON.parse(body);
            // Atualiza diagnóstico com payload
            const e = __diag.fetch.get(endpoint);
            if (e) diagTrack('fetch', endpoint, json);
            dispatch('fetch', {
              url, endpoint,
              method: (init?.method || 'GET').toUpperCase(),
              status: response.status,
              body: json,
              size: body.length,
            });
          } catch { /* não é JSON */ }
        }).catch(() => {});
      } catch { /* nunca interrompe */ }
    }

    return response;
  };

  // ─── 2. Interceptar XMLHttpRequest ────────────────────────────────────────
  const _XHROpen = XMLHttpRequest.prototype.open;
  const _XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__sureedge_url    = url;
    this.__sureedge_method = method;
    return _XHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const xhr = this;
    const url = xhr.__sureedge_url || '';

    // Diagnóstico: rastreia TODOS os XHR
    diagTrack('xhr', extractEndpointName(url), null);

    if (isDGUrl(url)) {
      xhr.addEventListener('load', function () {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const json = JSON.parse(xhr.responseText);
            dispatch('xhr', {
              url, endpoint: extractEndpointName(url),
              method: (xhr.__sureedge_method || 'GET').toUpperCase(),
              status: xhr.status, body: json, size: xhr.responseText.length,
            });
          }
        } catch { /* não é JSON */ }
      });
    }

    return _XHRSend.call(this, body);
  };

  // ─── 3. Interceptar WebSocket (TODOS os domínios para diagnóstico) ─────────
  const _WebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = protocols ? new _WebSocket(url, protocols) : new _WebSocket(url);

    // Diagnóstico: rastreia abertura
    const diagEntry = { url, count: 0, first: Date.now(), last: 0, openAt: Date.now(), samples: [], hasDgOdds: false };
    __diag.ws.set(url, diagEntry);
    console.debug(`[SureEdge][WS] nova conexão: ${url.slice(0, 100)}`);

    ws.addEventListener('message', function (event) {
      const data = typeof event.data === 'string' ? event.data : '[binary]';
      diagEntry.count++;
      diagEntry.last = Date.now();
      if (diagEntry.samples.length < 3) diagEntry.samples.push(data.slice(0, 300));
      if (!diagEntry.hasDgOdds) {
        if (data.includes('bookmaker_slug') || data.includes('odd_home') ||
            data.includes('match_id') || data.includes('get-individual-odds')) {
          diagEntry.hasDgOdds = true;
          console.log('%c[SureEdge][WS] ⚡ ODDS DETECTADAS via WebSocket!', 'color:#3FFF21;font-weight:900', url.slice(0, 80));
        }
      }

      // Dispatch ao SW apenas para URLs do DG
      if (isDGUrl(url)) {
        try {
          const json = JSON.parse(data);
          dispatch('ws', {
            url, endpoint: extractEndpointName(url),
            method: 'WS', status: 101, body: json, size: data.length,
          });
        } catch { /* não é JSON */ }
      }
    });

    ws.addEventListener('close', () => {
      console.debug(`[SureEdge][WS] conexão fechada: ${url.slice(0, 80)}`);
    });

    return ws;
  };
  Object.assign(window.WebSocket, _WebSocket);
  window.WebSocket.prototype = _WebSocket.prototype;

  // ─── 4. Interceptar EventSource / SSE (TODOS os domínios) ─────────────────
  const _EventSource = window.EventSource;
  window.EventSource = function (url, init) {
    const es = init ? new _EventSource(url, init) : new _EventSource(url);

    const diagEntry = { url, count: 0, first: Date.now(), last: 0, samples: [], hasDgOdds: false };
    __diag.sse.set(url, diagEntry);
    console.debug(`[SureEdge][SSE] nova conexão: ${url.slice(0, 100)}`);

    // Captura todos os tipos de evento SSE
    const origAddListener = es.addEventListener.bind(es);
    es.addEventListener = function (type, handler, ...rest) {
      if (type === 'message' || type === 'open' || type === 'error') {
        return origAddListener(type, handler, ...rest);
      }
      // Evento customizado — envolve para diagnóstico
      const wrapped = function (event) {
        const data = event.data || '';
        diagEntry.count++;
        diagEntry.last = Date.now();
        if (diagEntry.samples.length < 3) diagEntry.samples.push((`[${type}] ` + data).slice(0, 300));
        if (!diagEntry.hasDgOdds && (data.includes('bookmaker_slug') || data.includes('odd_home'))) {
          diagEntry.hasDgOdds = true;
          console.log('%c[SureEdge][SSE] ⚡ ODDS DETECTADAS via SSE!', 'color:#3FFF21;font-weight:900', url.slice(0, 80));
        }
        handler(event);
      };
      return origAddListener(type, wrapped, ...rest);
    };

    origAddListener('message', function (event) {
      const data = event.data || '';
      diagEntry.count++;
      diagEntry.last = Date.now();
      if (diagEntry.samples.length < 3) diagEntry.samples.push(data.slice(0, 300));
      if (!diagEntry.hasDgOdds && (data.includes('bookmaker_slug') || data.includes('odd_home'))) {
        diagEntry.hasDgOdds = true;
        console.log('%c[SureEdge][SSE] ⚡ ODDS DETECTADAS via SSE!', 'color:#3FFF21;font-weight:900', url.slice(0, 80));
      }

      if (isDGUrl(url)) {
        try {
          const json = JSON.parse(data);
          dispatch('sse', {
            url, endpoint: extractEndpointName(url),
            method: 'SSE', status: 200, body: json, size: data.length,
          });
        } catch { /* não é JSON */ }
      }
    });

    return es;
  };
  window.EventSource.prototype = _EventSource.prototype;

  // ─── Auto-report periódico (30s) ──────────────────────────────────────────
  // Após 30 segundos de página aberta, imprime o status atual no console
  setTimeout(() => {
    const wsCnt  = __diag.ws.size;
    const sseCnt = __diag.sse.size;
    const hasOddsWs  = [...__diag.ws.values()].some(e => e.hasDgOdds);
    const hasOddsSse = [...__diag.sse.values()].some(e => e.hasDgOdds);

    console.debug(
      `[SureEdge] diagnóstico 30s: WS=${wsCnt} SSE=${sseCnt} | odds_ws=${hasOddsWs} odds_sse=${hasOddsSse}` +
      ` | fetch=${__diag.fetch.size} endpoints` +
      '\n  → execute window.__sureedge_diag() para relatório completo'
    );
  }, 30_000);

  console.debug('[SureEdge] interceptor ativo (modo diagnóstico) — window.__sureedge_diag() para relatório');
})();
