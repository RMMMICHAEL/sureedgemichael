/**
 * POST /api/admin/transfer-user-data
 *
 * Copia o user_data (surebets, freebets, configurações) de um usuário para outro.
 * Restrito aos admins.
 *
 * Body: { from_email: string, to_email: string }
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  let body: { from_email?: string; to_email?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const { from_email, to_email } = body;
  if (!from_email || !to_email) {
    return NextResponse.json({ ok: false, error: 'from_email e to_email são obrigatórios' }, { status: 400 });
  }

  const admin = await getSupabaseAdmin();

  // Busca os user_ids por email via auth.admin
  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    return NextResponse.json({ ok: false, error: `Erro ao listar usuários: ${listErr.message}` }, { status: 500 });
  }

  const fromUser = users.find(u => u.email?.toLowerCase() === from_email.toLowerCase());
  const toUser   = users.find(u => u.email?.toLowerCase() === to_email.toLowerCase());

  if (!fromUser) return NextResponse.json({ ok: false, error: `Usuário origem não encontrado: ${from_email}` }, { status: 404 });
  if (!toUser)   return NextResponse.json({ ok: false, error: `Usuário destino não encontrado: ${to_email}` }, { status: 404 });

  // Lê o user_data da origem
  const { data: srcData, error: readErr } = await admin
    .from('user_data')
    .select('data')
    .eq('user_id', fromUser.id)
    .single();

  if (readErr || !srcData) {
    return NextResponse.json({ ok: false, error: `Sem dados para ${from_email} (${readErr?.message ?? 'vazio'})` }, { status: 404 });
  }

  // Upsert no destino
  const { error: writeErr } = await admin
    .from('user_data')
    .upsert({ user_id: toUser.id, data: srcData.data }, { onConflict: 'user_id' });

  if (writeErr) {
    return NextResponse.json({ ok: false, error: `Erro ao salvar: ${writeErr.message}` }, { status: 500 });
  }

  console.log(`[transfer-user-data] ${from_email} → ${to_email} por ${user.email}`);

  return NextResponse.json({
    ok:        true,
    from:      from_email,
    to:        to_email,
    from_id:   fromUser.id,
    to_id:     toUser.id,
    message:   `Dados transferidos com sucesso de ${from_email} para ${to_email}`,
  });
}
