/**
 * /api/sure/auth — uso interno, requer admin
 *
 * GET  — retorna { ok, connected }
 * POST — força renovação interna do cookie
 */
import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { invalidateCache, getActiveCookie } from '@/lib/supermonitor-auth';

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

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const cookie = await getActiveCookie();
    return NextResponse.json({ ok: true, connected: !!cookie });
  } catch {
    return NextResponse.json({ ok: true, connected: false });
  }
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  invalidateCache();
  try {
    const cookie = await getActiveCookie();
    return NextResponse.json({ ok: !!cookie });
  } catch (err: unknown) {
    console.error('[auth] refresh failed:', err);
    return NextResponse.json({ ok: false });
  }
}
