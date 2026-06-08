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
import { getKambiOdds }              from '@/lib/kambi/client';

/**
 * Merge Kambi events into Altenar events by fuzzy team name match.
 * When a Kambi event matches an existing Altenar event, its bookmakers
 * are added to that event. Unmatched Kambi events are appended separately.
 */
function mergeOdds(altenar: OddsSummary[], kambi: OddsSummary[]): OddsSummary[] {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  const merged = altenar.map(ev => ({ ...ev, bookmakers: [...ev.bookmakers] }));

  for (const kev of kambi) {
    const kHome = normalize(kev.home_team);
    const kAway = normalize(kev.away_team);

    const match = merged.find(aev => {
      const aHome = normalize(aev.home_team);
      const aAway = normalize(aev.away_team);
      return (
        (aHome.includes(kHome.slice(0, 5)) || kHome.includes(aHome.slice(0, 5))) &&
        (aAway.includes(kAway.slice(0, 5)) || kAway.includes(aAway.slice(0, 5)))
      );
    });

    if (match) {
      match.bookmakers.push(...kev.bookmakers);
    } else {
      merged.push(kev);
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

  try {
    const [altenarOdds, kambiOdds] = await Promise.allSettled([
      champId ? getOddsByLeague(Number(champId)) : getAllFootballOdds(),
      getKambiOdds(),
    ]);

    const altenar = altenarOdds.status === 'fulfilled' ? altenarOdds.value : [];
    const kambi   = kambiOdds.status   === 'fulfilled' ? kambiOdds.value   : [];

    const odds = mergeOdds(altenar, kambi);

    const sources: string[] = [];
    if (altenar.length > 0) sources.push('altenar');
    if (kambi.length > 0)   sources.push('kambi');

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
