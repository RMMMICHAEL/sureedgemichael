/**
 * SureEdge Sync Bridge — Interceptor Universal
 * Roda no mundo MAIN (contexto da página) para ter acesso direto a
 * window.fetch, XMLHttpRequest, WebSocket e EventSource.
 * Nunca interfere no comportamento original — apenas observa.
 */
(function () {
  'use strict';

  // Evita dupla injeção
  if (window.__sureedge_interceptor_loaded) return;
  window.__sureedge_interceptor_loaded = true;

  // ─── Filtros de URL ────────────────────────────────────────────────────────
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
    } catch {
      return url.slice(0, 100);
    }
  }

  // ─── Dispatch para service worker ─────────────────────────────────────────
  function dispatch(type, data) {
    window.dispatchEvent(new CustomEvent('__sureedge_intercept', {
      detail: { type, data, ts: Date.now() }
    }));
  }

  // ─── 1. Interceptar fetch ──────────────────────────────────────────────────
  let sessionCaptured = false;
  let lastCapturedHeaders = {};

  function extractHeaders(init) {
    const h = init?.headers;
    if (!h) return {};
    const out = {};
    if (h instanceof Headers) {
      h.forEach((v, k) => { out[k] = v; });
    } else if (typeof h === 'object') {
      Object.assign(out, h);
    }
    return out;
  }

  // Permite forçar fetch ativo manualmente via console do DG:
  //   window.__sureedge_force_fetch()
  window.__sureedge_force_fetch = function () {
    if (typeof window.__sureedge_run_active_fetch === 'function') {
      console.log('[SureEdge] forçando fetch ativo com headers:', lastCapturedHeaders);
      window.__sureedge_run_active_fetch(lastCapturedHeaders).catch(console.error);
    } else {
      console.warn('[SureEdge] active-fetch ainda não carregado');
    }
  };

  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    const response = await _fetch(input, init);

    if (isDGUrl(url)) {
      // Acumula sempre os headers mais recentes (pode ter Authorization)
      const captured = extractHeaders(init);
      if (captured.Authorization || captured.authorization) {
        lastCapturedHeaders = { ...lastCapturedHeaders, ...captured };
      }

      // Dispara fetch ativo na primeira requisição DG autenticada
      if (!sessionCaptured && (captured.Authorization || captured.authorization)) {
        sessionCaptured = true;
        console.log('[SureEdge] sessão capturada, iniciando fetch ativo');
        if (typeof window.__sureedge_run_active_fetch === 'function') {
          window.__sureedge_run_active_fetch(lastCapturedHeaders).catch(console.error);
        }
      }

      try {
        const clone = response.clone();
        clone.text().then(body => {
          try {
            const json = JSON.parse(body);
            dispatch('fetch', {
              url,
              endpoint: extractEndpointName(url),
              method: (init?.method || 'GET').toUpperCase(),
              status: response.status,
              body: json,
              size: body.length,
            });
          } catch {
            // resposta não é JSON — ignora
          }
        }).catch(() => {});
      } catch {
        // nunca interrompe o fetch original
      }
    }

    return response;
  };

  // ─── 2. Interceptar XMLHttpRequest ────────────────────────────────────────
  const _XHROpen  = XMLHttpRequest.prototype.open;
  const _XHRSend  = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__sureedge_url    = url;
    this.__sureedge_method = method;
    return _XHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const xhr = this;
    const url = xhr.__sureedge_url || '';

    if (isDGUrl(url)) {
      xhr.addEventListener('load', function () {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const json = JSON.parse(xhr.responseText);
            dispatch('xhr', {
              url,
              endpoint: extractEndpointName(url),
              method: (xhr.__sureedge_method || 'GET').toUpperCase(),
              status: xhr.status,
              body: json,
              size: xhr.responseText.length,
            });
          }
        } catch {
          // não é JSON
        }
      });
    }

    return _XHRSend.call(this, body);
  };

  // ─── 3. Interceptar WebSocket ─────────────────────────────────────────────
  const _WebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = protocols ? new _WebSocket(url, protocols) : new _WebSocket(url);

    if (isDGUrl(url)) {
      ws.addEventListener('message', function (event) {
        try {
          const json = JSON.parse(event.data);
          dispatch('ws', {
            url,
            endpoint: extractEndpointName(url),
            method: 'WS',
            status: 101,
            body: json,
            size: event.data.length,
          });
        } catch {
          // mensagem não é JSON
        }
      });
    }

    return ws;
  };
  // Preserva propriedades estáticas (WebSocket.OPEN etc.)
  Object.assign(window.WebSocket, _WebSocket);
  window.WebSocket.prototype = _WebSocket.prototype;

  // ─── 4. Interceptar EventSource ───────────────────────────────────────────
  const _EventSource = window.EventSource;
  window.EventSource = function (url, init) {
    const es = init ? new _EventSource(url, init) : new _EventSource(url);

    if (isDGUrl(url)) {
      es.addEventListener('message', function (event) {
        try {
          const json = JSON.parse(event.data);
          dispatch('sse', {
            url,
            endpoint: extractEndpointName(url),
            method: 'SSE',
            status: 200,
            body: json,
            size: event.data.length,
          });
        } catch {
          // dado não é JSON
        }
      });
    }

    return es;
  };
  window.EventSource.prototype = _EventSource.prototype;

  // ─── Relay ao service worker via content script ────────────────────────────
  // O mundo MAIN não tem acesso a chrome.runtime — o content script em
  // ISOLATED escuta o CustomEvent e faz o relay.
  console.debug('[SureEdge] interceptor ativo');
})();
