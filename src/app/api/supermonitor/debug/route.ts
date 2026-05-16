/**
 * GET /api/supermonitor/debug
 * Diagnóstico completo da cadeia: Supabase → cookie → ECDH → eventos
 * Requer autenticação (middleware protege esta rota).
 * REMOVER após diagnóstico.
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSession } from '@/lib/supermonitor-crypto';

const BASE = 'https://painel.supermonitor.pro';

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET() {
  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // ── 1. Variáveis de ambiente ──────────────────────────────────────────────
  const sbUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const sbAnonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const staticCookie = process.env.SUPERMONITOR_COOKIE ?? '';

  report.env = {
    NEXT_PUBLIC_SUPABASE_URL:    sbUrl ? `${sbUrl.slice(0, 30)}…` : 'NÃO DEFINIDO',
    SUPABASE_SERVICE_ROLE_KEY:   sbServiceKey ? `set (${sbServiceKey.length} chars)` : 'NÃO DEFINIDO',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: sbAnonKey ? `set (${sbAnonKey.length} chars)` : 'NÃO DEFINIDO',
    SUPERMONITOR_COOKIE:         staticCookie ? `set (${staticCookie.length} chars)` : 'não definido',
    using_key:                   sbServiceKey ? 'SERVICE_ROLE' : 'ANON (fallback)',
  };

  // ── 2. Leitura do Supabase ────────────────────────────────────────────────
  let cookieFromSb: string | null = null;
  try {
    if (!sbUrl || (!sbServiceKey && !sbAnonKey)) {
      report.supabase = { ok: false, error: 'URL ou chave Supabase não configurados' };
    } else {
      const sb = await getSupabaseAdmin();
      const { data, error, status } = await sb
        .from('app_config')
        .select('value, updated_at, key')
        .eq('key', 'supermonitor_cookie')
        .single();

      if (error) {
        report.supabase = { ok: false, status, error: error.message, code: error.code, hint: error.hint };
      } else if (!data) {
        report.supabase = { ok: false, error: 'Nenhuma linha encontrada — chave supermonitor_cookie não existe' };
      } else {
        const age = Date.now() - new Date(data.updated_at as string).getTime();
        const ageH = (age / 3_600_000).toFixed(1);
        cookieFromSb = data.value as string;
        const expired = age > 20 * 24 * 60 * 60 * 1000;
        report.supabase = {
          ok:          true,
          key:         data.key,
          cookie_len:  (data.value as string)?.length,
          cookie_preview: (data.value as string)?.slice(0, 20) + '…',
          updated_at:  data.updated_at,
          age_hours:   ageH,
          expired,
        };
        if (expired) cookieFromSb = null;
      }
    }
  } catch (err: unknown) {
    report.supabase = { ok: false, error: String(err) };
  }

  // ── 3. Qual cookie está sendo usado ──────────────────────────────────────
  const activeCookie = cookieFromSb || staticCookie || null;
  report.active_cookie = activeCookie
    ? { source: cookieFromSb ? 'supabase' : 'env_static', preview: activeCookie.slice(0, 24) + '…' }
    : { source: null, error: 'Nenhum cookie disponível → auth/no-cookie' };

  if (!activeCookie) {
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  }

  // ── 4. Validação rápida do cookie (events_lite) ───────────────────────────
  try {
    const res = await fetch(`${BASE}/ajax.php?action=events_lite`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cookie':     activeCookie,
        'Accept':     'application/json',
        'Referer':    `${BASE}/`,
      },
    });
    const txt = await res.text();
    const isLoginPage = txt.includes('<title>Login') || txt.includes('name="senha"');
    report.cookie_valid = {
      status:       res.status,
      is_login_page: isLoginPage,
      body_preview:  txt.slice(0, 120),
      ok:            res.status === 200 && !isLoginPage,
    };
  } catch (err: unknown) {
    report.cookie_valid = { ok: false, error: String(err) };
  }

  // ── 5. ECDH Handshake ────────────────────────────────────────────────────
  try {
    const t0 = Date.now();
    const session = await createSession(activeCookie);
    report.ecdh = { ok: true, ms: Date.now() - t0, aes_key: '(ok)' };

    // ── 6. Fetch de eventos ───────────────────────────────────────────────
    try {
      const { fetchDecrypted } = await import('@/lib/supermonitor-crypto');
      const t1     = Date.now();
      const today  = new Date().toISOString().slice(0, 10);
      const parsed = await fetchDecrypted(session, `action=events_lite&date=${today}`) as
        { events?: unknown[] } | unknown[];
      const rawEvents: unknown[] = Array.isArray(parsed) ? parsed : ((parsed as { events?: unknown[] }).events ?? []);
      report.events = {
        ok:    true,
        count: rawEvents.length,
        ms:    Date.now() - t1,
        first: rawEvents[0] ?? null,
      };
    } catch (err: unknown) {
      report.events = { ok: false, error: String(err) };
    }
  } catch (err: unknown) {
    report.ecdh   = { ok: false, error: String(err) };
    report.events = { ok: false, error: 'ECDH falhou, não tentou' };
  }

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
