/**
 * POST /api/dg/set-token
 * Recebe a sessão DuploGreen completa (access_token + refresh_token)
 * e persiste no Supabase para o daemon local usar.
 *
 * Como obter os valores:
 *   1. Abra https://www.duplogreenengine.com e faça login
 *   2. DevTools (F12) → Console
 *   3. Execute: JSON.parse(localStorage.getItem('sb-db-auth-token'))
 *   4. Copie access_token, refresh_token e expires_at
 *
 * GET /api/dg/set-token → retorna TTL atual e status do poller
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { saveDGSession, getDGTokenTTL, getDGPollerStatus } from '@/lib/dg/token';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'michael.martins.trader@gmail.com';

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === ADMIN_EMAIL ? user : null;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 });
  }

  let access_token  = '';
  let refresh_token = '';
  let expires_at    = 0; // unix seconds ou ms

  try {
    const body     = await req.json();
    access_token   = (body.access_token  ?? '').trim();
    refresh_token  = (body.refresh_token ?? '').trim();
    expires_at     = Number(body.expires_at ?? 0);
  } catch {
    return NextResponse.json({ ok: false, error: 'Corpo inválido' }, { status: 400 });
  }

  if (!access_token?.startsWith('eyJ')) {
    return NextResponse.json({ ok: false, error: 'access_token inválido' }, { status: 400 });
  }
  if (!refresh_token) {
    return NextResponse.json({ ok: false, error: 'refresh_token obrigatório' }, { status: 400 });
  }

  // Decodifica exp do JWT se expires_at não veio no body
  if (!expires_at) {
    try {
      const payload = JSON.parse(atob(access_token.split('.')[1]));
      expires_at    = payload.exp ?? (Math.floor(Date.now() / 1000) + 3600);
    } catch {
      expires_at = Math.floor(Date.now() / 1000) + 3600;
    }
  }

  // Normaliza para ms
  const expires_at_ms = expires_at > 1e12 ? expires_at : expires_at * 1000;

  try {
    await saveDGSession({ access_token, refresh_token, expires_at: expires_at_ms });
    const ttl = await getDGTokenTTL();
    return NextResponse.json({ ok: true, ttl, message: 'Sessão salva — inicie o daemon: node scripts/dg-poller.mjs' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 });
  }

  const [ttl, poller] = await Promise.all([
    getDGTokenTTL(),
    getDGPollerStatus(),
  ]);

  return NextResponse.json({ ok: true, ttl, poller });
}
