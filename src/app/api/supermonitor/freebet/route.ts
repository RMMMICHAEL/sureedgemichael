/**
 * GET /api/supermonitor/freebet
 * Proxy para a API de conversão de freebet do SuperMonitor.
 * Faz handshake ECDH server-side (sem CORS) e descriptografa a resposta.
 *
 * Query params:
 *   bookmaker  — ex: "Bet365"
 *   value      — valor da freebet em R$ (ex: 100)
 *   min_odd    — odd mínima (ex: 1.50)
 *   max_odd    — odd máxima (ex: 10.00)
 *   pa_filter  — all | none | one | two
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://painel.supermonitor.pro';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Crypto helpers ────────────────────────────────────────────────────────────

const subtle = globalThis.crypto.subtle;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── ECDH session ──────────────────────────────────────────────────────────────

interface ECDHSession {
  aesKey: CryptoKey;
  hdrs: Record<string, string>;
}

async function createECDHSession(cookie: string): Promise<ECDHSession> {
  const hdrs: Record<string, string> = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Referer': `${BASE}/index.php?page=buscador`,
    'Cookie': cookie,
  };

  // 1. Nonce do handshake
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`proxy_nonce_handshake falhou (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await nonceRes.json() as { nonce: string };
  if (!handshakeNonce) throw new Error('nonce inválido');

  // 2. Gera par de chaves ECDH P-256
  const keyPair  = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw   = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  // 3. Handshake com SuperMonitor
  const hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
    method: 'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body: JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) throw new Error(`buscador_handshake falhou (${hsRes.status})`);
  const hs = await hsRes.json() as { success: boolean; server_pub_x?: string; server_pub_y?: string };
  if (!hs.success) throw new Error('Handshake negado — cookie inválido ou expirado');

  // 4. Deriva chave AES-CBC via ECDH + HKDF
  const srvRaw = new Uint8Array(65);
  srvRaw[0] = 0x04;
  srvRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  srvRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await subtle.importKey('raw', srvRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, keyPair.privateKey, 256);
  const hkdfKey    = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey     = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('buscador-aes256-v1') },
    hkdfKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt'],
  );

  return { aesKey, hdrs };
}

// ── Busca e descriptografa resultado freebet ──────────────────────────────────

async function fetchFreebetData(
  session: ECDHSession,
  params: { bookmaker: string; value: number; min_odd: number; max_odd: number; pa_filter: string },
): Promise<unknown> {
  // Nonce por requisição (buscador_proxy family)
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_buscador.php`, { headers: session.hdrs });
  if (!nonceRes.ok) {
    // Fallback para o endpoint alternativo
    const nonceRes2 = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: session.hdrs });
    if (!nonceRes2.ok) throw new Error(`proxy_nonce falhou (${nonceRes2.status})`);
    const { nonce: nonce2 } = await nonceRes2.json() as { nonce: string };
    return await callFreebet(session, nonce2, params);
  }
  const { nonce } = await nonceRes.json() as { nonce: string };
  return await callFreebet(session, nonce, params);
}

async function callFreebet(
  session: ECDHSession,
  nonce: string,
  params: { bookmaker: string; value: number; min_odd: number; max_odd: number; pa_filter: string },
): Promise<unknown> {
  const qs = new URLSearchParams({
    endpoint:  'api/v2/freebet/convert',
    bookmaker: params.bookmaker,
    value:     String(params.value),
    min_odd:   String(params.min_odd),
    max_odd:   String(params.max_odd),
    pa_filter: params.pa_filter,
  }).toString();

  const res = await fetch(`${BASE}/api/freebet_proxy-v2.php?${qs}`, {
    headers: { ...session.hdrs, 'Accept': 'application/json', 'X-Proxy-Nonce': nonce },
  });
  if (!res.ok) throw new Error(`freebet_proxy falhou (${res.status})`);

  const enc = await res.json() as { encrypted?: boolean; data?: string; [k: string]: unknown };

  if (enc.encrypted && enc.data) {
    const encBytes = base64ToBytes(enc.data);
    const plain = await subtle.decrypt(
      { name: 'AES-CBC', iv: encBytes.slice(0, 16) },
      session.aesKey,
      encBytes.slice(16),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  return enc;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const bookmaker = sp.get('bookmaker') ?? '';
  const value     = parseFloat(sp.get('value') ?? '0');
  const min_odd   = parseFloat(sp.get('min_odd') ?? '1.5');
  const max_odd   = parseFloat(sp.get('max_odd') ?? '999');
  const pa_filter = sp.get('pa_filter') ?? 'all';

  if (!bookmaker || !value || value <= 0) {
    return NextResponse.json({ ok: false, error: 'bookmaker e value obrigatórios' });
  }

  try {
    const sb = await getSupabaseAdmin();
    const { data: row } = await sb
      .from('app_config')
      .select('value')
      .eq('key', 'supermonitor_cookie')
      .single();

    if (!row?.value) {
      return NextResponse.json({
        ok: false,
        error: 'Cookie não disponível. Inicie o daemon (start-daemon.vbs) e aguarde alguns segundos.',
      });
    }

    const session = await createECDHSession(row.value as string);
    const data    = await fetchFreebetData(session, { bookmaker, value, min_odd, max_odd, pa_filter });

    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[freebet]', msg);
    return NextResponse.json({ ok: false, error: msg });
  }
}
