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

/** GET /api/sure/cookie-status — requer admin */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    const adminEmail = process.env.ADMIN_EMAIL ?? '';
    if (!user || !adminEmail || user.email !== adminEmail) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const sb = await getSupabaseAdmin();

    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'cookie_status')
      .single();

    if (!data) return NextResponse.json({ ok: true, status: 'unknown' });

    return NextResponse.json({
      ok: true,
      status: data.value ?? 'unknown',
      updatedAt: data.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ ok: true, status: 'unknown' });
  }
}
