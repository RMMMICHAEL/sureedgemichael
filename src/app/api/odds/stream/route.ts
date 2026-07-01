/**
 * GET /api/odds/stream
 *
 * SSE — empurra updates de odds em tempo real para o frontend.
 *
 * Mecanismo: polling de 30s nos endpoints públicos do DuploGreen
 *   GET https://api.duplogreenengine.com/functions/v1/get-individual-odds?market=1x2
 *   GET https://api.duplogreenengine.com/functions/v1/get-individual-odds?market=1x2_pa
 *
 * A cada poll:
 *   1. Busca os dois endpoints em paralelo
 *   2. Mescla e normaliza para OddsMatch[]
 *   3. Difere contra o snapshot anterior (por match_id + bookmaker + odd)
 *   4. Push SSE apenas dos matches que mudaram (type: 'update')
 *
 * Protocolo SSE:
 *   event: odds
 *   data: OddsUpdateEvent (JSON)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { OddsMatch, OddsUpdateEvent } from '@/lib/odds-source/types';

// ── Config ────────────────────────────────────────────────────────────────────
const DG_API       = 'https://api.duplogreenengine.com/functions/v1/get-individual-odds';
const POLL_MS      = 30_000;   // intervalo de polling
const HEARTBEAT_MS = 25_000;   // keepalive para proxy/Vercel

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

/** Busca e normaliza os dois mercados do DG em paralelo */
async function fetchDGOdds(): Promise<OddsMatch[]> {
  const t = Date.now();
  const [r1, r2] = await Promise.allSettled([
    fetch(`${DG_API}?market=1x2&_t=${t}`,    { next: { revalidate: 0 } }),
    fetch(`${DG_API}?market=1x2_pa&_t=${t}`, { next: { revalidate: 0 } }),
  ]);

  const rows: DGRow[] = [];

  for (const r of [r1, r2]) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    try {
      const json = await r.value.json() as { success?: boolean; odds?: DGRow[] } | DGRow[];
      const list: DGRow[] = Array.isArray(json) ? json : (json as { odds?: DGRow[] }).odds ?? [];
      rows.push(...list);
    } catch { /* ignora parse errors */ }
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
      b => b.slug === row.bookmaker_slug && b.market_type === row.market_type
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

/** Detecta quais matches mudaram de odds entre dois snapshots */
function diffMatches(prev: OddsMatch[], next: OddsMatch[]): OddsMatch[] {
  const prevMap = new Map(prev.map(m => [m.match_id, m]));
  const changed: OddsMatch[] = [];

  for (const match of next) {
    const old = prevMap.get(match.match_id);
    if (!old) { changed.push(match); continue; } // novo match

    // Compara se alguma odd de alguma casa mudou
    const hasChange = match.bookmakers.some(bk => {
      const oldBk = old.bookmakers.find(
        b => b.slug === bk.slug && b.market_type === bk.market_type
      );
      if (!oldBk) return true;
      return oldBk.home !== bk.home || oldBk.draw !== bk.draw || oldBk.away !== bk.away;
    });

    if (hasChange) changed.push(match);
  }

  return changed;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await isAuthenticated())) {
    const s = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(
          sse({ type: 'error', error: 'unauthorized', ts: Date.now() })
        ));
        ctrl.close();
      },
    });
    return new Response(s, {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  const encoder = new TextEncoder();
  let closed    = false;
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
        push({ type: 'error', error: String(err), ts: Date.now() });
      }

      // 2. Polling a cada 30s — detecta mudanças e envia só o que mudou
      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const next    = await fetchDGOdds();
          const changed = diffMatches(snapshot, next);
          snapshot      = next;

          if (changed.length > 0) {
            for (const match of changed) {
              push({ type: 'update', match_id: match.match_id, data: match, ts: Date.now() });
            }
          }
        } catch { /* ignora erros de fetch — tenta de novo no próximo ciclo */ }
      }, POLL_MS);

      // 3. Heartbeat para manter conexão viva
      const heartbeat = setInterval(() => {
        push({ type: 'heartbeat', ts: Date.now() });
      }, HEARTBEAT_MS);

      // 4. Cleanup quando o cliente desconecta
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
