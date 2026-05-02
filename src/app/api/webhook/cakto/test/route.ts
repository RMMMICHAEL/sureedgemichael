/**
 * GET /api/webhook/cakto/test
 * Simula um purchase_approved para testar se o webhook está funcionando.
 * Protegido por CAKTO_WEBHOOK_SECRET como query param.
 *
 * Uso: GET /api/webhook/cakto/test?secret=SEU_SECRET&email=teste@email.com
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsertSubscriptionByEmail, PLAN_DURATION_DAYS } from '@/lib/supabase/subscription';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  const email  = searchParams.get('email');

  if (!process.env.CAKTO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'CAKTO_WEBHOOK_SECRET não configurado na Vercel' }, { status: 500 });
  }

  if (secret !== process.env.CAKTO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: 'Parâmetro email obrigatório' }, { status: 400 });
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
