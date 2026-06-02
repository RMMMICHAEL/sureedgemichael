/**
 * subscription.ts
 * Utilities to read and write subscription records.
 *
 * Table: public.subscriptions
 * Required SQL (run once in Supabase SQL editor):
 *
 *   CREATE TABLE public.subscriptions (
 *     id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 *     email           TEXT NOT NULL,
 *     plan            TEXT NOT NULL,
 *     status          TEXT NOT NULL DEFAULT 'pending',
 *     cakto_order_id  TEXT,
 *     expires_at      TIMESTAMPTZ,
 *     created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
 *     updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
 *     UNIQUE (email)
 *   );
 *   ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "Users read own" ON public.subscriptions
 *     FOR SELECT USING (auth.uid() = user_id);
 */

import { getSupabaseClient } from './client';
import { createClient } from '@supabase/supabase-js';

export type PlanId = 'monthly' | 'quarterly' | 'annual';
export type SubStatus = 'active' | 'pending' | 'expired' | 'cancelled';

export interface Subscription {
  id: string;
  user_id: string | null;
  email: string;
  plan: PlanId;
  status: SubStatus;
  cakto_order_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Plan durations ────────────────────────────────────────────────────────────

export const PLAN_DURATION_DAYS: Record<PlanId, number> = {
  monthly:   30,
  quarterly: 90,
  annual:    365,
};

export const PLAN_LABELS: Record<PlanId, string> = {
  monthly:   'Mensal',
  quarterly: 'Trimestral',
  annual:    'Anual',
};

export const PLAN_PRICES: Record<PlanId, number> = {
  monthly:    97,
  quarterly: 247,
  annual:    797,
};

// ── Admin bypass ──────────────────────────────────────────────────────────────

export const ADMIN_EMAILS = [
  'michael.martins.trader@gmail.com',
  'rmmichael20@gmail.com',
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

// ── Read (client-side, uses anon key + RLS) ───────────────────────────────────

export async function getMySubscription(): Promise<Subscription | null> {
  try {
    // Delegates to the server-side API route which uses the service_role_key
    // to bypass RLS — handles both user_id lookup and email fallback correctly.
    const res = await fetch('/api/subscription', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Subscription | null;
  } catch {
    return null;
  }
}

export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return sub.status === 'active';
}

// ── Write (server-side webhook, uses service role key) ────────────────────────

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface UpsertSubscriptionPayload {
  email: string;
  plan: PlanId;
  status: SubStatus;
  cakto_order_id?: string;
  expires_at?: string | null;
}

export async function upsertSubscriptionByEmail(payload: UpsertSubscriptionPayload): Promise<void> {
  const admin = getAdminClient();
  const now   = new Date().toISOString();

  // user_id is intentionally omitted here so renewals never overwrite an
  // already-linked user_id. The auto-link happens in /api/subscription on
  // the user's first login (email fallback path).
  const { error } = await admin
    .from('subscriptions')
    .upsert(
      {
        email:          payload.email.toLowerCase(),
        plan:           payload.plan,
        status:         payload.status,
        cakto_order_id: payload.cakto_order_id ?? null,
        expires_at:     payload.expires_at ?? null,
        updated_at:     now,
      },
      { onConflict: 'email' },
    );

  if (error) {
    // Throw so the webhook returns 500 and Cakto retries automatically
    throw new Error(`upsertSubscriptionByEmail failed: ${error.message} (code: ${error.code})`);
  }
}
