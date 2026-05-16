/**
 * GET /api/admin/recover-data
 * TEMPORÁRIO — remover após recuperação dos dados.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

const TARGET_EMAIL = 'michael.martins.trader@gmail.com';
const TODAY        = '2026-05-16';

interface LegRaw { id?: string; oid?: string; ho?: string; re?: unknown; st?: unknown; bd?: string; [k: string]: unknown; }

export async function GET() {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: profile, error: pe } = await admin
    .from('profiles').select('id').eq('email', TARGET_EMAIL).single();
  if (!profile) return NextResponse.json({ error: 'Usuário não encontrado', detail: pe?.message }, { status: 404 });

  const { data: row, error: de } = await admin
    .from('user_data').select('data, updated_at').eq('user_id', profile.id).single();
  if (!row) return NextResponse.json({ error: 'Sem dados no Supabase', detail: de?.message }, { status: 404 });

  const legs: LegRaw[] = (row.data as { legs?: LegRaw[] })?.legs ?? [];
  const today = legs.filter(l => typeof l.bd === 'string' && l.bd.startsWith(TODAY));

  return NextResponse.json({
    last_updated:    row.updated_at,
    legs_total:      legs.length,
    legs_today:      today.length,
    legs_today_list: today.map(l => ({ id: l.id, oid: l.oid, ho: l.ho, re: l.re, st: l.st, bd: l.bd })),
  });
}
