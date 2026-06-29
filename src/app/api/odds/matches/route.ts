/**
 * GET /api/odds/matches
 *
 * Snapshot inicial de odds — consome OddsSource (DG ou local, com fallback).
 * Requer usuário autenticado.
 *
 * Query params:
 *   ?date=YYYY-MM-DD   filtra a partir desta data (padrão: hoje BRT)
 *   ?limit=500          máximo de jogos (padrão 500, máx 2000)
 *   ?match_id=uuid     busca um jogo específico
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchAllOdds, fetchMatchOdds } from '@/lib/odds-source';

async function requireUser() {
  try {
    const cookieStore = await cookies();
    const sb = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await sb.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const sp      = req.nextUrl.searchParams;
  const matchId = sp.get('match_id');
  const date    = sp.get('date') ?? undefined;
  const limit   = Math.min(Number(sp.get('limit') ?? 500), 2000);

  try {
    if (matchId) {
      const match = await fetchMatchOdds(matchId);
      if (!match) return NextResponse.json({ ok: false, error: 'Jogo não encontrado' }, { status: 404 });
      return NextResponse.json({ ok: true, match });
    }

    const odds = await fetchAllOdds({ fromDate: date, limit });
    return NextResponse.json({ ok: true, count: odds.length, odds });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[odds/matches]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
