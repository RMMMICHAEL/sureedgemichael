/**
 * supermonitor-crypto.ts
 * Utilitário compartilhado: handshake ECDH + busca criptografada do SuperMonitor.
 */

import { webcrypto } from 'node:crypto';

const BASE = 'https://painel.supermonitor.pro';

export function buildHeaders(cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept':          '*/*',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Referer':         'https://painel.supermonitor.pro/index.php?page=buscador',
  };
  if (cookie) h['Cookie'] = cookie;
  return h;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface SMSession {
  aesKey:    CryptoKey;
  hdrs:      Record<string, string>;
}

/** Realiza o handshake ECDH completo e retorna a chave AES derivada */
export async function createSession(cookie?: string): Promise<SMSession> {
  const hdrs = buildHeaders(cookie);

  // 1. Nonce de handshake
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`SuperMonitor indisponível (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await nonceRes.json() as { nonce: string };
  if (!handshakeNonce) throw new Error('Nonce inválido — sessão expirada?');

  // 2. Gera par de chaves P-256
  const keyPair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw  = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  // 3. Handshake
  const hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
    method:  'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body:    JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) throw new Error(`Handshake falhou (${hsRes.status})`);
  const hs = await hsRes.json() as { success?: boolean; server_pub_x?: string; server_pub_y?: string };
  if (!hs.success) throw new Error('Cookie inválido ou expirado');

  // 4. Deriva AES-256-CBC via HKDF
  const serverPubRaw = new Uint8Array(65);
  serverPubRaw[0] = 0x04;
  serverPubRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  serverPubRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await webcrypto.subtle.importKey('raw', serverPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await webcrypto.subtle.deriveBits({ name: 'ECDH', public: serverPub }, keyPair.privateKey, 256);
  const hkdfKey    = await webcrypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey     = await webcrypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('buscador-aes256-v1') },
    hkdfKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
  );

  return { aesKey, hdrs };
}

/** Busca e descriptografa qualquer endpoint do buscador_proxy */
export async function fetchDecrypted(session: SMSession, qs: string): Promise<unknown> {
  // Nonce para o proxy
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: session.hdrs });
  if (!nonceRes.ok) throw new Error(`proxy_nonce falhou (${nonceRes.status})`);
  const { nonce } = await nonceRes.json() as { nonce: string };

  const res = await fetch(`${BASE}/api/buscador_proxy.php?${qs}`, {
    headers: { ...session.hdrs, 'Accept': 'application/json', 'X-Proxy-Nonce': nonce },
  });
  if (!res.ok) throw new Error(`Fetch falhou (${res.status})`);

  const enc = await res.json() as { encrypted?: boolean; data?: string };

  if (enc.encrypted && enc.data) {
    const encBytes = base64ToBytes(enc.data);
    const iv       = encBytes.slice(0, 16);
    const cipher   = encBytes.slice(16);
    const plain    = await webcrypto.subtle.decrypt({ name: 'AES-CBC', iv }, session.aesKey, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  return enc;
}
