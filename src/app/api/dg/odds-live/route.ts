/**
 * GET /api/dg/odds-live
 *
 * Busca odds em tempo real da API do DuploGreen via proxy residencial.
 * Retorna o mesmo formato de OddsMatch[] que o antigo SSE stream,
 * mas como resposta HTTP normal (para polling pelo useOdds hook).
 *
 * Autenticação: JWT DG com fallback email/senha + persistência no Supabase.
 * Proxy: RESIDENTIAL_PROXY env var (contorna Cloudflare no IP do Vercel).
 */
export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 20;

import { NextResponse }               from 'next/server';
import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { OddsMatch }             from '@/lib/odds-source/types';

// ── Config ────────────────────────────────────────────────────────────────────
const DG_API       = 'https://api.duplogreenengine.com/functions/v1/get-individual-odds';
const DG_AUTH      = 'https://db.duplogreenengine.com/auth/v1/token?grant_type=refresh_token';
const DG_LOGIN_URL = 'https://db.duplogreenengine.com/auth/v1/token?grant_type=password';
const DG_ANON      = process.env.DG_ANON_KEY      ?? '';
const DG_EMAIL     = process.env.DG_EMAIL          ?? '';
const DG_PASSWORD  = process.env.DG_PASSWORD       ?? '';
const SB_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SB_SVC_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PROXY_URL    = process.env.RESIDENTIAL_PROXY ?? '';
const TIMEOUT_MS   = 12_000;

const DG_HEADERS: Record<string, string> = {
  'Origin':          'https://www.duplogreenengine.com',
  'Referer':         'https://www.duplogreenengine.com/',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

// ── Token cache (por processo Vercel — reiniciado a cada cold start) ──────────
let dgJwt     = process.env.DG_JWT     ?? '';
let dgRefresh = process.env.DG_REFRESH ?? '';
let sbLoaded  = false;

async function sbGet(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${key}&select=value`, {
      headers: { 'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}` },
    });
    if (!res.ok) return null;
    const rows = await res.json() as { value: string }[];
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function sbSet(key: string, value: string): Promise<void> {
  try {
    await fetch(`${SB_URL}/rest/v1/app_settings`, {
      method:  'POST',
      headers: {
        'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
  } catch { /* silencia */ }
}

async function dgLogin(): Promise<void> {
  try {
    const res = await fetch(DG_LOGIN_URL, {
      method:  'POST',
      headers: { 'apikey': DG_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DG_EMAIL, password: DG_PASSWORD }),
    });
    if (!res.ok) { console.error(`[dg/odds-live] login falhou: ${res.status}`); return; }
    const data = await res.json() as { access_token?: string; refresh_token?: string };
    if (data.access_token)  { dgJwt     = data.access_token;  void sbSet('dg_access_token',  dgJwt); }
    if (data.refresh_token) { dgRefresh = data.refresh_token; void sbSet('dg_refresh_token', dgRefresh); }
    console.log('[dg/odds-live] login DG ok');
  } catch (e) { console.error('[dg/odds-live] login erro:', e); }
}

async function getDGToken(): Promise<string> {
  if (!sbLoaded) {
    sbLoaded = true;
    const r = await sbGet('dg_refresh_token'); if (r) dgRefresh = r;
    const j = await sbGet('dg_access_token');  if (j) dgJwt     = j;
  }
  if (dgJwt) {
    try {
      const p = JSON.parse(Buffer.from(dgJwt.split('.')[1], 'base64').toString());
      if (p.exp * 1000 > Date.now() + 60_000) return dgJwt;
    } catch { /* refresh */ }
  }
  if (dgRefresh) {
    try {
      const res = await fetch(DG_AUTH, {
        method:  'POST',
        headers: { 'apikey': DG_ANON, 'Authorization': `Bearer ${DG_ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: dgRefresh }),
      });
      if (res.ok) {
        const data = await res.json() as { access_token?: string; refresh_token?: string };
        if (data.access_token)  { dgJwt     = data.access_token;  void sbSet('dg_access_token',  dgJwt); }
        if (data.refresh_token) { dgRefresh = data.refresh_token; void sbSet('dg_refresh_token', dgRefresh); }
        if (dgJwt) return dgJwt;
      }
    } catch { /* login */ }
  }
  await dgLogin();
  return dgJwt;
}

// ── Proxy CONNECT ─────────────────────────────────────────────────────────────
function decodeChunked(buf: Buffer): string {
  const chunks: Buffer[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let crlf = -1;
    for (let i = pos; i < buf.length - 1; i++) {
      if (buf[i] === 0x0d && buf[i + 1] === 0x0a) { crlf = i; break; }
    }
    if (crlf === -1) break;
    const size = parseInt(buf.slice(pos, crlf).toString('ascii').split(';')[0].trim(), 16);
    if (isNaN(size) || size === 0) break;
    pos = crlf + 2;
    chunks.push(buf.slice(pos, pos + size));
    pos += size + 2;
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function fetchViaProxy(url: string, token: string): Promise<Response> {
  const http = await import('node:http');
  const tls  = await import('node:tls');
  const target = new URL(url);
  const proxy  = new URL(PROXY_URL);
  const proxyAuth = proxy.username
    ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`
    : undefined;

  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('proxy timeout')), TIMEOUT_MS);
    const connectReq = http.request({
      host: proxy.hostname, port: parseInt(proxy.port || '80'),
      method: 'CONNECT', path: `${target.hostname}:443`,
      headers: { 'Host': `${target.hostname}:443`, ...(proxyAuth ? { 'Proxy-Authorization': proxyAuth } : {}) },
    });
    connectReq.on('error', (e) => { clearTimeout(timer); reject(e); });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { clearTimeout(timer); socket.destroy(); reject(new Error(`Proxy CONNECT ${res.statusCode}`)); return; }
      const tlsSocket = tls.connect({ socket, servername: target.hostname, rejectUnauthorized: false });
      const path = target.pathname + target.search;
      const headers: Record<string, string> = { 'Host': target.hostname, 'Connection': 'close', 'Authorization': `Bearer ${token}`, ...DG_HEADERS };
      const headerLines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
      tlsSocket.on('error', (e) => { clearTimeout(timer); reject(e); });
      tlsSocket.write(`GET ${path} HTTP/1.1\r\n${headerLines}\r\n\r\n`);
      let raw = Buffer.alloc(0);
      tlsSocket.on('data', (chunk: Buffer) => { raw = Buffer.concat([raw, chunk]); });
      tlsSocket.on('end', () => {
        clearTimeout(timer);
        try {
          const sep = raw.indexOf('\r\n\r\n');
          const head = raw.slice(0, sep).toString();
          const body = raw.slice(sep + 4);
          const status = parseInt((head.match(/^HTTP\/1\.\d (\d+)/) ?? ['', '200'])[1]);
          const bodyStr = /transfer-encoding:\s*chunked/i.test(head) ? decodeChunked(body) : body.toString('utf-8');
          resolve(new Response(bodyStr, { status }));
        } catch (e) { reject(e); }
      });
    });
    connectReq.end();
  });
}

async function fetchDG(url: string, token: string): Promise<Response> {
  if (PROXY_URL) {
    try { return await fetchViaProxy(url, token); }
    catch (e) { console.error('[dg/odds-live] proxy falhou:', (e as Error).message); }
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'Authorization': `Bearer ${token}`, ...DG_HEADERS } });
  } finally { clearTimeout(t); }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface DGRow {
  match_id: string; home_team: string; away_team: string;
  match_date: string | null; start_time: string | null;
  league_slug: string | null; league_name: string | null;
  bookmaker_slug: string; bookmaker_name: string | null;
  market_type: string; odd_home: number; odd_draw: number | null;
  odd_away: number; match_url: string | null;
}

function rowsToMatches(rows: DGRow[]): OddsMatch[] {
  const map = new Map<string, OddsMatch>();
  for (const row of rows) {
    if (!map.has(row.match_id)) {
      map.set(row.match_id, {
        match_id: row.match_id, home_team: row.home_team, away_team: row.away_team,
        start_time: row.start_time ?? row.match_date ?? '',
        match_date: row.match_date ?? '', league_name: row.league_name ?? row.league_slug ?? '',
        league_slug: row.league_slug ?? '', bookmakers: [],
      });
    }
    const match = map.get(row.match_id)!;
    if (!match.bookmakers.find(b => b.slug === row.bookmaker_slug && b.market_type === row.market_type)) {
      match.bookmakers.push({
        slug: row.bookmaker_slug, name: row.bookmaker_name ?? row.bookmaker_slug,
        home: row.odd_home, draw: row.odd_draw ?? 0, away: row.odd_away,
        url: row.match_url ?? '', is_pa: row.market_type === '1x2_pa',
        market_type: row.market_type,
      });
    }
  }
  return Array.from(map.values());
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });

  try {
    const token = await getDGToken();
    const t = Date.now();

    const [r1, r2] = await Promise.allSettled([
      fetchDG(`${DG_API}?market=1x2&_t=${t}`, token),
      fetchDG(`${DG_API}?market=1x2_pa&_t=${t}`, token),
    ]);

    if (r1.status === 'rejected') throw new Error(`DG 1x2 unreachable: ${r1.reason}`);
    if (r2.status === 'rejected') throw new Error(`DG 1x2_pa unreachable: ${r2.reason}`);

    for (const [label, r] of [['1x2', r1.value], ['1x2_pa', r2.value]] as [string, Response][]) {
      if (!r.ok) {
        let body = '';
        try { body = await r.clone().text(); } catch { /* ignore */ }
        throw new Error(`DG ${label} HTTP ${r.status} | body=${body.slice(0, 200)}`);
      }
    }

    const rows: DGRow[] = [];
    for (const res of [r1.value, r2.value]) {
      try {
        const json = await res.json() as { odds?: DGRow[] } | DGRow[];
        const list: DGRow[] = Array.isArray(json) ? json : ((json as { odds?: DGRow[] }).odds ?? []);
        rows.push(...list);
      } catch { /* silencia parse errors individuais */ }
    }

    const odds = rowsToMatches(rows);
    console.log(`[dg/odds-live] ${odds.length} jogos · ${rows.length} linhas`);

    return NextResponse.json({ ok: true, count: odds.length, odds });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[dg/odds-live] erro:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
