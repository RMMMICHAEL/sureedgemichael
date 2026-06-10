/**
 * POST /api/admin/merge-legs
 *
 * Copia legs de um usuário para outro, filtrando por opType e intervalo de datas.
 * NÃO remove da origem — apenas adiciona ao destino (merge por id).
 *
 * Body: { from_email, to_email, date_from, date_to, op_types? }
 * Defaults: op_types = ['surebet', 'duplo_green', 'freebet', 'delay', 'outros']
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppDB, Leg } from '@/types';

const ADMIN_EMAILS = ['michael.martins.trader@gmail.com', 'rmmichael20@gmail.com'];

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  // Auth
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ ok: false, error: 'Acesso restrito ao administrador' }, { status: 403 });
  }

  // Parse
  let body: {
    from_email: string;
    to_email:   string;
    date_from:  string;  // YYYY-MM-DD inclusive
    date_to:    string;  // YYYY-MM-DD inclusive
    op_types?:  string[];
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const { from_email, to_email, date_from, date_to } = body;
  const op_types = body.op_types ?? ['surebet', 'duplo_green', 'freebet', 'delay', 'outros'];

  if (!from_email || !to_email || !date_from || !date_to) {
    return NextResponse.json({ ok: false, error: 'from_email, to_email, date_from e date_to são obrigatórios' }, { status: 400 });
  }

  const admin = await getSupabaseAdmin();

  // Busca os user_ids por email
  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });

  const fromUser = users.find(u => u.email?.toLowerCase() === from_email.toLowerCase());
  const toUser   = users.find(u => u.email?.toLowerCase() === to_email.toLowerCase());

  if (!fromUser) return NextResponse.json({ ok: false, error: `Usuário não encontrado: ${from_email}` }, { status: 404 });
  if (!toUser)   return NextResponse.json({ ok: false, error: `Usuário não encontrado: ${to_email}` },   { status: 404 });

  // Lê user_data de ambos
  const [srcRes, dstRes] = await Promise.all([
    admin.from('user_data').select('data').eq('user_id', fromUser.id).single(),
    admin.from('user_data').select('data').eq('user_id', toUser.id).single(),
  ]);

  if (srcRes.error || !srcRes.data) {
    return NextResponse.json({ ok: false, error: `Sem dados para ${from_email}` }, { status: 404 });
  }

  const srcDB = srcRes.data.data as AppDB;
  const dstDB = (dstRes.data?.data ?? { legs: [] }) as AppDB;

  // Filtra legs da origem: opType + intervalo de datas (bd = bet_date, ISO string)
  const dateFrom = date_from; // "2026-06-01"
  const dateTo   = date_to;   // "2026-06-10"

  const matchingLegs: Leg[] = (srcDB.legs ?? []).filter(leg => {
    const legDate = leg.bd?.slice(0, 10); // pega só YYYY-MM-DD
    if (!legDate) return false;
    if (legDate < dateFrom || legDate > dateTo) return false;

    // opType padrão é 'surebet' quando undefined
    const legOpType = leg.opType ?? 'surebet';
    return op_types.includes(legOpType);
  });

  if (!matchingLegs.length) {
    return NextResponse.json({
      ok: false,
      error: `Nenhuma leg encontrada em ${from_email} com os filtros informados.`,
      total_src_legs: srcDB.legs?.length ?? 0,
      filters: { date_from, date_to, op_types },
    }, { status: 404 });
  }

  // Merge no destino: adiciona apenas legs que ainda não existem (por id)
  const existingIds = new Set((dstDB.legs ?? []).map(l => l.id));
  const newLegs     = matchingLegs.filter(l => !existingIds.has(l.id));
  const merged      = [...(dstDB.legs ?? []), ...newLegs];

  const updatedDstDB: AppDB = { ...dstDB, legs: merged };

  // Salva destino
  const { error: writeErr } = await admin
    .from('user_data')
    .upsert({ user_id: toUser.id, data: updatedDstDB }, { onConflict: 'user_id' });

  if (writeErr) {
    return NextResponse.json({ ok: false, error: `Erro ao salvar: ${writeErr.message}` }, { status: 500 });
  }

  console.log(`[merge-legs] ${newLegs.length} legs copiadas de ${from_email} → ${to_email} (${date_from}~${date_to}) por ${user.email}`);

  return NextResponse.json({
    ok:              true,
    from:            from_email,
    to:              to_email,
    date_range:      `${date_from} ~ ${date_to}`,
    op_types,
    matched:         matchingLegs.length,
    already_existed: matchingLegs.length - newLegs.length,
    copied:          newLegs.length,
  });
}
