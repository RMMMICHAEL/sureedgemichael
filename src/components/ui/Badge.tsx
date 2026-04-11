import type { ResultType, AnomalyLevel } from '@/types';
import clsx from 'clsx';

interface ResultBadgeProps {
  result: ResultType;
  size?: 'sm' | 'md';
}

const RESULT_STYLES: Record<ResultType, { bg: string; color: string; border: string }> = {
  Green:        { bg: 'rgba(0,255,136,.08)',   color: '#00FF88', border: 'rgba(0,255,136,.15)' },
  Red:          { bg: 'rgba(255,77,77,.08)',   color: '#FF4D4D', border: 'rgba(255,77,77,.15)' },
  'Meio Green': { bg: 'rgba(255,214,0,.08)',   color: '#FFD600', border: 'rgba(255,214,0,.15)' },
  'Meio Red':   { bg: 'rgba(255,143,61,.08)',  color: '#FF8F3D', border: 'rgba(255,143,61,.15)' },
  Devolvido:             { bg: 'rgba(77,166,255,.08)',  color: '#4DA6FF', border: 'rgba(77,166,255,.15)' },
  Cashout:               { bg: 'rgba(255,191,0,.08)',  color: '#FFBF00', border: 'rgba(255,191,0,.15)' },
  'Pagamento Antecipado':{ bg: 'rgba(255,203,47,.08)', color: '#FFCB2F', border: 'rgba(255,203,47,.15)' },
  Pendente:              { bg: 'rgba(122,174,138,.06)', color: 'var(--t3)', border: 'rgba(122,174,138,.10)' },
};

export function ResultBadge({ result, size = 'md' }: ResultBadgeProps) {
  const s = RESULT_STYLES[result] ?? RESULT_STYLES.Pendente;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md font-bold',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      )}
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {result}
    </span>
  );
}

interface FlagBadgeProps {
  level: AnomalyLevel;
  label?: string;
}

const FLAG_STYLES: Record<AnomalyLevel, { bg: string; color: string; border: string }> = {
  light:    { bg: 'rgba(77,166,255,.08)',  color: '#4DA6FF', border: 'rgba(77,166,255,.15)' },
  medium:   { bg: 'rgba(255,214,0,.08)',   color: '#FFD600', border: 'rgba(255,214,0,.15)' },
  critical: { bg: 'rgba(255,77,77,.08)',   color: '#FF4D4D', border: 'rgba(255,77,77,.15)' },
};

export function FlagBadge({ level, label }: FlagBadgeProps) {
  const s = FLAG_STYLES[level];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold"
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {label ?? level}
    </span>
  );
}
