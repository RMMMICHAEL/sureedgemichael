'use client';

import type { KPIs } from '@/lib/finance/calculator';

function fmtBRL(v: number): string {
  const sign = v < 0 ? '\u2212' : '+';
  const abs  = Math.abs(v);
  return `${sign} R$ ${abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface KPICardProps {
  label:    string;
  value:    string;
  sub?:     string;
  positive?: boolean | null;
  highlight?: boolean;
}

function KPICard({ label, value, sub, positive, highlight }: KPICardProps) {
  const color =
    positive === true  ? 'var(--g)' :
    positive === false ? 'var(--r)' :
    'var(--t)';

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-1.5 transition-all duration-200"
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${highlight ? 'var(--gb)' : 'var(--b)'}`,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = highlight ? 'var(--gb)' : 'var(--b)'; }}
    >
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
        {label}
      </div>
      <div className="text-2xl font-extrabold tracking-tight" style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px]" style={{ color: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

interface KPIGridProps {
  kpis: KPIs;
  today: string;
  currentMonth: string;
}

export function KPIGrid({ kpis, today, currentMonth }: KPIGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
      <KPICard
        label="Lucro Hoje"
        value={fmtBRL(kpis.profitDay)}
        sub={today}
        positive={kpis.profitDay >= 0}
        highlight
      />
      <KPICard
        label="Lucro Semana"
        value={fmtBRL(kpis.profitWeek)}
        sub="Seg\u2013Dom"
        positive={kpis.profitWeek >= 0}
      />
      <KPICard
        label="Lucro do Mês"
        value={fmtBRL(kpis.profitMonth)}
        sub={currentMonth}
        positive={kpis.profitMonth >= 0}
      />
      <KPICard
        label="Lucro Total"
        value={fmtBRL(kpis.profitTotal)}
        sub={`${kpis.totalOps} operações`}
        positive={kpis.profitTotal >= 0}
      />
      <KPICard
        label="ROI Período"
        value={`${kpis.roi.toFixed(2)}%`}
        sub="filtro aplicado"
        positive={kpis.roi >= 0}
      />
      <KPICard
        label="Caixa Total"
        value={fmtBRL(kpis.cash)}
        sub="Casas + Bancos"
      />
      <KPICard
        label="Pendentes"
        value={String(kpis.pending)}
        sub="em aberto"
        positive={kpis.pending === 0 ? true : null}
      />
      <KPICard
        label="Pernas"
        value={String(kpis.totalLegs)}
        sub={`${kpis.totalOps} ops`}
      />
    </div>
  );
}
