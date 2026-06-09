/**
 * POST /api/admin/odds-import
 *
 * Importa o JSON do get-individual-odds (DuploGreen) para a tabela bookmaker_odds.
 * Restrito ao e-mail de administrador — verificado via sessão Supabase.
 *
 * Estratégia de atualização:
 *   Para cada lote de match_ids, apaga os registros do mesmo market_type
 *   e reinsere com os valores novos — garante que odds desatualizadas sejam
 *   sobrescritas mesmo que o upsert não detecte mudança.
 *
 * Body aceito:
 *   - Formato DG completo: { success, count, odds: [...] }
 *   - Só o array:          [...]
 *   - Com chave data:      { data: [...] }
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse }    from 'next/server';
import { cookies }                      from 'next/headers';
import { createSupabaseServerClient }   from '@/lib/supabase/server';

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

interface OddRecord {
  match_id:        string;
  home_team:       string;
  away_team:       string;
  match_date?:     string;
  start_time?:     string;
  league_slug?:    string;
  league_name?:    string;
  bookmaker_slug:  string;
  bookmaker_name?: string;
  market_type?:    string;
  odd_home:        number;
  odd_draw?:       number;
  odd_away:        number;
  match_url?:      string;
  source_url?:     string;
  updated_at?:     string;
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(req: NextRequest) {
  // ── 1. Autenticação ───────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ ok: false, error: 'Acesso restrito ao administrador' }, { status: 403 });
  }

  // ── 2. Parse do body ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido (JSON esperado)' }, { status: 400 });
  }

  let records: OddRecord[] = [];
  if (Array.isArray(body)) {
    records = body as OddRecord[];
  } else {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.odds))        records = b.odds as OddRecord[];
    else if (Array.isArray(b.data))   records = b.data as OddRecord[];
  }

  if (!records.length) {
    return NextResponse.json({ ok: false, error: 'Nenhum registro encontrado no JSON' }, { status: 400 });
  }

  // ── 3. Mapear para schema ─────────────────────────────────────────────────
  const now = new Date().toISOString();
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
    updated_at:     now,   // sempre agora — indica quando foi atualizado
    imported_at:    now,
  }));

  // ── 4. Delete → Insert por lote (garante atualização real das odds) ───────
  // Agrupa por market_type para deletar apenas o tipo que está sendo reimportado
  const byMarketType = new Map<string, typeof rows>();
  for (const row of rows) {
    const mt = row.market_type;
    if (!byMarketType.has(mt)) byMarketType.set(mt, []);
    byMarketType.get(mt)!.push(row);
  }

  const admin  = await getSupabaseAdmin();
  const BATCH  = 500;
  let   totalInserted = 0;
  const errors: string[] = [];

  for (const [marketType, mtRows] of byMarketType) {
    // Coleta todos os match_ids deste market_type
    const matchIds = [...new Set(mtRows.map(r => r.match_id))];

    // Apaga em lotes de 500 match_ids para evitar query muito longa
    for (let i = 0; i < matchIds.length; i += BATCH) {
      const idBatch = matchIds.slice(i, i + BATCH);
      const { error: delErr } = await admin
        .from('bookmaker_odds')
        .delete()
        .in('match_id', idBatch)
        .eq('market_type', marketType);

      if (delErr) {
        console.error(`[odds-import] erro ao deletar lote ${i} (${marketType}):`, delErr.message);
        errors.push(`delete lote ${i} (${marketType}): ${delErr.message}`);
      }
    }

    // Reinsere em lotes de 500 registros
    for (let i = 0; i < mtRows.length; i += BATCH) {
      const batch = mtRows.slice(i, i + BATCH);
      const { error: insErr, count } = await admin
        .from('bookmaker_odds')
        .insert(batch, { count: 'exact' });

      if (insErr) {
        console.error(`[odds-import] erro ao inserir lote ${i} (${marketType}):`, insErr.message);
        errors.push(`insert lote ${i} (${marketType}): ${insErr.message}`);
      } else {
        totalInserted += count ?? batch.length;
      }
    }
  }

  console.log(`[odds-import] ${totalInserted}/${rows.length} registros atualizados por ${user.email}`);

  return NextResponse.json({
    ok:       errors.length === 0,
    total:    rows.length,
    inserted: totalInserted,
    errors:   errors.length > 0 ? errors : undefined,
  });
}
