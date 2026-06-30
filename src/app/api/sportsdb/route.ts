import { NextRequest, NextResponse } from 'next/server';

const BASE   = process.env.DUCKTIPS_API_URL ?? 'https://api.ducktipsbr.com';
const APIKEY = process.env.DUCKTIPS_APIKEY  ?? '';
const TSDB   = 'https://www.thesportsdb.com/api/v1/json/3';

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

// ── In-memory badge cache (badge URLs são estáveis — 2h TTL) ─────────────────
interface BadgeEntry { home: string | null; away: string | null; league: string | null; ts: number }
const badgeCache = new Map<string, BadgeEntry>();
const BADGE_TTL  = 2 * 60 * 60 * 1000;

async function fetchTSDBBadge(eventId: string): Promise<BadgeEntry | null> {
  const cached = badgeCache.get(eventId);
  if (cached && Date.now() - cached.ts < BADGE_TTL) return cached;

  try {
    const res = await fetch(`${TSDB}/lookupevent.php?id=${eventId}`, {
      next: { revalidate: 7200 },
    });
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
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayBRT();

  const url = `${BASE}/rest/v1/thesportsdb_matches?select=${SELECT}&event_date=eq.${date}&order=event_time.asc&limit=500`;

  try {
    const res = await fetch(url, {
      headers: { 'apikey': APIKEY, 'Authorization': `Bearer ${APIKEY}`, 'Accept': 'application/json' },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error', status: res.status }, { status: 502 });
    }

    const matches = await res.json() as Array<{
      api_event_id: string;
      home_badge: string | null;
      away_badge: string | null;
      [key: string]: unknown;
    }>;

    // Enriquece com badges do TheSportsDB para eventos sem badge
    const needsBadge = matches.filter(m => !m.home_badge && !m.away_badge);
    // Limita a 60 fetches paralelos para não sobrecarregar a TSDB
    const chunk = needsBadge.slice(0, 60);
    await Promise.allSettled(
      chunk.map(async m => {
        const b = await fetchTSDBBadge(m.api_event_id);
        if (b) {
          m.home_badge   = b.home;
          m.away_badge   = b.away;
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
