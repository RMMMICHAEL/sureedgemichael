'use client';

import { useState, useMemo } from 'react';
import { useStore }   from '@/store/useStore';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid,
} from 'recharts';
import { calcLegProfit } from '@/lib/finance/calculator';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';
import { houseFavicon } from '@/lib/bookmakers/logos';
import { Wallet, Building2, TrendingUp, Percent, Filter, X } from 'lucide-react';
import type { Leg } from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number, showSign = false) {
  const sign = showSign ? (v < 0 ? '\u2212' : '+') : (v < 0 ? '\u2212' : '');
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--b)',
  borderRadius: 16,
};

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg3)',
  border: '1px solid var(--b2)',
  borderRadius: 12,
  color: 'var(--t)',
  fontFamily: "'JetBrains Mono', monospace",
  boxShadow: '0 8px 32px rgba(0,0,0,.5)',
};

// ── House logo ────────────────────────────────────────────────────────────────

function HouseLogo({ name, abbr, color }: { name: string; abbr: string; color: string }) {
  const [err, setErr] = useState(false);
  const logo = houseFavicon(name);
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden"
      style={{ background: (color || 'var(--t3)') + '22', color: color || 'var(--t3)' }}
    >
      {logo && !err ? (
        <img src={logo} alt={name} width={22} height={22} onError={() => setErr(true)}
          style={{ borderRadius: 4, objectFit: 'contain' }} />
      ) : (
        abbr
      )}
    </div>
  );
}

// ── Cash evolution chart with date filter ─────────────────────────────────────

function CashEvolutionChart({ legs }: { legs: Leg[] }) {
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  const settled = useMemo(() => {
    let l = legs.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido');
    if (from) l = l.filter(x => x.bd.slice(0, 10) >= from);
    if (to)   l = l.filter(x => x.bd.slice(0, 10) <= to);
    return l;
  }, [legs, from, to]);

  const byDay: Record<string, number> = {};
  settled.forEach(l => {
    const d = l.bd.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + calcLegProfit(l);
  });

  const days = Object.keys(byDay).sort();
  let cum = 0;
  const data = days.map(date => {
    cum += byDay[date];
    return { date: date.slice(5).replace('-', '/'), cumulative: +cum.toFixed(2) };
  });

  const lastVal = data[data.length - 1]?.cumulative ?? 0;
  const lineColor = lastVal >= 0 ? '#4DA6FF' : 'var(--r)';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const val = payload[0].value as number;
    return (
      <div className="rounded-xl px-3 py-2 text-sm" style={tooltipStyle}>
        <span style={{ color: 'var(--t3)' }}>{label}: </span>
        <span style={{ color: val >= 0 ? '#4DA6FF' : 'var(--r)' }}>{fmtBRL(val)}</span>
      </div>
    );
  };

  const inputS: React.CSSProperties = {
    background: 'var(--sur)',
    border: '1px solid var(--b2)',
    color: 'var(--t)',
    borderRadius: 8,
    padding: '5px 10px',
    fontSize: 12,
  };

  return (
    <div className="rounded-2xl p-5" style={cardStyle}>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="font-bold text-sm" style={{ color: 'var(--t)' }}>Evolução do Lucro Acumulado</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Lucro bruto cumulativo ao longo do tempo</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={12} style={{ color: 'var(--t3)' }} />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputS} />
          <span style={{ color: 'var(--t3)', fontSize: 12 }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputS} />
          {(from || to) && (
            <button
              onClick={() => { setFrom(''); setTo(''); }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
              style={{ color: 'var(--r)', background: 'var(--rd)', border: '1px solid rgba(255,77,77,.2)' }}
            >
              <X size={10} /> Limpar
            </button>
          )}
        </div>
      </div>
      {data.length < 2 ? (
        <p className="text-center py-10 text-sm" style={{ color: 'var(--t3)' }}>
          Dados insuficientes para gerar gráfico
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,136,.03)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, stroke: 'var(--bg)', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Monthly ROI chart ─────────────────────────────────────────────────────────

function MonthlyROIChart({ legs }: { legs: Leg[] }) {
  const byMonth: Record<string, { profit: number; stake: number }> = {};
  legs.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido').forEach(l => {
    const m = l.bd.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { profit: 0, stake: 0 };
    byMonth[m].profit += calcLegProfit(l);
    byMonth[m].stake  += l.st;
  });

  const data = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, { profit, stake }]) => ({
      month: month.slice(5) + '/' + month.slice(2, 4),
      roi:   stake > 0 ? +(profit / stake * 100).toFixed(2) : 0,
      profit: +profit.toFixed(2),
    }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl px-3 py-2 text-sm" style={tooltipStyle}>
        <div style={{ color: 'var(--t3)' }}>{label}</div>
        <div style={{ color: payload[0].value >= 0 ? '#4DA6FF' : 'var(--r)' }}>
          ROI: {payload[0].value}%
        </div>
        <div style={{ color: 'var(--t2)' }}>Lucro: {fmtBRL(payload[0].payload.profit)}</div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-5" style={cardStyle}>
      <div className="font-bold mb-1 text-sm" style={{ color: 'var(--t)' }}>ROI por Mês</div>
      <div className="text-xs mb-4" style={{ color: 'var(--t3)' }}>Últimos 6 meses</div>
      {data.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--t3)' }}>Sem dados</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} barSize={30}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.roi >= 0 ? '#4DA6FF' : 'var(--r)'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CaixaPage() {
  const bms      = useStore(s => s.bms);
  const banks    = useStore(s => s.banks);
  const legs     = useStore(s => s.legs);
  const expenses = useStore(s => s.expenses);

  const totalBMs   = bms.reduce((s, b) => s + b.balance, 0);
  const totalBanks = banks.reduce((s, b) => s + b.balance, 0);
  const totalCash  = totalBMs + totalBanks;

  const month  = currentMonth();
  const mStart = month + '-01';

  const settled = legs.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido');
  const mLegs   = settled.filter(l => l.bd.slice(0, 10) >= mStart);
  const mStake  = mLegs.reduce((s, l) => s + l.st, 0);
  const mProfit = +mLegs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
  const mROI    = mStake > 0 ? +(mProfit / mStake * 100).toFixed(2) : 0;

  const mExpenses = expenses
    .filter(e => e.date.slice(0, 7) === month)
    .reduce((s, e) => s + e.amount, 0);
  const netProfit = +(mProfit - mExpenses).toFixed(2);

  const shortMonth = new Date().toLocaleString('pt-BR', { month: 'short' });

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Total cash hero */}
      <div
        className="rounded-2xl p-6"
        style={{ ...cardStyle, borderColor: 'rgba(77,166,255,.15)' }}
      >
        <div
          className="text-[11px] font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--t3)' }}
        >
          Capital Total em Caixa
        </div>
        <div
          className="text-4xl font-extrabold mb-5"
          style={{ color: '#4DA6FF', fontFamily: "'JetBrains Mono', monospace" }}
        >
          R$ {totalCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4" style={{ borderTop: '1px solid var(--b)' }}>
          {[
            { label: 'Em Casas',     value: fmtBRL(totalBMs),        icon: <Building2 size={13} />, color: 'var(--y)' },
            { label: 'Em Bancos',    value: fmtBRL(totalBanks),       icon: <Wallet size={13} />,   color: '#4DA6FF' },
            { label: `Lucro ${shortMonth}`, value: fmtBRL(mProfit, true), icon: <TrendingUp size={13} />,
              color: mProfit >= 0 ? 'var(--g)' : 'var(--r)' },
            { label: 'ROI Mês',      value: `${mROI > 0 ? '+' : ''}${mROI}%`, icon: <Percent size={13} />, color: 'var(--t2)' },
          ].map(k => (
            <div key={k.label}>
              <div className="flex items-center gap-1.5 text-[11px] mb-1.5" style={{ color: 'var(--t3)' }}>
                {k.icon} {k.label}
              </div>
              <div
                className="font-bold text-sm"
                style={{ color: k.color, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Lucro Bruto (Mês)',  value: fmtBRL(mProfit, true),   color: mProfit  >= 0 ? 'var(--g)' : 'var(--r)' },
          { label: 'Gastos (Mês)',        value: fmtBRL(-mExpenses, true), color: mExpenses > 0 ? 'var(--r)' : 'var(--t3)' },
          { label: 'Lucro Líquido (Mês)', value: fmtBRL(netProfit, true), color: netProfit >= 0 ? 'var(--g)' : 'var(--r)' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl p-5" style={cardStyle}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t3)' }}>
              {k.label}
            </div>
            <div
              className="text-xl font-extrabold"
              style={{ color: k.color, fontFamily: "'JetBrains Mono', monospace" }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CashEvolutionChart legs={legs} />
        <MonthlyROIChart    legs={legs} />
      </div>

      {/* Bookmaker balances */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t2)' }}>Saldo por Casa de Aposta</h3>
        {bms.length === 0 ? (
          <div className="rounded-xl p-6 text-center text-sm" style={{ ...cardStyle, color: 'var(--t3)' }}>
            Nenhuma casa cadastrada
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bms.map(bm => (
              <div
                key={bm.id}
                className="rounded-xl p-4 flex items-center gap-3 transition-all duration-200"
                style={cardStyle}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)'; }}
              >
                <HouseLogo name={bm.name} abbr={bm.abbr} color={bm.color} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate" style={{ color: 'var(--t)' }}>{bm.name}</div>
                  <div
                    className="font-bold text-base"
                    style={{
                      color: bm.balance >= bm.initial_balance ? 'var(--g)' : 'var(--r)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    R$ {Math.abs(bm.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bank accounts */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t2)' }}>Contas Bancárias / PIX</h3>
        {banks.length === 0 ? (
          <div className="rounded-xl p-6 text-center text-sm" style={{ ...cardStyle, color: 'var(--t3)' }}>
            Nenhuma conta bancária cadastrada
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {banks.map(b => (
              <div
                key={b.id}
                className="rounded-xl p-4 flex items-center justify-between transition-all duration-200"
                style={cardStyle}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)'; }}
              >
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--t)' }}>{b.name}</div>
                  <div
                    className="text-base font-bold mt-1"
                    style={{ color: '#4DA6FF', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {fmtBRL(b.balance)}
                  </div>
                  {b.notes && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{b.notes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
