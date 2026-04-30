/**
 * GET /api/subscription
 *
 * Server-side subscription check — bypasses RLS using service_role_key.
 * Handles two scenarios:
 *   1. Subscription created after account (user_id already set) — fast path
 *   2. Payment made before account creation (user_id = null) — email fallback
 *      Auto-links user_id on first match so future calls hit the fast path.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import {
  getAdminClient,
  isAdminEmail,
  type Subscription,
} from '@/lib/supabase/subscription';

export async function GET() {
  try {
    const cookieStore = await cookies();

    // Identify the current user from their session cookie
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json(null);

    // Admin bypass — never needs a subscription record
    if (isAdminEmail(user.email)) {
      const now = new Date().toISOString();
      return NextResponse.json({
        id: 'admin',
        user_id: user.id,
        email: user.email!,
        plan: 'annual',
        status: 'active',
        cakto_order_id: null,
        expires_at: null,
        created_at: now,
        updated_at: now,
      } satisfies Subscription);
    }

    // Use admin client to bypass RLS
    const admin = getAdminClient();

    // 1. Fast path: look up by user_id (already linked)
    const { data: byId } = await admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (byId) {
      return NextResponse.json(maybeExpire(byId as Subscription));
    }

    // 2. Fallback: look up by email (payment before account creation)
    if (!user.email) return NextResponse.json(null);

    const { data: byEmail } = await admin
      .from('subscriptions')
      .select('*')
      .eq('email', user.email.toLowerCase())
      .single();

    if (!byEmail) return NextResponse.json(null);

    const sub = byEmail as Subscription;

    // Auto-link user_id so future calls skip this fallback
    if (!sub.user_id) {
      await admin
        .from('subscriptions')
        .update({ user_id: user.id, updated_at: new Date().toISOString() })
        .eq('id', sub.id);
    }

    return NextResponse.json(maybeExpire(sub));
  } catch (e) {
    console.error('[api/subscription] Error:', e);
    return NextResponse.json(null);
  }
}

function maybeExpire(sub: Subscription): Subscription {
  if (sub.expires_at && new Date(sub.expires_at) < new Date() && sub.status === 'active') {
    return { ...sub, status: 'expired' };
  }
  return sub;
}
