export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';

async function sbUpsert(table: string, row: Record<string, unknown>) {
  await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      device_id: string;
      extension_version: string;
      browser_fingerprint?: string;
    };

    if (!body.device_id) return NextResponse.json({ ok: false }, { status: 400 });

    await sbUpsert('sync_devices', {
      device_id:         body.device_id,
      extension_version: body.extension_version ?? '?',
      active:            true,
      last_seen:         new Date().toISOString(),
    });

    return NextResponse.json({
      ok:          true,
      api_version: 1,
      config: {
        plugins: {
          'odds-1x2':      { enabled: true, priority: 'critical' },
          'odds-pa':       { enabled: true, priority: 'critical' },
          'opportunities': { enabled: true, priority: 'high' },
        },
        heartbeat_interval_ms: 60000,
        min_extension_version: '1.0.0',
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
