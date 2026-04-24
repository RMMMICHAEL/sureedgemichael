export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { fetchSportEvents, type SportKey } from '@/lib/sportsdb';
import { sortEvents } from '@/lib/sportsPriority';

// ── In-memory cache (persists across requests within the same server instance)
interface CacheEntry {
  cached_at: string;
  date: string;
  sports: Record<string, unknown[]>;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let _cache: CacheEntry | null = null;

const ALL_SPORTS: SportKey[] = ['soccer', 'tennis', 'basketball', 'baseball', 'hockey'];

async function buildCache(date: string): Promise<CacheEntry> {
  const results = await Promise.allSettled(
    ALL_SPORTS.map(sport => fetchSportEvents(sport, date).then(events => ({ sport, events })))
  );

  const sports: Record<string, unknown[]> = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { sport, events } = r.value;
      sports[sport] = sortEvents(events, sport);
    }
  }

  return {
    cached_at: new Date().toISOString(),
    date,
    sports,
  };
}

function isCacheValid(entry: CacheEntry, date: string): boolean {
  if (entry.date !== date) return false;
  const age = Date.now() - new Date(entry.cached_at).getTime();
  return age < CACHE_TTL_MS;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const sport = searchParams.get('sport') as SportKey | null;

  try {
    // Serve or build cache
    if (!_cache || !isCacheValid(_cache, date)) {
      _cache = await buildCache(date);
    }

    if (sport) {
      // Return single sport
      return NextResponse.json({
        cached_at: _cache.cached_at,
        date: _cache.date,
        events: _cache.sports[sport] ?? [],
      });
    }

    // Return all sports
    return NextResponse.json(_cache);
  } catch (err) {
    console.error('[sports/today]', err);
    // If cache exists but stale, return it with a warning
    if (_cache && _cache.date === date) {
      return NextResponse.json({ ..._cache, stale: true }, { status: 200 });
    }
    return NextResponse.json({ error: 'Dados indisponíveis', sports: {} }, { status: 503 });
  }
}

// ── Cache invalidation endpoint (POST) — protegido por token secreto
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cache-secret');
  if (!secret || secret !== process.env.SPORTS_CACHE_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  try {
    _cache = await buildCache(date);
    return NextResponse.json({ ok: true, cached_at: _cache.cached_at });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
