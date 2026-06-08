export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget';
const DEFAULT = 'culture=pt-BR&timezoneOffset=180&deviceType=1&numFormat=en-GB&countryCode=BR';

export async function GET() {
  const out: Record<string, unknown> = {};

  // 1. Sport menu
  try {
    const r = await fetch(`${BASE}/GetSportMenu?${DEFAULT}&integration=estrelabet&period=0`, { cache: 'no-store' });
    const d = await r.json();
    const sports = d?.sports ?? [];
    const football = sports.find((s: { id: number }) => s.id === 66);
    out.sportMenu = {
      ok: r.ok,
      sportsCount: sports.length,
      footballLeaguesCount: football?.champs?.length ?? 0,
      firstLeague: football?.champs?.[0] ?? null,
    };
  } catch (e) {
    out.sportMenu = { error: String(e) };
  }

  // 2. GetEvents for Brasileirão A (champId 11318)
  try {
    const r = await fetch(
      `${BASE}/GetEvents?${DEFAULT}&integration=estrelabet&eventCount=0&sportId=0&champIds=11318`,
      { cache: 'no-store' }
    );
    const d = await r.json();

    // Build maps
    const competitorMap = new Map<number, string>(
      (d.competitors ?? []).map((c: { id: number; name: string }) => [c.id, c.name])
    );
    const oddsMap = new Map<number, number>(
      (d.odds ?? []).map((o: { id: number; price: number }) => [o.id, o.price])
    );
    const marketMap = new Map<number, { typeId: number; oddIds: number[] }>(
      (d.markets ?? []).map((m: { id: number; typeId: number; oddIds: number[] }) => [m.id, m])
    );

    const resolved = [];
    for (const ev of d.events ?? []) {
      const t1 = competitorMap.get(ev.competitorIds?.[0]) ?? '';
      const t2 = competitorMap.get(ev.competitorIds?.[1]) ?? '';
      let odds1 = 0, oddsX = 0, odds2 = 0;
      for (const mId of ev.marketIds ?? []) {
        const m = marketMap.get(mId);
        if (!m || m.typeId !== 1) continue;
        odds1 = oddsMap.get(m.oddIds[0]) ?? 0;
        oddsX = oddsMap.get(m.oddIds[1]) ?? 0;
        odds2 = oddsMap.get(m.oddIds[2]) ?? 0;
        break;
      }
      resolved.push({ t1, t2, odds1, oddsX, odds2, skip: !t1 || !t2 || odds1 <= 1 || odds2 <= 1 });
    }

    out.getEvents = {
      ok: r.ok,
      eventsRaw: d.events?.length ?? 0,
      resolved,
    };
  } catch (e) {
    out.getEvents = { error: String(e) };
  }

  return NextResponse.json(out);
}
