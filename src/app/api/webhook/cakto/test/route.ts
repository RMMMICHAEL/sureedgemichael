/**
 * POST /api/webhook/cakto/test
 * Simula um purchase_approved para testar se o webhook está funcionando.
 * Protegido por CAKTO_WEBHOOK_SECRET no header Authorization (Bearer <secret>).
 *
 * Uso:
 *   curl -X POST https://suredge.app/api/webhook/cakto/test \
 *     -H "Authorization: Bearer SEU_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"email": "teste@email.com"}'
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsertSubscriptionByEmail, PLAN_DURATION_DAYS } from '@/lib/supabase/subscription';

export async function POST(req: NextRequest) {
  if (!process.env.CAKTO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'CAKTO_WEBHOOK_SECRET não configurado na Vercel' }, { status: 500 });
  }

  // Secret no header Authorization: Bearer <secret>
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!secret || secret !== process.env.CAKTO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  let email: string | undefined;
  try {
    const body = await req.json() as { email?: string };
    email = body.email;
  } catch {
    return NextResponse.json({ error: 'Corpo JSON inválido' }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: 'Campo email obrigatório no body' }, { status: 400 });
  }

  const days = PLAN_DURATION_DAYS['monthly'];
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  await upsertSubscriptionByEmail({
    email,
    plan:       'monthly',
    status:     'active',
    expires_at: expiresAt.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    message: `Assinatura ativada para ${email}`,
    expires_at: expiresAt.toISOString(),
  });
}

// Bloqueia GET para evitar acesso acidental via browser/logs de crawler
export async function GET() {
  return NextResponse.json({ error: 'Método não permitido' }, { status: 405 });
}
