/**
 * /api/sure/freebet
 *
 * POST { bookmaker, value, min_odd, max_odd, pa_filter }
 *   → insere requisição em freebet_queue (status: pending)
 *   → retorna { ok, request_id }
 *
 * GET ?request_id=<uuid>
 *   → retorna { ok, status: 'pending'|'done'|'error', data?, error_msg? }
 *
 * O handshake ECDH e chamada ao SuperMonitor são feitos pelo daemon local
 * (process-queue.mjs) via IP residencial brasileiro, evitando bloqueio de
 * datacenter estrangeiro.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── POST — enfileira requisição de freebet ────────────────────────────────────

export async function POST(req: NextRequest) {
  let bookmaker = '', value = 0, min_odd = 1.5, max_odd = 999, pa_filter = 'all';
  try {
    const body = await req.json() as Record<string, unknown>;
    bookmaker  = String(body.bookmaker  ?? '').trim();
    value      = parseFloat(String(body.value   ?? '0'));
    min_odd    = parseFloat(String(body.min_odd  ?? '1.5'));
    max_odd    = parseFloat(String(body.max_odd  ?? '999'));
    pa_filter  = String(body.pa_filter  ?? 'all').trim();
  } catch (_e) { /* json inválido */ }

  if (!bookmaker || !value || value <= 0) {
    return NextResponse.json(
      { ok: false, error: 'bookmaker e value são obrigatórios' },
      { status: 400 },
    );
  }

  try {
    const sb = await getSupabaseAdmin();

    const { data, error } = await sb
      .from('freebet_queue')
      .insert({ bookmaker, value, min_odd, max_odd, pa_filter, status: 'pending' })
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, request_id: data.id });
  } catch (e: unknown) {
    console.error('[freebet POST]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}

// ── GET — polling do resultado ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const request_id = req.nextUrl.searchParams.get('request_id')?.trim() ?? '';

  if (!request_id) {
    return NextResponse.json({ ok: false, error: 'request_id obrigatório' }, { status: 400 });
  }

  try {
    const sb = await getSupabaseAdmin();

    const { data, error } = await sb
      .from('freebet_queue')
      .select('status, result, error_msg, created_at')
      .eq('id', request_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Requisição não encontrada' }, { status: 404 });
    }

    // Timeout: se ficou pending por mais de 3 minutos sem processamento
    if (data.status === 'pending') {
      const age = Date.now() - new Date(data.created_at).getTime();
      if (age > 3 * 60 * 1000) {
        return NextResponse.json({
          ok: false,
          status: 'timeout',
          error: 'Daemon não respondeu. Verifique se o process-queue.mjs está rodando.',
        }, { status: 504 });
      }
    }

    return NextResponse.json({
      ok: true,
      status:    data.status,
      data:      data.result   ?? undefined,
      error_msg: data.error_msg ?? undefined,
    });
  } catch (e: unknown) {
    console.error('[freebet GET]', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}
