/**
 * POST /api/supermonitor/duplo-signals
 *
 * Busca sinais de Duplo Futebol diretamente do Super Monitor (signals_proxy.php).
 * Usa ECDH P-256 + HKDF + AES-CBC — exatamente como o scanner-crypto-loader.js
 * do browser faz, mas server-side com webcrypto do Node.js.
 *
 * Algoritmo (extraído do scanner-crypto-loader.js do SM):
 *  1. GET proxy_nonce_scanner_handshake.php   → nonce do handshake
 *  2. Gerar par ECDH P-256
 *  3. POST scanner_handshake.php + X-Handshake-Nonce → server_pub_x/y
 *  4. ECDH.deriveBits → HKDF(sha256, salt=32×0, info="scanner-aes256-v1") → AES-CBC-256
 *  5. GET proxy_nonce.php → nonce do proxy
 *  6. GET signals_proxy.php?limit=3000 + X-Proxy-Nonce → JSON criptografado
 *  7. AES-CBC.decrypt(iv=data[0:16], ct=data[16:])
 *
 * Body: { pa_mode?: 'ambos'|'um'|'nenhum', disabled_houses?: string[] }
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1'];

import { NextRequest, NextResponse } from 'next/server';
import { webcrypto } from 'node:crypto';
import { getActiveCookie } from '@/lib/supermonitor-auth';

const BASE = 'https://painel.supermonitor.pro';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Tipos do Super Monitor ─────────────────────────────────────────────────────

interface SMSignal {
  id:             string;
  tipo:           string;
  jogo:           string;
  campeonato?:    string;
  liga?:          string;
  league?:        string;
  data?:          string;
  profit_margin?: number;
  age_seconds?:   number;
  casa1?:         string;
  casa2?:         string;
  casa3?:         string;
  odd1?:          number;
  odd2?:          number;
  odd3?:          number;
  link1?:         string;
  link2?:         string;
  link3?:         string;
}

export interface MLSignal {
  event_id:     string;
  event_name:   string;
  league:       string;
  start_utc:    string;
  leg1:         { house: string; pa: boolean; odd: number; url?: string };
  legX:         { house: string; pa: boolean; odd: number; url?: string };
  leg2:         { house: string; pa: boolean; odd: number; url?: string };
  margin:       number;
  loss_pct:     number;
  data_age_min: number;
}

// ── Crypto helpers ─────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return b;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── ECDH Handshake (scanner-crypto-loader.js) ─────────────────────────────────

async function createScannerSession(cookie: string): Promise<CryptoKey> {
  const hdrs: Record<string, string> = {
    Cookie:           cookie,
    'User-Agent':     UA,
    Accept:           '*/*',
    'Cache-Control':  'no-cache',
    Pragma:           'no-cache',
    'Accept-Language':'pt-BR,pt;q=0.9',
    Referer:          `${BASE}/index.php?page=alertas-scanner`,
  };

  // 1. Nonce do handshake
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_scanner_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`nonce_handshake_${nonceRes.status}`);
  const { nonce: handshakeNonce } = await nonceRes.json() as { nonce: string };
  if (!handshakeNonce) throw new Error('nonce_handshake_empty');

  // 2. Gerar par ECDH P-256
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const pubRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  // 3. Handshake
  const hsRes = await fetch(`${BASE}/api/scanner_handshake.php`, {
    method:  'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body:    JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) throw new Error(`handshake_${hsRes.status}`);
  const hs = await hsRes.json() as { success?: boolean; server_pub_x?: string; server_pub_y?: string };
  if (!hs.success || !hs.server_pub_x || !hs.server_pub_y) throw new Error('handshake_failed');

  // 4. Derivar AES-256-CBC via HKDF
  //    (salt = 32 zeros, info = "scanner-aes256-v1" — igual scanner-crypto-loader.js)
  const serverPubRaw = new Uint8Array(65);
  serverPubRaw[0] = 0x04;
  serverPubRaw.set(hexToBytes(hs.server_pub_x), 1);
  serverPubRaw.set(hexToBytes(hs.server_pub_y), 33);

  const serverPub  = await webcrypto.subtle.importKey(
    'raw', serverPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedBits = await webcrypto.subtle.deriveBits(
    { name: 'ECDH', public: serverPub }, keyPair.privateKey, 256
  );
  const hkdfKey = await webcrypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey  = await webcrypto.subtle.deriveKey(
    {
      name: 'HKDF', hash: 'SHA-256',
      salt: new Uint8Array(32),                              // 32 zeros (scanner usa isso)
      info: new TextEncoder().encode('scanner-aes256-v1'),  // info do scanner
    },
    hkdfKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );

  return aesKey;
}

// ── Buscar e descriptografar sinais ───────────────────────────────────────────

async function fetchSignals(cookie: string, aesKey: CryptoKey): Promise<SMSignal[]> {
  const hdrs: Record<string, string> = {
    Cookie:           cookie,
    'User-Agent':     UA,
    Accept:           'application/json',
    'Cache-Control':  'no-cache',
    Pragma:           'no-cache',
    'Accept-Language':'pt-BR,pt;q=0.9',
    Referer:          `${BASE}/index.php?page=alertas-scanner`,
  };

  // 5. Proxy nonce
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`proxy_nonce_${nonceRes.status}`);
  const { nonce } = await nonceRes.json() as { nonce: string };
  if (!nonce) throw new Error('proxy_nonce_empty');

  // 6. Buscar sinais
  const res = await fetch(`${BASE}/api/signals_proxy.php?limit=3000`, {
    headers: { ...hdrs, 'X-Proxy-Nonce': nonce },
  });
  if (!res.ok) throw new Error(`signals_${res.status}`);

  const raw = await res.json() as SMSignal[] | { encrypted?: boolean; data?: string; needs_handshake?: boolean };

  // 7. Descriptografar se necessário
  if (Array.isArray(raw)) return raw;

  if ('encrypted' in raw && raw.encrypted && raw.data) {
    const encBytes = b64ToBytes(raw.data);
    const iv       = encBytes.slice(0, 16);
    const ct       = encBytes.slice(16);
    const plain    = await webcrypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ct);
    const decoded  = JSON.parse(new TextDecoder().decode(plain));
    return Array.isArray(decoded) ? decoded : [];
  }

  return [];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseCasa(raw: string): { name: string; pa: boolean } {
  const pa = /\(pa\)/i.test(raw);
  return { name: raw.replace(/\s*\(pa\)/gi, '').trim(), pa };
}
function normHouse(h: string): string {
  return h.toLowerCase().replace(/[\s\-_.]/g, '');
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let paMode: 'ambos' | 'um' | 'nenhum' = 'ambos';
  let disabledHouses: string[] = [];

  try {
    const body = await req.json() as { pa_mode?: string; disabled_houses?: string[] };
    if (body.pa_mode === 'um' || body.pa_mode === 'nenhum') paMode = body.pa_mode;
    disabledHouses = (body.disabled_houses ?? []).map(h => normHouse(h));
  } catch { /* vazio */ }

  const disabledSet = new Set(disabledHouses);

  // ── Autenticação ─────────────────────────────────────────────────────────────
  let cookie: string;
  try {
    cookie = await getActiveCookie();
  } catch {
    return NextResponse.json({ ok: false, error: 'auth/no-cookie' });
  }

  // ── Handshake + busca ─────────────────────────────────────────────────────────
  let smSignals: SMSignal[];
  try {
    const aesKey = await createScannerSession(cookie);
    smSignals    = await fetchSignals(cookie, aesKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }

  // ── Filtrar e transformar ─────────────────────────────────────────────────────
  const now     = Date.now();
  const signals: MLSignal[] = [];

  for (const s of smSignals) {
    if (s.tipo !== 'ML') continue;
    if (!s.casa1 || !s.casa2 || !s.casa3) continue;
    if (!s.odd1  || !s.odd2  || !s.odd3)  continue;

    const leg1 = parseCasa(s.casa1);
    const legX = parseCasa(s.casa2);
    const leg2 = parseCasa(s.casa3);

    if (disabledSet.has(normHouse(leg1.name))) continue;
    if (disabledSet.has(normHouse(legX.name))) continue;
    if (disabledSet.has(normHouse(leg2.name))) continue;

    // PA: leg1=Casa e leg2=Fora precisam ser PA; legX=Empate aceita qualquer casa
    if (paMode === 'ambos' && (!leg1.pa || !leg2.pa)) continue;
    if (paMode === 'um'    && !leg1.pa && !leg2.pa)   continue;

    const margin  = 1 / s.odd1 + 1 / s.odd2 + 1 / s.odd3;
    const lossPct = s.profit_margin != null
      ? Math.round(-s.profit_margin * 100) / 100
      : Math.round((margin - 1) * 10000) / 100;

    const dataAgeMin = s.age_seconds != null ? Math.round(s.age_seconds / 60) : 0;
    const startUtc   = s.data ?? '';

    // Excluir jogos encerrados (> 90 min atrás)
    if (startUtc) {
      const startMs = new Date(startUtc).getTime();
      if (!isNaN(startMs) && startMs < now - 90 * 60_000) continue;
    }

    signals.push({
      event_id:     s.id,
      event_name:   s.jogo ?? '',
      league:       s.campeonato ?? s.liga ?? s.league ?? '',
      start_utc:    startUtc,
      leg1:         { house: leg1.name, pa: leg1.pa, odd: s.odd1, url: s.link1 },
      legX:         { house: legX.name, pa: legX.pa, odd: s.odd2, url: s.link2 },
      leg2:         { house: leg2.name, pa: leg2.pa, odd: s.odd3, url: s.link3 },
      margin,
      loss_pct:     lossPct,
      data_age_min: dataAgeMin,
    });
  }

  signals.sort((a, b) => a.loss_pct - b.loss_pct);

  return NextResponse.json({
    ok:           true,
    ml:           signals.slice(0, 300),
    total_events: new Set(smSignals.filter(s => s.tipo === 'ML').map(s => s.id)).size,
    computed_at:  new Date().toISOString(),
    source:       'supermonitor_live',
  });
}
