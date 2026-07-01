/**
 * GET /api/odds/stream
 *
 * SSE — empurra updates de odds em tempo real para o frontend.
 *
 * Mecanismo: polling de 15s nos endpoints públicos do DuploGreen.
 *   GET https://api.duplogreenengine.com/functions/v1/get-individual-odds?market=1x2
 *   GET https://api.duplogreenengine.com/functions/v1/get-individual-odds?market=1x2_pa
 *
 * Garantias:
 *   - Nenhuma requisição sobreposta: lock impede dois polls simultâneos
 *   - Snapshot atualizado somente em fetch bem-sucedido (sem perda de diff em erros)
 *   - Diff detecta: odds alteradas, partidas novas, partidas encerradas/removidas
 *   - Erros de rede não interrompem o SSE — próximo ciclo tenta novamente
 *   - Apenas os matches que mudaram são enviados (sem re-enviar toda a lista)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { OddsMatch, OddsUpdateEvent } from '@/lib/odds-source/types';

// ── Config ────────────────────────────────────────────────────────────────────
const DG_API       = 'https://api.duplogreenengine.com/functions/v1/get-individual-odds';
const DG_AUTH      = 'https://db.duplogreenengine.com/auth/v1/token?grant_type=refresh_token';
const DG_ANON      = process.env.DG_ANON_KEY ?? '';
const POLL_MS      = 15_000;
const HEARTBEAT_MS = 25_000;
const FETCH_TIMEOUT_MS = 10_000;

// ── DG auth — token cache com auto-refresh e persistência no Supabase ────────
const SB_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';

let dgJwt     = process.env.DG_JWT     ?? '';
let dgRefresh = process.env.DG_REFRESH ?? '';
let sbLoaded  = false; // já leu do Supabase neste processo

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
  } catch { /* ignora erros de escrita */ }
}

async function getDGToken(): Promise<string> {
  // Cold start: tenta carregar refresh persistido no Supabase
  if (!sbLoaded) {
    sbLoaded = true;
    const persisted = await sbGet('dg_refresh_token');
    if (persisted) dgRefresh = persisted;
    const persistedJwt = await sbGet('dg_access_token');
    if (persistedJwt) dgJwt = persistedJwt;
  }

  // Token em cache ainda válido?
  if (dgJwt) {
    try {
      const payload = JSON.parse(Buffer.from(dgJwt.split('.')[1], 'base64').toString());
      if (payload.exp * 1000 > Date.now() + 60_000) return dgJwt;
    } catch { /* tenta refresh */ }
  }

  if (!dgRefresh) return dgJwt;
  try {
    const res = await fetch(DG_AUTH, {
      method:  'POST',
      headers: {
        'apikey':        DG_ANON,
        'Authorization': `Bearer ${DG_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ refresh_token: dgRefresh }),
    });
    if (!res.ok) return dgJwt;
    const data = await res.json() as { access_token?: string; refresh_token?: string };
    if (data.access_token)  {
      dgJwt = data.access_token;
      void sbSet('dg_access_token', dgJwt);
    }
    if (data.refresh_token) {
      dgRefresh = data.refresh_token;
      void sbSet('dg_refresh_token', dgRefresh); // persiste imediatamente
    }
  } catch { /* mantém token atual */ }
  return dgJwt;
}

// ── Tipos da resposta DG ──────────────────────────────────────────────────────
interface DGRow {
  match_id:       string;
  home_team:      string;
  away_team:      string;
  match_date:     string | null;
  start_time:     string | null;
  league_slug:    string | null;
  league_name:    string | null;
  bookmaker_slug: string;
  bookmaker_name: string | null;
  market_type:    string;
  odd_home:       number;
  odd_draw:       number | null;
  odd_away:       number;
  match_url:      string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sse(event: OddsUpdateEvent): string {
  return `event: odds\ndata: ${JSON.stringify(event)}\n\n`;
}

async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const sb = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await sb.auth.getUser();
    return !!user;
  } catch { return false; }
}

// Proxy residencial para contornar Cloudflare bot-check no IP do Vercel
const PROXY_URL = process.env.RESIDENTIAL_PROXY ?? '';

const DG_HEADERS: Record<string, string> = {
  'Origin':          'https://www.duplogreenengine.com',
  'Referer':         'https://www.duplogreenengine.com/',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

/**
 * Busca via proxy HTTP usando CONNECT tunnel (node:http + node:https raw).
 * Controla diretamente o header Proxy-Authorization no CONNECT — sem depender
 * de como o undici interpreta a URL do proxy.
 */
async function fetchViaProxy(url: string, authToken: string): Promise<Response> {
  const http  = await import('node:http');
  const https = await import('node:https');
  const tls   = await import('node:tls');

  const target = new URL(url);
  const proxy  = new URL(PROXY_URL);
  const proxyAuth = proxy.username
    ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`
    : undefined;

  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('proxy timeout')), FETCH_TIMEOUT_MS);

    // Passo 1: CONNECT para abrir o tunnel TCP
    const connectReq = http.request({
      host:   proxy.hostname,
      port:   parseInt(proxy.port || '80'),
      method: 'CONNECT',
      path:   `${target.hostname}:443`,
      headers: {
        'Host': `${target.hostname}:443`,
        ...(proxyAuth ? { 'Proxy-Authorization': proxyAuth } : {}),
      },
    });

    connectReq.on('error', (err) => { clearTimeout(timer); reject(err); });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        socket.destroy();
        reject(new Error(`Proxy CONNECT ${res.statusCode}`));
        return;
      }

      // Passo 2: TLS sobre o socket do tunnel
      const tlsSocket = tls.connect({ socket, servername: target.hostname, rejectUnauthorized: false });

      const path = target.pathname + target.search;
      const headers: Record<string, string> = {
        'Host':       target.hostname,
        'Connection': 'close',
        'Authorization': `Bearer ${authToken}`,
        ...DG_HEADERS,
      };
      const headerLines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
      const request = `GET ${path} HTTP/1.1\r\n${headerLines}\r\n\r\n`;

      tlsSocket.on('error', (err) => { clearTimeout(timer); reject(err); });

      tlsSocket.write(request);

      // Passo 3: lê a resposta HTTP crua
      let rawData = Buffer.alloc(0);
      tlsSocket.on('data', (chunk: Buffer) => { rawData = Buffer.concat([rawData, chunk]); });
      tlsSocket.on('end', () => {
        clearTimeout(timer);
        try {
          const raw   = rawData.toString();
          const sep   = raw.indexOf('\r\n\r\n');
          const head  = raw.slice(0, sep);
          const bodyStr = raw.slice(sep + 4);
          const statusMatch = head.match(/^HTTP\/1\.\d (\d+)/);
          const status = statusMatch ? parseInt(statusMatch[1]) : 200;
          resolve(new Response(bodyStr, { status }));
        } catch (e) { reject(e); }
      });
    });

    connectReq.end();
  });
}

/** Busca sem proxy (fallback direto) */
async function fetchDirect(url: string, token: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Authorization': `Bearer ${token}`, ...DG_HEADERS },
      next: { revalidate: 0 },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Busca com timeout + auth headers DG — usa proxy se configurado */
async function fetchWithTimeout(url: string, token: string): Promise<Response> {
  if (PROXY_URL) {
    try {
      return await fetchViaProxy(url, token);
    } catch (err) {
      console.error(`[odds/stream] proxy falhou (${(err as Error).message}), tentando direto`);
      return fetchDirect(url, token);
    }
  }
  return fetchDirect(url, token);
}

/** Busca e normaliza os dois mercados do DG em paralelo.
 *  Lança erro se QUALQUER endpoint falhar — evita falsos "removes"
 *  por mistura de dados novos (1x2) com dados ausentes (1x2_pa). */
async function fetchDGOdds(): Promise<OddsMatch[]> {
  const token = await getDGToken();
  const t = Date.now();

  // Log diagnóstico: token usado (últimos 30 chars) e expiração
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    console.log(`[odds/stream] token sub=${p.sub?.slice(0,8)} exp=${new Date(p.exp*1000).toISOString()} now=${new Date().toISOString()} valid=${p.exp*1000 > Date.now()}`);
  } catch { console.log('[odds/stream] token inválido ou ausente'); }

  const [r1, r2] = await Promise.allSettled([
    fetchWithTimeout(`${DG_API}?market=1x2&_t=${t}`, token),
    fetchWithTimeout(`${DG_API}?market=1x2_pa&_t=${t}`, token),
  ]);

  // Se qualquer endpoint falhou, abortamos — não queremos dados parciais
  if (r1.status === 'rejected') throw new Error(`DG 1x2 unreachable: ${r1.reason}`);
  if (r2.status === 'rejected') throw new Error(`DG 1x2_pa unreachable: ${r2.reason}`);
  if (!r1.value.ok) {
    let body = '';
    try { body = await r1.value.clone().text(); } catch { /* ignore */ }
    throw new Error(`DG 1x2 HTTP ${r1.value.status} | cf-ray=${r1.value.headers.get('cf-ray')} | body=${body.slice(0,300)}`);
  }
  if (!r2.value.ok) {
    let body = '';
    try { body = await r2.value.clone().text(); } catch { /* ignore */ }
    throw new Error(`DG 1x2_pa HTTP ${r2.value.status} | body=${body.slice(0,300)}`);
  }

  const rows: DGRow[] = [];
  for (const res of [r1.value, r2.value]) {
    try {
      const json = await res.json() as { success?: boolean; odds?: DGRow[] } | DGRow[];
      const list: DGRow[] = Array.isArray(json)
        ? json
        : ((json as { odds?: DGRow[] }).odds ?? []);
      rows.push(...list);
    } catch { /* parse error individual — não bloqueia o outro mercado */ }
  }

  return rowsToMatches(rows);
}

function rowsToMatches(rows: DGRow[]): OddsMatch[] {
  const map = new Map<string, OddsMatch>();

  for (const row of rows) {
    if (!map.has(row.match_id)) {
      map.set(row.match_id, {
        match_id:    row.match_id,
        home_team:   row.home_team,
        away_team:   row.away_team,
        start_time:  row.start_time  ?? row.match_date ?? '',
        match_date:  row.match_date  ?? '',
        league_name: row.league_name ?? row.league_slug ?? '',
        league_slug: row.league_slug ?? '',
        bookmakers:  [],
      });
    }

    const match = map.get(row.match_id)!;
    const exists = match.bookmakers.find(
      b => b.slug === row.bookmaker_slug && b.market_type === row.market_type,
    );
    if (!exists) {
      match.bookmakers.push({
        slug:        row.bookmaker_slug,
        name:        row.bookmaker_name ?? row.bookmaker_slug,
        home:        row.odd_home,
        draw:        row.odd_draw ?? 0,
        away:        row.odd_away,
        url:         row.match_url ?? '',
        is_pa:       row.market_type === '1x2_pa',
        market_type: row.market_type,
      });
    }
  }

  return Array.from(map.values());
}

interface DiffResult {
  updated: OddsMatch[];   // odds alteradas ou match novo
  removed: string[];      // match_ids que desapareceram
}

/**
 * Compara dois snapshots.
 * - updated: matches com qualquer odd alterada + matches novos
 * - removed: match_ids presentes em prev mas ausentes em next
 */
function diffMatches(prev: OddsMatch[], next: OddsMatch[]): DiffResult {
  const prevMap = new Map(prev.map(m => [m.match_id, m]));
  const nextMap = new Map(next.map(m => [m.match_id, m]));

  const updated: OddsMatch[] = [];

  for (const match of next) {
    const old = prevMap.get(match.match_id);

    // Match novo
    if (!old) { updated.push(match); continue; }

    // Compara bookmakers: nova casa, ou odd diferente
    const hasChange = match.bookmakers.some(bk => {
      const oldBk = old.bookmakers.find(
        b => b.slug === bk.slug && b.market_type === bk.market_type,
      );
      if (!oldBk) return true; // nova casa para este match
      return oldBk.home !== bk.home
          || oldBk.draw !== bk.draw
          || oldBk.away !== bk.away;
    });

    // Também detecta casa que saiu do match
    const hadRemoval = old.bookmakers.some(
      b => !match.bookmakers.find(bk => bk.slug === b.slug && bk.market_type === b.market_type),
    );

    if (hasChange || hadRemoval) updated.push(match);
  }

  // Partidas encerradas / removidas do DG
  const removed = prev
    .map(m => m.match_id)
    .filter(id => !nextMap.has(id));

  return { updated, removed };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await isAuthenticated())) {
    const s = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(
          sse({ type: 'error', error: 'unauthorized', ts: Date.now() }),
        ));
        ctrl.close();
      },
    });
    return new Response(s, {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  const encoder  = new TextEncoder();
  let closed   = false;
  let snapshot: OddsMatch[] = [];

  const stream = new ReadableStream({
    async start(ctrl) {
      function push(event: OddsUpdateEvent) {
        if (closed) return;
        try { ctrl.enqueue(encoder.encode(sse(event))); } catch { /* client disconnected */ }
      }

      // 1. Snapshot inicial
      try {
        snapshot = await fetchDGOdds();
        push({ type: 'snapshot', data: snapshot, ts: Date.now() });
      } catch (err) {
        push({ type: 'error', error: `Falha no snapshot inicial: ${err}`, ts: Date.now() });
        // Continua — próximo ciclo pode recuperar
      }

      // 2. Loop sequencial: aguarda conclusão do fetch, depois espera POLL_MS.
      //    Garante que o intervalo sempre começa APÓS o fetch terminar — sem sobreposição,
      //    sem drift acumulado em caso de fetches lentos.
      const schedulePoll = () => {
        if (closed) return;
        setTimeout(async () => {
          if (closed) return;
          const cycleStart = Date.now();
          try {
            const next = await fetchDGOdds();
            const { updated, removed } = diffMatches(snapshot, next);
            snapshot = next; // só atualiza se fetch completo e ambos os mercados ok
            for (const match of updated) {
              push({ type: 'update', match_id: match.match_id, data: match, ts: Date.now() });
            }
            for (const match_id of removed) {
              push({ type: 'remove', match_id, ts: Date.now() });
            }
          } catch {
            // Qualquer falha parcial: snapshot não é atualizado, próximo ciclo tenta novamente
          }
          if (process.env.NODE_ENV === 'development') {
            console.log(`[odds/stream] ciclo em ${Date.now() - cycleStart}ms`);
          }
          schedulePoll(); // agenda próximo ciclo apenas após este terminar
        }, POLL_MS);
      };
      schedulePoll();

      // 3. Heartbeat para manter a conexão viva em proxies
      const heartbeat = setInterval(() => {
        push({ type: 'heartbeat', ts: Date.now() });
      }, HEARTBEAT_MS);

      // 4. Cleanup quando cliente desconecta
      return () => {
        closed = true;
        clearInterval(heartbeat);
      };
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
