/**
 * proxyFetch — fetch via proxy residencial (proxy-seller.com).
 * Usado nos scrapers que são bloqueados por Cloudflare/Fastly
 * quando chamados de datacenter (Vercel/AWS).
 *
 * Usa undici ProxyAgent (disponível nativamente no Node.js 18+).
 * Fallback: fetch normal se RESIDENTIAL_PROXY não estiver configurado.
 */

const PROXY_URL = process.env.RESIDENTIAL_PROXY ?? '';

// Cache do dispatcher para não recriar a cada request
let _dispatcher: unknown = null;

async function getDispatcher() {
  if (!PROXY_URL) return null;
  if (_dispatcher) return _dispatcher;
  try {
    const { ProxyAgent } = await import('undici');
    _dispatcher = new ProxyAgent(PROXY_URL);
    return _dispatcher;
  } catch {
    return null;
  }
}

export async function proxyFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const dispatcher = await getDispatcher();

  if (!dispatcher) {
    // Sem proxy — usa fetch normal
    return fetch(url, options);
  }

  try {
    const { fetch: undiciFetch } = await import('undici');
    // undici fetch aceita dispatcher no options
    return undiciFetch(url, {
      ...options,
      // @ts-expect-error — undici estende o tipo RequestInit com dispatcher
      dispatcher,
    }) as unknown as Response;
  } catch {
    // Fallback para fetch nativo se undici falhar
    return fetch(url, options);
  }
}
