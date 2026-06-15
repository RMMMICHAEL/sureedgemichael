/**
 * GET /api/dg/odds
 * Agrega odds de múltiplas plataformas com campo is_pa correto por bookmaker.
 *
 * Fontes ativas:
 *  - Altenar (PA):  EstrelaBet, Br4bet, EsportivaBet, JogodeOuro, VaideBet,
 *                   SortenasBet, LotoGreen, BetPix365, F12.bet, VupiBet
 *  - Bwin/CDS (PA): Sportingbet
 *  - Superbet (PA): Superbet
 *  - PulseScore:    Bet365 (não-PA)
 *  - Betfair (PA):  tentativa via BFF API
 *  - Pinnacle:      tentativa via REST API (não-PA)
 *  - BetNacional:   tentativa via Bet6 API (não-PA)
 *  - VivaSorte:     tentativa via REST API (não-PA)
 *
 * Query params:
 *   ?date=YYYY-MM-DD  → dia específico (padrão: hoje BRT)
 *   ?all=1            → sem filtro de data
 *   ?champ_id=N       → filtra por liga Altenar
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 25;

/** Limita tempo de cada fonte externa — evita que uma API travada derrube a rota inteira */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`[timeout] ${label} após ${ms}ms`)), ms)
    ),
  ]);
}

import { NextRequest, NextResponse }     from 'next/server';
import { cookies }                        from 'next/headers';
import { createSupabaseServerClient }     from '@/lib/supabase/server';
import { getAllFootballOdds, getOddsByLeague, type OddsSummary } from '@/lib/altenar/client';
import { getKambiOdds }       from '@/lib/kambi/client';
import { getSuperbetOdds }    from '@/lib/superbet/client';
import { getBwinOdds }        from '@/lib/bwin/client';
import { getBet365Odds }      from '@/lib/bet365/client';
import { getBetfairOdds }     from '@/lib/betfair/client';
import { getPinnacleOdds }    from '@/lib/pinnacle/client';
import { getBetNacionalOdds } from '@/lib/betnacional/client';
import { getVivaSorteOdds }   from '@/lib/vivasorte/client';
import { getBetanoOdds }      from '@/lib/betano/client';
import { mergeMatches }       from '@/lib/match-mapper';

// ── Merge helpers ─────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Garante que strings ISO sem indicador de fuso sejam tratadas como UTC.
 *  APIs como Altenar retornam "2024-06-15T16:00:00" (sem Z) — browsers
 *  interpretam isso como horário local, causando erro de 3h no Brasil. */
function toUtcIso(s: string): string {
  if (!s) return s;
  if (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) return s;
  return s + 'Z';
}

function fuzzyMatch(a: string, b: string): boolean {
  const an = normalize(a);
  const bn = normalize(b);
  const short = Math.min(an.length, bn.length, 5);
  return an.slice(0, short) === bn.slice(0, short) ||
         an.includes(bn.slice(0, short)) ||
         bn.includes(an.slice(0, short));
}

/**
 * Merge de fontes de odds por nome fuzzy dos times.
 * Eventos que casam: bookmakers adicionados ao evento base.
 * Eventos sem match: adicionados como evento independente.
 */
function mergeOdds(base: OddsSummary[], ...others: OddsSummary[][]): OddsSummary[] {
  const merged = base.map(ev => ({ ...ev, bookmakers: [...ev.bookmakers] }));

  for (const source of others) {
    for (const sev of source) {
      const match = merged.find(aev =>
        fuzzyMatch(aev.home_team, sev.home_team) &&
        fuzzyMatch(aev.away_team, sev.away_team)
      );

      if (match) {
        for (const bk of sev.bookmakers) {
          // Evita duplicata: mesmo slug E mesmo is_pa
          const exists = match.bookmakers.find(
            b => b.slug === bk.slug && b.is_pa === bk.is_pa
          );
          if (!exists) match.bookmakers.push(bk);
        }
      } else {
        merged.push(sev);
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

  const champId   = req.nextUrl.searchParams.get('champ_id');
  const showAll   = req.nextUrl.searchParams.get('all')  === '1';
  const dateParam = req.nextUrl.searchParams.get('date') ?? '';

  try {
    const t0 = Date.now();

    // Timeouts individuais por fonte (ms). Fontes mais lentas têm menos tempo.
    const [
      altenarOdds, kambiOdds, superbetOdds, bwinOdds,
      bet365Odds, betfairOdds, pinnacleOdds, betNacionalOdds, vivaSorteOdds, betanoOdds,
    ] = await Promise.allSettled([
      withTimeout(champId ? getOddsByLeague(Number(champId)) : getAllFootballOdds(), 10000, 'altenar'),
      withTimeout(getKambiOdds(),       6000, 'kambi'),
      withTimeout(getSuperbetOdds(),    8000, 'superbet'),
      withTimeout(getBwinOdds(),        8000, 'bwin'),
      withTimeout(getBet365Odds(),      8000, 'bet365'),
      withTimeout(getBetfairOdds(),     5000, 'betfair'),
      withTimeout(getPinnacleOdds(),    5000, 'pinnacle'),
      withTimeout(getBetNacionalOdds(), 5000, 'betnacional'),
      withTimeout(getVivaSorteOdds(),   5000, 'vivasorte'),
      withTimeout(getBetanoOdds(),      8000, 'betano'),
    ]);
    console.log('[odds:0-coleta] tempo total APIs:', Date.now() - t0, 'ms');

    const altenar    = altenarOdds.status     === 'fulfilled' ? altenarOdds.value     : [];
    const kambi      = kambiOdds.status       === 'fulfilled' ? kambiOdds.value       : [];
    const superbet   = superbetOdds.status    === 'fulfilled' ? superbetOdds.value    : [];
    const bwin       = bwinOdds.status        === 'fulfilled' ? bwinOdds.value        : [];
    const bet365     = bet365Odds.status      === 'fulfilled' ? bet365Odds.value      : [];
    const betfair    = betfairOdds.status     === 'fulfilled' ? betfairOdds.value     : [];
    const pinnacle   = pinnacleOdds.status    === 'fulfilled' ? pinnacleOdds.value    : [];
    const betnac     = betNacionalOdds.status === 'fulfilled' ? betNacionalOdds.value : [];
    const vivasorte  = vivaSorteOdds.status   === 'fulfilled' ? vivaSorteOdds.value   : [];
    const betano     = betanoOdds.status      === 'fulfilled' ? betanoOdds.value      : [];

    // ── STEP 1: Log contagem por fonte ──────────────────────────────────────
    const sourceCounts = {
      altenar: altenar.length, kambi: kambi.length, superbet: superbet.length,
      bwin: bwin.length, bet365: bet365.length, betano: betano.length,
      betfair: betfair.length, pinnacle: pinnacle.length,
      betnac: betnac.length, vivasorte: vivasorte.length,
    };
    console.log('[odds:1-coleta]', sourceCounts);
    const totalCollected = Object.values(sourceCounts).reduce((a, b) => a + b, 0);
    console.log('[odds:1-coleta] total eventos coletados:', totalCollected);

    // ── STEP 2: Match mapping com normalização avançada ──────────────────────
    const { matches: mergedMatches, stats: mergeStats } = mergeMatches(
      [altenar, kambi, superbet, bwin, bet365, betfair, pinnacle, betnac, vivasorte, betano],
      ['altenar', 'kambi', 'superbet', 'bwin', 'bet365', 'betfair', 'pinnacle', 'betnacional', 'vivasorte', 'betano'],
    );
    console.log('[odds:2-merge] total após merge:', mergedMatches.length);
    console.log('[odds:2-merge] stats:', JSON.stringify(mergeStats.perSource));

    // Debug: mostra quais bookmakers cada fonte contribuiu
    const bkCount: Record<string, number> = {};
    for (const m of mergedMatches) {
      for (const bk of m.bookmakers) {
        bkCount[bk.bookmaker_slug] = (bkCount[bk.bookmaker_slug] ?? 0) + 1;
      }
    }
    console.log('[odds:2-merge] bookmakers por fonte:', bkCount);

    // Converte UnifiedMatch de volta para OddsSummary (compatibilidade com código existente)
    // market_type: '1x2' (sem PA) ou '1x2_pa' (com PA) — derivado de is_pa
    let odds: OddsSummary[] = mergedMatches.map(m => ({
      match_id:    m.match_id,
      home_team:   m.home_team,
      away_team:   m.away_team,
      start_time:  toUtcIso(m.start_time),
      league_name: m.league_name,
      league_id:   0,
      bookmakers:  m.bookmakers.map(b => ({
        slug:        b.bookmaker_slug,
        name:        b.bookmaker_name,
        home:        b.odd_home,
        draw:        b.odd_draw,
        away:        b.odd_away,
        url:         b.match_url,
        is_pa:       b.is_pa,
        market_type: b.is_pa ? '1x2_pa' : '1x2',
      })),
    }));

    // Log: quantos bookmakers de cada market_type existem no total
    let total1x2 = 0, total1x2pa = 0;
    for (const ev of odds) {
      for (const bk of ev.bookmakers) {
        if (bk.is_pa) total1x2pa++; else total1x2++;
      }
    }
    console.log(`[odds:2-merge] market_type: 1x2=${total1x2} 1x2_pa=${total1x2pa}`);

    // ── STEP 3: Filtro de data (BRT = UTC-3) ────────────────────────────────
    if (!showAll) {
      const refBR   = dateParam
        ? new Date(dateParam + 'T12:00:00Z')
        : new Date(Date.now() - 3 * 60 * 60 * 1000);
      const filterY = refBR.getUTCFullYear();
      const filterM = refBR.getUTCMonth();
      const filterD = refBR.getUTCDate();

      odds = odds.filter(ev => {
        const d   = new Date(ev.start_time);
        const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
        return brt.getUTCFullYear() === filterY &&
               brt.getUTCMonth()    === filterM &&
               brt.getUTCDate()     === filterD;
      });
    }

    console.log('[odds:3-filtro] após filtro de data:', odds.length);

    const sources: string[] = [];
    if (altenar.length   > 0) sources.push('altenar');
    if (kambi.length     > 0) sources.push('kambi');
    if (superbet.length  > 0) sources.push('superbet');
    if (bwin.length      > 0) sources.push('bwin');
    if (bet365.length    > 0) sources.push('bet365');
    if (betfair.length   > 0) sources.push('betfair');
    if (pinnacle.length  > 0) sources.push('pinnacle');
    if (betnac.length    > 0) sources.push('betnacional');
    if (vivasorte.length > 0) sources.push('vivasorte');
    if (betano.length    > 0) sources.push('betano');

    return NextResponse.json({
      ok:     true,
      count:  odds.length,
      source: sources.join('+') || 'none',
      odds,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[odds] falhou:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
