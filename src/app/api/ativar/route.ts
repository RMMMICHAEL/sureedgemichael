/**
 * POST /api/ativar
 * Verifica se existe uma assinatura ativa para o email informado
 * (independente do user_id). Retorna o status da assinatura.
 * Não ativa nada — apenas consulta. A ativação vem do webhook.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/subscription';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json() as { email?: string };
    if (!email) return NextResponse.json({ found: false, message: 'Email obrigatório' });

    const admin = getAdminClient();
    const { data } = await admin
      .from('subscriptions')
      .select('status, plan, expires_at, user_id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (!data) {
      return NextResponse.json({
        found: false,
        message: 'Nenhuma compra encontrada para este email. Verifique se usou o mesmo email do pagamento.',
      });
    }

    const isActive = data.status === 'active' &&
      (!data.expires_at || new Date(data.expires_at) > new Date());

    return NextResponse.json({
      found:     true,
      active:    isActive,
      status:    data.status,
      plan:      data.plan,
      linked:    !!data.user_id,
      message:   isActive
        ? 'Compra confirmada! Faça login com este email para acessar.'
        : `Assinatura encontrada mas com status "${data.status}". Entre em contato com o suporte.`,
    });
  } catch (e) {
    console.error('[api/ativar]', e);
    return NextResponse.json({ found: false, message: 'Erro interno. Tente novamente.' });
  }
}
