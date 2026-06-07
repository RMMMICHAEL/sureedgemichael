/**
 * GET /api/dg/odds
 * Retorna todas as odds do DuploGreen para o usuário autenticado.
 * Query params:
 *   ?match_id=xxx   → odds de um jogo específico (get-match)
 *   ?type=all       → todos os jogos com melhor odd (get-all-odds) [default]
 *   ?type=individual → todas as odds individuais por casa (get-individual-odds)
 *   ?type=opportunities → todas as linhas por casa e jogo (get-dg-opportunities)
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dgFetch } from '@/lib/dg/token';

export async function GET(req: NextRequest) {
  // Requer usuário autenticado no SureEdge
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get('match_id');
  const type    = searchParams.get('type') ?? 'all';

  try {
    let endpoint: string;
    let params: Record<string, string> | undefined;

    if (matchId) {
      endpoint = 'get-match';
      params = { id: matchId };
    } else if (type === 'individual') {
      endpoint = 'get-individual-odds';
    } else if (type === 'opportunities') {
      endpoint = 'get-dg-opportunities';
    } else {
      endpoint = 'get-all-odds';
    }

    const res = await dgFetch(endpoint, params);

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { ok: false, error: `DuploGreen erro ${res.status}: ${err}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[DG odds]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
