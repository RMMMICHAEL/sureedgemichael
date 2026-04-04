'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { filterByDate, calcBySport, calcByHour, groupLegsIntoOps } from '@/lib/finance/calculator';
import { SportChart, HourlyChart } from '@/components/dashboard/Charts';
import { todayStr, currentMonth } from '@/lib/parsers/dateParser';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { AlertTriangle, Shuffle } from 'lucide-react';
import { houseFavicon } from '@/lib/bookmakers/logos';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--b)',
  borderRadius: 16,
  padding: '20px 20px 16px',
};

const HOUSE_COLORS = [
  '#4DA6FF', '#3DFF8F', '#FFCB2F', '#FF8F3D', '#C084FC',
  '#34D399', '#F472B6', '#60A5FA', '#A78BFA', '#FB923C',
];

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg3)',
  border: '1px solid var(--b2)',
  borderRadius: 12,
  color: 'var(--t)',
  boxShadow: '0 8px 32px rgba(0,0,0,.5)',
};

function abbr(name: string) { return (name || '??').slice(0, 3).toUpperCase(); }

function calcProfit(legs: ReturnType<typeof filterByDate>): number {
  return +legs.reduce((s, l) => {
    const st = +(l.st) || 0; const od = +(l.od) || 0;
    if (l.manualProfit !== undefined) return s + l.manualProfit;
    switch (l.re) {
      case 'Green':      return s + st * (od - 1);
      case 'Meio Green': return s + st * (od - 1) * 0.5;
      case 'Red':        return s - st;
      case 'Meio Red':   return s - st * 0.5;
      default:           return s;
    }
  }, 0).toFixed(2);
}

// ── Top Houses by usage chart ──────────────────────────────────────────────────

function TopHousesByUsageChart({ legs }: { legs: ReturnType<typeof filterByDate> }) {
  const data = useMemo(() => {
    const map: Record<string, { legs: number; profit: number }> = {};
    legs.forEach(l => {
      if (!l.ho) return;
      if (!map[l.ho]) map[l.ho] = { legs: 0, profit: 0 };
      map[l.ho].legs++;
    });
    return Object.entries(map)
      .map(([house, v]) => ({ house, legs: v.legs }))
      .sort((a, b) => b.legs - a.legs)
      .slice(0, 12);
  }, [legs]);

  return (
    <div style={cardStyle}>
      <div className="text-sm font-bold mb-4" style={{ color: 'var(--t)' }}>Casas Mais Usadas</div>
      {!data.length ? (
        <div className="flex items-center justify-center h-44 text-sm" style={{ color: 'var(--t3)' }}>
          Sem dados no período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
          <BarChart layout="vertical" data={data} barCategoryGap="22%">
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,.05)" />
            <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false}
              tick={{ fill: 'var(--t3)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} />
            <YAxis type="category" dataKey="house" axisLine={false} tickLine={false} width={110}
              tick={{ fill: 'var(--t2)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }} />
            <Tooltip formatter={(val: number) => [val, 'Operações']} contentStyle={tooltipStyle}
              cursor={{ fill: 'rgba(255,255,255,.03)' }} />
            <Bar dataKey="legs" radius={[0, 5, 5, 0]}>
              {data.map((_, i) => <Cell key={i} fill={HOUSE_COLORS[i % HOUSE_COLORS.length]} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── House favicon badge ────────────────────────────────────────────────────────

function HouseFaviconBadge({ name }: { name: string }) {
  const [err, setErr] = useState(false);
  const url = houseFavicon(name);
  if (url && !err) {
    return (
      <span className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--sur2)' }}>
        <img src={url} alt={name} width={16} height={16} onError={() => setErr(true)}
          style={{ borderRadius: 2, objectFit: 'contain' }} />
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{ background: 'var(--sur2)', color: 'var(--t2)' }}>
      {abbr(name)}
    </span>
  );
}

// ── Top 10 Crossings ──────────────────────────────────────────────────────────

function Top10Crossings({ legs }: { legs: ReturnType<typeof filterByDate> }) {
  const pairs = useMemo(() => {
    const ops = groupLegsIntoOps([...legs]);
    const counts = new Map<string, number>();
    ops.forEach(op => {
      const houses = [...new Set(op.legs.map(l => l.ho).filter(Boolean))];
      for (let i = 0; i < houses.length; i++) {
        for (let j = i + 1; j < houses.length; j++) {
          const key = [houses[i], houses[j]].sort().join('|||');
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ houses: key.split('|||'), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [legs]);

  const max = pairs[0]?.count || 1;

  return (
    <div style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,106,0,.1)', border: '1px solid rgba(255,106,0,.2)' }}>
          <Shuffle size={14} style={{ color: '#ff6a00' }} />
        </div>
        <div className="text-sm font-bold" style={{ color: 'var(--t2)' }}>Top 10 Cruzamentos</div>
      </div>

      {!pairs.length ? (
        <div className="flex items-center justify-center h-44 text-sm" style={{ color: 'var(--t3)' }}>
          Sem operações com múltiplas casas no período
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pairs.map((p, i) => {
            const pct = (p.count / max) * 100;
            const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#7A90B0';
            return (
              <div key={i} className="flex items-center gap-3">
                {/* Rank */}
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                  style={{ background: 'var(--sur)', color: rankColor, border: `1px solid ${rankColor}44` }}
                >
                  {i + 1}
                </span>
                {/* Pair */}
                <div className="flex items-center gap-1.5 flex-shrink-0 w-44">
                  <HouseFaviconBadge name={p.houses[0]} />
                  <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>×</span>
                  <HouseFaviconBadge name={p.houses[1]} />
                  <span className="text-xs font-medium truncate max-w-24" style={{ color: 'var(--t)' }}>
                    {p.houses[0]} × {p.houses[1]}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,106,0,.12)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: '#ff6a00',
                        boxShadow: '0 0 6px rgba(255,106,0,.5)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold flex-shrink-0"
                    style={{ color: '#ff6a00', minWidth: 24, textAlign: 'right' }}>
                    {p.count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Summary KPI chips ─────────────────────────────────────────────────────────

function KpiChip({ label, value, sub, valueColor }: {
  label: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-xl"
      style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>{label}</span>
      <span className="text-lg font-bold font-mono" style={{ color: valueColor ?? 'var(--t)' }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: 'var(--t3)' }}>{sub}</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AnalisePage() {
  const legs    = useStore(s => s.legs);
  const setView = useStore(s => s.setView);
  const today   = todayStr();
  const month   = currentMonth();
  const year    = today.slice(0, 4);

  const [from, setFrom] = useState(month + '-01');
  const [to,   setTo]   = useState(today);

  const filtered  = useMemo(() => filterByDate(legs, from, to),         [legs, from, to]);
  const sports    = useMemo(() => calcBySport(filtered),                 [filtered]);
  const hours     = useMemo(() => calcByHour(filtered),                  [filtered]);

  // Period profit
  const totalProfit  = calcProfit(filtered);

  // Month profit (always current month)
  const monthLegs    = useMemo(() => filterByDate(legs, month + '-01', today), [legs, month, today]);
  const monthProfit  = calcProfit(monthLegs);

  // Year profit
  const yearLegs     = useMemo(() => filterByDate(legs, year + '-01-01', today), [legs, year, today]);
  const yearProfit   = calcProfit(yearLegs);

  // ROI
  const totalStake   = filtered.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido').reduce((s, l) => s + l.st, 0);
  const roi          = totalStake > 0 ? +(+totalProfit / totalStake * 100).toFixed(2) : 0;

  // Unique houses count
  const housesCount  = useMemo(() => new Set(filtered.map(l => l.ho).filter(Boolean)).size, [filtered]);

  // Op count
  const totalOps     = useMemo(() => new Set(filtered.map(l => l.oid)).size, [filtered]);

  // Anomaly counts (by unique oids)
  const withFlagsOids = useMemo(() => {
    const s = new Set<string>();
    filtered.filter(l => l.fl && l.fl.length > 0).forEach(l => s.add(l.oid));
    return s;
  }, [filtered]);
  const criticalOids = useMemo(() => {
    const s = new Set<string>();
    filtered.filter(l => l.fl?.some(f => f.level === 'critical')).forEach(l => s.add(l.oid));
    return s;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Análise</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>
            Desempenho detalhado por período
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
          <span style={{ color: 'var(--t3)' }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiChip label="Operações" value={String(totalOps)} sub={`${filtered.length} apostas`} />
        <KpiChip label="Casas" value={String(housesCount)} sub="distintas" />
        <KpiChip
          label="Lucro do Mês"
          value={fmtBRL(monthProfit)}
          sub={month}
          valueColor={+monthProfit >= 0 ? 'var(--g)' : 'var(--r)'}
        />
        <KpiChip
          label="Lucro do Ano"
          value={fmtBRL(yearProfit)}
          sub={year}
          valueColor={+yearProfit >= 0 ? 'var(--g)' : 'var(--r)'}
        />
      </div>

      {/* Period profit + ROI strip */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <div>
          <div className="text-xs" style={{ color: 'var(--t3)' }}>Lucro no período</div>
          <div className="text-base font-bold font-mono" style={{ color: +totalProfit >= 0 ? 'var(--g)' : 'var(--r)' }}>
            {fmtBRL(+totalProfit)}
          </div>
        </div>
        <div className="w-px h-8 self-center" style={{ background: 'var(--b)' }} />
        <div>
          <div className="text-xs" style={{ color: 'var(--t3)' }}>ROI</div>
          <div className="text-base font-bold font-mono" style={{ color: roi >= 0 ? 'var(--g)' : 'var(--r)' }}>
            {roi >= 0 ? '+' : ''}{roi}%
          </div>
        </div>
      </div>

      {/* Anomaly alert */}
      {withFlagsOids.size > 0 && (
        <div className="rounded-xl p-4 flex items-center justify-between gap-3"
          style={{ background: 'rgba(255,203,47,.07)', border: '1px solid rgba(255,203,47,.2)' }}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={15} style={{ color: 'var(--y)', flexShrink: 0 }} />
            <span className="text-xs" style={{ color: 'var(--y)' }}>
              <strong>{withFlagsOids.size}</strong> operações com anomalias detectadas ·{' '}
              <strong>{criticalOids.size}</strong> críticas
            </span>
          </div>
          <button
            onClick={() => setView('ops')}
            className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all"
            style={{ background: 'rgba(255,203,47,.15)', color: '#FFCB2F', border: '1px solid rgba(255,203,47,.3)' }}
          >
            Ver em Operações →
          </button>
        </div>
      )}

      {/* Top houses + sport chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopHousesByUsageChart legs={filtered} />
        <SportChart data={sports} />
      </div>

      {/* Hourly chart */}
      <HourlyChart data={hours} />

      {/* Top 10 Crossings */}
      <Top10Crossings legs={filtered} />
    </div>
  );
}
