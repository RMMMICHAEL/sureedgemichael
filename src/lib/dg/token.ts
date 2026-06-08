/**
 * DuploGreen — token manager (server-side, Vercel)
 *
 * As chamadas reais ao DuploGreen são feitas pelo daemon local (IP residencial).
 * Este módulo apenas persiste/lê a sessão no Supabase e serve o status para o frontend.
 */

export interface DGSession {
  access_token:  string;
  refresh_token: string;
  expires_at:    number; // sempre em ms internamente
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Salva sessão completa no Supabase */
export async function saveDGSession(session: DGSession): Promise<void> {
  const sb = await getSupabaseAdmin();
  const value = JSON.stringify(session);
  const { error } = await sb.from('app_config').upsert(
    { key: 'dg_session', value, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw new Error(`saveDGSession: ${error.message}`);
}

/** Lê sessão do Supabase */
export async function getDGSession(): Promise<DGSession | null> {
  try {
    const sb = await getSupabaseAdmin();
    const { data } = await sb
      .from('app_config')
      .select('value')
      .eq('key', 'dg_session')
      .single();
    if (!data?.value) return null;
    const s = JSON.parse(data.value) as DGSession;
    // Normaliza expires_at para ms
    if (s.expires_at && s.expires_at < 1e12) s.expires_at *= 1000;
    return s;
  } catch {
    return null;
  }
}

/** TTL em segundos (0 = expirado ou sem sessão) */
export async function getDGTokenTTL(): Promise<number> {
  const s = await getDGSession();
  if (!s?.access_token) return 0;
  return Math.max(0, Math.floor((s.expires_at - Date.now()) / 1000));
}

/** Status do poller local (escrito pelo dg-poller.mjs) */
export async function getDGPollerStatus(): Promise<{
  ok: boolean;
  count_all?: number;
  count_opp?: number;
  error?: string;
  at?: string;
} | null> {
  try {
    const sb = await getSupabaseAdmin();
    const { data } = await sb
      .from('app_config')
      .select('value')
      .eq('key', 'dg_poller_status')
      .single();
    if (!data?.value) return null;
    return JSON.parse(data.value);
  } catch {
    return null;
  }
}
