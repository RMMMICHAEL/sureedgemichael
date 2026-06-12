/**
 * POST /api/admin/dg-full-import
 *
 * Recebe o JSON gerado pelo console script do DuploGreen (_type: "dg_full_export")
 * e distribui automaticamente para as tabelas corretas:
 *
 *   individual_odds  →  bookmaker_odds  (odds por casa por jogo)
 *
 * Formato aceito:
 *   { _type: "dg_full_export", _version: 2, individual_odds: [...], dashboard: {...} }
 *
 * Também aceita os formatos legados:
 *   { success, count, odds: [...] }   ← get-individual-odds direto
 *   [...]                              ← array puro
 *
 * Mapeamento de campos (DuploGreen usa camelCase e snake_case conforme versão):
 *   matchId / match_id, homeTeam / home_team, awayTeam / away_team,
 *   bookmakerSlug / bookmaker_slug, bookmakerName / bookmaker_name,
 *   oddHome / odd_home / home, oddDraw / odd_draw / draw,
 *   oddAway / odd_away / away, leagueName / league_name,
 *   leagueSlug / league_slug, kickoff / start_time / date,
 *   market / market_type / _market, matchUrl / match_url / url
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse }  from 'next/server';
import { cookies }                    from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['michael.martins.trader@gmail.com', 'rmmichael20@gmail.com'];

// ── Normalização de campos ────────────────────────────────────────────────────

interface RawOdd {
  [key: string]: unknown;
}

interface NormalizedOdd {
  match_id:       string;
  home_team:      string;
  away_team:      string;
  bookmaker_slug: string;
  bookmaker_name: string | null;
  market_type:    string;
  odd_home:       number;
  odd_draw:       number | null;
  odd_away:       number;
  league_name:    string | null;
  league_slug:    string | null;
  match_date:     string | null;
  start_time:     string | null;
  match_url:      string | null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Extrai match_date (YYYY-MM-DD BRT) a partir de vários formatos de timestamp */
function extractDate(v: unknown): string | null {
  if (!v) return null;
  try {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return null;
    // Converte para BRT (UTC-3)
    const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    const y = brt.getUTCFullYear();
    const m = String(brt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(brt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  } catch { return null; }
}

/** Normaliza qualquer odd da API do DuploGreen para o schema do banco */
function normalizeOdd(raw: RawOdd): NormalizedOdd | null {
  // match_id
  const matchId = str(raw.matchId ?? raw.match_id ?? raw.id ?? raw.event_id ?? raw.eventId);
  if (!matchId) return null;

  // times
  const homeTeam = str(raw.homeTeam ?? raw.home_team ?? raw.home ?? raw.team_home);
  const awayTeam = str(raw.awayTeam ?? raw.away_team ?? raw.away ?? raw.team_away);
  if (!homeTeam || !awayTeam) return null;

  // bookmaker
  const bkSlug = str(
    raw.bookmakerSlug ?? raw.bookmaker_slug ?? raw.bookmaker ?? raw.casa ??
    raw.bookie ?? raw.provider
  );
  if (!bkSlug) return null;

  const bkName = str(
    raw.bookmakerName ?? raw.bookmaker_name ?? raw.bookmakerLabel ??
    raw.casa_nome ?? raw.providerName ?? bkSlug
  );

  // mercado
  const marketRaw = str(
    raw.market ?? raw.market_type ?? raw.marketType ?? raw._market ?? raw.tipo
  ) ?? '1x2';
  // Normaliza: "1x2_pa" → "1x2_pa", "1x2" → "1x2", outros → como veio
  const marketType = marketRaw.toLowerCase().replace(/\s/g, '_');

  // odds numéricas
  const oddHome = num(raw.oddHome ?? raw.odd_home ?? raw.home_odd ?? raw.homeOdd ?? raw.home);
  const oddDraw = num(raw.oddDraw ?? raw.odd_draw ?? raw.draw_odd ?? raw.drawOdd ?? raw.draw ?? raw.empate);
  const oddAway = num(raw.oddAway ?? raw.odd_away ?? raw.away_odd ?? raw.awayOdd ?? raw.away);

  if (oddHome == null || oddAway == null || oddHome <= 0 || oddAway <= 0) return null;

  // liga
  const leagueName = str(
    raw.leagueName ?? raw.league_name ?? raw.league ?? raw.championship ??
    raw.campeonato ?? raw.competition
  );
  const leagueSlug = str(
    raw.leagueSlug ?? raw.league_slug ?? raw.leagueId ?? raw.league_id
  );

  // tempo
  const kickoffRaw = raw.kickoff ?? raw.start_time ?? raw.startTime ??
                     raw.date ?? raw.matchDate ?? raw.match_date ?? raw.datetime;
  const startTime  = str(kickoffRaw);
  const matchDate  = extractDate(kickoffRaw);

  // URL
  const matchUrl = str(
    raw.matchUrl ?? raw.match_url ?? raw.url ?? raw.eventUrl ?? raw.event_url
  );

  return {
    match_id:       matchId,
    home_team:      homeTeam,
    away_team:      awayTeam,
    bookmaker_slug: bkSlug,
    bookmaker_name: bkName,
    market_type:    marketType,
    odd_home:       oddHome,
    odd_draw:       oddDraw,
    odd_away:       oddAway,
    league_name:    leagueName,
    league_slug:    leagueSlug,
    match_date:     matchDate,
    start_time:     startTime,
    match_url:      matchUrl,
  };
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ ok: false, error: 'Acesso restrito ao administrador' }, { status: 403 });
  }

  // 2. Parse body
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  // 3. Detecta formato e extrai array de odds brutas
  let rawOdds: RawOdd[] = [];
  let detectedType = 'desconhecido';

  if (Array.isArray(body)) {
    rawOdds = body as RawOdd[];
    detectedType = 'array_puro';
  } else {
    const b = body as Record<string, unknown>;

    if (b._type === 'dg_full_export') {
      detectedType = `dg_full_export v${b._version ?? 1}`;

      if (Number(b._version) >= 3) {
        // ── Formato v3 (baixarTudo) — odds_1x2 e odds_1x2_pa são objetos {odds:[]} ──
        const odds1x2   = (b.odds_1x2   as Record<string,unknown>)?.odds;
        const odds1x2pa = (b.odds_1x2_pa as Record<string,unknown>)?.odds;
        if (Array.isArray(odds1x2))   rawOdds.push(...odds1x2   as RawOdd[]);
        if (Array.isArray(odds1x2pa)) rawOdds.push(...odds1x2pa as RawOdd[]);
      } else {
        // ── Formato v1/v2 legado ──────────────────────────────────────────────────
        const indOdds = Array.isArray(b.individual_odds) ? b.individual_odds as RawOdd[] : [];
        const dashOdds = Array.isArray((b.dashboard as Record<string,unknown>)?.odds)
          ? ((b.dashboard as Record<string,unknown>).odds as RawOdd[])
          : [];
        rawOdds = indOdds.length ? indOdds : dashOdds;
      }
    } else if (Array.isArray(b.odds)) {
      // Formato legado: { success, count, odds: [...] }
      rawOdds = b.odds as RawOdd[];
      detectedType = `legado_odds (${(b as {market?:string}).market ?? 'sem market'})`;
    } else if (Array.isArray(b.data)) {
      rawOdds = b.data as RawOdd[];
      detectedType = 'legado_data';
    }
  }

  if (!rawOdds.length) {
    return NextResponse.json({
      ok: false,
      error: 'Nenhuma odd encontrada. Verifique se o arquivo é uma exportação DG válida.',
      detected_type: detectedType,
    }, { status: 400 });
  }

  // 4. Normaliza
  const normalized: NormalizedOdd[] = [];
  let skipped = 0;
  for (const raw of rawOdds) {
    const n = normalizeOdd(raw);
    if (n) normalized.push(n);
    else    skipped++;
  }

  if (!normalized.length) {
    // Retorna sample para debug
    return NextResponse.json({
      ok: false,
      error: `Todas as ${rawOdds.length} odds foram ignoradas por campos obrigatórios ausentes.`,
      detected_type: detectedType,
      sample_raw: rawOdds[0],
      tip: 'Campos obrigatórios: matchId/match_id, homeTeam/home_team, awayTeam/away_team, bookmakerSlug/bookmaker_slug, oddHome/odd_home, oddAway/odd_away',
    }, { status: 400 });
  }

  // 5. Adiciona timestamps e agrupa por market_type
  const now = new Date().toISOString();
  const rows = normalized.map(n => ({ ...n, updated_at: now, imported_at: now }));

  const admin = await getSupabaseAdmin();
  const BATCH = 500;

  // Limpeza de datas antigas (mesmo comportamento do odds-import legado)
  const todayBRT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { count: cleanCount } = await admin
    .from('bookmaker_odds')
    .delete({ count: 'exact' })
    .lt('match_date', todayBRT);

  // Agrupa por market_type para delete seletivo antes do insert
  const byMarket = new Map<string, typeof rows>();
  for (const row of rows) {
    const mt = row.market_type;
    if (!byMarket.has(mt)) byMarket.set(mt, []);
    byMarket.get(mt)!.push(row);
  }

  let totalInserted = 0;
  const errors: string[] = [];
  const marketStats: Record<string, number> = {};

  for (const [market, mRows] of byMarket) {
    const matchIds = [...new Set(mRows.map(r => r.match_id))];

    // Delete em lotes de 500 match_ids para este market
    for (let i = 0; i < matchIds.length; i += BATCH) {
      const { error: delErr } = await admin
        .from('bookmaker_odds')
        .delete()
        .in('match_id', matchIds.slice(i, i + BATCH))
        .eq('market_type', market);
      if (delErr) errors.push(`delete ${market} lote ${i}: ${delErr.message}`);
    }

    // Insert em lotes
    for (let i = 0; i < mRows.length; i += BATCH) {
      const batch = mRows.slice(i, i + BATCH);
      const { error: insErr, count } = await admin
        .from('bookmaker_odds')
        .insert(batch, { count: 'exact' });
      if (insErr) {
        errors.push(`insert ${market} lote ${i}: ${insErr.message}`);
      } else {
        totalInserted    += count ?? batch.length;
        marketStats[market] = (marketStats[market] ?? 0) + (count ?? batch.length);
      }
    }
  }

  console.log(`[dg-full-import] ${totalInserted}/${rows.length} odds importadas (${Object.entries(marketStats).map(([k,v])=>`${k}:${v}`).join(', ')}) por ${user.email}`);

  return NextResponse.json({
    ok:             errors.length === 0,
    detected_type:  detectedType,
    total_raw:      rawOdds.length,
    total_valid:    normalized.length,
    skipped,
    inserted:       totalInserted,
    cleaned_old:    cleanCount ?? 0,
    by_market:      marketStats,
    errors:         errors.length ? errors : undefined,
  });
}
