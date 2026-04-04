'use client';

import type { Leg } from '@/types';
import { ResultBadge } from '@/components/ui/Badge';
import { groupLegsIntoOps, calcLegProfit } from '@/lib/finance/calculator';

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RecentOps({ legs }: { legs: Leg[] }) {
  const ops = groupLegsIntoOps(legs)
    .sort((a, b) => (b.bet_date || '').localeCompare(a.bet_date || ''))
    .slice(0, 8);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
    >
      <div
        className="px-5 py-4 text-sm font-bold"
        style={{ color: 'var(--t)', borderBottom: '1px solid var(--b)' }}
      >
        Últimas Operações
      </div>
      {!ops.length ? (
        <div className="p-8 text-center text-sm" style={{ color: 'var(--t3)' }}>
          Nenhuma operação no período
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Evento</th>
                <th>Casa</th>
                <th>Pernas</th>
                <th style={{ textAlign: 'right' }}>Lucro</th>
              </tr>
            </thead>
            <tbody>
              {ops.map(op => {
                const firstLeg = op.legs[0];
                return (
                  <tr key={op.id}>
                    <td className="font-mono text-xs whitespace-nowrap">
                      {(op.bet_date || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="max-w-xs truncate">
                      <span className="mr-1.5 text-xs">{sportEmoji(op.sport)}</span>
                      {op.event || '—'}
                    </td>
                    <td className="text-xs">{firstLeg?.ho || '—'}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {op.legs.map(l => (
                          <ResultBadge key={l.id} result={l.re} size="sm" />
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span
                        className="font-bold font-mono text-sm"
                        style={{ color: op.profit >= 0 ? 'var(--g)' : 'var(--r)' }}
                      >
                        {fmtBRL(op.profit)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function sportEmoji(s: string) {
  const m: Record<string, string> = {
    Futebol: '⚽', Tênis: '🎾', Basquete: '🏀',
    Hockey: '🏒', 'E-Futebol': '🎮',
  };
  return m[s] ?? '🎯';
}
