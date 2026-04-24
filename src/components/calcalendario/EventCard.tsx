'use client';

import type { SportsEvent, SportKey } from '@/lib/sportsdb';
import { getEventStatus } from '@/lib/sportsPriority';
import { StatusBadge } from './StatusBadge';
import { TeamLogo } from './TeamLogo';
import { PlayerFlag } from './PlayerFlag';

interface Props {
  event: SportsEvent;
  sport: SportKey;
}

const USE_FLAGS: SportKey[] = ['tennis', 'baseball'];

function formatTime(strTime: string | null): string {
  if (!strTime) return '';
  try {
    const [h, m] = strTime.replace(/:\d+$/, '').split(':');
    const d = new Date();
    d.setUTCHours(Number(h), Number(m), 0, 0);
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).format(d);
  } catch { return strTime; }
}

export function EventCard({ event: e, sport }: Props) {
  const status    = getEventStatus(e);
  const useFlags  = USE_FLAGS.includes(sport);
  const isLive    = status === 'live';
  const isFinished = status === 'finished';

  const hasScore = e.intHomeScore !== null && e.intAwayScore !== null
    && e.intHomeScore !== '' && e.intAwayScore !== '';

  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl transition-colors cursor-default group"
      style={{
        background: isLive ? 'rgba(255,77,109,.04)' : 'transparent',
        border: isLive ? '1px solid rgba(255,77,109,.12)' : '1px solid transparent',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isLive ? 'rgba(255,77,109,.07)' : 'rgba(255,255,255,.03)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isLive ? 'rgba(255,77,109,.04)' : 'transparent'; }}
    >
      {/* Teams row */}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {useFlags
            ? <PlayerFlag country={e.strCountry} size={22} />
            : <TeamLogo src={e.strHomeTeamBadge} name={e.strHomeTeam} size={22} />
          }
          <span
            className="text-sm font-semibold truncate"
            style={{ color: isFinished ? 'var(--t3)' : 'var(--t)' }}
          >
            {e.strHomeTeam}
          </span>
        </div>

        {/* Score / separator */}
        <div className="flex items-center gap-1.5 flex-shrink-0 px-2">
          {hasScore ? (
            <>
              <span
                className="text-base font-black tabular-nums"
                style={{ color: isLive ? 'var(--r)' : isFinished ? 'var(--t3)' : 'var(--t)' }}
              >
                {e.intHomeScore}
              </span>
              <span className="text-xs" style={{ color: 'var(--t3)' }}>–</span>
              <span
                className="text-base font-black tabular-nums"
                style={{ color: isLive ? 'var(--r)' : isFinished ? 'var(--t3)' : 'var(--t)' }}
              >
                {e.intAwayScore}
              </span>
            </>
          ) : (
            <span className="text-xs font-bold px-1" style={{ color: 'var(--t3)' }}>vs</span>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span
            className="text-sm font-semibold truncate text-right"
            style={{ color: isFinished ? 'var(--t3)' : 'var(--t)' }}
          >
            {e.strAwayTeam}
          </span>
          {useFlags
            ? <PlayerFlag country={e.strCountry} size={22} />
            : <TeamLogo src={e.strAwayTeamBadge} name={e.strAwayTeam} size={22} />
          }
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {status === 'live' || status === 'finished' || status === 'postponed'
          ? <StatusBadge status={status} rawStatus={e.strStatus} progress={e.strProgress} />
          : e.strTime
            ? <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--bl)' }}>
                {formatTime(e.strTime)}
              </span>
            : null
        }
        {e.strVenue && (
          <span className="text-[11px] truncate" style={{ color: 'var(--t3)' }}>
            {e.strVenue}
          </span>
        )}
      </div>
    </div>
  );
}
