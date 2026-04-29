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

  if (!email) {
    console.error('[cakto-webhook] Missing customer email', { event });
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }

  const plan = detectPlan(payload);

  if (ACTIVATE_EVENTS.has(event)) {
    await upsertSubscriptionByEmail({
      email,
      plan,
      status:         'active',
      cakto_order_id: refId,
      expires_at:     addDays(PLAN_DURATION_DAYS[plan]),
    });
    console.log(`[cakto-webhook] Activated ${plan} for ${email} (event: ${event})`);
    return NextResponse.json({ ok: true });
  }

  if (DEACTIVATE_EVENTS.has(event)) {
    await upsertSubscriptionByEmail({
      email,
      plan,
      status:         'cancelled',
      cakto_order_id: refId,
      expires_at:     null,
    });
    console.log(`[cakto-webhook] Cancelled for ${email} (event: ${event})`);
    return NextResponse.json({ ok: true });
  }

  console.log(`[cakto-webhook] Unhandled event: ${event}`);
  return NextResponse.json({ ok: true, note: 'event not handled' });
}
