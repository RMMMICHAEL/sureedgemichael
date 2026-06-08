/**
 * GET /api/dg/odds
 * Agrega odds de múltiplas plataformas:
 *  - Altenar: EstrelaBet, Br4bet, EsportivaBet, Jogo de Ouro
 *  - Kambi:   Sportingbet
 *
 * Query params:
 *   ?champ_id=11318  → filtra por liga Altenar (Kambi sempre retorna tudo)
 */
export const dynamic    = 'force-dynamic';
export const maxDuration = 30; // segundos — Vercel Pro/hobby suporta até 60s

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAllFootballOdds, getOddsByLeague, type OddsSummary } from '@/lib/altenar/client';
import { getKambiOdds }    from '@/lib/kambi/client';
// Betano e Novibet bloqueiam requisições de datacenter (Cloudflare) — desativados
// import { getBetanoOdds }   from '@/lib/betano/client';
// import { getNovibetOdds }  from '@/lib/novibet/client';
import { getSuperbetOdds } from '@/lib/superbet/client';
import { getBwinOdds }     from '@/lib/bwin/client';
import { getBet365Odds }   from '@/lib/bet365/client';

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

/**
 * Merge multiple odds sources into base (Altenar) by fuzzy team name match.
 * Matching events get their bookmakers merged; unmatched events are appended.
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
          if (!match.bookmakers.find(b => b.slug === bk.slug)) {
            match.bookmakers.push(bk);
          }
        }
      } else {
        merged.push(sev);
      }
    }
  }

  return merged;
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase    = createSupabaseServerClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  }

  const champId = req.nextUrl.searchParams.get('champ_id');
  // ?all=1 retorna todos os dias; ?date=YYYY-MM-DD filtra dia específico; padrão = hoje (BRT)
  const showAll  = req.nextUrl.searchParams.get('all')  === '1';
  const dateParam = req.nextUrl.searchParams.get('date') ?? '';

  try {
    const [altenarOdds, kambiOdds, superbetOdds, bwinOdds, bet365Odds] =
      await Promise.allSettled([
        champId ? getOddsByLeague(Number(champId)) : getAllFootballOdds(),
        getKambiOdds(),
        getSuperbetOdds(),
        getBwinOdds(),
        getBet365Odds(),
      ]);

    const altenar  = altenarOdds.status  === 'fulfilled' ? altenarOdds.value  : [];
    const kambi    = kambiOdds.status    === 'fulfilled' ? kambiOdds.value    : [];
    const superbet = superbetOdds.status === 'fulfilled' ? superbetOdds.value : [];
    const bwin     = bwinOdds.status     === 'fulfilled' ? bwinOdds.value     : [];
    const bet365   = bet365Odds.status   === 'fulfilled' ? bet365Odds.value   : [];

    let odds = mergeOdds(altenar, kambi, superbet, bwin, bet365);

    // Filtra por dia (Brasília = UTC-3)
    if (!showAll) {
      // ?date=YYYY-MM-DD → dia específico; sem date → hoje BRT
      const refBR   = dateParam
        ? new Date(dateParam + 'T12:00:00Z')
        : new Date(Date.now() - 3 * 60 * 60 * 1000);
      const filterY = refBR.getUTCFullYear();
      const filterM = refBR.getUTCMonth();
      const filterD = refBR.getUTCDate();

      odds = odds.filter(ev => {
        const d   = new Date(ev.start_time);
        // Converte UTC → BRT (UTC-3) para comparar o dia correto.
        // Exemplos: 21:00 BRT = 00:00 UTC próximo dia → subtrai 3h = 21:00 UTC = dia BRT correto.
        const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
        return brt.getUTCFullYear() === filterY &&
               brt.getUTCMonth()    === filterM &&
               brt.getUTCDate()     === filterD;
      });
    }

    const sources: string[] = [];
    if (altenar.length  > 0) sources.push('altenar');
    if (kambi.length    > 0) sources.push('kambi');
    if (superbet.length > 0) sources.push('superbet');
    if (bwin.length     > 0) sources.push('bwin');
    if (bet365.length   > 0) sources.push('bet365');

    return NextResponse.json({
      ok:      true,
      count:   odds.length,
      source:  sources.join('+') || 'none',
      // diagnóstico — remove depois
      _debug: {
        altenar:  altenar.length,
        superbet: superbet.length,
        bwin:     bwin.length,
        bet365:   bet365.length,
        superbetStatus: superbetOdds.status,
        bet365Status:   bet365Odds.status,
        bet365Reason:   bet365Odds.status === 'rejected' ? String((bet365Odds as PromiseRejectedResult).reason) : undefined,
      },
      odds,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[odds] falhou:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
