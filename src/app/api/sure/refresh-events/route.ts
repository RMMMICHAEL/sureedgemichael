/**
 * POST /api/sure/refresh-events — requer usuário autenticado
 * Seta a flag refresh_events_requested no Supabase para o daemon processar.
 *
 * GET /api/sure/refresh-events — requer usuário autenticado
 * Retorna { done: bool, at: string|null } — usado pelo frontend para polling.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
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

export async function POST() {
  if (!(await requireUser())) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const sb = await getSupabaseAdmin();

    await sb.from('app_config').upsert(
      { key: 'refresh_events_done', value: '', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

    const { error } = await sb.from('app_config').upsert(
      { key: 'refresh_events_requested', value: 'true', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function GET() {
  if (!(await requireUser())) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const sb = await getSupabaseAdmin();

    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'refresh_events_done')
      .single();

    const done = !!(data?.value && data.value !== '');
    return NextResponse.json({ ok: true, done, at: data?.value || null });
  } catch {
    return NextResponse.json({ ok: true, done: false, at: null });
  }
}
