'use client';

import type { SportKey } from '@/lib/sportsdb';

export interface SportTab {
  key: SportKey;
  label: string;
  icon: React.ReactNode;
}

const SPORT_TABS: SportTab[] = [
  {
    key: 'soccer',
    label: 'Futebol',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12" strokeWidth="1.2"/>
        <path d="M12 6 L8 9 L9.5 13.5 L14.5 13.5 L16 9 Z" fill="currentColor" opacity=".5"/>
      </svg>
    ),
  },
  {
    key: 'tennis',
    label: 'Tênis',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M5 5 Q12 12 5 19" strokeWidth="1.5"/>
        <path d="M19 5 Q12 12 19 19" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    key: 'basketball',
    label: 'Basquete',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12 L22 12" />
        <path d="M12 2 L12 22" />
        <path d="M5 4 Q8 12 5 20" strokeWidth="1.5"/>
        <path d="M19 4 Q16 12 19 20" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    key: 'baseball',
    label: 'Beisebol',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 4 Q10 12 8 20" strokeWidth="1.5"/>
        <path d="M16 4 Q14 12 16 20" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    key: 'hockey',
    label: 'Hóquei',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 8 L12 14 L19 8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 8 L3 12 Q3 17 8 17 L16 17 Q21 17 21 12 L19 8" strokeLinecap="round"/>
        <ellipse cx="12" cy="19" rx="5" ry="2" fill="currentColor" opacity=".3"/>
      </svg>
    ),
  },
];

interface Props {
  active: SportKey;
  onChange: (sport: SportKey) => void;
  liveCounts?: Partial<Record<SportKey, number>>;
}

export function SportsTabs({ active, onChange, liveCounts = {} }: Props) {
  return (
    <div
      className="flex overflow-x-auto scrollbar-none gap-1 p-1 rounded-xl flex-shrink-0"
      style={{ background: 'var(--bg2)', border: '1px solid rgba(255,255,255,.06)' }}
    >
      {SPORT_TABS.map(tab => {
        const isActive = tab.key === active;
        const live = liveCounts[tab.key] ?? 0;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 relative"
            style={isActive
              ? {
                  background: 'rgba(63,255,33,.12)',
                  color: 'var(--g)',
                  border: '1px solid rgba(63,255,33,.20)',
                  boxShadow: '0 0 12px rgba(63,255,33,.08)',
                }
              : {
                  color: 'var(--t3)',
                  border: '1px solid transparent',
                }
            }
          >
            {tab.icon}
            <span>{tab.label}</span>
            {live > 0 && (
              <span
                className="ml-0.5 text-[9px] font-black px-1 py-0.5 rounded-full"
                style={{ background: 'rgba(255,77,109,.2)', color: 'var(--r)' }}
              >
                {live}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
