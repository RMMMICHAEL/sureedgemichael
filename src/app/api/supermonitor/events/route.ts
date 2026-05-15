/**
 * /api/supermonitor/events
 * Proxy server-side para painel.supermonitor.pro
 * Realiza handshake ECDH, busca eventos criptografados e descriptografa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { webcrypto } from 'node:crypto';

const BASE = 'https://painel.supermonitor.pro';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildHeaders(cookie?: string): Record<string, string> {
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

interface SuperMonitorEvent {
  home?:       string;
  away?:       string;
  date?:       string;
  league?:     { name?: string; slug?: string } | string;
  sport?:      string;
  id?:         string | number;
  bookmakers?: number | unknown[];
  odds_count?: number;
  houses?:     number;
  [key: string]: unknown;
}

function normaliseEvent(raw: SuperMonitorEvent) {
  const home = String(raw.home ?? '');
  const away = String(raw.away ?? '');
  const name = home && away ? `${home} x ${away}` : home || away || 'Evento';

  const id = raw.id
    ? String(raw.id)
    : `${home}-${away}-${raw.date ?? ''}`.replace(/\s+/g, '-');

  const leagueRaw = raw.league;
  const league = typeof leagueRaw === 'string'
    ? leagueRaw
    : (leagueRaw?.name ?? raw.sport ?? 'Sport');

  const sport = String(raw.sport ?? league);
  const start_utc = String(raw.date ?? '');

  let house_count = 0;
  if (typeof raw.bookmakers === 'number') house_count = raw.bookmakers;
  else if (Array.isArray(raw.bookmakers)) house_count = raw.bookmakers.length;
  else if (typeof raw.odds_count === 'number') house_count = raw.odds_count;
  else if (typeof raw.houses === 'number') house_count = raw.houses;

  return { id, name, sport, league, start_utc, house_count };
}

export async function POST(req: NextRequest) {
  let cookie = '';
  let date   = '';

  try {
    const body = await req.json() as { cookie?: string; date?: string };
    cookie = body.cookie ?? '';
    date   = body.date   ?? '';
  } catch (_e) { /* body vazio */ }

  // Usa cookie do body, se não tiver usa o do .env.local
  const authCookie = cookie || (process.env.SUPERMONITOR_COOKIE ?? '');
  const hdrs = buildHeaders(authCookie || undefined);

  try {
    // 1. Nonce do handshake
    const nonceRes = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrs });
    if (!nonceRes.ok) throw new Error(`SuperMonitor indisponível (${nonceRes.status})`);
    const nonceJson = await nonceRes.json() as { nonce?: string };
    const handshakeNonce = nonceJson.nonce ?? '';
    if (!handshakeNonce) throw new Error('Nonce inválido — sessão expirada?');

    // 2. Gera par de chaves ECDH P-256
    const keyPair = await webcrypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const pubKeyRaw = await webcrypto.subtle.exportKey('raw', keyPair.publicKey);
    const pubBytes  = new Uint8Array(pubKeyRaw);
    // Ponto não comprimido: 0x04 || X[32] || Y[32]
    const client_pub_x = bytesToHex(pubBytes.slice(1, 33));
    const client_pub_y = bytesToHex(pubBytes.slice(33, 65));

    // 3. Handshake — troca de chaves públicas
    const hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
      method:  'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
      body:    JSON.stringify({ client_pub_x, client_pub_y }),
    });
    if (!hsRes.ok) throw new Error(`Handshake falhou (${hsRes.status})`);
    const hs = await hsRes.json() as { success?: boolean; server_pub_x?: string; server_pub_y?: string };
    if (!hs.success) throw new Error('Cookie inválido ou expirado');

    // 4. Deriva chave AES-256-CBC via HKDF
    const serverPubRaw = new Uint8Array(65);
    serverPubRaw[0] = 0x04;
    serverPubRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
    serverPubRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

    const serverPubKey = await webcrypto.subtle.importKey(
      'raw', serverPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
    );
    const sharedBits = await webcrypto.subtle.deriveBits(
      { name: 'ECDH', public: serverPubKey }, keyPair.privateKey, 256
    );
    const hkdfKey = await webcrypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const aesKey  = await webcrypto.subtle.deriveKey(
      {
        name: 'HKDF', hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: new TextEncoder().encode('buscador-aes256-v1'),
      },
      hkdfKey,
      { name: 'AES-CBC', length: 256 },
      false, ['decrypt']
    );

    // 5. Nonce para o proxy
    const proxyNonceRes = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: hdrs });
    if (!proxyNonceRes.ok) throw new Error(`proxy_nonce falhou (${proxyNonceRes.status})`);
    const { nonce: proxyNonce } = await proxyNonceRes.json() as { nonce: string };

    // 6. Busca eventos
    const qs    = date ? `action=events_lite&date=${encodeURIComponent(date)}` : 'action=events_lite';
    const evRes = await fetch(`${BASE}/api/buscador_proxy.php?${qs}`, {
      headers: { ...hdrs, 'Accept': 'application/json', 'X-Proxy-Nonce': proxyNonce },
    });
    if (!evRes.ok) throw new Error(`Eventos falhou (${evRes.status})`);
    const evEnc = await evRes.json() as { encrypted?: boolean; data?: string; events?: SuperMonitorEvent[] };

    // 7. Descriptografa se necessário
    let rawEvents: SuperMonitorEvent[];

    if (evEnc.encrypted && evEnc.data) {
      const encBytes = base64ToBytes(evEnc.data);
      const iv       = encBytes.slice(0, 16);
      const cipher   = encBytes.slice(16);
      const plainBuf = await webcrypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, cipher);
      const parsed   = JSON.parse(new TextDecoder().decode(plainBuf)) as { events?: SuperMonitorEvent[] } | SuperMonitorEvent[];
      rawEvents = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
    } else {
      rawEvents = evEnc.events ?? [];
    }

    const events = rawEvents.map(normaliseEvent);
    events.sort((a, b) => a.start_utc.localeCompare(b.start_utc));

    return NextResponse.json({ ok: true, events, source: 'supermonitor' });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
