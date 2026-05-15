/**
 * /api/supermonitor/search
 * Busca odds de um evento específico no SuperMonitor.
 * POST body: { query: string, cookie?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSession, fetchDecrypted } from '@/lib/supermonitor-crypto';

export async function POST(req: NextRequest) {
  let query = '', cookie = '';
  try {
    const body = await req.json() as { query?: string; cookie?: string };
    query  = body.query  ?? '';
    cookie = body.cookie ?? '';
  } catch (_e) { /* vazio */ }

  if (!query.trim()) {
    return NextResponse.json({ ok: false, error: 'query obrigatório' }, { status: 200 });
  }

  const authCookie = cookie || (process.env.SUPERMONITOR_COOKIE ?? '');

  try {
    const session = await createSession(authCookie || undefined);
    const qs      = `action=search&q=${encodeURIComponent(query)}&type=all`;
    const data    = await fetchDecrypted(session, qs);

    // Retorna raw para o frontend interpretar e também como raw_sample para debug
    return NextResponse.json({ ok: true, data, raw_sample: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
