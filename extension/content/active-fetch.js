/**
 * Fetch ativo — roda no contexto MAIN da página do DG.
 * Tem acesso completo à sessão (cookies + headers) do usuário.
 * Injeta a função no window e é chamado pelo interceptor após capturar sessão.
 */
(function () {
  if (window.__sureedge_active_fetch_loaded) return;
  window.__sureedge_active_fetch_loaded = true;

  const API_BASE = 'https://api.duplogreenengine.com/functions/v1';

  const ENDPOINTS = [
    { path: 'get-individual-odds?market=1x2',              type: 'fetch' },
    { path: 'get-individual-odds?market=1x2_pa',           type: 'fetch' },
    { path: 'get-dg-opportunities-v2?pa_mode=both&sort_by=profit', type: 'fetch' },
    { path: 'get-dg-opportunities-v2?pa_mode=one&sort_by=profit',  type: 'fetch' },
    { path: 'get-dg-opportunities',                        type: 'fetch' },
  ];

  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function fetchOne(path, headers) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${API_BASE}/${path}${sep}_t=${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      if (i > 0) await delay(800);
      try {
        const res = await fetch(url, {
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          mode: 'cors',
        });
        if (res.ok) return { url, body: await res.json() };
        if (res.status === 401 || res.status === 403) {
          console.warn('[SureEdge] auth falhou para', path, res.status);
          return null;
        }
      } catch (e) {
        console.warn('[SureEdge] erro em', path, e.message);
      }
    }
    return null;
  }

  window.__sureedge_run_active_fetch = async function (capturedHeaders) {
    console.debug('[SureEdge] iniciando fetch ativo...');

    for (const ep of ENDPOINTS) {
      const result = await fetchOne(ep.path, capturedHeaders);
      if (result) {
        const body = Array.isArray(result.body)
          ? result.body
          : (result.body?.odds ?? result.body?.opportunities ?? result.body?.data ?? []);

        window.dispatchEvent(new CustomEvent('__sureedge_intercept', {
          detail: {
            type: 'fetch',
            data: {
              url:      result.url,
              endpoint: ep.path,
              method:   'GET',
              status:   200,
              body,
              size:     JSON.stringify(body).length,
            },
            ts: Date.now(),
          },
        }));

        console.debug(`[SureEdge] ativo: ${ep.path} → ${body.length} rows`);
      }
      await delay(400);
    }

    console.debug('[SureEdge] fetch ativo concluído');
  };
})();
