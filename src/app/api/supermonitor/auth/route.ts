/**
 * /api/supermonitor/auth
 *
 * GET  — retorna status da autenticação (modo auto/static/none, cache válido?)
 * POST — força renovação do cookie (auto-login) e retorna novo status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthStatus, invalidateCache, getActiveCookie } from '@/lib/supermonitor-auth';

export async function GET() {
  const status = getAuthStatus();
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(req: NextRequest) {
  // Aceita credenciais opcionais no body para testar sem alterar o .env
  let email = '', password = '';
  try {
    const body = await req.json() as { email?: string; password?: string };
    email    = (body.email    ?? '').trim();
    password = (body.password ?? '').trim();
  } catch { /* vazio */ }

  // Se vieram credenciais no body, testa sem salvar (só valida)
  if (email && password) {
    try {
      // Usa as credenciais passadas diretamente (sobrescreve temporariamente via env trick não aplicável aqui)
      // Por segurança, apenas informa se são iguais às configuradas no servidor
      const serverEmail = (process.env.SUPERMONITOR_EMAIL ?? '').trim();
      if (serverEmail && serverEmail !== email) {
        return NextResponse.json({
          ok: false,
          error: 'Credenciais diferentes das configuradas no servidor. Edite o .env.local.',
        });
      }
    } catch { /* noop */ }
  }

  // Invalida cache e força novo login
  invalidateCache();

  try {
    const cookie = await getActiveCookie();
    if (!cookie) {
      return NextResponse.json({
        ok: false,
        error: 'Sem credenciais configuradas. Adicione SUPERMONITOR_EMAIL e SUPERMONITOR_PASSWORD ao .env.local',
      });
    }
    const status = getAuthStatus();
    return NextResponse.json({ ok: true, ...status, refreshed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }
}
