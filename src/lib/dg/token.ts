/**
 * DuploGreen token manager
 * Faz login via email/senha e renova o access_token automaticamente.
 * O token dura 1 hora — renovado automaticamente antes de expirar.
 */

const DG_API   = process.env.DG_API_URL   || 'https://api.duplogreenengine.com';
const DG_ANON  = process.env.DG_ANON_KEY  || '';
const DG_EMAIL = process.env.DG_EMAIL     || '';
const DG_PASS  = process.env.DG_PASSWORD  || '';

interface TokenCache {
  access_token: string;
  expires_at: number; // ms
}

// Cache em memória do processo Node (persiste entre requests no mesmo worker)
let _cache: TokenCache | null = null;

/** Retorna um access_token válido, fazendo login se necessário. */
export async function getDGToken(): Promise<string> {
  const now = Date.now();

  // Válido se ainda tem 5 minutos de margem
  if (_cache && _cache.expires_at - now > 5 * 60 * 1000) {
    return _cache.access_token;
  }

  // Login fresco com email + senha
  const res = await fetch(`${DG_API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': DG_ANON,
    },
    body: JSON.stringify({ email: DG_EMAIL, password: DG_PASS }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DuploGreen login falhou (${res.status}): ${err}`);
  }

  const data = await res.json();
  const token: string = data.access_token;
  const expiresIn: number = data.expires_in ?? 3600; // segundos

  _cache = {
    access_token: token,
    expires_at: now + expiresIn * 1000,
  };

  return token;
}

/** Chama um endpoint do DuploGreen autenticado. */
export async function dgFetch(endpoint: string, params?: Record<string, string>): Promise<Response> {
  const token = await getDGToken();
  const url = new URL(`${DG_API}/functions/v1/${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  // Cache-bust para evitar resposta obsoleta
  url.searchParams.set('_t', String(Date.now()));

  return fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}
