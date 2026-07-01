import { NextRequest, NextResponse } from 'next/server';

const BASE    = process.env.DUCKTIPS_API_URL  ?? 'https://api.ducktipsbr.com';
const APIKEY  = process.env.DUCKTIPS_APIKEY   ?? '';
const SUPABASE_AUTH = 'https://rkndrrpqsmqdrbcvsmzl.supabase.co/auth/v1';
const TSDB    = 'https://www.thesportsdb.com/api/v1/json/3';

const SELECT = [
  'api_event_id','home_team','away_team','league',
  'event_date','event_time','home_score','away_score',
  'status','is_live','progress',
  'home_badge','away_badge','home_team_pt','away_team_pt','league_pt',
].join(',');

function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// ── Token cache (renovado automaticamente via refresh token) ─────────────────
let cachedJwt     = process.env.DUCKTIPS_JWT     ?? '';
let cachedRefresh = process.env.DUCKTIPS_REFRESH ?? '';

async function getValidJwt(): Promise<string> {
  // Verifica se o token atual ainda está válido (margem de 60s)
  if (cachedJwt) {
    try {
      const payload = JSON.parse(Buffer.from(cachedJwt.split('.')[1], 'base64').toString());
      if (payload.exp * 1000 > Date.now() + 60_000) return cachedJwt;
    } catch { /* token malformado — tenta refresh */ }
  }

  // Token expirado ou ausente — renova com refresh token
  if (!cachedRefresh) return cachedJwt; // sem refresh, usa o que tem
  try {
    const res = await fetch(`${SUPABASE_AUTH}/token?grant_type=refresh_token`, {
      method:  'POST',
      headers: { 'apikey': APIKEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: cachedRefresh }),
    });
    if (!res.ok) return cachedJwt;
    const data = await res.json() as { access_token?: string; refresh_token?: string };
    if (data.access_token) cachedJwt     = data.access_token;
    if (data.refresh_token) cachedRefresh = data.refresh_token;
  } catch { /* mantém token atual */ }

  return cachedJwt;
}

// ── In-memory badge cache (2h TTL) ──────────────────────────────────────────
interface BadgeEntry { home: string | null; away: string | null; league: string | null; ts: number }
const badgeCache = new Map<string, BadgeEntry>();
const BADGE_TTL  = 2 * 60 * 60 * 1000;

async function fetchTSDBBadge(eventId: string): Promise<BadgeEntry | null> {
  const cached = badgeCache.get(eventId);
  if (cached && Date.now() - cached.ts < BADGE_TTL) return cached;
  try {
    const res = await fetch(`${TSDB}/lookupevent.php?id=${eventId}`, { next: { revalidate: 7200 } });
    if (!res.ok) return null;
    const data = await res.json() as { events?: Array<{
      strHomeTeamBadge?: string; strAwayTeamBadge?: string;
      strLeagueBadge?: string;  strLeagueLogo?: string;
    }> };
    const ev = data.events?.[0];
    if (!ev) return null;
    const entry: BadgeEntry = {
      home:   ev.strHomeTeamBadge ?? null,
      away:   ev.strAwayTeamBadge ?? null,
      league: ev.strLeagueBadge ?? ev.strLeagueLogo ?? null,
      ts:     Date.now(),
    };
    badgeCache.set(eventId, entry);
    return entry;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayBRT();
  const jwt  = await getValidJwt();

  const url = `${BASE}/rest/v1/thesportsdb_matches?select=${SELECT}&event_date=eq.${date}&order=event_time.asc&limit=500`;

  try {
    const res = await fetch(url, {
      headers: { 'apikey': APIKEY, 'Authorization': `Bearer ${jwt}`, 'Accept': 'application/json' },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error', status: res.status }, { status: 502 });
    }

    const matches = await res.json() as Array<{
      api_event_id: string; home_badge: string | null; away_badge: string | null;
      [key: string]: unknown;
    }>;

    // Enriquece com badges do TheSportsDB para eventos sem badge
    const needsBadge = matches.filter(m => !m.home_badge && !m.away_badge).slice(0, 60);
    await Promise.allSettled(
      needsBadge.map(async m => {
        const b = await fetchTSDBBadge(m.api_event_id);
        if (b) {
          m.home_badge = b.home;
          m.away_badge = b.away;
          (m as Record<string, unknown>).league_badge = b.league;
        }
      })
    );

    return NextResponse.json(matches, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
