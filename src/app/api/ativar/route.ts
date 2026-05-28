/**
 * POST /api/ativar
 * Verifica se existe uma assinatura ativa para o email informado
 * (independente do user_id). Retorna o status da assinatura.
 * Não ativa nada — apenas consulta. A ativação vem do webhook.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/subscription';

// Rate limiting: 10 tentativas por IP por 5 minutos
const _rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_MAX;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { found: false, message: 'Muitas tentativas. Aguarde alguns minutos.' },
      { status: 429, headers: { 'Retry-After': '300' } }
    );
  }

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
      found:   true,
      active:  isActive,
      message: isActive
        ? 'Compra confirmada! Faça login com este email para acessar.'
        : 'Assinatura encontrada mas ainda não está ativa. Entre em contato com o suporte.',
    });
  } catch (e) {
    console.error('[api/ativar]', e);
    return NextResponse.json({ found: false, message: 'Erro interno. Tente novamente.' });
  }
}
