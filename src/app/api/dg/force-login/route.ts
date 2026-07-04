/**
 * POST /api/dg/force-login
 * Força login com DG_EMAIL + DG_PASSWORD e salva tokens no app_settings.
 * Útil para renovar credenciais após troca de conta ou expiração.
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 15;

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const DG_ANON     = process.env.DG_ANON_KEY ?? '';
const DG_EMAIL    = process.env.DG_EMAIL    ?? '';
const DG_PASSWORD = process.env.DG_PASSWORD ?? '';
const SB_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';

async function sbSet(key: string, value: string) {
  await fetch(`${SB_URL}/rest/v1/app_settings`, {
    method:  'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
}

export async function POST() {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });

  if (!DG_EMAIL || !DG_PASSWORD) {
    return NextResponse.json({ ok: false, error: 'DG_EMAIL ou DG_PASSWORD não configurados no Vercel' }, { status: 500 });
  }

  try {
    const res = await fetch('https://db.duplogreenengine.com/auth/v1/token?grant_type=password', {
      method:  'POST',
      headers: { 'apikey': DG_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DG_EMAIL, password: DG_PASSWORD }),
    });

    const data = await res.json() as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };

    if (!res.ok || !data.access_token) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: data.error_description ?? data.error ?? 'Login falhou',
        email_usado: DG_EMAIL,
      }, { status: 400 });
    }

    // Decodifica exp do token para mostrar validade
    let exp = '';
    try {
      const p = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString());
      exp = new Date(p.exp * 1000).toISOString();
    } catch { /* ignora */ }

    // Salva no app_settings
    await Promise.all([
      sbSet('dg_access_token',  data.access_token),
      sbSet('dg_refresh_token', data.refresh_token ?? ''),
    ]);

    return NextResponse.json({
      ok:      true,
      email:   DG_EMAIL,
      expires: exp,
      message: 'Login OK — tokens salvos no Supabase',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
