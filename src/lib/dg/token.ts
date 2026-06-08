/**
 * DuploGreen token manager (server-side)
 * O access_token é fornecido pelo browser do admin e armazenado aqui.
 * Renovação via browser (Cloudflare bloqueia login server-side).
 */

const DG_API = process.env.DG_API_URL || 'https://api.duplogreenengine.com';

// Cache em memória — persiste entre requests no mesmo worker
let _accessToken: string | null = null;
let _expiresAt:   number        = 0; // ms

/** Define um novo token (chamado pela rota /api/dg/set-token) */
export function setDGToken(token: string, expiresInSeconds = 3600) {
  _accessToken = token;
  _expiresAt   = Date.now() + expiresInSeconds * 1000;
}

/** Retorna o token atual ou null se expirado/ausente */
export function getDGToken(): string | null {
  if (_accessToken && Date.now() < _expiresAt - 60_000) {
    return _accessToken;
  }
  return null;
}

/** Informa quantos segundos faltam para expirar (0 = expirado) */
export function getDGTokenTTL(): number {
  if (!_accessToken) return 0;
  return Math.max(0, Math.floor((_expiresAt - Date.now()) / 1000));
}

/** Chama endpoint do DuploGreen com o token armazenado */
export async function dgFetch(endpoint: string, params?: Record<string, string>): Promise<Response> {
  const token = getDGToken();
  if (!token) {
    throw new Error('TOKEN_EXPIRED');
  }

  const url = new URL(`${DG_API}/functions/v1/${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  url.searchParams.set('_t', String(Date.now()));

  return fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
  });
}
