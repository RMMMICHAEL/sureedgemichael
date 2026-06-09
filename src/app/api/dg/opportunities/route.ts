/**
 * GET /api/dg/opportunities
 *
 * Lê oportunidades DuploGreen da tabela dg_opportunities.
 *
 * Query params:
 *   ?classification=ALTA|MEDIA|BAIXA  → filtra por classificação
 *   ?min_score=80                     → score mínimo
 *   ?pa=only|none|all                 → filtro de PA nas pernas
 *   ?limit=200                        → máximo de resultados (padrão 500)
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }  from 'next/server';
import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const classification   = searchParams.get('classification');
  const minScore         = Number(searchParams.get('min_score') ?? 0);
  const limit            = Math.min(Number(searchParams.get('limit') ?? 500), 1000);

  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);

  let query = supabase
    .from('dg_opportunities')
    .select('*')
    .order('dg_score', { ascending: false })
    .limit(limit);

  if (classification) {
    query = query.eq('dg_classification', classification);
  }
  if (minScore > 0) {
    query = query.gte('dg_score', minScore);
  }

  // Só eventos futuros
  const now = new Date().toISOString();
  query = query.gt('kickoff', now);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    count:   data?.length ?? 0,
    results: data ?? [],
  });
}
