export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET() {
  const BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget';
  const params = new URLSearchParams({
    culture: 'pt-BR', timezoneOffset: '180', deviceType: '1',
    numFormat: 'en-GB', countryCode: 'BR',
    integration: 'estrelabet', eventCount: '0', sportId: '0', champIds: '11318',
  });

  const res = await fetch(`${BASE}/GetEvents?${params}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const status = res.status;
  if (!res.ok) return NextResponse.json({ status, error: 'fetch failed' });

  const data = await res.json();

  // Return counts and first item of each key so we can see the structure
  const summary: Record<string, unknown> = {
    httpStatus: status,
    topLevelKeys: Object.keys(data),
    eventsCount: data.events?.length ?? 0,
    competitorsCount: data.competitors?.length ?? 0,
    marketsCount: data.markets?.length ?? 0,
    oddsCount: data.odds?.length ?? 0,
    firstEvent: data.events?.[0] ?? null,
    firstCompetitor: data.competitors?.[0] ?? null,
    firstMarket: data.markets?.[0] ?? null,
    firstOdd: data.odds?.[0] ?? null,
  };

  return NextResponse.json(summary);
}
