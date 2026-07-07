/**
 * Criptografia — HMAC-SHA256 para assinatura de payloads.
 * Usa crypto.subtle nativo do browser (disponível em service workers MV3).
 */

const SUREEDGE_ORIGIN = 'https://www.sureedge.com.br';

/** Lê ou gera o device_id persistido */
export async function getDeviceId() {
  const stored = await chrome.storage.local.get('device_id');
  if (stored.device_id) return stored.device_id;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ device_id: id });
  return id;
}

/** Lê ou gera a chave HMAC persistida como JWK */
async function getHmacKey() {
  const stored = await chrome.storage.local.get('hmac_key_jwk');
  if (stored.hmac_key_jwk) {
    return crypto.subtle.importKey(
      'jwk', stored.hmac_key_jwk,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign', 'verify']
    );
  }
  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true, ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await chrome.storage.local.set({ hmac_key_jwk: jwk });
  return key;
}

/** Assina um payload (string ou ArrayBuffer) e retorna hex da assinatura */
export async function signPayload(payload) {
  const key  = await getHmacKey();
  const data = typeof payload === 'string'
    ? new TextEncoder().encode(payload)
    : payload;
  const sig  = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Comprime um objeto JSON com CompressionStream (gzip) */
export async function compress(obj) {
  const json   = JSON.stringify(obj);
  const stream = new Response(json).body.pipeThrough(new CompressionStream('gzip'));
  const buf    = await new Response(stream).arrayBuffer();
  return buf;
}

/** Envia payload ao SureEdge com HMAC */
export async function sendToSureEdge(endpoint, payload, deviceId) {
  const compressed = await compress(payload);
  const hex        = await signPayload(compressed);

  const res = await fetch(`${SUREEDGE_ORIGIN}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/octet-stream',
      'Content-Encoding':'gzip',
      'X-Device-ID':     deviceId,
      'X-Signature':     hex,
      'X-Plugin-ID':     payload.pluginId ?? '',
      'X-Sequence-ID':   String(payload.sequenceId ?? 0),
    },
    body: compressed,
  });

  return res;
}
