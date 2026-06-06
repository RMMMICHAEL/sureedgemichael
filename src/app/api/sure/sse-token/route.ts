export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1'];

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

/** GET /api/sure/sse-token — requer usuário autenticado */
export async function GET() {
  if (!(await requireUser())) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const sb = await getSupabaseAdmin();

    const [tokenRow, urlRow] = await Promise.all([
      sb.from('app_config').select('value, updated_at').eq('key', 'sse_temp_token').single(),
      sb.from('app_config').select('value').eq('key', 'sse_url').single(),
    ]);

    if (tokenRow.error || !tokenRow.data?.value) {
      return NextResponse.json({ ok: false, error: 'token_indisponivel' });
    }

    const age = Date.now() - new Date(tokenRow.data.updated_at).getTime();
    if (age > 15 * 60 * 1000) {
      return NextResponse.json({ ok: false, error: 'token_expirado' });
    }

    return NextResponse.json({
      ok: true,
      token: tokenRow.data.value,
      sse_url: urlRow.data?.value ?? null,
      updated_at: tokenRow.data.updated_at,
    });
  } catch (e: unknown) {
    console.error('[sse-token]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'Erro interno' });
  }
}
