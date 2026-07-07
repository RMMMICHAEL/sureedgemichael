export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';

interface DiffPayload {
  pluginId:   string;
  sequenceId: number;
  diff: {
    added:    unknown[];
    modified: unknown[];
    removed:  string[];
  };
  stats: {
    total: number; added: number; modified: number; removed: number;
    unchanged: number; sizeBytes: number;
  };
  capturedAt: number;
}

// Gera ID rastreável por batch: base36(timestamp) + 4 chars aleatórios
function makeBatchId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function parseBody(req: NextRequest): Promise<DiffPayload> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return req.json() as Promise<DiffPayload>;
  }
  const buf  = await req.arrayBuffer();
  const ds   = new DecompressionStream('gzip');
  const w    = ds.writable.getWriter();
  await w.write(new Uint8Array(buf));
  await w.close();
  const text = await new Response(ds.readable).text();
  return JSON.parse(text);
}

async function sbUpsert(table: string, rows: Record<string, unknown>[], batchId: string) {
  if (rows.length === 0) return;
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[INGEST:${batchId}] sbUpsert ${table} falhou ${res.status}:`, body.slice(0, 400));
    throw new Error(`sbUpsert ${table} ${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Envia broadcast Realtime com 2 tentativas (timeout 1.5s cada).
 * Fire-and-forget: chamada sem await — não bloqueia a resposta ao cliente.
 * O broadcast é sempre chamado APÓS handleOdds completar (DB committed).
 */
async function broadcastOddsUpdated(
  pluginId: string,
  rowsWritten: number,
  batchId: string,
): Promise<void> {
  const url = `${SB_URL}/realtime/v1/api/broadcast`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0   = Date.now();
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 1500);

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            topic:   'realtime:odds_updates',
            event:   'odds_updated',
            payload: { pluginId, rowsWritten, syncedAt: Date.now(), batchId },
          }],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      const elapsed = Date.now() - t0;

      if (res.ok) {
        console.log(`[INGEST:${batchId}] broadcast_sent=true rows_written=${rowsWritten} elapsed=${elapsed}ms`);
        return;
      }
      console.warn(`[INGEST:${batchId}] broadcast_sent=false attempt=${attempt} status=${res.status} elapsed=${elapsed}ms`);
    } catch (e) {
      clearTimeout(tid);
      const msg = (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message;
      console.warn(`[INGEST:${batchId}] broadcast_sent=false attempt=${attempt} error="${msg}" elapsed=${Date.now()-t0}ms`);
    }

    if (attempt < 2) await new Promise(r => setTimeout(r, 300));
  }

  console.error(
    `[INGEST:${batchId}] broadcast_sent=FAILED rows_written=${rowsWritten}` +
    ` — fallback_poll irá recuperar atualizações perdidas`
  );
}

async function handleOdds(diff: DiffPayload['diff'], pluginId: string, batchId: string): Promise<number> {
  const isPa = pluginId === 'odds-pa';
  const rows = [...(diff.added as Record<string,unknown>[]), ...(diff.modified as Record<string,unknown>[])];

  console.log(`[INGEST:${batchId}] handleOdds plugin=${pluginId} rows_to_upsert=${rows.length}`);

  if (rows.length === 0) return 0;

  const mapped = rows.map((r: Record<string,unknown>) => ({
    match_id:       r.match_id,
    home_team:      r.home_team,
    away_team:      r.away_team,
    match_date:     r.match_date ?? r.date,
    start_time:     r.start_time,
    league_name:    r.league_name ?? r.league_slug,
    league_slug:    r.league_slug,
    bookmaker_slug: r.bookmaker_slug,
    bookmaker_name: r.bookmaker_name ?? r.bookmaker_slug,
    market_type:    isPa ? '1x2_pa' : '1x2',
    odd_home:       r.odd_home,
    odd_draw:       r.odd_draw,
    odd_away:       r.odd_away,
    match_url:      r.match_url,
    updated_at:     new Date().toISOString(),
  }));

  const t0 = Date.now();
  await sbUpsert('bookmaker_odds', mapped, batchId);
  // DB transaction committed aqui — seguro enviar broadcast
  console.log(`[INGEST:${batchId}] db_commit=true rows_written=${mapped.length} elapsed=${Date.now()-t0}ms`);

  return mapped.length;
}

export async function POST(req: NextRequest) {
  const batchId    = makeBatchId(); // rastreamento ponta a ponta neste batch
  const deviceId   = req.headers.get('x-device-id')    ?? '';
  const pluginId   = req.headers.get('x-plugin-id')    ?? '';
  const sequenceId = Number(req.headers.get('x-sequence-id') ?? 0);

  if (!deviceId || !pluginId) {
    return NextResponse.json({ ok: false, error: 'headers obrigatórios ausentes' }, { status: 400 });
  }

  let payload: DiffPayload;
  try {
    payload = await parseBody(req);
  } catch (e) {
    console.error(`[INGEST:${batchId}] body_parse=false`, e);
    return NextResponse.json({ ok: false, error: 'body inválido' }, { status: 400 });
  }

  const addedLen    = (payload.diff?.added    as unknown[])?.length ?? 0;
  const modifiedLen = (payload.diff?.modified as unknown[])?.length ?? 0;
  const removedLen  = (payload.diff?.removed  as unknown[])?.length ?? 0;

  console.log(
    `[INGEST:${batchId}] recv plugin=${pluginId} seq=${sequenceId}` +
    ` added=${addedLen} modified=${modifiedLen} removed=${removedLen}` +
    ` body=${JSON.stringify(payload).length}B`
  );

  // Upsert dispositivo e sequence (fire-and-forget — não bloqueiam o pipeline)
  fetch(`${SB_URL}/rest/v1/sync_devices`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ device_id: deviceId, last_seen: new Date().toISOString(), last_plugin: pluginId }),
  }).catch(() => {});

  fetch(`${SB_URL}/rest/v1/sync_sequence`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ device_id: deviceId, plugin_id: pluginId, last_sequence_id: sequenceId }),
  }).catch(() => {});

  try {
    if (pluginId === 'odds-1x2' || pluginId === 'odds-pa') {
      // 1. Persiste no DB (awaited — garantia de commit antes do broadcast)
      const rowsWritten = await handleOdds(payload.diff, pluginId, batchId);

      // 2. Notifica UI (fire-and-forget com retry interno)
      //    Executado APÓS db_commit=true — sem condição de corrida
      if (rowsWritten > 0) {
        broadcastOddsUpdated(pluginId, rowsWritten, batchId).catch(() => {});
      } else {
        console.log(`[INGEST:${batchId}] broadcast_sent=skipped rows_written=0`);
      }
    } else {
      console.log(`[INGEST:${batchId}] plugin_handler=none plugin=${pluginId}`);
    }

    return NextResponse.json({ ok: true, accepted_sequence_id: sequenceId, batch_id: batchId });
  } catch (e) {
    console.error(`[INGEST:${batchId}] error=`, e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
