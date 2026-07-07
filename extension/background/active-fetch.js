/**
 * Fetch ativo — assim que a sessão DG é capturada, busca todos os
 * endpoints conhecidos e envia ao SureEdge, sem precisar navegar pelo site.
 */

const API_BASE = 'https://api.duplogreenengine.com/functions/v1';

const OPP_ENDPOINTS = [
  'get-dg-opportunities-v2?pa_mode=both&sort_by=profit',
  'get-dg-opportunities-v2?pa_mode=both&sort_by=score',
  'get-dg-opportunities-v2?pa_mode=one&sort_by=profit',
  'get-dg-opportunities-v2?pa_mode=one&sort_by=score',
  'get-dg-opportunities',
];

const ODDS_ENDPOINTS = [
  'get-individual-odds?market=1x2',
  'get-individual-odds?market=1x2_pa',
];

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchOne(path, sessionHeaders, retries = 2) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}/${path}${sep}_t=${Date.now()}`;
  for (let i = 0; i <= retries; i++) {
    if (i > 0) await delay(800);
    try {
      const res = await fetch(url, {
        headers: sessionHeaders,
        credentials: 'include',
        mode: 'cors',
      });
      if (res.ok) return await res.json();
      if (res.status === 401) return null; // sessão expirou
    } catch { /* retry */ }
  }
  return null;
}

export async function runActiveFetch(sessionHeaders, onData) {
  console.log('[SureEdge] fetch ativo iniciado');

  // Odds primeiro (prioridade crítica)
  for (const ep of ODDS_ENDPOINTS) {
    const data = await fetchOne(ep, sessionHeaders);
    if (data) {
      const body = Array.isArray(data) ? data : (data.odds ?? data.data ?? []);
      onData({
        url:      `${API_BASE}/${ep}`,
        endpoint: ep,
        method:   'GET',
        status:   200,
        body,
        size:     JSON.stringify(body).length,
      });
      console.log(`[SureEdge] ${ep} → ${body.length} rows`);
    }
    await delay(400);
  }

  // Oportunidades (prioridade high)
  for (const ep of OPP_ENDPOINTS) {
    const data = await fetchOne(ep, sessionHeaders);
    if (data) {
      const body = Array.isArray(data) ? data : (data.opportunities ?? data.data ?? []);
      onData({
        url:      `${API_BASE}/${ep}`,
        endpoint: ep,
        method:   'GET',
        status:   200,
        body,
        size:     JSON.stringify(body).length,
      });
      console.log(`[SureEdge] ${ep} → ${body.length} rows`);
    }
    await delay(400);
  }

  console.log('[SureEdge] fetch ativo concluído');
}
