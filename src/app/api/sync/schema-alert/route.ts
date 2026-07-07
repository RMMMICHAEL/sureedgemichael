export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await fetch(`${SB_URL}/rest/v1/sync_alerts`, {
      method: 'POST',
      headers: {
        'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id:       body.deviceId,
        plugin_id:       body.pluginId,
        type:            'schema_mismatch',
        payload:         body,
        resolved:        false,
        created_at:      new Date().toISOString(),
      }),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
