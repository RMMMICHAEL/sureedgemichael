'use client';

/**
 * Charts.tsx — Premium financial dashboard charts using Recharts.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, Cell, PieChart, Pie, ReferenceLine,
} from 'recharts';
import type {
  WeekDay, MonthPoint, SportStat, HourStat,
  WeekStat, DayStat, ResultDist,
} from '@/lib/finance/calculator';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtBRLShort(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '+';
  if (abs >= 1000) return `${sign}R$${(abs / 1000).toFixed(1)}k`;
  return `${sign}R$${abs.toFixed(0)}`;
}

const card: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--b)',
  borderRadius: 16,
  padding: '20px 20px 16px',
  position: 'relative',
  overflow: 'hidden',
};

const tip: React.CSSProperties = {
  background: '#0D1117',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10,
  color: '#f1f5f9',
  fontSize: 12,
  boxShadow: '0 16px 48px rgba(0,0,0,.6)',
  padding: '10px 14px',
};

const AXIS = { fill: 'rgba(255,255,255,.3)', fontSize: 10, fontFamily: "'JetBrains Mono',monospace" };

function ChartTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: '.01em' }}>
      {children}
    </div>
  );
}

function EmptyState({ h = 160 }: { h?: number }) {
  return (
    <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.2)', fontSize: 13 }}>
      Sem dados disponíveis
    </div>
  );
}

// ── Week bar chart ────────────────────────────────────────────────────────────

export function WeekChart({ data }: { data: WeekDay[] }) {
  return (
    <div style={card}>
      <ChartTitle>Lucro por Dia — Semana Atual</ChartTitle>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="32%">
          <defs>
            <linearGradient id="wkGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity={1} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="wkRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ef4444" stopOpacity={1} />
              <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="wkBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#60a5fa" stopOpacity={1} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,.03)" />
          <ReferenceLine y={0} stroke="rgba(255,255,255,.1)" strokeDasharray="4 4" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} />
          <YAxis
            axisLine={false} tickLine={false}
            tickFormatter={fmtBRLShort}
            tick={AXIS} width={56}
          />
          <Tooltip
            formatter={(v: number) => [fmtBRL(v), 'Lucro']}
            contentStyle={tip}
            cursor={{ fill: 'rgba(255,255,255,.03)', radius: 4 }}
          />
          <Bar dataKey="profit" radius={[5, 5, 2, 2]}>
            {data.map((e, i) => (
              <Cell
                key={i}
                fill={e.isToday ? 'url(#wkBlue)' : e.profit >= 0 ? 'url(#wkGreen)' : 'url(#wkRed)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Month cumulative area chart ───────────────────────────────────────────────

export function MonthChart({ data }: { data: MonthPoint[] }) {
  const last  = data[data.length - 1]?.cumulative ?? 0;
  const color = last >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <ChartTitle>Evolução Mensal — Acumulado</ChartTitle>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 15, fontWeight: 700,
          color: last >= 0 ? '#22c55e' : '#ef4444',
        }}>
          {fmtBRL(last)}
        </span>
      </div>
      {data.length < 2 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,.03)" vertical={false} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,.1)" strokeDasharray="4 4" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={AXIS} interval={4} />
            <YAxis
              axisLine={false} tickLine={false}
              tickFormatter={fmtBRLShort}
              tick={AXIS} width={56}
            />
            <Tooltip
              formatter={(v: number) => [fmtBRL(v), 'Acumulado']}
              contentStyle={tip}
              cursor={{ stroke: 'rgba(255,255,255,.1)', strokeWidth: 1 }}
            />
            <Area
              type="monotone" dataKey="cumulative"
              stroke={color} strokeWidth={2.5}
              fill="url(#mcGrad)"
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: '#0D1117', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Sport horizontal bar chart ────────────────────────────────────────────────

const SP_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#60a5fa', '#f472b6', '#a3e635'];

export function SportChart({ data }: { data: SportStat[] }) {
  const top = data.slice(0, 6);
  return (
    <div style={card}>
      <ChartTitle>Lucro por Esporte</ChartTitle>
      {!top.length ? <EmptyState h={140} /> : (
        <ResponsiveContainer width="100%" height={Math.max(140, top.length * 38)}>
          <BarChart layout="vertical" data={top} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,.03)" />
            <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={fmtBRLShort} tick={AXIS} />
            <YAxis type="category" dataKey="sport" axisLine={false} tickLine={false} width={90} tick={AXIS} />
            <Tooltip formatter={(v: number) => [fmtBRL(v), 'Lucro']} contentStyle={tip} />
            <Bar dataKey="profit" radius={[0, 5, 5, 0]}>
              {top.map((_, i) => (
                <Cell key={i} fill={SP_COLORS[i % SP_COLORS.length]} fillOpacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Hourly volume chart ───────────────────────────────────────────────────────

export function HourlyChart({ data }: { data: HourStat[] }) {
  const max = Math.max(...data.map(d => d.legs), 1);
  return (
    <div style={card}>
      <ChartTitle>Volume por Horário</ChartTitle>
      {!data.length ? <EmptyState h={140} /> : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={data} barCategoryGap="15%">
            <defs>
              <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#60a5fa" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,.03)" />
            <XAxis
              dataKey="hour"
              axisLine={false} tickLine={false}
              tickFormatter={h => `${h}h`}
              tick={AXIS} interval={2}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => [v, 'Pernas']}
              labelFormatter={(h: string) => `${h}:00h`}
              contentStyle={tip}
            />
            <Bar dataKey="legs" fill="url(#hrGrad)" radius={[3, 3, 1, 1]}>
              {data.map((e, i) => (
                <Cell key={i} fillOpacity={0.4 + (e.legs / max) * 0.6} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Live vs Pre donut ─────────────────────────────────────────────────────────

export function LivePreChart({ live, pre }: { live: number; pre: number }) {
  const total   = live + pre;
  const pieData = [
    { name: 'Live',     value: live, color: '#f87171' },
    { name: 'Pré-Live', value: pre,  color: '#60a5fa' },
  ];
  const livePct = total > 0 ? Math.round(live / total * 100) : 0;

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <ChartTitle>Live vs Pré-Live</ChartTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
        <ResponsiveContainer width={110} height={110}>
          <PieChart>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <Pie
              data={total > 0 ? pieData : [{ name: 'Sem dados', value: 1, color: 'rgba(255,255,255,.08)' }]}
              cx="50%" cy="50%"
              innerRadius={34} outerRadius={50}
              dataKey="value"
              strokeWidth={0}
              paddingAngle={total > 0 ? 3 : 0}
            >
              {(total > 0 ? pieData : [{ color: 'rgba(255,255,255,.08)' }]).map((e, i) => (
                <Cell key={i} fill={e.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {pieData.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{d.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontFamily: "'JetBrains Mono',monospace" }}>
                {d.value}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f87171', fontFamily: "'JetBrains Mono',monospace", marginTop: 4 }}>
            {livePct}%
            <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,.3)', marginLeft: 6 }}>live</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Weekly profit (last 4 weeks of month) ────────────────────────────────────

export function WeeklyProfitChart({ data }: { data: WeekStat[] }) {
  const total = +data.reduce((s, d) => s + d.profit, 0).toFixed(2);
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <ChartTitle>Lucro por Semana — 4 Semanas do Mês</ChartTitle>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: total >= 0 ? '#4ade80' : '#f87171' }}>
          {fmtBRL(total)}
        </span>
      </div>
      {!data.length ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap="28%">
            <defs>
              <linearGradient id="wkpGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#4ade80" stopOpacity={1} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id="wkpRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#f87171" stopOpacity={1} />
                <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,.03)" />
            <ReferenceLine y={0} stroke="rgba(255,255,255,.12)" strokeDasharray="4 4" />
            <XAxis
              dataKey="weekLabel"
              axisLine={false} tickLine={false}
              tick={AXIS}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={40}
            />
            <YAxis
              axisLine={false} tickLine={false}
              tickFormatter={fmtBRLShort}
              tick={AXIS} width={56}
            />
            <Tooltip
              contentStyle={tip}
              formatter={(v: number, _: string, props: { payload?: WeekStat }) => {
                const d = props.payload;
                return [
                  <span key="p" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                    {fmtBRL(v)}
                    <br />
                    <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>
                      {d?.ops ?? 0} ops · ROI {d?.roi ?? 0}%
                    </span>
                  </span>,
                  'Lucro',
                ];
              }}
              cursor={{ fill: 'rgba(255,255,255,.03)' }}
            />
            <Bar dataKey="profit" radius={[6, 6, 2, 2]}>
              {data.map((e, i) => (
                <Cell key={i} fill={e.profit >= 0 ? 'url(#wkpGreen)' : 'url(#wkpRed)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Daily profit bar chart ────────────────────────────────────────────────────

export function DailyProfitChart({ data }: { data: DayStat[] }) {
  const total  = +data.reduce((s, d) => s + d.profit, 0).toFixed(2);
  const maxAbs = Math.max(...data.map(d => Math.abs(d.profit)), 0.01);

  // Interval so X axis never gets overcrowded
  const xInterval = data.length <= 15 ? 0
    : data.length <= 31 ? 2
    : Math.floor(data.length / 10);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <ChartTitle>Lucro por Dia</ChartTitle>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: total >= 0 ? '#4ade80' : '#f87171' }}>
          {fmtBRL(total)}
        </span>
      </div>
      {data.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap="18%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dpGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#4ade80" stopOpacity={1} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="dpRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#f87171" stopOpacity={1} />
                <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="dpZero" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#334155" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#1e293b" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,.03)" vertical={false} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,.1)" strokeDasharray="4 4" />
            <XAxis
              dataKey="dayLabel"
              axisLine={false} tickLine={false}
              tick={AXIS}
              interval={xInterval}
            />
            <YAxis
              axisLine={false} tickLine={false}
              tickFormatter={fmtBRLShort}
              tick={AXIS} width={56}
            />
            <Tooltip
              contentStyle={tip}
              formatter={(v: number, _: string, props: { payload?: DayStat }) => {
                const p = props.payload;
                const label = p?.ops ? `${p.ops} op${p.ops > 1 ? 's' : ''}` : 'Sem apostas';
                return [v === 0 ? '—' : fmtBRL(v), label];
              }}
              cursor={{ fill: 'rgba(255,255,255,.03)' }}
            />
            <Bar dataKey="profit" radius={[3, 3, 1, 1]} minPointSize={2}>
              {data.map((e, i) => (
                <Cell
                  key={i}
                  fill={e.profit > 0 ? 'url(#dpGreen)' : e.profit < 0 ? 'url(#dpRed)' : 'url(#dpZero)'}
                  fillOpacity={e.profit === 0 ? 0.25 : 0.5 + (Math.abs(e.profit) / maxAbs) * 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Sport distribution donut + legend ────────────────────────────────────────

const SPORT_DIST_COLORS = [
  '#818cf8', '#34d399', '#f59e0b', '#60a5fa',
  '#f472b6', '#a3e635', '#fb923c', '#22d3ee',
];

export function SportDistributionChart({ data }: { data: SportStat[] }) {
  const top    = data.slice(0, 8);
  const total  = top.reduce((s, d) => s + d.legs, 0);
  const tProfit = +top.reduce((s, d) => s + d.profit, 0).toFixed(2);
  const pieData = top.map((d, i) => ({ name: d.sport || 'Outros', value: d.legs, color: SPORT_DIST_COLORS[i % SPORT_DIST_COLORS.length] }));
  const maxLegs = Math.max(...top.map(d => d.legs), 1);

  function sportEmoji(sp: string) {
    const s = (sp || '').toLowerCase();
    if (s.includes('futebol') && !s.includes('amer')) return '⚽';
    if (s.includes('americano')) return '🏈';
    if (s.includes('tênis') || s.includes('tenis')) return '🎾';
    if (s.includes('basquete')) return '🏀';
    if (s.includes('hockey')) return '🏒';
    if (s.includes('e-') || s.includes('esport')) return '🎮';
    if (s.includes('volei') || s.includes('vôlei')) return '🏐';
    if (s.includes('baseball')) return '⚾';
    if (s.includes('mma') || s.includes('ufc')) return '🥊';
    return '🎯';
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <ChartTitle>Distribuição por Esporte</ChartTitle>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: tProfit >= 0 ? '#4ade80' : '#f87171' }}>
          {fmtBRL(tProfit)}
        </span>
      </div>
      {!top.length ? <EmptyState h={140} /> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Donut */}
          <ResponsiveContainer width={130} height={130}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={36} outerRadius={58}
                dataKey="value"
                strokeWidth={0}
                paddingAngle={2}
              >
                {pieData.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.9} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Legend + bars */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top.map((d, i) => {
              const color = SPORT_DIST_COLORS[i % SPORT_DIST_COLORS.length];
              const pct   = total > 0 ? Math.round(d.legs / total * 100) : 0;
              const barPct = Math.round(d.legs / maxLegs * 100);
              return (
                <div key={d.sport} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13, flexShrink: 0, width: 18 }}>{sportEmoji(d.sport)}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', minWidth: 70, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.sport || 'Outros'}
                  </span>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', fontFamily: "'JetBrains Mono',monospace", minWidth: 28, textAlign: 'right' }}>
                    {pct}%
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace", minWidth: 40, textAlign: 'right' }}>
                    {d.profit >= 0 ? '+' : ''}R${Math.abs(d.profit) >= 1000 ? `${(d.profit / 1000).toFixed(1)}k` : d.profit.toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result distribution donut + legend ───────────────────────────────────────

export function ResultDistributionChart({ data }: { data: ResultDist[] }) {
  const total       = data.reduce((s, d) => s + d.count, 0);
  const totalProfit = +data.reduce((s, d) => s + d.profit, 0).toFixed(2);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <ChartTitle>Distribuição de Resultados</ChartTitle>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 13, fontWeight: 700,
          color: totalProfit >= 0 ? '#4ade80' : '#f87171',
        }}>
          {fmtBRL(totalProfit)}
        </span>
      </div>
      {!data.length ? <EmptyState h={140} /> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ResponsiveContainer width={130} height={130}>
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={36} outerRadius={58}
                dataKey="count"
                strokeWidth={0}
                paddingAngle={2}
              >
                {data.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.9} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.map(d => {
              const pct = total > 0 ? Math.round(d.count / total * 100) : 0;
              return (
                <div key={d.result} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', minWidth: 80 }}>{d.result}</span>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: d.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.7)', fontFamily: "'JetBrains Mono',monospace", minWidth: 22, textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
