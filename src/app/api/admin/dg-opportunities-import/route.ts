/**
 * POST /api/admin/dg-opportunities-import
 *
 * Importa o JSON de oportunidades DuploGreen (formato opportunities/legs)
 * para a tabela dg_opportunities.
 *
 * Body aceito:
 *   - { success, count, opportunities: [...] }  ← formato freebet2.txt
 *   - Array diretamente: [...]
 *
 * Estratégia: delete-all-then-insert (substitui tudo — as oportunidades
 * mudam frequentemente e não faz sentido acumular com as antigas).
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse }  from 'next/server';
import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['michael.martins.trader@gmail.com', 'rmmichael20@gmail.com'];

interface Leg {
  bookmaker:     string;
  bookmakerSlug: string;
  odd:           number;
  outcome:       string;
  matchUrl?:     string;
  isPA:          boolean;
}

interface OpportunityRecord {
  id:               string;
  matchId:          string;
  homeTeam:         string;
  awayTeam:         string;
  league?:          string;
  leagueSlug?:      string;
  kickoff?:         string;
  maxLossPct?:      number;
  dgProfitPct?:     number;
  dgScore?:         number;
  dgClassification?: string;
  legs:             Leg[];
  updatedAt?:       string;
  _pa_sides?:       number; // embutido pelo cliente ao extrair do export
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(req: NextRequest) {
  // append=1 → pula o delete (usado em lotes após o primeiro)
  const append = req.nextUrl.searchParams.get('append') === '1';

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ ok: false, error: 'Acesso restrito ao administrador' }, { status: 403 });
  }

  // ── 2. Parse ──────────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Body inválido (JSON esperado)' }, { status: 400 }); }

  // pa_sides por registro (match_id → 0|1|2)
  const paSidesMap = new Map<string, number>();

  function extractOpps(arr: unknown[], paSides: number) {
    for (const r of arr as OpportunityRecord[]) {
      if (!r?.id) continue;
      const cur = paSidesMap.get(r.id) ?? 0;
      if (paSides > cur) paSidesMap.set(r.id, paSides);
    }
  }

  let records: OpportunityRecord[] = [];
  if (Array.isArray(body)) {
    records = body as OpportunityRecord[];
  } else {
    const b = body as Record<string, unknown>;

    if (b._type === 'dg_full_export') {
      if (Number(b._version) >= 3) {
        // ── Formato v3 — opp_both / opp_one / opp_legacy são chaves top-level ──
        const oppBoth   = (b.opp_both   as Record<string,unknown>)?.opportunities;
        const oppOne    = (b.opp_one    as Record<string,unknown>)?.opportunities;
        const oppLegacy = (b.opp_legacy as Record<string,unknown>)?.opportunities;

        if (Array.isArray(oppBoth))   { extractOpps(oppBoth,   2); records.push(...oppBoth   as OpportunityRecord[]); }
        if (Array.isArray(oppOne))    { extractOpps(oppOne,    1); records.push(...oppOne    as OpportunityRecord[]); }
        if (Array.isArray(oppLegacy)) {                            records.push(...oppLegacy as OpportunityRecord[]); }
      } else if (b.opportunities && typeof b.opportunities === 'object' && !Array.isArray(b.opportunities)) {
        // ── Formato v2 — opportunities é objeto { endpoint: { opportunities:[] } } ──
        const oppsObj = b.opportunities as Record<string, { opportunities?: OpportunityRecord[] }>;
        for (const [endpoint, val] of Object.entries(oppsObj)) {
          if (!Array.isArray(val?.opportunities)) continue;
          const paSides = endpoint.includes('pa_mode=both') ? 2
                        : endpoint.includes('pa_mode=one')  ? 1
                        : 0;
          extractOpps(val.opportunities, paSides);
          records.push(...val.opportunities);
        }
      }

      // Dedup por id (preferindo versões com maior pa_sides)
      const seen = new Map<string, OpportunityRecord>();
      for (const r of records) {
        if (!r?.id) continue;
        const cur = seen.get(r.id);
        if (!cur || (paSidesMap.get(r.id) ?? 0) > (paSidesMap.get(cur.id) ?? 0)) seen.set(r.id, r);
      }
      records = Array.from(seen.values());
    } else if (Array.isArray(b.opportunities)) {
      records = b.opportunities as OpportunityRecord[];
    } else if (Array.isArray(b.data)) {
      records = b.data as OpportunityRecord[];
    }
  }

  if (!records.length) {
    return NextResponse.json({ ok: false, error: 'Nenhuma oportunidade encontrada no JSON' }, { status: 400 });
  }

  // ── 3. Mapear para schema ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const rows = records.map(r => ({
    id:                r.id,
    match_id:          r.matchId,
    home_team:         r.homeTeam,
    away_team:         r.awayTeam,
    league:            r.league            ?? null,
    league_slug:       r.leagueSlug        ?? null,
    kickoff:           r.kickoff           ?? null,
    max_loss_pct:      r.maxLossPct        ?? null,
    dg_profit_pct:     r.dgProfitPct       ?? null,
    dg_score:          r.dgScore           ?? null,
    dg_classification: r.dgClassification  ?? null,
    legs:              r.legs              ?? [],
    pa_sides:          paSidesMap.get(r.id) ?? r._pa_sides ?? 0,
    updated_at:        r.updatedAt         ?? now,
    imported_at:       now,
  }));

  const admin = await getSupabaseAdmin();
  const BATCH = 500;
  let   inserted = 0;
  const errors: string[] = [];

  // Limpa tudo antes do primeiro lote (pula se append=1)
  if (!append) {
    const { error: delErr } = await admin.from('dg_opportunities').delete().gte('imported_at', '2000-01-01');
    if (delErr) {
      console.warn('[dg-opp-import] aviso ao limpar tabela:', delErr.message);
    }
  }

  // Insere em lotes
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: insErr, count } = await admin
      .from('dg_opportunities')
      .insert(batch, { count: 'exact' });

    if (insErr) {
      console.error(`[dg-opp-import] erro lote ${i}:`, insErr.message);
      errors.push(`lote ${i}: ${insErr.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }

  console.log(`[dg-opp-import] ${inserted}/${rows.length} oportunidades importadas por ${user.email}`);

  return NextResponse.json({
    ok:       errors.length === 0,
    total:    rows.length,
    inserted,
    errors:   errors.length > 0 ? errors : undefined,
  });
}
