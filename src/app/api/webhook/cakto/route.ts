/**
 * POST /api/webhook/cakto
 *
 * Receives payment events from Cakto and updates subscription records.
 *
 * Proteções implementadas:
 *   1. Logging de todos os eventos em webhook_events (auditoria completa)
 *   2. Período de graça: não cancela se subscription foi ativada nos últimos 15 min
 *   3. Validação de secret obrigatória (falha segura se env var não configurada)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  upsertSubscriptionByEmail,
  getAdminClient,
  PLAN_DURATION_DAYS,
  type PlanId,
} from '@/lib/supabase/subscription';

// ── Cakto event names ─────────────────────────────────────────────────────────

const ACTIVATE_EVENTS = new Set([
  'purchase_approved',
  'subscription_created',
  'subscription_renewed',
]);

const DEACTIVATE_EVENTS = new Set([
  'refund',
  'subscription_canceled',
  'chargeback',
]);

// ── Payload structure ─────────────────────────────────────────────────────────

interface CaktoPayload {
  event:  string;
  secret: string;
  data: {
    refId?:    string;
    checkout?: number;
    customer: {
      email:      string;
      name?:      string;
      phone?:     string;
      docNumber?: string;
      docType?:   string;
    };
    offer?: {
      id?:   string;
      name?: string;
    };
    product?: {
      id?:   string;
      name?: string;
    };
    amount?:        number;
    baseAmount?:    number;
    fees?:          number;
    status?:        string;
    paymentMethod?: string;
    createdAt?:     string;
    paidAt?:        string;
    sentAt?:        string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectPlan(payload: CaktoPayload): PlanId {
  const productId = payload.data?.product?.id ?? '';
  const offerName = (payload.data?.offer?.name ?? payload.data?.product?.name ?? '').toLowerCase();

  if (productId === process.env.CAKTO_PRODUCT_ID_ANNUAL    || offerName.includes('anual'))    return 'annual';
  if (productId === process.env.CAKTO_PRODUCT_ID_QUARTERLY || offerName.includes('trimest')) return 'quarterly';
  if (productId === process.env.CAKTO_PRODUCT_ID_MONTHLY)                                     return 'monthly';
  return 'monthly';
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Log de eventos (auditoria) ────────────────────────────────────────────────
// Falha silenciosamente — logging nunca deve derrubar o webhook principal.
async function logWebhookEvent(
  event: string,
  email: string | null,
  refId: string | null,
  payload: unknown,
  note?: string,
): Promise<void> {
  try {
    const admin = getAdminClient();
    await admin.from('webhook_events').insert({
      provider:  'cakto',
      event,
      email:     email?.toLowerCase() ?? null,
      ref_id:    refId ?? null,
      payload:   payload as Record<string, unknown>,
      processed: true,
      note:      note ?? null,
    });
  } catch {
    // Silencioso: tabela pode não existir ainda; não bloqueia o webhook
  }
}

// ── Período de graça anti-cancelamento imediato ───────────────────────────────
// Cakto às vezes dispara subscription_canceled ou refund segundos após
// purchase_approved (bug deles em PIX/checkout duplicado). Essa proteção
// impede o cancelamento se a subscription foi ativada nos últimos 15 minutos.
const GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutos

async function isInGracePeriod(email: string): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from('subscriptions')
      .select('status, updated_at')
      .eq('email', email.toLowerCase())
      .single();

    if (!data || data.status !== 'active') return false;

    const updatedMs = new Date(data.updated_at).getTime();
    const ageMs     = Date.now() - updatedMs;
    return ageMs < GRACE_PERIOD_MS;
  } catch {
    return false; // em caso de erro, não bloqueia o cancelamento
  }
}

// ── Magic link para novos clientes ───────────────────────────────────────────
async function sendAccessEmail(email: string, name?: string): Promise<void> {
  try {
    const admin      = getAdminClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.sureedge.com.br'}/login`;

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: name ?? '' },
    });

    if (error) {
      if (error.message.includes('already') || error.message.includes('registered')) {
        console.log(`[cakto-webhook] User already exists, skipping invite: ${email.slice(0, 4)}…`);
        return;
      }
      console.error(`[cakto-webhook] inviteUserByEmail error for ${email.slice(0, 4)}…: ${error.message}`);
    } else {
      console.log(`[cakto-webhook] Invite sent to ${email.slice(0, 4)}…`);
    }
  } catch (err) {
    console.error('[cakto-webhook] sendAccessEmail unexpected error:', err);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let payload: CaktoPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validação do secret — falha segura se env var não configurada
  const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[cakto-webhook] CAKTO_WEBHOOK_SECRET não configurado — bloqueando todos os eventos');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  if (payload.secret !== expectedSecret) {
    console.error('[cakto-webhook] Secret inválido');
    // Loga tentativa inválida para auditoria
    await logWebhookEvent(
      payload.event ?? 'unknown',
      payload.data?.customer?.email ?? null,
      payload.data?.refId ?? null,
      payload,
      'BLOCKED: invalid secret',
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = payload.event;
  const email = payload.data?.customer?.email;
  const refId = payload.data?.refId ?? null;

  console.log('[cakto-webhook] Received:', JSON.stringify({
    event,
    refId,
    offer:   payload.data?.offer?.id,
    product: payload.data?.product?.id,
  }));

  if (!email) {
    console.error('[cakto-webhook] Missing customer email', { event });
    await logWebhookEvent(event, null, refId, payload, 'ERROR: missing email');
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }

  const plan = detectPlan(payload);

  // ── Ativação ──────────────────────────────────────────────────────────────
  if (ACTIVATE_EVENTS.has(event)) {
    try {
      await upsertSubscriptionByEmail({
        email,
        plan,
        status:         'active',
        cakto_order_id: refId ?? undefined,
        expires_at:     addDays(PLAN_DURATION_DAYS[plan]),
      });
      console.log(`[cakto-webhook] Activated ${plan} for ${email.slice(0,4)}… (event: ${event})`);

      await logWebhookEvent(event, email, refId, payload, `activated:${plan}`);

      if (event === 'purchase_approved' || event === 'subscription_created') {
        const name = payload.data?.customer?.name ?? '';
        sendAccessEmail(email, name).catch(e => console.error('[webhook] email bg error:', e));
      }

      return NextResponse.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cakto-webhook] FAILED to activate ${email.slice(0,4)}…: ${msg}`);
      await logWebhookEvent(event, email, refId, payload, `ERROR: ${msg}`);
      return NextResponse.json({ error: 'Subscription activation failed' }, { status: 500 });
    }
  }

  // ── Cancelamento ──────────────────────────────────────────────────────────
  if (DEACTIVATE_EVENTS.has(event)) {
    // Período de graça: protege contra cancelamento imediato após compra (bug Cakto)
    const grace = await isInGracePeriod(email);
    if (grace) {
      const msg = `SKIPPED: grace period ativo — subscription ativada há menos de 15 min`;
      console.warn(`[cakto-webhook] ${msg} | email: ${email.slice(0,4)}… | event: ${event}`);
      await logWebhookEvent(event, email, refId, payload, msg);
      // Retorna 200 para Cakto não retentar
      return NextResponse.json({ ok: true, note: 'grace period — cancellation skipped' });
    }

    try {
      await upsertSubscriptionByEmail({
        email,
        plan,
        status:         'cancelled',
        cakto_order_id: refId ?? undefined,
        expires_at:     null,
      });
      console.log(`[cakto-webhook] Cancelled for ${email.slice(0,4)}… (event: ${event})`);
      await logWebhookEvent(event, email, refId, payload, 'cancelled');
      return NextResponse.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cakto-webhook] FAILED to cancel ${email.slice(0,4)}…: ${msg}`);
      await logWebhookEvent(event, email, refId, payload, `ERROR: ${msg}`);
      return NextResponse.json({ error: 'Subscription update failed' }, { status: 500 });
    }
  }

  console.log(`[cakto-webhook] Unhandled event: ${event}`);
  await logWebhookEvent(event, email, refId, payload, 'unhandled event');
  return NextResponse.json({ ok: true, note: 'event not handled' });
}
