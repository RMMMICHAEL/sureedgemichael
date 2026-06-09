/**
 * POST /api/admin/odds-import
 *
 * Importa o JSON do get-individual-odds (DuploGreen) para a tabela bookmaker_odds.
 * Restrito ao e-mail de administrador — verificado via sessão Supabase.
 *
 * Body: { odds: OddRecord[] }
 * onde OddRecord é o formato exato do get-individual-odds.
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createServerClient }        from '@supabase/ssr';

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

interface OddRecord {
  match_id:       string;
  home_team:      string;
  away_team:      string;
  match_date?:    string;
  start_time?:    string;
  league_slug?:   string;
  league_name?:   string;
  bookmaker_slug: string;
  bookmaker_name?: string;
  market_type?:   string;
  odd_home:       number;
  odd_draw?:      number;
  odd_away:       number;
  match_url?:     string;
  source_url?:    string;
  updated_at?:    string;
}

export async function POST(req: NextRequest) {
  // ── 1. Autenticação ──────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => {
          try {
            cs.forEach(({ name, value, options }) =>
              (cookieStore as unknown as { set: (n: string, v: string, o: unknown) => void }).set(name, value, options)
            );
          } catch { /* server component */ }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ ok: false, error: 'Acesso restrito ao administrador' }, { status: 403 });
  }

  // ── 2. Parse do body ─────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido (JSON esperado)' }, { status: 400 });
  }

  // Aceita tanto { odds: [...] } quanto diretamente o array, ou o formato completo do DG
  let records: OddRecord[] = [];
  if (Array.isArray(body)) {
    records = body as OddRecord[];
  } else {
    const b = body as Record<string, unknown>;
    // Formato DuploGreen: { success, count, odds: [...] }
    if (Array.isArray(b.odds))   records = b.odds as OddRecord[];
    else if (Array.isArray(b.data)) records = b.data as OddRecord[];
  }

  if (!records.length) {
    return NextResponse.json({ ok: false, error: 'Nenhum registro encontrado no JSON' }, { status: 400 });
  }

  // ── 3. Mapear para schema da tabela ──────────────────────────────────────────
  const rows = records.map(r => ({
    match_id:       r.match_id,
    bookmaker_slug: r.bookmaker_slug,
    market_type:    r.market_type ?? '1x2',
    home_team:      r.home_team,
    away_team:      r.away_team,
    match_date:     r.match_date ?? null,
    start_time:     r.start_time ?? null,
    league_slug:    r.league_slug ?? null,
    league_name:    r.league_name ?? null,
    bookmaker_name: r.bookmaker_name ?? null,
    odd_home:       r.odd_home,
    odd_draw:       r.odd_draw ?? null,
    odd_away:       r.odd_away,
    match_url:      r.match_url ?? null,
    source_url:     r.source_url ?? null,
    updated_at:     r.updated_at ?? new Date().toISOString(),
    imported_at:    new Date().toISOString(),
  }));

  // ── 4. Upsert em lotes de 500 ────────────────────────────────────────────────
  const BATCH = 500;
  let totalUpserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from('bookmaker_odds')
      .upsert(batch, {
        onConflict:        'match_id,bookmaker_slug,market_type',
        ignoreDuplicates:  false,
        count:             'exact',
      });

    if (error) {
      console.error(`[odds-import] lote ${i}–${i + BATCH} erro:`, error.message);
      errors.push(`lote ${i}: ${error.message}`);
    } else {
      totalUpserted += count ?? batch.length;
    }
  }

  console.log(`[odds-import] importados ${totalUpserted}/${rows.length} registros`);

  return NextResponse.json({
    ok:      errors.length === 0,
    total:   rows.length,
    upserted: totalUpserted,
    errors:  errors.length > 0 ? errors : undefined,
  });
}
