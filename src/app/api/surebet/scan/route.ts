/**
 * GET /api/surebet/scan
 * Detecta surebets entre bookmakers para jogos de futebol.
 *
 * Usa todos os bookmakers disponíveis:
 *   Bet365, Betano, Superbet, Sportingbet + casas Altenar
 *
 * Tipos de surebet detectados:
 *   DC 1X + 2, DC X2 + 1, DC 12 + X
 *
 * Query params:
 *   ?filter=surebet|all   → padrão: surebet
 *   ?date=YYYY-MM-DD      → dia (padrão: hoje BRT)
 *   ?all=1                → sem filtro de data
 */

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse }  from 'next/server';
import { cookies }                     from 'next/headers';
import { createSupabaseServerClient }  from '@/lib/supabase/server';
import { getAllFootballOdds }          from '@/lib/altenar/client';
import { getBwinOdds }                 from '@/lib/bwin/client';
import { getBet365Odds }               from '@/lib/bet365/client';
import { getBetanoOdds }               from '@/lib/betano/client';
import { getSuperbetOdds }             from '@/lib/superbet/client';
import type { OddsSummary }            from '@/lib/altenar/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BookmakerInfo {
  slug: string;
  name: string;
  url:  string;
}

export interface SurebetLeg {
  bookmaker: BookmakerInfo;
  outcome:   string;   // '1'|'X'|'2'|'1X'|'X2'|'12'
  odds:      number;
  isPa:      boolean;
}

export interface Surebet {
  id:      string;
  type:    'dc_1x_2' | 'dc_x2_1' | 'dc_12_x';
  label:   string;
  leg1:    SurebetLeg;   // DC leg
  leg2:    SurebetLeg;   // MR leg
  profit:  number;
  stakes:  { s1: number; s2: number; total: number; profit: number };
}

export interface SurebetEvent {
  eventId:    string;
  home:       string;
  away:       string;
  league:     string;
  startTime:  string;
  bookmakers: string[];   // slugs das casas com odds disponíveis
  surebets:   Surebet[];
  hasSurebet: boolean;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function calcProfit(o1: number, o2: number): number {
  const sum = 1 / o1 + 1 / o2;
  if (sum >= 1) return 0;
  return Math.round((1 / sum - 1) * 10000) / 100;
}

function calcStakes(o1: number, o2: number, banca = 100) {
  const sum = 1 / o1 + 1 / o2;
  const s1  = Math.round(banca / (o1 * sum) * 100) / 100;
  const s2  = Math.round(banca / (o2 * sum) * 100) / 100;
  const ret = Math.round(banca / sum * 100) / 100;
  return { s1, s2, total: banca, profit: Math.round((ret - banca) * 100) / 100 };
}

// ── Surebet detection ─────────────────────────────────────────────────────────

function detectSurebets(ev: OddsSummary): Surebet[] {
  const bks = ev.bookmakers.filter(b =>
    b.home > 1 && b.draw > 1 && b.away > 1
  );
  if (bks.length < 2) return [];

  const surebets: Surebet[] = [];

  // Monta pares de casas diferentes
  for (let i = 0; i < bks.length; i++) {
    for (let j = 0; j < bks.length; j++) {
      if (i === j) continue;
      const A = bks[i];  // Casa com DC
      const B = bks[j];  // Casa com resultado simples

      const dcInfo = (A: typeof bks[0]): { '1X': number; 'X2': number; '12': number } => ({
        '1X': Math.min(1 / (1 / A.home + 1 / A.draw), 999),  // odds implícita DC
        'X2': Math.min(1 / (1 / A.draw + 1 / A.away), 999),
        '12': Math.min(1 / (1 / A.home + 1 / A.away), 999),
      });

      // Odds reais de DC — alguns bookmakers fornecem diretamente
      // Como não temos DC separado na OddsSummary, calculamos pela inversão da parlay
      // DC 1X (A ganha se casa vencer OU empatar) + Away de B
      const dc1X = 1 / (1 / A.home + 1 / A.draw);
      const dcX2 = 1 / (1 / A.draw + 1 / A.away);
      const dc12 = 1 / (1 / A.home + 1 / A.away);

      const dcOdds = dcInfo(A);
      void dcOdds;

      const checks = [
        { dcOdds: dc1X, dcOut: '1X', mrOdds: B.away, mrOut: '2', type: 'dc_1x_2' as const, label: `DC 1X (${A.name}) + Away (${B.name})` },
        { dcOdds: dcX2, dcOut: 'X2', mrOdds: B.home, mrOut: '1', type: 'dc_x2_1' as const, label: `DC X2 (${A.name}) + Casa (${B.name})` },
        { dcOdds: dc12, dcOut: '12', mrOdds: B.draw, mrOut: 'X', type: 'dc_12_x' as const, label: `DC 12 (${A.name}) + Empate (${B.name})` },
      ];

      for (const c of checks) {
        if (c.dcOdds <= 1 || c.mrOdds <= 1) continue;
        const profit = calcProfit(c.dcOdds, c.mrOdds);
        if (profit <= 0) continue;

        const id = `${c.type}-${A.slug}-${B.slug}`;
        if (surebets.find(s => s.id === id)) continue;

        surebets.push({
          id,
          type:  c.type,
          label: c.label,
          leg1: {
            bookmaker: { slug: A.slug, name: A.name, url: A.url },
            outcome:   c.dcOut,
            odds:      c.dcOdds,
            isPa:      A.is_pa ?? false,
          },
          leg2: {
            bookmaker: { slug: B.slug, name: B.name, url: B.url },
            outcome:   c.mrOut,
            odds:      c.mrOdds,
            isPa:      B.is_pa ?? false,
          },
          profit,
          stakes: calcStakes(c.dcOdds, c.mrOdds),
        });
      }
    }
  }

  return surebets.sort((a, b) => b.profit - a.profit);
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const an = normalize(a);
  const bn = normalize(b);
  const short = Math.min(an.length, bn.length, 5);
  return an.slice(0, short) === bn.slice(0, short) ||
         an.includes(bn.slice(0, short)) ||
         bn.includes(an.slice(0, short));
}

function mergeAll(...sources: OddsSummary[][]): OddsSummary[] {
  const merged: OddsSummary[] = [];

  for (const source of sources) {
    for (const ev of source) {
      const match = merged.find(m =>
        fuzzyMatch(m.home_team, ev.home_team) &&
        fuzzyMatch(m.away_team, ev.away_team)
      );
      if (match) {
        for (const bk of ev.bookmakers) {
          if (!match.bookmakers.find(b => b.slug === bk.slug)) {
            match.bookmakers.push(bk);
          }
        }
      } else {
        merged.push({ ...ev, bookmakers: [...ev.bookmakers] });
      }
    }
  }

  return merged;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const showAll    = req.nextUrl.searchParams.get('all')    === '1';
  const dateParam  = req.nextUrl.searchParams.get('date')   ?? '';
  const filterMode = req.nextUrl.searchParams.get('filter') ?? 'surebet';

  // Busca todas as fontes em paralelo
  const [altenarR, bwinR, bet365R, betanoR, superbetR] = await Promise.allSettled([
    getAllFootballOdds(),
    getBwinOdds(),
    getBet365Odds(),
    getBetanoOdds(),
    getSuperbetOdds(),
  ]);

  const altenar  = altenarR.status  === 'fulfilled' ? altenarR.value  : [];
  const bwin     = bwinR.status     === 'fulfilled' ? bwinR.value     : [];
  const bet365   = bet365R.status   === 'fulfilled' ? bet365R.value   : [];
  const betano   = betanoR.status   === 'fulfilled' ? betanoR.value   : [];
  const superbet = superbetR.status === 'fulfilled' ? superbetR.value : [];

  let merged = mergeAll(altenar, bwin, bet365, betano, superbet);

  // Filtro de data
  if (!showAll) {
    const refBR   = dateParam
      ? new Date(dateParam + 'T12:00:00Z')
      : new Date(Date.now() - 3 * 60 * 60 * 1000);
    const filterY = refBR.getUTCFullYear();
    const filterM = refBR.getUTCMonth();
    const filterD = refBR.getUTCDate();

    merged = merged.filter(ev => {
      const d   = new Date(ev.start_time);
      const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      return brt.getUTCFullYear() === filterY &&
             brt.getUTCMonth()    === filterM &&
             brt.getUTCDate()     === filterD;
    });
  }

  // Detecta surebets
  const events: SurebetEvent[] = merged.map(ev => {
    const surebets = detectSurebets(ev);
    return {
      eventId:    ev.match_id,
      home:       ev.home_team,
      away:       ev.away_team,
      league:     ev.league_name,
      startTime:  ev.start_time,
      bookmakers: ev.bookmakers.map(b => b.name),
      surebets,
      hasSurebet: surebets.length > 0,
    };
  });

  // Aplica filtro de surebet
  const result = filterMode === 'surebet'
    ? events.filter(e => e.hasSurebet)
    : events;

  // Ordena: surebet primeiro, depois lucro decrescente, depois hora
  result.sort((a, b) => {
    if (a.hasSurebet && !b.hasSurebet) return -1;
    if (!a.hasSurebet && b.hasSurebet) return 1;
    const maxA = a.surebets[0]?.profit ?? 0;
    const maxB = b.surebets[0]?.profit ?? 0;
    if (maxA !== maxB) return maxB - maxA;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  const sources: string[] = [];
  if (altenar.length  > 0) sources.push('altenar');
  if (bwin.length     > 0) sources.push('sportingbet');
  if (bet365.length   > 0) sources.push('bet365');
  if (betano.length   > 0) sources.push('betano');
  if (superbet.length > 0) sources.push('superbet');

  return NextResponse.json({
    ok:          true,
    events:      result,
    total:       result.length,
    totalRaw:    merged.length,
    withSurebet: events.filter(e => e.hasSurebet).length,
    sources,
  });
}
