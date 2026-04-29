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
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Admin users always bypass subscription check
    if (isAdminEmail(user.email)) {
      return {
        id: 'admin',
        user_id: user.id,
        email: user.email!,
        plan: 'annual',
        status: 'active',
        cakto_order_id: null,
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error || !data) return null;

    // Auto-expire if past expires_at
    const sub = data as Subscription;
    if (sub.expires_at && new Date(sub.expires_at) < new Date() && sub.status === 'active') {
      return { ...sub, status: 'expired' };
    }
    return sub;
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

  // Look up user_id by email
  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = listData?.users?.find(u => u.email?.toLowerCase() === payload.email.toLowerCase());

  const now = new Date().toISOString();

  await admin
    .from('subscriptions')
    .upsert(
      {
        user_id:        user?.id ?? null,
        email:          payload.email.toLowerCase(),
        plan:           payload.plan,
        status:         payload.status,
        cakto_order_id: payload.cakto_order_id ?? null,
        expires_at:     payload.expires_at ?? null,
        updated_at:     now,
      },
      { onConflict: 'email' },
    );
}
