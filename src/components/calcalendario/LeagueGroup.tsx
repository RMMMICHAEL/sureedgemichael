'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SportsEvent, SportKey } from '@/lib/sportsdb';
import { getEventStatus } from '@/lib/sportsPriority';
import { EventCard } from './EventCard';
import { TeamLogo } from './TeamLogo';

interface Props {
  league:  string;
  events:  SportsEvent[];
  sport:   SportKey;
  defaultOpen?: boolean;
}

export function LeagueGroup({ league, events, sport, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const liveCount = events.filter(e => getEventStatus(e) === 'live').length;
  const leagueBadge = events[0]?.strLeagueBadge ?? null;

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,.06)', background: 'var(--bg2)' }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
        style={{ background: open ? 'rgba(255,255,255,.03)' : 'transparent' }}
      >
        <TeamLogo src={leagueBadge} name={league} size={18} />
        <span className="text-xs font-black uppercase tracking-wide flex-1 truncate"
          style={{ color: 'var(--t2)' }}>
          {league}
        </span>
        {liveCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(255,77,109,.15)', color: 'var(--r)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {liveCount} ao vivo
          </span>
        )}
        <span className="text-[11px] ml-1 flex-shrink-0" style={{ color: 'var(--t3)' }}>
          {events.length} {events.length === 1 ? 'jogo' : 'jogos'}
        </span>
        <ChevronDown
          size={14}
          style={{ color: 'var(--t3)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
        />
      </button>

      {/* Events */}
      {open && (
        <div className="divide-y" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
          {events.map(ev => (
            <div key={ev.idEvent} style={{ borderColor: 'rgba(255,255,255,.04)' }}>
              <EventCard event={ev} sport={sport} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
