/**
 * POST /api/sure/save-cookie
 * Recebe o cookie do browser do admin, valida e salva no Supabase.
 * Só aceita requisições autenticadas (usuário logado).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { storeCookieInSupabase, validateCookie } from '@/lib/supermonitor-auth';

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

export async function POST(req: NextRequest) {
  // Apenas admin pode injetar cookies do SuperMonitor
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }
  if (user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ ok: false, error: 'Acesso negado' }, { status: 403 });
  }

  let rawCookie = '';
  let cfClearance = '';
  try {
    const body = await req.json() as { cookie?: string; cf_clearance?: string };
    rawCookie    = (body.cookie        ?? '').trim();
    cfClearance  = (body.cf_clearance  ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Corpo inválido' }, { status: 400 });
  }

  // Salva cf_clearance separado (se fornecido), sem bloquear o fluxo principal
  if (cfClearance) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      // Extrai só o valor se vier no formato "cf_clearance=valor"
      const cfVal = cfClearance.replace(/^cf_clearance=/i, '');
      await sb.from('app_config').upsert(
        { key: 'cf_clearance', value: cfVal, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
    } catch { /* best-effort */ }
  }

  if (!rawCookie) {
    return NextResponse.json({ ok: false, error: 'Cookie vazio' }, { status: 400 });
  }

  // Normaliza: aceita só o valor do PHPSESSID ou o cookie completo
  const sessMatch = rawCookie.match(/PHPSESSID=([a-z0-9]+)/i);
  const normalized = sessMatch ? `PHPSESSID=${sessMatch[1]}` : `PHPSESSID=${rawCookie.replace(/^PHPSESSID=/i, '')}`;

  // Valida o cookie antes de salvar
  const valid = await validateCookie(normalized);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'Cookie inválido ou sessão expirada. Faça login no site e tente novamente.' });
  }

  // Salva no Supabase
  await storeCookieInSupabase(normalized);

  // Limpa flag de falha de renovação automática (se existia)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await sb.from('app_config').upsert(
      { key: 'cookie_renewal_failed', value: '', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
