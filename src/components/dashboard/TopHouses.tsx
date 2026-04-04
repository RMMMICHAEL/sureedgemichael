'use client';

import type { Leg } from '@/types';
import { calcByHouse } from '@/lib/finance/calculator';

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TopHouses({ legs }: { legs: Leg[] }) {
  const houses = calcByHouse(legs).slice(0, 6);
  const maxLegs = Math.max(...houses.map(h => h.legs), 1);

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
    >
      <div className="text-sm font-bold mb-4" style={{ color: 'var(--t)' }}>
        Casas Mais Usadas
      </div>

      {!houses.length ? (
        <div className="text-sm text-center py-6" style={{ color: 'var(--t3)' }}>
          Sem dados
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {houses.map(h => (
            <div key={h.house}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium" style={{ color: 'var(--t)' }}>
                  {h.house}
                </span>
                <span
                  className="text-xs font-bold font-mono"
                  style={{ color: h.profit >= 0 ? 'var(--g)' : 'var(--r)' }}
                >
                  {fmtBRL(h.profit)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--sur2)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(h.legs / maxLegs) * 100}%`,
                      background: h.profit >= 0 ? 'var(--g)' : 'var(--r)',
                      opacity: 0.7,
                    }}
                  />
                </div>
                <span className="text-xs font-mono" style={{ color: 'var(--t3)', width: 28, textAlign: 'right' }}>
                  {h.legs}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
