/**
 * POST /api/admin/restore-legs
 * TEMPORÁRIO — recebe legs do localStorage e salva no Supabase do usuário logado.
 * Remover após recuperação.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const { createClient } = await import('@supabase/supabase-js');
  const { createServerClient } = await import('@supabase/ssr');

  // Identifica o usuário logado via sessão
  const cookieStore = cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });

  // Lê as legs enviadas
  const body = await req.json() as { legs?: unknown[] };
  const newLegs = body.legs ?? [];
  if (!newLegs.length) return NextResponse.json({ ok: false, error: 'Nenhuma leg enviada' });

  // Admin client (bypass RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Lê o user_data atual do Supabase
  const { data: existing } = await admin
    .from('user_data')
    .select('data')
    .eq('user_id', user.id)
    .single();

  const currentData = (existing?.data ?? {}) as Record<string, unknown>;

  // Merge: mantém tudo que estava no Supabase, substitui só as legs
  const merged = { ...currentData, legs: newLegs };

  const { error } = await admin
    .from('user_data')
    .upsert({ user_id: user.id, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ ok: false, error: error.message });

  return NextResponse.json({ ok: true, legs_saved: newLegs.length });
}
