export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      device_id:         string;
      status:            'online' | 'offline';
      dg_tab_open:       boolean;
      last_sync_at:      string | null;
      queue_depth:       Record<string, number>;
      extension_version: string;
    };

    if (!body.device_id) return NextResponse.json({ ok: false }, { status: 400 });

    // Verifica se o dispositivo está ativo
    const devRes = await fetch(
      `${SB_URL}/rest/v1/sync_devices?device_id=eq.${body.device_id}&select=active`,
      { headers: { 'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}` } }
    );
    const devices = await devRes.json() as { active: boolean }[];
    const revoked = devices.length > 0 && !devices[0].active;

    if (!revoked) {
      // Atualiza estado do dispositivo
      await fetch(`${SB_URL}/rest/v1/sync_devices?device_id=eq.${body.device_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status:            body.status,
          dg_tab_open:       body.dg_tab_open,
          last_sync_at:      body.last_sync_at,
          extension_version: body.extension_version,
          last_seen:         new Date().toISOString(),
        }),
      });
    }

    return NextResponse.json({ ok: true, revoked });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
