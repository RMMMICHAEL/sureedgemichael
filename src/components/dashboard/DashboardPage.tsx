'use client';

import { useMemo, useState } from 'react';
import { useStore }   from '@/store/useStore';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import {
  calcLegProfit, groupLegsIntoOps, filterByDate,
  calcWeeklyProfit, calcBySport,
} from '@/lib/finance/calculator';
import { DailyProfitChart, WeeklyProfitChart, SportDistributionChart } from '@/components/dashboard/Charts';
import { todayStr, currentMonth } from '@/lib/parsers/dateParser';
import type { Leg, OpType, Expense } from '@/types';
import type { DayStat, SportStat } from '@/lib/finance/calculator';
import {
  TrendingUp, TrendingDown, Calendar, DollarSign,
  Zap, BarChart3, Eye, EyeOff, Receipt, Activity,
} from 'lucide-react';

const EXPENSE_COLORS: Record<string, string> = {
  Assinatura: '#A78BFA',
  Saque:      '#38BDF8',
  Deposito:   '#34D399',
  Multilogin: '#60A5FA',
  Conta:      '#FB923C',
  Software:   '#2DD4BF',
  Outros:     '#6B7280',
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function fmtBRL(v: number, showSign = true) {
  const sign = v < 0 ? '\u2212' : (showSign ? '+' : '');
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function fmtCapital(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function getWeekStart(today: string) {
  const d = new Date(today + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function profitOfLegs(legs: Leg[]) {
  return +legs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);
}

/* ── Design tokens ─────────────────────────────────────────────────────────── */

type ShownOpType = 'surebet' | 'outros';

const OP_CFG: Record<ShownOpType, { label: string; color: string; bg: string; border: string }> = {
  surebet: { label: 'Surebet', color: '#FFD600', bg: 'rgba(255,214,0,.07)',  border: 'rgba(255,214,0,.15)' },
  outros:  { label: 'Outros',  color: '#FF8F3D', bg: 'rgba(255,143,61,.07)', border: 'rgba(255,143,61,.15)' },
};

const OP_ICONS: Record<ShownOpType, React.ReactNode> = {
  surebet: <Zap size={14} />,
  outros:  <BarChart3 size={14} />,
};

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
  boxShadow: '0 8px 32px rgba(0,0,0,.5)',
  backdropFilter: 'blur(12px)',
};

/* ── KPI Bar ───────────────────────────────────────────────────────────────── */

interface KPIStat {
  label: string;
  value: string;
  sub?: string;
  positive: boolean | null;
  icon: React.ReactNode;
  hidden?: boolean;
  onToggleHide?: () => void;
}

function KPIBar({ stats }: { stats: KPIStat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s, i) => {
        const color =
          s.positive === null ? 'var(--t2)' :
          s.positive           ? 'var(--g)' : 'var(--r)';
        return (
          <div
            key={s.label}
            className="rounded-2xl p-5 flex flex-col gap-2 transition-all duration-200 animate-fade-in"
            style={{ ...cardStyle, animationDelay: `${i * 60}ms` }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)'; }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--t3)', fontFamily: "'Manrope', sans-serif" }}>
                {s.label}
              </span>
              <div className="flex items-center gap-1">
                {s.onToggleHide && (
                  <button
                    onClick={s.onToggleHide}
                    className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                    style={{ color: 'var(--t3)' }}
                    title={s.hidden ? 'Mostrar valor' : 'Ocultar valor'}
                  >
                    {s.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--gd)', color: 'var(--t3)' }}
                >
                  {s.icon}
                </span>
              </div>
            </div>
            <div
              className="text-2xl font-black tracking-tight"
              style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
            >
              {s.hidden ? '••••••' : s.value}
            </div>
            {s.sub && (
              <div className="text-[11px] font-medium" style={{ color: 'var(--t3)' }}>{s.sub}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Profit by operation type (Surebet + Outros only) ──────────────────────── */

type PeriodKey = 'hoje' | 'semana' | 'mes' | 'personalizado';

function ProfitByType({ legs, period, from, to, onPeriodChange, onFromChange, onToChange }: {
  legs: Leg[];
  period: PeriodKey;
  from: string;
  to: string;
  onPeriodChange: (p: PeriodKey) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  const settled = legs.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido');

  const byType = useMemo(() => {
    const map: Record<ShownOpType, { profit: number; count: number }> = {
      surebet: { profit: 0, count: 0 },
      outros:  { profit: 0, count: 0 },
    };
    settled.forEach(l => {
      const raw = (l.opType ?? 'surebet') as OpType;
      // Map delay and duplo_green into outros
      const t: ShownOpType = (raw === 'surebet') ? 'surebet' : 'outros';
      map[t].profit += calcLegProfit(l);
      map[t].count++;
    });
    (Object.keys(map) as ShownOpType[]).forEach(k => {
      map[k].profit = +map[k].profit.toFixed(2);
    });
    return map;
  }, [settled]);

  const chartData = (Object.keys(OP_CFG) as ShownOpType[])
    .map(t => ({ key: t, name: OP_CFG[t].label, value: byType[t].profit, color: OP_CFG[t].color }))
    .filter(d => d.value !== 0);

  const maxAbs = Math.max(...chartData.map(d => Math.abs(d.value)), 1);
  const hasAnyData = settled.length > 0;

  const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mês' },
    { key: 'personalizado', label: 'Período' },
  ];

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-5" style={cardStyle}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--t)', fontFamily: "'Manrope', sans-serif" }}>Lucro por Tipo de Operação</h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>{settled.length} apostas liquidadas</p>
        </div>
        {/* Period selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background: 'var(--sur)' }}>
            {PERIODS.slice(0, 3).map(p => (
              <button
                key={p.key}
                onClick={() => onPeriodChange(p.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={period === p.key
                  ? { background: 'var(--g)', color: '#000', borderRadius: 100 }
                  : { color: 'var(--t3)' }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onPeriodChange('personalizado')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
            style={period === 'personalizado'
              ? { background: 'var(--g)', color: '#000', borderRadius: 100 }
              : { background: 'var(--sur)', color: 'var(--t3)', borderRadius: 100 }
            }
          >
            Período
          </button>
          {period === 'personalizado' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} onChange={e => onFromChange(e.target.value)}
                className="px-2 py-1 rounded-lg text-xs font-mono"
                style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
              <span style={{ color: 'var(--t3)', fontSize: 12 }}>→</span>
              <input type="date" value={to} onChange={e => onToChange(e.target.value)}
                className="px-2 py-1 rounded-lg text-xs font-mono"
                style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
            </div>
          )}
        </div>
      </div>

      {!hasAnyData ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--t3)' }}>
          Nenhuma operação liquidada ainda
        </div>
      ) : (
        <>
          {/* Type cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(OP_CFG) as ShownOpType[]).map((t, i) => {
              const cfg = OP_CFG[t];
              const data = byType[t];
              const pos = data.profit >= 0;
              return (
                <div
                  key={t}
                  className="rounded-xl p-4 flex flex-col gap-2.5 transition-all duration-200 animate-fade-in"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: cfg.color, opacity: 0.7 }}>{OP_ICONS[t]}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: cfg.color, fontFamily: "'Manrope', sans-serif" }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div
                    className="text-lg font-black"
                    style={{ color: data.profit === 0 ? 'var(--t3)' : pos ? cfg.color : 'var(--r)', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {data.profit === 0 ? '\u2014' : fmtBRL(data.profit)}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--t3)' }}>
                    {data.count} {data.count === 1 ? 'aposta' : 'apostas'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Horizontal bars */}
          {chartData.length > 0 && (
            <div className="flex flex-col gap-2.5 pt-2">
              {chartData.map(d => {
                const pct = Math.abs(d.value) / maxAbs * 100;
                const pos = d.value >= 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div className="w-24 text-[11px] font-medium flex-shrink-0" style={{ color: 'var(--t2)' }}>{d.name}</div>
                    <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--sur)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${d.color}88, ${d.color})`,
                          boxShadow: `0 0 8px ${d.color}44`,
                          transition: 'width 0.8s cubic-bezier(.2,.8,.4,1)',
                        }}
                      />
                    </div>
                    <div
                      className="text-[11px] font-bold w-28 text-right flex-shrink-0"
                      style={{ color: pos ? d.color : 'var(--r)', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {fmtBRL(d.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Daily profit area chart ───────────────────────────────────────────────── */

function DailyChart({ legs, from, to, period }: { legs: Leg[]; from: string; to: string; period: PeriodKey }) {
  const byDay: Record<string, number> = {};
  legs.forEach(l => {
    const d = l.bd.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + calcLegProfit(l);
  });

  const data: { day: string; label: string; cumulative: number; daily: number }[] = [];
  const cursor = new Date(from + 'T12:00:00');
  const end    = new Date(to + 'T12:00:00');
  let cum = 0;
  while (cursor <= end) {
    const k = cursor.toISOString().slice(0, 10);
    const daily = +(byDay[k] || 0).toFixed(2);
    cum = +(cum + daily).toFixed(2);
    const label = period === 'hoje'
      ? cursor.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : cursor.getDate().toString();
    data.push({ day: k, label, cumulative: cum, daily });
    cursor.setDate(cursor.getDate() + 1);
  }

  const periodLabel = period === 'hoje' ? 'Hoje'
    : period === 'semana' ? 'Esta Semana'
    : period === 'mes' ? new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    : `${from} → ${to}`;

  const lastVal   = data[data.length - 1]?.cumulative ?? 0;
  const positive  = lastVal >= 0;
  const lineColor = '#4DA6FF';
  const profitColor = positive ? 'var(--g)' : 'var(--r)';

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const cum   = payload[0]?.value as number;
    const daily = payload[0]?.payload?.daily as number;
    const day   = payload[0]?.payload?.day as string;
    return (
      <div className="rounded-xl px-4 py-3 text-sm" style={tooltipStyle}>
        <div className="font-bold mb-1.5 text-[11px] uppercase tracking-wide" style={{ color: 'var(--t3)' }}>{day}</div>
        <div className="font-bold" style={{ color: cum >= 0 ? 'var(--g)' : 'var(--r)', fontFamily: "'JetBrains Mono', monospace" }}>
          Acum: {fmtBRL(cum)}
        </div>
        <div className="text-xs mt-1" style={{ color: daily >= 0 ? 'var(--g)' : 'var(--r)', opacity: 0.7, fontFamily: "'JetBrains Mono', monospace" }}>
          Dia: {fmtBRL(daily)}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-5 h-full" style={cardStyle}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--t3)', fontFamily: "'Manrope', sans-serif" }}>
            Lucro Acumulado — {periodLabel}
          </p>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black" style={{ color: profitColor, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtBRL(lastVal)}
            </span>
            {lastVal !== 0 && (
              <span className="flex items-center gap-1 text-xs font-bold" style={{ color: profitColor }}>
                {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                acumulado
              </span>
            )}
          </div>
        </div>
      </div>

      {data.length < 1 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--t3)' }}>Sem dados no período</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={lineColor} stopOpacity={0.20} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,255,33,.03)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(0, Math.floor(data.length / 7))}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#areaGrad)"
              dot={false}
              activeDot={{ r: 4, fill: lineColor, stroke: 'var(--bg)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ── Monthly profit comparison ─────────────────────────────────────────────── */

function MonthlyComparisonChart({ legs }: { legs: Leg[] }) {
  const data = useMemo(() => {
    const byMonth: Record<string, number> = {};
    legs.forEach(l => {
      const m = (l.bd || '').slice(0, 7);
      if (!m) return;
      byMonth[m] = (byMonth[m] || 0) + calcLegProfit(l);
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, profit]) => {
        const [y, m] = month.split('-');
        const label = new Date(parseInt(y), parseInt(m) - 1, 1)
          .toLocaleString('pt-BR', { month: 'short' })
          .replace('.', '');
        return { month, label: label.charAt(0).toUpperCase() + label.slice(1), profit: +profit.toFixed(2) };
      });
  }, [legs]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const v = payload[0]?.value as number;
    const m = payload[0]?.payload?.month as string;
    const [y, mo] = m.split('-');
    const name = new Date(parseInt(y), parseInt(mo) - 1, 1)
      .toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    return (
      <div className="rounded-xl px-4 py-3" style={tooltipStyle}>
        <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--t3)' }}>{name}</div>
        <div className="font-bold text-sm" style={{ color: v >= 0 ? 'var(--g)' : 'var(--r)', fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtBRL(v)}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-5" style={cardStyle}>
      <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--t)', fontFamily: "'Manrope', sans-serif" }}>
        Lucro por Mês
      </h3>
      {data.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--t3)' }}>Sem dados ainda</p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
            <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.profit >= 0 ? 'rgba(63,255,33,.7)' : 'rgba(255,77,77,.7)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ── Top houses ────────────────────────────────────────────────────────────── */

function TopHousesCard({ legs }: { legs: Leg[] }) {
  const byHouse: Record<string, number> = {};
  legs.forEach(l => {
    byHouse[l.ho || 'Outros'] = (byHouse[l.ho || 'Outros'] || 0) + 1;
  });
  const sorted = Object.entries(byHouse)
    .map(([h, count]) => ({ house: h, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxCount = Math.max(...sorted.map(h => h.count), 1);

  const BAR_COLORS = ['#4DA6FF','#FFD600','#3FFF21','#FF8F3D','#A78BFA','#FF6B9D'];

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full" style={cardStyle}>
      <h3 className="text-sm font-bold" style={{ color: 'var(--t)', fontFamily: "'Manrope', sans-serif" }}>Top Casas</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--t3)' }}>Sem dados</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((h, i) => (
            <div key={h.house} className="flex items-center gap-2.5">
              <span
                className="text-[10px] font-bold w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: `${BAR_COLORS[i % BAR_COLORS.length]}15`, color: BAR_COLORS[i % BAR_COLORS.length] }}
              >
                {i + 1}
              </span>
              <span className="text-[11px] w-20 truncate font-medium flex-shrink-0" style={{ color: 'var(--t2)' }}>{h.house}</span>
              <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--sur)' }}>
                <div
                  style={{
                    width: `${h.count / maxCount * 100}%`,
                    background: `linear-gradient(90deg, ${BAR_COLORS[i % BAR_COLORS.length]}66, ${BAR_COLORS[i % BAR_COLORS.length]})`,
                    height: '100%',
                    borderRadius: 9999,
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
              <span className="text-[11px] font-bold w-8 text-right flex-shrink-0" style={{ color: BAR_COLORS[i % BAR_COLORS.length], fontFamily: "'JetBrains Mono', monospace" }}>
                {h.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Recent operations ─────────────────────────────────────────────────────── */

const OP_CFG_ALL: Record<OpType, { label: string; color: string; bg: string; border: string }> = {
  surebet:     { label: 'Surebet',     color: '#FFD600', bg: 'rgba(255,214,0,.07)',  border: 'rgba(255,214,0,.15)' },
  delay:       { label: 'Delay',       color: '#4DA6FF', bg: 'rgba(77,166,255,.07)', border: 'rgba(77,166,255,.15)' },
  duplo_green: { label: 'Duplo Green', color: '#3FFF21', bg: 'rgba(63,255,33,.07)',  border: 'rgba(63,255,33,.15)' },
  outros:      { label: 'Outros',      color: '#FF8F3D', bg: 'rgba(255,143,61,.07)', border: 'rgba(255,143,61,.15)' },
};

function RecentOpsCard({ legs }: { legs: Leg[] }) {
  const ops = useMemo(() =>
    groupLegsIntoOps(legs)
      .sort((a, b) => b.bet_date.localeCompare(a.bet_date))
      .slice(0, 6),
    [legs]
  );

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div className="rounded-2xl p-5 h-full" style={cardStyle}>
      <h3 className="font-bold mb-4 text-sm" style={{ color: 'var(--t)', fontFamily: "'Manrope', sans-serif" }}>Últimas Operações</h3>
      {ops.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--t3)' }}>Nenhuma operação ainda</p>
      ) : (
        <div className="flex flex-col">
          {ops.map((op, i) => {
            const t = (op.legs[0]?.opType ?? 'surebet') as OpType;
            const cfg = OP_CFG_ALL[t];
            const isLast = i === ops.length - 1;
            return (
              <div
                key={op.id}
                className="flex items-center gap-3 py-2.5 transition-colors"
                style={{ borderBottom: isLast ? 'none' : '1px solid var(--b)' }}
              >
                <span
                  className="text-[11px] w-10 flex-shrink-0"
                  style={{ color: 'var(--t3)', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {fmtDate(op.bet_date)}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-md font-bold flex-shrink-0"
                  style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                >
                  {cfg.label}
                </span>
                <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--t2)' }}>
                  {op.event || op.sport}
                </span>
                <span
                  className="text-[11px] font-bold flex-shrink-0"
                  style={{ color: op.profit >= 0 ? 'var(--g)' : 'var(--r)', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {op.pending ? '\u23F3' : fmtBRL(op.profit)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Expenses chart ────────────────────────────────────────────────────────── */

function ExpensesChart({ expenses, from, to }: { expenses: Expense[]; from: string; to: string }) {
  const filtered = expenses.filter(e => e.date >= from && e.date <= to);
  const totalExpenses = +filtered.reduce((s, e) => s + e.amount, 0).toFixed(2);

  // Group by category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => {
      const cat = e.category || 'Outros';
      map[cat] = (map[cat] || 0) + e.amount;
    });
    return Object.entries(map)
      .map(([cat, total]) => ({ cat, total: +total.toFixed(2) }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group by day for sparkline
  const byDay = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => { map[e.date] = (map[e.date] || 0) + e.amount; });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({
        label: new Date(date + 'T12:00:00').getDate().toString(),
        total: +total.toFixed(2),
      }));
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl px-3 py-2" style={tooltipStyle}>
        <div className="text-xs font-bold" style={{ color: '#FF8F3D', fontFamily: "'JetBrains Mono', monospace" }}>
          − {fmtBRL(payload[0]?.value, false)}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={cardStyle}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--t)', fontFamily: "'Manrope', sans-serif" }}>
            Gastos do Período
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>{filtered.length} registros</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,143,61,.1)', color: '#FF8F3D' }}>
            <Receipt size={14} />
          </span>
          <span className="text-lg font-black" style={{ color: '#FF8F3D', fontFamily: "'JetBrains Mono', monospace" }}>
            − {fmtBRL(totalExpenses, false)}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-4 text-sm" style={{ color: 'var(--t3)' }}>Nenhum gasto no período</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Category breakdown */}
          <div className="flex flex-col gap-2">
            {byCategory.map((item, i) => {
              const color = EXPENSE_COLORS[item.cat] ?? '#6B7280';
              const pct = totalExpenses > 0 ? (item.total / totalExpenses * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--t2)' }}>{item.cat}</span>
                  <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ background: 'var(--sur)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.6s ease' }} />
                  </div>
                  <span className="text-[11px] font-mono font-bold w-20 text-right flex-shrink-0" style={{ color }}>
                    − {fmtBRL(item.total, false)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Bar sparkline by day */}
          {byDay.length > 1 && (
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={byDay} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={10}>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                <Bar dataKey="total" fill="#FF8F3D" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chart section period presets ───────────────────────────────────────────── */

type ChartPeriodKey = '30d' | '60d' | '90d' | 'custom';

const CHART_PERIODS: { key: ChartPeriodKey; label: string; days: number }[] = [
  { key: '30d', label: '30 dias', days: 30 },
  { key: '60d', label: '60 dias', days: 60 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: 'custom', label: 'Período', days: 0 },
];

function subDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const legs     = useStore(s => s.legs);
  const bms      = useStore(s => s.bms);
  const banks    = useStore(s => s.banks);
  const expenses = useStore(s => s.expenses);

  const today     = todayStr();
  const month     = currentMonth();
  const weekStart = getWeekStart(today);
  const mStart    = month + '-01';

  const settled = legs.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido');

  function expSum(from: string, to: string) {
    return +expenses.filter(e => e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0).toFixed(2);
  }

  const profitDay   = profitOfLegs(settled.filter(l => l.bd.slice(0, 10) === today))   - expSum(today, today);
  const profitWeek  = profitOfLegs(settled.filter(l => l.bd.slice(0, 10) >= weekStart)) - expSum(weekStart, today);
  const profitMonth = profitOfLegs(settled.filter(l => l.bd.slice(0, 10) >= mStart))   - expSum(mStart, today);

  const totalCash = [...bms.map(b => b.balance), ...banks.map(b => b.balance)].reduce((s, v) => s + v, 0);
  const totalOps  = groupLegsIntoOps(legs).length;

  const monthName = new Date().toLocaleString('pt-BR', { month: 'long' });

  // Period filter for ProfitByType + DailyChart
  const [period, setPeriod] = useState<PeriodKey>('mes');
  const [customFrom, setCustomFrom] = useState(mStart);
  const [customTo,   setCustomTo]   = useState(today);
  const [capitalHidden, setCapitalHidden] = useState(false);

  const filteredLegs = useMemo(() => {
    let from = mStart, to = today;
    if (period === 'hoje')   { from = today; to = today; }
    if (period === 'semana') { from = weekStart; to = today; }
    if (period === 'personalizado') { from = customFrom; to = customTo; }
    return legs.filter(l => {
      const d = (l.bd || '').slice(0, 10);
      return d >= from && d <= to;
    });
  }, [legs, period, customFrom, customTo, today, weekStart, mStart]);

  const monthLegs = legs.filter(l => l.bd.slice(0, 10) >= mStart);

  const activePeriodFrom = period === 'hoje' ? today
    : period === 'semana' ? weekStart
    : period === 'mes' ? mStart
    : customFrom;
  const activePeriodTo = period === 'personalizado' ? customTo : today;

  // ── Chart section period (last 30/60/90 days or custom) ──────────────────
  const [chartPeriod,   setChartPeriod]   = useState<ChartPeriodKey>('30d');
  const [chartCustomFrom, setChartCustomFrom] = useState(subDays(today, 29));
  const [chartCustomTo,   setChartCustomTo]   = useState(today);

  const chartFrom = chartPeriod === 'custom'
    ? chartCustomFrom
    : subDays(today, CHART_PERIODS.find(p => p.key === chartPeriod)!.days - 1);
  const chartTo = chartPeriod === 'custom' ? chartCustomTo : today;

  const chartLegs = useMemo(
    () => filterByDate(legs, chartFrom, chartTo),
    [legs, chartFrom, chartTo],
  );

  // Build DayStat[] from chartLegs over the selected date range
  const dailyData = useMemo<DayStat[]>(() => {
    const byDay: Record<string, { profit: number; ops: number }> = {};
    chartLegs.forEach(l => {
      const d = l.bd.slice(0, 10);
      if (!byDay[d]) byDay[d] = { profit: 0, ops: 0 };
      byDay[d].profit += calcLegProfit(l);
    });
    // count ops per day
    groupLegsIntoOps(chartLegs).forEach(op => {
      const d = op.bet_date.slice(0, 10);
      if (byDay[d]) byDay[d].ops++;
    });

    const result: DayStat[] = [];
    const cursor = new Date(chartFrom + 'T12:00:00');
    const end    = new Date(chartTo   + 'T12:00:00');
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      const mm = date.slice(5, 7), dd = date.slice(8, 10);
      const entry = byDay[date];
      result.push({
        dayLabel: `${dd}/${mm}`,
        date,
        profit: entry ? +entry.profit.toFixed(2) : 0,
        ops:    entry?.ops ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [chartLegs, chartFrom, chartTo]);

  const weeklyData  = useMemo(() => calcWeeklyProfit(chartLegs, 4),  [chartLegs]);
  const sportDist   = useMemo<SportStat[]>(() => calcBySport(chartLegs),     [chartLegs]);

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* KPI Bar */}
      <KPIBar stats={[
        {
          label: 'Lucro Hoje',
          value: fmtBRL(profitDay),
          sub: `${settled.filter(l => l.bd.slice(0, 10) === today).length} apostas`,
          positive: profitDay === 0 ? null : profitDay > 0,
          icon: <TrendingUp size={14} />,
        },
        {
          label: 'Lucro Semana',
          value: fmtBRL(profitWeek),
          sub: 'esta semana',
          positive: profitWeek === 0 ? null : profitWeek > 0,
          icon: <Calendar size={14} />,
        },
        {
          label: `Lucro ${monthName}`,
          value: fmtBRL(profitMonth),
          sub: `${monthLegs.length} apostas`,
          positive: profitMonth === 0 ? null : profitMonth > 0,
          icon: <BarChart3 size={14} />,
        },
        {
          label: 'Capital Total',
          value: fmtCapital(totalCash),
          sub: `${totalOps} operações`,
          positive: null,
          icon: <DollarSign size={14} />,
          hidden: capitalHidden,
          onToggleHide: () => setCapitalHidden(v => !v),
        },
      ]} />

      {/* Profit by type with period filters */}
      <ProfitByType
        legs={filteredLegs}
        period={period}
        from={customFrom}
        to={customTo}
        onPeriodChange={setPeriod}
        onFromChange={setCustomFrom}
        onToChange={setCustomTo}
      />

      {/* Daily chart + top houses — follow period filter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DailyChart legs={filteredLegs} from={activePeriodFrom} to={activePeriodTo} period={period} />
        </div>
        <TopHousesCard legs={filteredLegs} />
      </div>

      {/* ── Tendência & Distribuição ─────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--b)',
        borderRadius: 20,
        padding: '18px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Header with period selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(99,102,241,.25), rgba(99,102,241,.08))',
              border: '1px solid rgba(99,102,241,.2)',
            }}>
              <Activity size={14} style={{ color: '#818cf8' }} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Tendência &amp; Distribuição</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 1 }}>
                {chartFrom} → {chartTo} · {chartLegs.length} apostas
              </div>
            </div>
          </div>

          {/* Period pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, padding: '3px', borderRadius: 10, background: 'rgba(255,255,255,.05)' }}>
              {CHART_PERIODS.slice(0, 3).map(p => (
                <button
                  key={p.key}
                  onClick={() => setChartPeriod(p.key)}
                  style={{
                    padding: '5px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', border: 'none', transition: 'all .15s',
                    ...(chartPeriod === p.key
                      ? { background: 'rgba(129,140,248,.2)', color: '#818cf8', boxShadow: '0 0 0 1px rgba(129,140,248,.3)' }
                      : { background: 'transparent', color: 'rgba(255,255,255,.35)' }),
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setChartPeriod('custom')}
                style={{
                  padding: '5px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', border: 'none', transition: 'all .15s',
                  ...(chartPeriod === 'custom'
                    ? { background: 'rgba(129,140,248,.2)', color: '#818cf8', boxShadow: '0 0 0 1px rgba(129,140,248,.3)' }
                    : { background: 'transparent', color: 'rgba(255,255,255,.35)' }),
                }}
              >
                Período
              </button>
            </div>
            {chartPeriod === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="date" value={chartCustomFrom} onChange={e => setChartCustomFrom(e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#f1f5f9', outline: 'none' }} />
                <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 11 }}>→</span>
                <input type="date" value={chartCustomTo} onChange={e => setChartCustomTo(e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#f1f5f9', outline: 'none' }} />
              </div>
            )}
          </div>
        </div>

        {/* Charts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          <DailyProfitChart  data={dailyData}  />
          <WeeklyProfitChart data={weeklyData} />
        </div>
        <SportDistributionChart data={sportDist} />
      </div>

      {/* Monthly comparison chart */}
      <MonthlyComparisonChart legs={legs} />

      {/* Expenses chart — synced to selected period */}
      <ExpensesChart expenses={expenses} from={activePeriodFrom} to={activePeriodTo} />

      {/* Recent ops — always show all, not filtered */}
      <RecentOpsCard legs={legs} />
    </div>
  );
}
