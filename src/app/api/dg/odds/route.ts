/**
 * GET /api/dg/odds
 * Agrega odds de múltiplas plataformas:
 *  - Altenar: EstrelaBet, Br4bet, EsportivaBet, Jogo de Ouro
 *  - Kambi:   Sportingbet
 *
 * Query params:
 *   ?champ_id=11318  → filtra por liga Altenar (Kambi sempre retorna tudo)
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAllFootballOdds, getOddsByLeague, type OddsSummary } from '@/lib/altenar/client';
import { getKambiOdds }    from '@/lib/kambi/client';
import { getBetanoOdds }   from '@/lib/betano/client';
import { getSuperbetOdds } from '@/lib/superbet/client';
import { getNovibetOdds }  from '@/lib/novibet/client';
import { getBwinOdds }     from '@/lib/bwin/client';

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
  // ?all=1 retorna todos os dias; padrão = só hoje (horário de Brasília)
  const showAll = req.nextUrl.searchParams.get('all') === '1';

  try {
    const [altenarOdds, kambiOdds, betanoOdds, superbetOdds, novibetOdds, bwinOdds] =
      await Promise.allSettled([
        champId ? getOddsByLeague(Number(champId)) : getAllFootballOdds(),
        getKambiOdds(),
        getBetanoOdds(),
        getSuperbetOdds(),
        getNovibetOdds(),
        getBwinOdds(),
      ]);

    const altenar  = altenarOdds.status  === 'fulfilled' ? altenarOdds.value  : [];
    const kambi    = kambiOdds.status    === 'fulfilled' ? kambiOdds.value    : [];
    const betano   = betanoOdds.status   === 'fulfilled' ? betanoOdds.value   : [];
    const superbet = superbetOdds.status === 'fulfilled' ? superbetOdds.value : [];
    const novibet  = novibetOdds.status  === 'fulfilled' ? novibetOdds.value  : [];
    const bwin     = bwinOdds.status     === 'fulfilled' ? bwinOdds.value     : [];

    let odds = mergeOdds(altenar, kambi, betano, superbet, novibet, bwin);

    // Filtra por dia (Brasília = UTC-3)
    if (!showAll) {
      const nowBR  = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const todayY = nowBR.getUTCFullYear();
      const todayM = nowBR.getUTCMonth();
      const todayD = nowBR.getUTCDate();

      odds = odds.filter(ev => {
        const d = new Date(ev.start_time);
        const dBR = new Date(d.getTime() - 3 * 60 * 60 * 1000);
        return (
          dBR.getUTCFullYear() === todayY &&
          dBR.getUTCMonth()    === todayM &&
          dBR.getUTCDate()     === todayD
        );
      });
    }

    const sources: string[] = [];
    if (altenar.length  > 0) sources.push('altenar');
    if (kambi.length    > 0) sources.push('kambi');
    if (betano.length   > 0) sources.push('betano');
    if (superbet.length > 0) sources.push('superbet');
    if (novibet.length  > 0) sources.push('novibet');
    if (bwin.length     > 0) sources.push('bwin');

    return NextResponse.json({
      ok:      true,
      count:   odds.length,
      source:  sources.join('+') || 'none',
      odds,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[odds] falhou:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
