/**
 * GET /api/odds/stream
 *
 * SSE — empurra updates de odds em tempo real para o frontend.
 * Assina Supabase Realtime do DuploGreenEngine (bookmaker_odds).
 * Quando qualquer linha muda, pusha o update incremental do match afetado.
 *
 * Protocolo:
 *   event: odds
 *   data: OddsUpdateEvent (JSON)
 *
 * O cliente reconecta automaticamente via EventSource (built-in browser).
 */
export const dynamic  = 'force-dynamic';
export const runtime  = 'nodejs';

import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient }               from '@supabase/supabase-js';
import { fetchAllOdds, fetchMatchOdds, patchCached } from '@/lib/odds-source';
import type { OddsUpdateEvent }       from '@/lib/odds-source/types';

const DG_SUPABASE_URL = 'https://db.duplogreenengine.com';
const DG_ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3Njg0MDM4LCJleHAiOjIwOTMwNDQwMzh9.9JN4OCzFRPvDhBdrd81PjZJzFnZs3EgZtdHFAuKENks';

const HEARTBEAT_MS  = 25_000; // keepalive — evita timeout de proxy/Vercel
const SNAPSHOT_REVALIDATE_MS = 60_000; // re-envia snapshot a cada 1min se sem updates

function sse(event: OddsUpdateEvent): string {
  return `event: odds\ndata: ${JSON.stringify(event)}\n\n`;
}

async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const sb = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await sb.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await isAuthenticated())) {
    const s = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(sse({ type: 'error', error: 'unauthorized', ts: Date.now() })));
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

  const stream = new ReadableStream({
    async start(ctrl) {
      function push(event: OddsUpdateEvent) {
        if (closed) return;
        try { ctrl.enqueue(encoder.encode(sse(event))); } catch { /* client disconnected */ }
      }

      // 1. Snapshot inicial
      try {
        const odds = await fetchAllOdds();
        push({ type: 'snapshot', data: odds, ts: Date.now() });
      } catch (err) {
        push({ type: 'error', error: String(err), ts: Date.now() });
      }

      // 2. Assina Supabase Realtime do DG para updates incrementais
      const dgClient = createClient(DG_SUPABASE_URL, DG_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } },
      });

      // Pending match_ids que chegaram via Realtime — debounce por 500ms
      const pending = new Map<string, ReturnType<typeof setTimeout>>();

      function scheduleMatchUpdate(matchId: string) {
        if (pending.has(matchId)) clearTimeout(pending.get(matchId)!);
        pending.set(matchId, setTimeout(async () => {
          pending.delete(matchId);
          try {
            const match = await fetchMatchOdds(matchId);
            if (!match) return;
            patchCached(match);
            push({ type: 'update', match_id: matchId, data: match, ts: Date.now() });
          } catch { /* ignora erros de fetch incremental */ }
        }, 500));
      }

      const channel = dgClient
        .channel('bookmaker_odds_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookmaker_odds' },
          (payload) => {
            const matchId = (payload.new as { match_id?: string })?.match_id
                         ?? (payload.old as { match_id?: string })?.match_id;
            if (matchId) scheduleMatchUpdate(matchId);
          },
        )
        .subscribe();

      // 3. Heartbeat
      const heartbeat = setInterval(() => {
        push({ type: 'heartbeat', ts: Date.now() });
      }, HEARTBEAT_MS);

      // 4. Re-snapshot periódico (safety net se Realtime falhar)
      const reSnapshot = setInterval(async () => {
        if (closed) return;
        try {
          const odds = await fetchAllOdds({ fromDate: undefined }); // usa cache se válido
          push({ type: 'snapshot', data: odds, ts: Date.now() });
        } catch { /* ignora */ }
      }, SNAPSHOT_REVALIDATE_MS);

      // 5. Cleanup quando cliente desconecta
      return () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(reSnapshot);
        for (const t of pending.values()) clearTimeout(t);
        dgClient.removeChannel(channel).catch(() => {});
      };
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
