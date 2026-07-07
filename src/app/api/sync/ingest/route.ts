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

async function parseBody(req: NextRequest): Promise<DiffPayload> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return req.json() as Promise<DiffPayload>;
  }
  // fallback: octet-stream com gzip
  const buf  = await req.arrayBuffer();
  const ds   = new DecompressionStream('gzip');
  const w    = ds.writable.getWriter();
  await w.write(new Uint8Array(buf));
  await w.close();
  const text = await new Response(ds.readable).text();
  return JSON.parse(text);
}

async function sbUpsert(table: string, rows: Record<string, unknown>[]) {
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
    console.error(`[sync/ingest] sbUpsert ${table} falhou ${res.status}:`, body.slice(0, 500));
    throw new Error(`sbUpsert ${table} ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function handleOdds(diff: DiffPayload['diff'], pluginId: string) {
  const isPa = pluginId === 'odds-pa';

  const rows = [...(diff.added as Record<string,unknown>[]), ...(diff.modified as Record<string,unknown>[])];
  console.log(`[DIAG] handleOdds ${pluginId}: ${rows.length} rows para upsert`);
  if (rows.length > 0) {
    // [DIAG-9] Amostra do primeiro row para verificar campos
    console.log(`[DIAG] handleOdds amostra[0]:`, JSON.stringify(rows[0]).slice(0, 300));
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
    console.log(`[DIAG] sbUpsert: enviando ${mapped.length} rows para bookmaker_odds`);
    await sbUpsert('bookmaker_odds', mapped);
    console.log(`[DIAG] sbUpsert: concluído para ${mapped.length} rows`);
  }

  // Remove deleted (por row_id)
  if (diff.removed.length > 0) {
    const ids = diff.removed.map(id => id.split('__')[0]); // match_id
    // Soft delete via update is_active = false seria ideal mas por ora ignoramos
    // já que o snapshot local da extensão gerencia isso
  }
}

export async function POST(req: NextRequest) {
  const deviceId    = req.headers.get('x-device-id')    ?? '';
  const signature   = req.headers.get('x-signature')    ?? '';
  const pluginId    = req.headers.get('x-plugin-id')    ?? '';
  const sequenceId  = Number(req.headers.get('x-sequence-id') ?? 0);

  if (!deviceId || !pluginId) {
    return NextResponse.json({ ok: false, error: 'headers obrigatórios ausentes' }, { status: 400 });
  }

  let payload: DiffPayload;
  try {
    payload = await parseBody(req);
  } catch (e) {
    console.error('[sync/ingest] body inválido:', e);
    return NextResponse.json({ ok: false, error: 'body inválido' }, { status: 400 });
  }

  // Upsert dispositivo (cria se não existir)
  fetch(`${SB_URL}/rest/v1/sync_devices`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ device_id: deviceId, last_seen: new Date().toISOString(), last_plugin: pluginId }),
  }).catch(() => {});

  // Persiste sequence_id
  fetch(`${SB_URL}/rest/v1/sync_sequence`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ device_id: deviceId, plugin_id: pluginId, last_sequence_id: sequenceId }),
  }).catch(() => {});

  // [DIAG-8] Recebido na API
  const addedLen   = (payload.diff?.added   as unknown[])?.length ?? 0;
  const modifiedLen= (payload.diff?.modified as unknown[])?.length ?? 0;
  const removedLen = (payload.diff?.removed  as unknown[])?.length ?? 0;
  console.log(`[DIAG] ingest recebido: plugin=${pluginId} +${addedLen} ~${modifiedLen} -${removedLen} bodyBytes=${JSON.stringify(payload).length}`);

  try {
    if (pluginId === 'odds-1x2' || pluginId === 'odds-pa') {
      await handleOdds(payload.diff, pluginId);
    } else {
      console.log(`[DIAG] plugin ${pluginId} não tem handler de DB — ignorado`);
    }

    const stats = payload.stats ?? {};
    console.log(`[sync/ingest] ${pluginId} seq=${sequenceId} +${stats.added} ~${stats.modified} -${stats.removed}`);

    return NextResponse.json({ ok: true, accepted_sequence_id: sequenceId });
  } catch (e) {
    console.error('[sync/ingest] erro:', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
