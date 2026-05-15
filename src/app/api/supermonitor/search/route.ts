/**
 * /api/supermonitor/search
 * Busca odds de um evento específico no SuperMonitor.
 * POST body: { query: string, cookie?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSession, fetchDecrypted } from '@/lib/supermonitor-crypto';
import { getActiveCookie, invalidateCache } from '@/lib/supermonitor-auth';

async function doSearch(cookie: string, query: string) {
  const session = await createSession(cookie || undefined);
  const qs      = `action=search&q=${encodeURIComponent(query)}&type=all`;
  return fetchDecrypted(session, qs);
}

export async function POST(req: NextRequest) {
  let query = '', clientCookie = '';
  try {
    const body = await req.json() as { query?: string; cookie?: string };
    query        = body.query  ?? '';
    clientCookie = body.cookie ?? '';
  } catch (_e) { /* vazio */ }

  if (!query.trim()) {
    return NextResponse.json({ ok: false, error: 'query obrigatório' }, { status: 200 });
  }

  try {
    const cookie = await getActiveCookie(clientCookie);
    const data   = await doSearch(cookie, query);
    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // 401 = cookie expirado → invalida cache e retenta com login fresco
    if (msg.includes('401') || msg.includes('inválido') || msg.includes('expirado')) {
      invalidateCache();
      try {
        const freshCookie = await getActiveCookie(clientCookie);
        const data = await doSearch(freshCookie, query);
        return NextResponse.json({ ok: true, data });
      } catch (err2: unknown) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        return NextResponse.json({ ok: false, error: msg2 }, { status: 200 });
      }
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
