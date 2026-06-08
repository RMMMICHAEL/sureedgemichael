/**
 * GET /api/dg/odds
 * Retorna odds de futebol via Altenar (API pública, sem auth, sem Cloudflare).
 * Cobre: EstrelaBet, Br4bet, EsportivaBet, Jogo de Ouro.
 *
 * Query params:
 *   ?champ_id=11318   → odds de uma liga específica (Brasileirão A = 11318)
 *   (sem params)      → todas as ligas de futebol
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAllFootballOdds, getOddsByLeague } from '@/lib/altenar/client';

export async function GET(req: NextRequest) {
  // Requer usuário autenticado no SureEdge
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const champId = searchParams.get('champ_id');

  try {
    const odds = champId
      ? await getOddsByLeague(Number(champId))
      : await getAllFootballOdds();

    return NextResponse.json({
      ok:     true,
      count:  odds.length,
      source: 'altenar',
      odds,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[altenar odds]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
