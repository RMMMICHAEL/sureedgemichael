import { NextRequest, NextResponse } from 'next/server';

const BASE    = process.env.DUCKTIPS_API_URL ?? 'https://api.ducktipsbr.com';
const APIKEY  = process.env.DUCKTIPS_APIKEY  ?? '';

const SELECT  = [
  'api_event_id','home_team','away_team','league',
  'event_date','event_time','home_score','away_score',
  'status','is_live','progress',
  'home_badge','away_badge','home_team_pt','away_team_pt','league_pt',
].join(',');

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayBRT();

  const url = `${BASE}/rest/v1/thesportsdb_matches?select=${SELECT}&event_date=eq.${date}&order=event_time.asc&limit=500`;

  try {
    const res = await fetch(url, {
      headers: {
        'apikey':        APIKEY,
        'Authorization': `Bearer ${APIKEY}`,
        'Accept':        'application/json',
      },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error', status: res.status }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (e) {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
