'use client';

import type { EventStatus } from '@/lib/sportsPriority';

interface Props {
  status: EventStatus;
  rawStatus: string | null;
  progress?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  '1H': '1º Tempo', '2H': '2º Tempo', 'HT': 'Intervalo',
  'ET': 'Prorrog.', 'P': 'Pênaltis', 'Q1': '1º Quarto',
  'Q2': '2º Quarto', 'Q3': '3º Quarto', 'Q4': '4º Quarto',
  'OT': 'Prorrog.', 'FT': 'Enc.', 'AET': 'Enc.(PE)',
  'PEN': 'Enc.(Pen)', 'PPD': 'Adiado', 'SUSP': 'Suspens.',
  'CANC': 'Cancelado', 'ABD': 'Abandono', 'NS': '',
};

export function StatusBadge({ status, rawStatus, progress }: Props) {
  const s = (rawStatus ?? '').toUpperCase();

  if (status === 'live') {
    const label = STATUS_LABELS[s] ?? s;
    const prog  = progress ?? s;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide"
        style={{ background: 'rgba(255,77,109,.15)', color: 'var(--r)', border: '1px solid rgba(255,77,109,.3)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        {label || 'AO VIVO'}{prog && prog !== s ? ` ${prog}'` : ''}
      </span>
    );
  }

  if (status === 'finished') {
    const label = STATUS_LABELS[s] ?? 'Enc.';
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide"
        style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid rgba(255,255,255,.08)' }}>
        {label}
      </span>
    );
  }

  if (status === 'postponed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide"
        style={{ background: 'rgba(255,214,0,.10)', color: 'var(--y)', border: '1px solid rgba(255,214,0,.25)' }}>
        Adiado
      </span>
    );
  }

  return null; // upcoming — shows time instead
}
