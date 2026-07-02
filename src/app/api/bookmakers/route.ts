/**
 * GET /api/bookmakers
 *
 * Retorna todos os bookmakers da tabela `bookmakers` (descobertos via DG + manuais).
 * Usado pelo BookmakersPage para exibir casas detectadas automaticamente.
 */
export const dynamic = 'force-dynamic';

import { NextResponse }               from 'next/server';
import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });

  const { data, error } = await supabase
    .from('bookmakers')
    .select('slug, name, domain, color, source, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, bookmakers: data ?? [] });
}
