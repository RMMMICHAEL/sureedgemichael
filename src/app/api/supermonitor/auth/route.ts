/**
 * /api/supermonitor/auth — uso interno apenas
 * Não expõe informações sensíveis ao cliente.
 *
 * GET  — retorna { ok, connected } — sem modo, sem email, sem detalhes
 * POST — força renovação interna do cookie
 */

import { NextResponse } from 'next/server';
import { invalidateCache, getActiveCookie } from '@/lib/supermonitor-auth';

export async function GET() {
  // Resposta mínima — não revela o provedor, credenciais ou modo de auth
  try {
    const cookie = await getActiveCookie();
    return NextResponse.json({ ok: true, connected: !!cookie });
  } catch {
    return NextResponse.json({ ok: true, connected: false });
  }
}

export async function POST() {
  // Rota interna: invalida cache e força re-autenticação
  invalidateCache();
  try {
    const cookie = await getActiveCookie();
    return NextResponse.json({ ok: !!cookie });
  } catch (err: unknown) {
    // Não expõe detalhes do erro ao cliente
    console.error('[auth] refresh failed:', err);
    return NextResponse.json({ ok: false });
  }
}
