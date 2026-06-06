/**
 * GET /api/sure/scanner — requer usuário autenticado
 *
 * Parâmetros: profitMin, tipo, limit, onlyNew
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function requireUser() {
  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  const profitMin = parseFloat(sp.get('profitMin') ?? '-2.5');
  const tipoParam = (sp.get('tipo') ?? '').trim();
  const tipos     = tipoParam ? tipoParam.split(',').map(t => t.trim()).filter(Boolean) : [];
  const limit     = Math.min(parseInt(sp.get('limit') ?? '200', 10) || 200, 500);
  const onlyNew   = sp.get('onlyNew') === 'true';

  try {
    const sb = await getSupabaseAdmin();

    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let q = sb
      .from('scanner_signals')
      .select('id,tipo,jogo,casa1,casa2,casa3,campeonato,data_evento,profit_margin,is_new,new_at,updated_at,raw_data')
      .gte('profit_margin', isNaN(profitMin) ? -2.5 : profitMin)
      .or(`data_evento.is.null,data_evento.gte.${cutoff}`)
      .order('profit_margin', { ascending: false })
      .limit(limit);

    if (tipos.length > 0) {
      q = q.in('tipo', tipos);
    }

    if (onlyNew) {
      q = q.eq('is_new', true);
    }

    const { data, error } = await q;

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok:      true,
      count:   data?.length ?? 0,
      signals: data ?? [],
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}
