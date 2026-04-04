'use client';

/**
 * Charts.tsx
 * All dashboard charts using Recharts.
 * Unified dark neon theme.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, Cell, PieChart, Pie,
} from 'recharts';
import type { WeekDay, MonthPoint, SportStat, HourStat } from '@/lib/finance/calculator';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  const sign = v < 0 ? '\u2212' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--b)',
  borderRadius: 16,
  padding: '20px 20px 16px',
};

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg3)',
  border: '1px solid var(--b2)',
  borderRadius: 12,
  color: 'var(--t)',
  boxShadow: '0 8px 32px rgba(0,0,0,.5)',
};

const AXIS_TICK = { fill: 'var(--t3)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" };

// ── Week bar chart ───────────────────────────────────────────────────────────

export function WeekChart({ data }: { data: WeekDay[] }) {
  return (
    <div style={cardStyle}>
      <div className="text-sm font-bold mb-4" style={{ color: 'var(--t)' }}>
        Lucro por Dia — Semana Atual
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="rgba(0,255,136,.03)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `R$${v >= 0 ? '+' : ''}${v}`}
            tick={AXIS_TICK}
            width={64}
          />
          <Tooltip
            formatter={(val: number) => [fmtBRL(val), 'Lucro']}
            labelFormatter={(l: string) => `${l}`}
            contentStyle={tooltipStyle}
            cursor={{ fill: 'rgba(0,255,136,.02)' }}
          />
          <Bar dataKey="profit" radius={[5, 5, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.isToday ? '#4DA6FF' :
                  entry.profit > 0 ? '#00FF88' :
                  entry.profit < 0 ? '#FF4D4D' :
                  'var(--sur)'
                }
                fillOpacity={entry.isToday ? 1 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Month cumulative line chart ──────────────────────────────────────────────

export function MonthChart({ data }: { data: MonthPoint[] }) {
  const lastVal = data[data.length - 1]?.cumulative ?? 0;
  const color   = lastVal >= 0 ? '#00FF88' : '#FF4D4D';

  return (
    <div style={cardStyle}>
      <div className="text-sm font-bold mb-4" style={{ color: 'var(--t)' }}>
        Evolução Mensal — Lucro Acumulado
      </div>
      {data.length < 2 ? (
        <div className="flex items-center justify-center h-44 text-sm" style={{ color: 'var(--t3)' }}>
          Sem dados suficientes no mês atual
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor={color} stopOpacity={0.20} />
                <stop offset="100%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(0,255,136,.03)" vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `R$${v}`}
              tick={AXIS_TICK}
              width={64}
            />
            <Tooltip
              formatter={(val: number) => [fmtBRL(val), 'Acumulado']}
              contentStyle={tooltipStyle}
              cursor={{ stroke: 'rgba(0,255,136,.1)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={color}
              strokeWidth={2}
              fill="url(#mcGrad)"
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: 'var(--bg)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Sport horizontal bar chart ───────────────────────────────────────────────

const SPORT_COLORS = ['#00FF88', '#4DA6FF', '#FFD600', '#FF8F3D', '#A78BFA', '#34D399'];

export function SportChart({ data }: { data: SportStat[] }) {
  const top = data.slice(0, 6);
  return (
    <div style={cardStyle}>
      <div className="text-sm font-bold mb-4" style={{ color: 'var(--t)' }}>
        Lucro por Esporte
      </div>
      {!top.length ? (
        <div className="flex items-center justify-center h-36 text-sm" style={{ color: 'var(--t3)' }}>
          Sem dados
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(140, top.length * 36)}>
          <BarChart layout="vertical" data={top} barCategoryGap="25%">
            <CartesianGrid horizontal={false} stroke="rgba(0,255,136,.03)" />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `R$${v}`}
              tick={AXIS_TICK}
            />
            <YAxis
              type="category"
              dataKey="sport"
              axisLine={false}
              tickLine={false}
              width={90}
              tick={AXIS_TICK}
            />
            <Tooltip
              formatter={(val: number) => [fmtBRL(val), 'Lucro']}
              contentStyle={tooltipStyle}
            />
            <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
              {top.map((_, i) => (
                <Cell key={i} fill={SPORT_COLORS[i % SPORT_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Hourly volume bar chart ──────────────────────────────────────────────────

export function HourlyChart({ data }: { data: HourStat[] }) {
  return (
    <div style={cardStyle}>
      <div className="text-sm font-bold mb-4" style={{ color: 'var(--t)' }}>
        Volume por Horário
      </div>
      {!data.length ? (
        <div className="flex items-center justify-center h-36 text-sm" style={{ color: 'var(--t3)' }}>Sem dados</div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={data} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="rgba(0,255,136,.03)" />
            <XAxis
              dataKey="hour"
              axisLine={false}
              tickLine={false}
              tickFormatter={h => `${h}h`}
              tick={AXIS_TICK}
              interval={2}
            />
            <YAxis hide />
            <Tooltip
              formatter={(val: number) => [val, 'Pernas']}
              labelFormatter={(h: string) => `${h}:00`}
              contentStyle={tooltipStyle}
            />
            <Bar dataKey="legs" fill="rgba(77,166,255,.6)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Live vs Pre donut ────────────────────────────────────────────────────────

export function LivePreChart({ live, pre }: { live: number; pre: number }) {
  const total = live + pre;
  const pieData = [
    { name: 'Live',    value: live, color: '#FF6B6B' },
    { name: 'Pré-Live', value: pre,  color: '#4DA6FF' },
  ];
  const livePct = total > 0 ? ((live / total) * 100).toFixed(0) : '0';

  return (
    <div style={cardStyle} className="flex flex-col">
      <div className="text-sm font-bold mb-2" style={{ color: 'var(--t)' }}>
        Live vs Pré-Live
      </div>
      <div className="flex items-center gap-4 flex-1">
        <ResponsiveContainer width={110} height={110}>
          <PieChart>
            <Pie
              data={total > 0 ? pieData : [{ name: 'Sem dados', value: 1, color: 'var(--sur)' }]}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={50}
              dataKey="value"
              strokeWidth={0}
            >
              {(total > 0 ? pieData : [{ color: 'var(--sur)' }]).map((e, i) => (
                <Cell key={i} fill={e.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2.5 flex-1">
          {pieData.map(d => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="text-[11px]" style={{ color: 'var(--t2)' }}>{d.name}</span>
              <span className="ml-auto text-xs font-bold" style={{ color: 'var(--t)', fontFamily: "'JetBrains Mono', monospace" }}>
                {d.value}
              </span>
            </div>
          ))}
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
            {livePct}% live
          </div>
        </div>
      </div>
    </div>
  );
}
