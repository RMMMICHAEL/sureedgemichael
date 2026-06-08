/**
 * POST /api/dg/set-token
 * Recebe o access_token do DuploGreen vindo do browser do admin
 * e o armazena em memória para uso nas chamadas server-side.
 *
 * Só o ADMIN pode chamar este endpoint.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { setDGToken, getDGTokenTTL } from '@/lib/dg/token';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'michael.martins.trader@gmail.com';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 });
  }

  let token = '';
  try {
    const body = await req.json();
    token = body.access_token ?? '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Corpo inválido' }, { status: 400 });
  }

  if (!token || !token.startsWith('eyJ')) {
    return NextResponse.json({ ok: false, error: 'Token inválido' }, { status: 400 });
  }

  // Decodifica exp do JWT para saber expiração real
  let expiresIn = 3600;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp) {
      expiresIn = payload.exp - Math.floor(Date.now() / 1000);
    }
  } catch { /* usa 3600 como fallback */ }

  setDGToken(token, expiresIn);

  return NextResponse.json({ ok: true, ttl: getDGTokenTTL() });
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, ttl: getDGTokenTTL() });
}
