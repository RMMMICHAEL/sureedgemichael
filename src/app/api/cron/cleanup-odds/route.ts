export const dynamic  = 'force-dynamic';
export const runtime  = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function sbDelete(filter: string, label: string): Promise<number> {
  const res = await fetch(`${SB_URL}/rest/v1/bookmaker_odds?${filter}&select=match_id`, {
    method: 'DELETE',
    headers: {
      'apikey':       SB_SVC_KEY,
      'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Prefer':        'return=representation',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[cleanup] ${label} falhou ${res.status}:`, body.slice(0, 200));
    return 0;
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

export async function GET(req: NextRequest) {
  // Vercel injeta Authorization: Bearer <CRON_SECRET> em chamadas de cron
  const auth   = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const today        = todayBRT();
  const staleThresh  = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 dias atrás
  const t0           = Date.now();

  // 1. Partidas passadas (ontem para trás)
  const deletedPast = await sbDelete(
    `match_date=lt.${today}`,
    'partidas passadas',
  );

  // 2. Odds desatualizadas: partidas futuras cujo updated_at não é renovado há 3+ dias
  //    (bookmaker removeu o mercado, partida cancelada, etc.)
  const deletedStale = await sbDelete(
    `match_date=gte.${today}&updated_at=lt.${staleThresh}`,
    'odds desatualizadas',
  );

  const elapsed = Date.now() - t0;
  console.log(
    `[cleanup] ok past=${deletedPast} stale=${deletedStale} elapsed=${elapsed}ms`,
  );

  return NextResponse.json({
    ok:            true,
    deleted_past:  deletedPast,
    deleted_stale: deletedStale,
    elapsed_ms:    elapsed,
    ran_at:        new Date().toISOString(),
  });
}
