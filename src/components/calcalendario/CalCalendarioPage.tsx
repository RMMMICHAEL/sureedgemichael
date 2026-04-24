'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, CalendarDays, AlertTriangle } from 'lucide-react';
import type { SportKey, SportsEvent } from '@/lib/sportsdb';
import { getEventStatus, groupByLeague, sortEvents } from '@/lib/sportsPriority';
import { SportsTabs } from './SportsTabs';
import { LeagueGroup } from './LeagueGroup';

// ── Priority league order per sport ────────────────────────────────────────
const LEAGUE_PRIORITY: Record<SportKey, string[]> = {
  soccer: [
    'UEFA Champions League','UEFA Europa League','UEFA Europa Conference League',
    'English Premier League','La Liga','Serie A','Bundesliga','Ligue 1',
    'Brazilian Série A','Copa do Brasil','Copa Libertadores','Copa Sudamericana','MLS',
  ],
  basketball: ['NBA','EuroLeague','NBB'],
  hockey:     ['NHL','KHL'],
  baseball:   ['MLB'],
  tennis:     ['ATP Masters','ATP Tour','WTA Tour','Grand Slam',
    'Australian Open','Roland Garros','Wimbledon','US Open'],
};

function sortLeagues(leagues: string[], sport: SportKey): string[] {
  const priority = LEAGUE_PRIORITY[sport] ?? [];
  return [...leagues].sort((a, b) => {
    const ia = priority.findIndex(l => a.toLowerCase().includes(l.toLowerCase()));
    const ib = priority.findIndex(l => b.toLowerCase().includes(l.toLowerCase()));
    const pa = ia === -1 ? priority.length : ia;
    const pb = ib === -1 ? priority.length : ib;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

interface CacheData {
  cached_at: string;
  date: string;
  sports: Record<string, SportsEvent[]>;
  stale?: boolean;
}

const AUTO_REFRESH_MS = 60_000;

function secondsAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
}

function formatSecondsAgo(s: number): string {
  if (s < 10)  return 'agora mesmo';
  if (s < 60)  return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
}

// Skeleton loader
function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2 px-3 py-3 rounded-xl animate-pulse"
      style={{ background: 'var(--bg2)', border: '1px solid rgba(255,255,255,.05)' }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div className="h-3 rounded flex-1" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div className="w-8 h-4 rounded" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div className="h-3 rounded flex-1" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,.07)' }} />
      </div>
      <div className="h-2.5 rounded w-1/3" style={{ background: 'rgba(255,255,255,.05)' }} />
    </div>
  );
}

function SkeletonGroup() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.06)', background: 'var(--bg2)' }}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 animate-pulse">
        <div className="w-4 h-4 rounded" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div className="h-3 rounded flex-1" style={{ background: 'rgba(255,255,255,.07)' }} />
      </div>
      <div className="flex flex-col gap-1 p-2">
        {[1,2,3].map(i => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

export function CalCalendarioPage() {
  const today = new Date().toISOString().split('T')[0];
  const [activeSport, setActiveSport] = useState<SportKey>('soccer');
  const [data, setData]               = useState<CacheData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string>(new Date().toISOString());
  const [tick, setTick]               = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every 10s to update "last updated" label
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/sports/today?date=${today}`);
      if (!res.ok) throw new Error('API error');
      const json: CacheData = await res.json();
      setData(json);
      setRefreshedAt(new Date().toISOString());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [today]);

  // Initial load
  useEffect(() => { fetchData(true); }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    timerRef.current = setInterval(() => fetchData(false), AUTO_REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  // Derived data
  const allEvents   = (data?.sports?.[activeSport] ?? []) as SportsEvent[];
  const sorted      = sortEvents(allEvents, activeSport);
  const grouped     = groupByLeague(sorted);
  const leagueNames = sortLeagues(Array.from(grouped.keys()), activeSport);

  // Live counts per sport for tab badges
  const liveCounts: Partial<Record<SportKey, number>> = {};
  if (data?.sports) {
    for (const [sport, evs] of Object.entries(data.sports)) {
      const n = (evs as SportsEvent[]).filter(e => getEventStatus(e) === 'live').length;
      if (n > 0) liveCounts[sport as SportKey] = n;
    }
  }

  const totalLive  = Object.values(liveCounts).reduce((a, b) => a + (b ?? 0), 0);
  const secs       = secondsAgo(refreshedAt);

  // Formatted date for title
  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <CalendarDays size={18} style={{ color: 'var(--g)' }} />
            <h1 className="text-lg font-black" style={{ color: 'var(--t)' }}>
              CalCalendário
            </h1>
            {totalLive > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,77,109,.15)', color: 'var(--r)', border: '1px solid rgba(255,77,109,.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {totalLive} ao vivo
              </span>
            )}
          </div>
          <p className="text-xs capitalize" style={{ color: 'var(--t3)' }}>{dateLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--yd)', color: 'var(--y)', border: '1px solid rgba(255,214,0,.2)' }}>
              <AlertTriangle size={12} />
              Dados temporariamente indisponíveis
            </span>
          )}
          {!loading && !error && (
            <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
              Atualizado {formatSecondsAgo(secs)}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{
              background: 'rgba(63,255,33,.08)',
              color: 'var(--g)',
              border: '1px solid rgba(63,255,33,.15)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? .6 : 1,
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Sport tabs */}
      <SportsTabs active={activeSport} onChange={setActiveSport} liveCounts={liveCounts} />

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1,2,3].map(i => <SkeletonGroup key={i} />)}
        </div>
      ) : allEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-4xl">📭</span>
          <p className="font-bold" style={{ color: 'var(--t2)' }}>
            Nenhum jogo programado para hoje
          </p>
          <p className="text-xs" style={{ color: 'var(--t3)' }}>
            Tente outro esporte ou volte mais tarde
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {leagueNames.map((league, i) => {
            const events = grouped.get(league)!;
            const hasLive = events.some(e => getEventStatus(e) === 'live');
            return (
              <LeagueGroup
                key={league}
                league={league}
                events={events}
                sport={activeSport}
                defaultOpen={i < 5 || hasLive}
              />
            );
          })}
        </div>
      )}

      {/* Stale warning */}
      {data?.stale && (
        <p className="text-center text-xs py-2" style={{ color: 'var(--t3)' }}>
          ⚠️ Exibindo dados do último cache disponível
        </p>
      )}
    </div>
  );
}
