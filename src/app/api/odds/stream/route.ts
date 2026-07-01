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
const POLL_MS      = 15_000;  // 15s — compromisso entre latência e carga
const HEARTBEAT_MS = 25_000;  // keepalive para proxy/Vercel
const FETCH_TIMEOUT_MS = 10_000; // timeout por requisição ao DG

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

/** Busca com timeout para evitar que um fetch travado bloqueie o próximo ciclo */
async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, next: { revalidate: 0 } });
  } finally {
    clearTimeout(timer);
  }
}

/** Busca e normaliza os dois mercados do DG em paralelo */
async function fetchDGOdds(): Promise<OddsMatch[]> {
  const t = Date.now();
  const [r1, r2] = await Promise.allSettled([
    fetchWithTimeout(`${DG_API}?market=1x2&_t=${t}`),
    fetchWithTimeout(`${DG_API}?market=1x2_pa&_t=${t}`),
  ]);

  const rows: DGRow[] = [];

  for (const r of [r1, r2]) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    try {
      const json = await r.value.json() as { success?: boolean; odds?: DGRow[] } | DGRow[];
      const list: DGRow[] = Array.isArray(json)
        ? json
        : ((json as { odds?: DGRow[] }).odds ?? []);
      rows.push(...list);
    } catch { /* ignora parse errors individuais */ }
  }

  // Falha total: nenhum dos dois endpoints respondeu
  if (rows.length === 0 && r1.status === 'rejected' && r2.status === 'rejected') {
    throw new Error('DG API unreachable');
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
  let closed     = false;
  let snapshot:    OddsMatch[] = [];
  let polling    = false; // lock anti-sobreposição

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
        // Continua — próximo poll pode recuperar
      }

      // 2. Polling periódico com lock anti-sobreposição
      const poll = setInterval(async () => {
        if (closed || polling) return; // skip se já tem um poll em andamento
        polling = true;

        try {
          const next = await fetchDGOdds();
          // Só atualiza snapshot se o fetch foi bem-sucedido
          const { updated, removed } = diffMatches(snapshot, next);
          snapshot = next;

          for (const match of updated) {
            push({ type: 'update', match_id: match.match_id, data: match, ts: Date.now() });
          }
          for (const match_id of removed) {
            push({ type: 'remove', match_id, ts: Date.now() });
          }
        } catch {
          // Erro de rede: snapshot NÃO é atualizado (evita perder diff na próxima rodada)
          // SSE continua vivo — próximo ciclo tenta novamente
        } finally {
          polling = false;
        }
      }, POLL_MS);

      // 3. Heartbeat para manter a conexão viva em proxies
      const heartbeat = setInterval(() => {
        push({ type: 'heartbeat', ts: Date.now() });
      }, HEARTBEAT_MS);

      // 4. Cleanup quando cliente desconecta
      return () => {
        closed = true;
        clearInterval(poll);
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
