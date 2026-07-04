/**
 * GET /api/dg/token
 * Retorna o token DG atual para o browser fazer fetch direto à API do DG.
 * O browser usa o IP residencial do usuário — sem proxy necessário.
 */
export const dynamic = 'force-dynamic';

import { NextResponse }               from 'next/server';
import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';
const DG_ANON    = process.env.DG_ANON_KEY                 ?? '';
const DG_EMAIL   = process.env.DG_EMAIL                    ?? '';
const DG_PASSWORD = process.env.DG_PASSWORD                ?? '';

async function sbGet(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${key}&select=value`, {
      headers: { 'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}` },
    });
    const rows = await res.json() as { value: string }[];
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function sbSet(key: string, value: string) {
  await fetch(`${SB_URL}/rest/v1/app_settings`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
}

async function getFreshToken(): Promise<string> {
  // Lê token salvo
  const jwt = await sbGet('dg_access_token');
  if (jwt) {
    try {
      const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
      if (p.exp * 1000 > Date.now() + 60_000) return jwt; // ainda válido
    } catch { /* tenta login */ }
  }

  // Token expirado — faz login
  const res = await fetch('https://db.duplogreenengine.com/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': DG_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DG_EMAIL, password: DG_PASSWORD }),
  });
  const data = await res.json() as { access_token?: string; refresh_token?: string };
  if (data.access_token) {
    await Promise.all([
      sbSet('dg_access_token',  data.access_token),
      sbSet('dg_refresh_token', data.refresh_token ?? ''),
    ]);
    return data.access_token;
  }
  throw new Error('Login DG falhou');
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const token = await getFreshToken();
    return NextResponse.json({ ok: true, token, anon: DG_ANON });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
