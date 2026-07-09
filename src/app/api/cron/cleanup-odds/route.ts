export const dynamic  = 'force-dynamic';
export const runtime  = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const KNOWN_MARKETS = ['1x2', '1x2_pa'];
const FINISHED_MATCH_HOURS = 4; // duração média de uma partida + margem

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

  const today          = todayBRT();
  const staleThresh    = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 dias atrás
  const finishedThresh = new Date(Date.now() - FINISHED_MATCH_HOURS * 60 * 60 * 1000).toISOString();
  const t0             = Date.now();

  // 1. Partidas passadas (ontem para trás — data inteira)
  const deletedPast = await sbDelete(
    `match_date=lt.${today}`,
    'partidas passadas',
  );

  // 2. Partidas encerradas hoje mesmo (kickoff + algumas horas de margem) —
  //    cobre o caso do jogo ter começado e terminado no mesmo dia do cron.
  const deletedFinished = await sbDelete(
    `start_time=lt.${finishedThresh}`,
    'partidas encerradas',
  );

  // 3. Odds desatualizadas: partidas futuras cujo updated_at não é renovado há 3+ dias
  //    (bookmaker removeu o mercado, partida cancelada, etc.)
  const deletedStale = await sbDelete(
    `match_date=gte.${today}&updated_at=lt.${staleThresh}`,
    'odds desatualizadas',
  );

  // 4. Mercados que não existem mais na taxonomia atual (registro órfão de formato antigo)
  const deletedUnknownMarket = await sbDelete(
    `market_type=not.in.(${KNOWN_MARKETS.join(',')})`,
    'mercados desconhecidos',
  );

  const elapsed = Date.now() - t0;
  console.log(
    `[cleanup] ok past=${deletedPast} finished=${deletedFinished} stale=${deletedStale} unknown_market=${deletedUnknownMarket} elapsed=${elapsed}ms`,
  );

  return NextResponse.json({
    ok:                    true,
    deleted_past:          deletedPast,
    deleted_finished:      deletedFinished,
    deleted_stale:         deletedStale,
    deleted_unknown_market: deletedUnknownMarket,
    elapsed_ms:            elapsed,
    ran_at:                new Date().toISOString(),
  });
}
