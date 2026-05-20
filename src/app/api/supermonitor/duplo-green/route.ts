/**
 * POST /api/supermonitor/duplo-green
 * Varre o cache sm_odds e computa sinais de Duplo Green:
 *   - ML: arbs 3 vias (1X2) com casas PA preferencial
 *   - Gols: pares Over X.5 + Under Y.5 onde X < Y (zona verde entre as linhas)
 *
 * Body (opcional):
 *   { disabled_houses?: string[] }   — casas a ignorar (array de nomes lowercase)
 *
 * Resposta:
 *   { ok: true, ml: MLSignal[], gols: GolsSignal[], total_events: number, computed_at: string }
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1'];

import { NextRequest, NextResponse } from 'next/server';

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface BookmakerRow {
  house:      string;
  pa:         boolean;
  url?:       string;
  mlHome?:    number;
  mlDraw?:    number;
  mlAway?:    number;
  ouHdp?:     number;
  ouOver?:    number;
  ouUnder?:   number;
}

export interface MLSignal {
  event_id:   string;
  event_name: string;
  league:     string;
  start_utc:  string;
  leg1:       { house: string; pa: boolean; odd: number; url?: string; };
  legX:       { house: string; pa: boolean; odd: number; url?: string; };
  leg2:       { house: string; pa: boolean; odd: number; url?: string; };
  margin:     number;
  loss_pct:   number;   // (margin−1)×100 — negativo = lucro
}

export interface GolsSignal {
  event_id:      string;
  event_name:    string;
  league:        string;
  start_utc:     string;
  over_house:    string;
  over_pa:       boolean;
  over_line:     number;
  over_odd:      number;
  over_url?:     string;
  under_house:   string;
  under_pa:      boolean;
  under_line:    number;
  under_odd:     number;
  under_url?:    string;
  gap:           number;    // under_line − over_line
  green_goals:   string;    // "4" ou "3–4"
  both_win_pct:  number;    // % de retorno quando ambos ganham
  loss_pct:      number;    // % de perda no cenário de 1 perna (balanced stakes)
}

// ── PA set ─────────────────────────────────────────────────────────────────────

const PA_SET = new Set([
  'betano','novibet','betvip','betsul','betesporte','brasilbet','betsson','bet365',
  'bet365arg','bet365pe','lotogreen','kto','vivasorte','sportingbet','superbet',
  'apostabet','br4bet','esportesdasorte','esportiva','esportivabet','sortenabet',
  'betmgm','estrelabet','bet7k','jogodeouro','mcgames','meridianbet','meridian',
  'versusbet','vupi','vupibet','vaidebet',
]);

function isPa(house: string): boolean {
  const n = house.toLowerCase().replace(/[\s\-_.]/g, '');
  if (n.endsWith('so')) return false;
  if (PA_SET.has(n)) return true;
  for (const pa of PA_SET) {
    if (n.length >= 4 && pa.length >= 4 && (n.startsWith(pa) || pa.startsWith(n))) return true;
  }
  return false;
}

// ── Parser de odds por casa ────────────────────────────────────────────────────

function parseBookmakers(
  payload: Record<string, unknown>,
  disabledSet: Set<string>,
): BookmakerRow[] {
  const results: Record<string, unknown>[] = Array.isArray(payload?.results)
    ? payload.results as Record<string, unknown>[]
    : Array.isArray(payload?.data)
      ? payload.data as Record<string, unknown>[]
      : [];

  const houseMap = new Map<string, BookmakerRow>();

  for (const result of results) {
    const bms  = result.bookmakers as Record<string, unknown> | undefined;
    const urls = result.urls as Record<string, string> | undefined;
    if (!bms) continue;

    for (const [hn, markets] of Object.entries(bms)) {
      if (!Array.isArray(markets)) continue;
      const hnLower = hn.toLowerCase();
      if (disabledSet.has(hnLower)) continue;

      let row = houseMap.get(hn);
      if (!row) {
        row = { house: hn, pa: isPa(hn), url: urls?.[hn] };
        houseMap.set(hn, row);
      }

      for (const market of markets as Record<string, unknown>[]) {
        const mName = String(market.name ?? '').toLowerCase();
        const oddsArr = Array.isArray(market.odds) ? market.odds : [];
        const odds = oddsArr.length > 0 ? (oddsArr[0] as Record<string, unknown>) : null;
        if (!odds) continue;

        if (mName === 'ml' || mName === '1x2' || mName === 'moneyline' || mName.includes('resultado')) {
          const h = parseFloat(String(odds.home ?? odds['1'] ?? ''));
          const d = parseFloat(String(odds.draw ?? odds.x ?? ''));
          const a = parseFloat(String(odds.away ?? odds['2'] ?? ''));
          if (!isNaN(h) && h > 1) row.mlHome = h;
          if (!isNaN(d) && d > 1) row.mlDraw = d;
          if (!isNaN(a) && a > 1) row.mlAway = a;
        } else if (mName === 'totals' || mName.includes('over') || mName.includes('under')) {
          const ov = parseFloat(String(odds.over  ?? ''));
          const un = parseFloat(String(odds.under ?? ''));
          const hd = parseFloat(String(odds.hdp   ?? ''));
          if (!isNaN(ov) && ov > 1) row.ouOver  = ov;
          if (!isNaN(un) && un > 1) row.ouUnder  = un;
          if (!isNaN(hd))           row.ouHdp    = hd;
        }
      }
    }
  }

  return Array.from(houseMap.values());
}

// ── Computar sinais ML ────────────────────────────────────────────────────────

function computeMLSignals(
  rows: BookmakerRow[],
  meta: { event_id: string; event_name: string; league: string; start_utc: string },
): MLSignal[] {
  const withHome = rows.filter(r => r.mlHome);
  const withDraw = rows.filter(r => r.mlDraw);
  const withAway = rows.filter(r => r.mlAway);

  if (!withHome.length || !withDraw.length || !withAway.length) return [];

  const results: MLSignal[] = [];
  const seen = new Set<string>();

  for (const hr of withHome) {
    for (const ar of withAway) {
      if (hr.house === ar.house) continue;
      // melhor empate de casa diferente das outras duas
      const drawRow = withDraw
        .filter(r => r.house !== hr.house && r.house !== ar.house)
        .sort((a, b) => (b.mlDraw ?? 0) - (a.mlDraw ?? 0))[0]
        ?? withDraw.sort((a, b) => (b.mlDraw ?? 0) - (a.mlDraw ?? 0))[0];

      if (!drawRow?.mlDraw) continue;

      const margin = 1 / hr.mlHome! + 1 / drawRow.mlDraw + 1 / ar.mlAway!;
      const key    = `${hr.house}|${drawRow.house}|${ar.house}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        ...meta,
        leg1: { house: hr.house,      pa: hr.pa,      odd: hr.mlHome!,     url: hr.url },
        legX: { house: drawRow.house, pa: drawRow.pa, odd: drawRow.mlDraw, url: drawRow.url },
        leg2: { house: ar.house,      pa: ar.pa,      odd: ar.mlAway!,     url: ar.url },
        margin,
        loss_pct: Math.round((margin - 1) * 10000) / 100,
      });
    }
  }

  // Deduplica por par 1×2 (home+away), mantém melhor margem
  const bestByPair = new Map<string, MLSignal>();
  for (const sig of results) {
    const pairKey = `${sig.leg1.house}|${sig.leg2.house}`;
    const existing = bestByPair.get(pairKey);
    if (!existing || sig.margin < existing.margin) {
      bestByPair.set(pairKey, sig);
    }
  }

  return Array.from(bestByPair.values()).sort((a, b) => a.margin - b.margin);
}

// ── Computar sinais Gols ──────────────────────────────────────────────────────

function computeGolsSignals(
  rows: BookmakerRow[],
  meta: { event_id: string; event_name: string; league: string; start_utc: string },
): GolsSignal[] {
  const withTotals = rows.filter(r => r.ouHdp != null && r.ouOver != null && r.ouUnder != null);
  if (withTotals.length < 2) return [];

  const results: GolsSignal[] = [];

  for (const overRow of withTotals) {
    for (const underRow of withTotals) {
      if (overRow.house === underRow.house) continue;
      if (overRow.ouHdp! >= underRow.ouHdp!) continue; // precisa de gap positivo

      const oLine = overRow.ouHdp!;
      const uLine = underRow.ouHdp!;
      const oOdd  = overRow.ouOver!;
      const uOdd  = underRow.ouUnder!;
      const gap   = uLine - oLine;

      // Stakes balanceados: s_over * oOdd = s_under * uOdd
      // → s_over = uOdd / (oOdd + uOdd), s_under = oOdd / (oOdd + uOdd)
      // retorno balanceado (cenário de 1 perna) = oOdd * uOdd / (oOdd + uOdd)
      const balancedReturn = (oOdd * uOdd) / (oOdd + uOdd);
      const loss_pct       = Math.round((1 - balancedReturn) * 10000) / 100;

      // retorno quando ambos ganham (zona verde)
      const s_over  = uOdd / (oOdd + uOdd);
      const s_under = oOdd / (oOdd + uOdd);
      const bothWin = s_over * oOdd + s_under * uOdd; // = 2 * balancedReturn
      const both_win_pct = Math.round((bothWin - 1) * 10000) / 100;

      // Descrição da zona verde: goals where oLine < g <= uLine
      const lo = Math.floor(oLine) + 1;
      const hi = Math.floor(uLine);
      const green_goals = lo === hi ? String(lo) : `${lo}–${hi}`;

      results.push({
        ...meta,
        over_house:  overRow.house,
        over_pa:     overRow.pa,
        over_line:   oLine,
        over_odd:    oOdd,
        over_url:    overRow.url,
        under_house: underRow.house,
        under_pa:    underRow.pa,
        under_line:  uLine,
        under_odd:   uOdd,
        under_url:   underRow.url,
        gap,
        green_goals,
        both_win_pct,
        loss_pct,
      });
    }
  }

  // Deduplica por par de casas, mantém o melhor (menor loss)
  const bestByPair = new Map<string, GolsSignal>();
  for (const sig of results) {
    const key = `${sig.over_house}|${sig.under_house}`;
    const ex  = bestByPair.get(key);
    if (!ex || sig.loss_pct < ex.loss_pct) bestByPair.set(key, sig);
  }

  return Array.from(bestByPair.values()).sort((a, b) => a.loss_pct - b.loss_pct);
}

// ── Supabase helper ───────────────────────────────────────────────────────────

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let disabledHouses: string[] = [];
  try {
    const body = await req.json() as { disabled_houses?: string[] };
    disabledHouses = (body.disabled_houses ?? []).map(h => h.toLowerCase());
  } catch { /* vazio */ }

  const disabledSet = new Set(disabledHouses);

  try {
    const sb   = await getSupabaseAdmin();
    const now  = new Date();

    // Pega todos os eventos do dia com odds no cache (sem filtro de tempo —
    // o usuário vê os dados mais recentes disponíveis e o frontend informa a idade)
    const today = now.toISOString().slice(0, 10);
    const { data: oddsRows, error } = await sb
      .from('sm_odds')
      .select('event_id, event_name, data, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message });
    }

    // Pega metadados dos eventos (liga, horário)
    const { data: eventRows } = await sb
      .from('sm_events')
      .select('id, league, start_utc')
      .eq('event_date', today);

    const eventMeta = new Map<string, { league: string; start_utc: string }>();
    for (const e of (eventRows ?? [])) {
      eventMeta.set(e.id, { league: e.league ?? '', start_utc: e.start_utc ?? '' });
    }

    // Deduplica por event_id (fica com a mais recente, já ordenado)
    const seen = new Set<string>();
    const mlAll:   MLSignal[]   = [];
    const golsAll: GolsSignal[] = [];
    let newestUpdatedAt = '';

    for (const row of (oddsRows ?? [])) {
      if (seen.has(row.event_id)) continue;
      seen.add(row.event_id);

      if (!newestUpdatedAt || row.updated_at > newestUpdatedAt) {
        newestUpdatedAt = row.updated_at;
      }

      const payload = row.data as Record<string, unknown>;
      const bms     = parseBookmakers(payload, disabledSet);
      const meta    = eventMeta.get(row.event_id) ?? { league: '', start_utc: '' };
      const base    = { event_id: row.event_id, event_name: row.event_name, ...meta };

      mlAll.push(...computeMLSignals(bms, base));
      golsAll.push(...computeGolsSignals(bms, base));
    }

    // Ordena globalmente por margem / loss%
    mlAll.sort((a, b)   => a.margin   - b.margin);
    golsAll.sort((a, b) => a.loss_pct - b.loss_pct);

    // Calcula idade do cache em minutos
    const cacheAgeMin = newestUpdatedAt
      ? Math.round((now.getTime() - new Date(newestUpdatedAt).getTime()) / 60_000)
      : null;

    return NextResponse.json({
      ok:            true,
      ml:            mlAll.slice(0, 200),
      gols:          golsAll.slice(0, 200),
      total_events:  seen.size,
      cache_updated: newestUpdatedAt,
      cache_age_min: cacheAgeMin,
      computed_at:   now.toISOString(),
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg });
  }
}
