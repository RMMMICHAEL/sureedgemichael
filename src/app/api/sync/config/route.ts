export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';

const DEFAULT_CONFIG = {
  plugins: {
    'odds-1x2':      { enabled: true,  priority: 'critical' },
    'odds-pa':       { enabled: true,  priority: 'critical' },
    'opportunities': { enabled: true,  priority: 'high' },
  },
  heartbeat_interval_ms: 60000,
  log_level: 'warn',
  feature_flags: {
    replay_mode:      true,
    schema_detection: true,
    discovery:        true,
  },
  min_extension_version: '1.0.0',
  api_version: 1,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get('device_id') ?? '';

  // Tenta buscar config customizada do dispositivo no Supabase
  if (deviceId) {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/sync_devices?device_id=eq.${deviceId}&select=config,active`,
        { headers: { 'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}` } }
      );
      const rows = await res.json() as { config: Record<string,unknown> | null; active: boolean }[];
      if (rows.length > 0) {
        if (!rows[0].active) {
          return NextResponse.json({ ...DEFAULT_CONFIG, revoked: true });
        }
        if (rows[0].config) {
          return NextResponse.json({ ...DEFAULT_CONFIG, ...rows[0].config });
        }
      }
    } catch { /* usa default */ }
  }

  return NextResponse.json(DEFAULT_CONFIG);
}
