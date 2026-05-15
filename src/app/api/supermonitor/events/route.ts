import { NextRequest, NextResponse } from 'next/server';
import { createSession, fetchDecrypted } from '@/lib/supermonitor-crypto';

interface SMEvent {
  home?:    string;
  away?:    string;
  date?:    string;
  league?:  { name?: string; slug?: string } | string;
  sport?:   string;
  id?:      string | number;
  bookmakers?: number | unknown[];
  odds_count?: number;
  houses?:  number;
  [key: string]: unknown;
}

function normalise(raw: SMEvent) {
  const home   = String(raw.home ?? '');
  const away   = String(raw.away ?? '');
  const name   = home && away ? `${home} x ${away}` : home || away || 'Evento';
  const id     = raw.id ? String(raw.id) : `${home}-${away}-${raw.date ?? ''}`.replace(/\s+/g, '-');
  const league = typeof raw.league === 'string' ? raw.league : (raw.league?.name ?? raw.sport ?? 'Sport');
  const sport  = String(raw.sport ?? league);
  const start_utc = String(raw.date ?? '');

  let house_count = 0;
  if (typeof raw.bookmakers === 'number') house_count = raw.bookmakers;
  else if (Array.isArray(raw.bookmakers)) house_count = raw.bookmakers.length;
  else if (typeof raw.odds_count === 'number') house_count = raw.odds_count;
  else if (typeof raw.houses === 'number') house_count = raw.houses;

  return { id, name, sport, league, start_utc, house_count };
}

export async function POST(req: NextRequest) {
  let cookie = '', date = '';
  try {
    const body = await req.json() as { cookie?: string; date?: string };
    cookie = body.cookie ?? '';
    date   = body.date   ?? '';
  } catch (_e) { /* vazio */ }

  const authCookie = cookie || (process.env.SUPERMONITOR_COOKIE ?? '');

  try {
    const session  = await createSession(authCookie || undefined);
    const qs       = date ? `action=events_lite&date=${encodeURIComponent(date)}` : 'action=events_lite';
    const parsed   = await fetchDecrypted(session, qs) as { events?: SMEvent[] } | SMEvent[];
    const rawEvents: SMEvent[] = Array.isArray(parsed) ? parsed : (parsed.events ?? []);

    const events = rawEvents.map(normalise);
    events.sort((a, b) => a.start_utc.localeCompare(b.start_utc));

    return NextResponse.json({ ok: true, events, source: 'supermonitor' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
