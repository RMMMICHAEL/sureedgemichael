/**
 * POST /api/webhook/cakto
 *
 * Receives payment events from Cakto and updates subscription records.
 *
 * Required env vars:
 *   CAKTO_WEBHOOK_SECRET      — the "secret" value from the Cakto webhook config
 *                               (shown in fields.secret after webhook creation)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (never expose to client)
 *   CAKTO_OFFER_ID_ANNUAL     — Cakto offer ID for the annual plan
 *   CAKTO_OFFER_ID_QUARTERLY  — Cakto offer ID for the quarterly plan
 *
 * Register the webhook in the Cakto dashboard pointing to:
 *   https://yourdomain.vercel.app/api/webhook/cakto
 *
 * Subscribe to events:
 *   purchase_approved, subscription_created, subscription_renewed,
 *   refund, subscription_canceled, chargeback
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  upsertSubscriptionByEmail,
  getAdminClient,
  PLAN_DURATION_DAYS,
  type PlanId,
} from '@/lib/supabase/subscription';

// ── Cakto event names (custom_id from API docs) ───────────────────────────────

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

// ── Payload structure (per official Cakto API docs) ───────────────────────────

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

  if (productId === process.env.CAKTO_PRODUCT_ID_ANNUAL   || offerName.includes('anual'))    return 'annual';
  if (productId === process.env.CAKTO_PRODUCT_ID_QUARTERLY || offerName.includes('trimest')) return 'quarterly';
  if (productId === process.env.CAKTO_PRODUCT_ID_MONTHLY)                                    return 'monthly';
  return 'monthly';
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Envia Magic Link de acesso ao novo cliente ────────────────────────────────
// Usa inviteUserByEmail: cria a conta (se não existir) e envia e-mail com
// link mágico que loga o usuário direto no app — sem senha necessária.
// Para clientes que já têm conta (renovações), cai no catch silenciosamente.
async function sendAccessEmail(email: string, name?: string): Promise<void> {
  try {
    const admin = getAdminClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.sureedge.com.br'}/login`;

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: name ?? '' },
    });

    if (error) {
      // Usuário já existe (conta criada anteriormente) — não é erro crítico.
      // O acesso já foi ativado pela subscription. Ele pode logar normalmente.
      if (error.message.includes('already') || error.message.includes('registered')) {
        console.log(`[cakto-webhook] User already exists, skipping invite: ${email.slice(0, 4)}…`);
        return;
      }
      // Qualquer outro erro: loga mas não retorna 500 (subscription já foi ativada)
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

  // Cakto includes the webhook secret in every payload body for verification
  if (payload.secret !== process.env.CAKTO_WEBHOOK_SECRET) {
    console.error('[cakto-webhook] Invalid secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = payload.event;
  const email = payload.data?.customer?.email;
  const refId = payload.data?.refId;

  // Log mínimo — não loga email nem dados do cliente (LGPD)
  console.log('[cakto-webhook] Received:', JSON.stringify({ event, refId, offer: payload.data?.offer?.id, product: payload.data?.product?.id }));

  if (!email) {
    console.error('[cakto-webhook] Missing customer email', { event });
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }

  const plan = detectPlan(payload);

  if (ACTIVATE_EVENTS.has(event)) {
    try {
      await upsertSubscriptionByEmail({
        email,
        plan,
        status:         'active',
        cakto_order_id: refId,
        expires_at:     addDays(PLAN_DURATION_DAYS[plan]),
      });
      console.log(`[cakto-webhook] Activated ${plan} for ${email} (event: ${event})`);

      // Envia Magic Link + WhatsApp em paralelo (fire-and-forget, não bloqueia)
      if (event === 'purchase_approved' || event === 'subscription_created') {
        const name  = payload.data?.customer?.name ?? '';
        sendAccessEmail(email, name).catch(e => console.error('[webhook] email bg error:', e));
      }

      return NextResponse.json({ ok: true });
    } catch (err: unknown) {
      // Return 500 so Cakto retries the webhook automatically
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cakto-webhook] FAILED to activate ${email}: ${msg}`);
      return NextResponse.json({ error: 'Subscription activation failed' }, { status: 500 });
    }
  }

  if (DEACTIVATE_EVENTS.has(event)) {
    try {
      await upsertSubscriptionByEmail({
        email,
        plan,
        status:         'cancelled',
        cakto_order_id: refId,
        expires_at:     null,
      });
      console.log(`[cakto-webhook] Cancelled for ${email} (event: ${event})`);
      return NextResponse.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cakto-webhook] FAILED to cancel ${email}: ${msg}`);
      return NextResponse.json({ error: 'Subscription update failed' }, { status: 500 });
    }
  }

  console.log(`[cakto-webhook] Unhandled event: ${event}`);
  return NextResponse.json({ ok: true, note: 'event not handled' });
}
