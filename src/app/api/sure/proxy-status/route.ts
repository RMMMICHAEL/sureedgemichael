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

async function requireAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    const adminEmail = process.env.ADMIN_EMAIL ?? '';
    return !!user && !!adminEmail && user.email === adminEmail;
  } catch {
    return false;
  }
}

/** GET — retorna status atual do proxy */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const sb = await getSupabaseAdmin();
    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'supermonitor_status')
      .single();

    if (!data) return NextResponse.json({ status: 'ok' });
    return NextResponse.json({ status: data.value ?? 'ok', updatedAt: data.updated_at ?? null });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}

/** POST — reseta para ok e re-enfileira itens com erro recente */
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const sb = await getSupabaseAdmin();

    await sb.from('app_config').upsert(
      { key: 'supermonitor_status', value: 'ok', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await sb
      .from('odds_queue')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('status', 'error')
      .gte('updated_at', cutoff);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}
