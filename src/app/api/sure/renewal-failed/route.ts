/**
 * GET /api/sure/renewal-failed
 * Retorna o status da última tentativa de renovação automática do cookie.
 * Usado pelo painel admin para exibir alerta quando o daemon falhou.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function getAdminClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

export async function GET() {
  // Admin-only
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ failed: false });

  try {
    const sb = await getAdminClient();
    const { data } = await sb
      .from('app_config')
      .select('value')
      .eq('key', 'cookie_renewal_failed')
      .single();

    if (!data?.value) return NextResponse.json({ failed: false });

    const parsed = JSON.parse(data.value) as { ts: string; reason: string };
    return NextResponse.json({ failed: true, ts: parsed.ts, reason: parsed.reason });
  } catch {
    return NextResponse.json({ failed: false });
  }
}
