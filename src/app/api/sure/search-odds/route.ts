/**
 * POST /api/sure/search-odds
 * Recebe query do cliente, cria entrada na search_queue,
 * aguarda a extensão processar e retorna o resultado.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const TIMEOUT_MS = 15_000; // 15s máximo de espera
const POLL_MS    = 300;    // checa a cada 300ms

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(req: NextRequest) {
  // Requer usuário autenticado com subscription ativa
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  let query = '';
  try {
    const body = await req.json();
    query = (body.query ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Corpo inválido' }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ ok: false, error: 'Query vazia' }, { status: 400 });
  }

  const sb = getAdmin();

  // 1. Cria entrada na fila
  const { data: row, error: insertErr } = await sb
    .from('search_queue')
    .insert({ query, status: 'pending' })
    .select('id')
    .single();

  if (insertErr || !row) {
    return NextResponse.json({ ok: false, error: 'Erro ao criar busca' }, { status: 500 });
  }

  const id = row.id;
  const deadline = Date.now() + TIMEOUT_MS;

  // 2. Polling até resultado ou timeout
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));

    const { data } = await sb
      .from('search_queue')
      .select('status, result, error')
      .eq('id', id)
      .single();

    if (!data) continue;

    if (data.status === 'done') {
      // Limpa a entrada após entregar
      sb.from('search_queue').delete().eq('id', id).then(() => {});
      return NextResponse.json({ ok: true, results: data.result });
    }

    if (data.status === 'error') {
      sb.from('search_queue').delete().eq('id', id).then(() => {});
      return NextResponse.json({ ok: false, error: data.error ?? 'Erro na busca' }, { status: 502 });
    }
  }

  // Timeout — limpa e retorna erro
  sb.from('search_queue').delete().eq('id', id).then(() => {});
  return NextResponse.json(
    { ok: false, error: 'Timeout — extensão não respondeu. Verifique se o navegador está aberto com a extensão ativa.' },
    { status: 504 },
  );
}
