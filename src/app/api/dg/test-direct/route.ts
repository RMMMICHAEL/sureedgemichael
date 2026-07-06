export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 25;

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const SB_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? '';
const DG_ANON    = process.env.DG_ANON_KEY                 ?? '';
const DG_EMAIL   = process.env.DG_EMAIL                    ?? '';
const DG_PASSWORD = process.env.DG_PASSWORD                ?? '';

async function sbGet(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${key}&select=value`, {
      headers: { 'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}` },
    });
    const rows = await res.json() as { value: string }[];
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function sbSet(key: string, value: string) {
  await fetch(`${SB_URL}/rest/v1/app_settings`, {
    method: 'POST',
    headers: {
      'apikey': SB_SVC_KEY, 'Authorization': `Bearer ${SB_SVC_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
}

async function getFreshToken(): Promise<string> {
  const jwt = await sbGet('dg_access_token');
  if (jwt) {
    try {
      const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
      if (p.exp * 1000 > Date.now() + 60_000) return jwt;
    } catch { /* login */ }
  }
  const res = await fetch('https://db.duplogreenengine.com/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': DG_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DG_EMAIL, password: DG_PASSWORD }),
  });
  const data = await res.json() as { access_token?: string; refresh_token?: string };
  if (data.access_token) {
    await Promise.all([
      sbSet('dg_access_token',  data.access_token),
      sbSet('dg_refresh_token', data.refresh_token ?? ''),
    ]);
    return data.access_token;
  }
  throw new Error('Login DG falhou');
}

const HEADERS_BASE = {
  'Origin':  'https://www.duplogreenengine.com',
  'Referer': 'https://www.duplogreenengine.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

async function probe(url: string, token: string): Promise<{ url: string; status: number; ok: boolean; rows?: number; snippet?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { ...HEADERS_BASE, 'Authorization': `Bearer ${token}`, 'apikey': DG_ANON },
    });
    clearTimeout(t);
    let rows: number | undefined;
    let snippet: string | undefined;
    try {
      const text = await res.text();
      snippet = text.slice(0, 120);
      const json = JSON.parse(text);
      rows = Array.isArray(json) ? json.length : (json?.data?.length ?? json?.odds?.length ?? undefined);
    } catch { /* ignora */ }
    return { url, status: res.status, ok: res.ok, rows, snippet };
  } catch (e) {
    return { url, status: 0, ok: false, snippet: (e as Error).message };
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const token = await getFreshToken();

  const BASE = 'https://api.duplogreenengine.com/functions/v1';
  const targets = [
    `${BASE}/get-individual-odds?market=1x2`,
    `${BASE}/get-individual-odds?market=1x2_pa`,
    `${BASE}/get-dg-opportunities-v2?pa_mode=both&sort_by=profit`,
    `${BASE}/get-dg-opportunities`,
  ];

  const results = await Promise.all(targets.map(u => probe(u, token)));

  return NextResponse.json({ ok: true, results });
}
