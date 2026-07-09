/**
 * POST /api/dg-sync/ingest
 *
 * Recebe lotes de deltas de odds capturados pela extensão (QueryCache do
 * DuploGreen Engine via React Fiber) e aplica em bookmaker_odds.
 *
 * Autenticação: secret compartilhado via header (não é sessão de usuário —
 * é a extensão falando máquina-a-máquina, mesmo padrão de fail-safe do
 * webhook do Cakto: sem env var configurada, recusa tudo).
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID }                from 'node:crypto';

interface OddsBookmaker {
  slug:        string;
  name:        string;
  home:        number;
  draw:        number;
  away:        number;
  url:         string;
  is_pa:       boolean;
  market_type: string;
  updated_at?: string | null;
}

interface OddsMatch {
  match_id:    string;
  home_team:   string;
  away_team:   string;
  start_time:  string;
  match_date:  string;
  league_name: string;
  league_slug: string;
  bookmakers:  OddsBookmaker[];
}

interface DeltaItem {
  type:            string;
  queryKey:        unknown;
  queryHash:       string;
  dataUpdateCount: number;
  ts:              number;
  added:           OddsMatch[];
  modified:        OddsMatch[];
  removed:         string[];
}

function matchesToRows(matches: OddsMatch[]) {
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const m of matches) {
    for (const b of m.bookmakers) {
      rows.push({
        match_id:       m.match_id,
        bookmaker_slug: b.slug,
        market_type:    b.market_type,
        home_team:      m.home_team,
        away_team:      m.away_team,
        match_date:     m.match_date || null,
        start_time:     m.start_time || null,
        league_slug:    m.league_slug || null,
        league_name:    m.league_name || null,
        bookmaker_name: b.name,
        odd_home:       b.home,
        odd_draw:       b.draw || null,
        odd_away:       b.away,
        match_url:      b.url || null,
        updated_at:     b.updated_at || now,
      });
    }
  }
  return rows;
}

/**
 * Notifica os navegadores conectados ao SureEdge via broadcast do Supabase
 * Realtime — mesmo canal/formato que `useOdds.ts` já escuta. Nunca envia o
 * dado em si, só um sinal "algo mudou"; quem escuta decide o que refazer.
 * Falha aqui não derruba a resposta HTTP — o upsert já é a fonte da verdade.
 */
async function broadcastOddsUpdated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  rowsWritten: number,
  batchId: string,
): Promise<void> {
  const channel = admin.channel('odds_updates', { config: { broadcast: { ack: true } } });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout ao inscrever no canal')), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timeout);
          reject(new Error(`status do canal: ${status}`));
        }
      });
    });
    await channel.send({
      type:    'broadcast',
      event:   'odds_updated',
      payload: { pluginId: 'dg-sync-extension', rowsWritten, syncedAt: Date.now(), batchId },
    });
  } catch (e) {
    console.warn('[dg-sync/ingest] broadcast falhou (upsert já foi salvo):', (e as Error).message);
  } finally {
    await admin.removeChannel(channel);
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.DG_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'DG_SYNC_SECRET não configurado no servidor' }, { status: 500 });
  }
  if (req.headers.get('x-dg-sync-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Secret inválido' }, { status: 401 });
  }

  let body: { source?: string; batch?: DeltaItem[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const batch = Array.isArray(body.batch) ? body.batch : [];
  if (!batch.length) {
    return NextResponse.json({ ok: true, upserted: 0, deleted: 0, note: 'batch vazio' });
  }

  const upsertRows: Record<string, unknown>[] = [];
  const removedIds = new Set<string>();
  for (const item of batch) {
    upsertRows.push(...matchesToRows(item.added ?? []));
    upsertRows.push(...matchesToRows(item.modified ?? []));
    for (const id of item.removed ?? []) removedIds.add(id);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BATCH = 500;
  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const chunk = upsertRows.slice(i, i + BATCH);
    const { error, count } = await admin
      .from('bookmaker_odds')
      .upsert(chunk, { onConflict: 'match_id,bookmaker_slug,market_type', count: 'exact' });
    if (error) errors.push(`upsert lote ${i}: ${error.message}`);
    else upserted += count ?? chunk.length;
  }

  let deleted = 0;
  if (removedIds.size) {
    const { error, count } = await admin
      .from('bookmaker_odds')
      .delete({ count: 'exact' })
      .in('match_id', [...removedIds]);
    if (error) errors.push(`delete: ${error.message}`);
    else deleted = count ?? 0;
  }

  console.log(`[dg-sync/ingest] +${upserted} upserts, -${deleted} deletes, batch=${batch.length}`);

  const batchId = randomUUID();
  if (upserted > 0 || deleted > 0) {
    await broadcastOddsUpdated(admin, upserted + deleted, batchId);
  }

  return NextResponse.json({
    ok:     errors.length === 0,
    upserted,
    deleted,
    batchId,
    errors: errors.length ? errors : undefined,
  });
}
