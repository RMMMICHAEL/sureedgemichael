'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  filterByDate, calcBySport, calcByHour, groupLegsIntoOps, calcLegProfit,
} from '@/lib/finance/calculator';
import { SportChart, HourlyChart } from '@/components/dashboard/Charts';
import { todayStr, currentMonth } from '@/lib/parsers/dateParser';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { AlertTriangle, Shuffle, Target, TrendingUp, BarChart2, Activity } from 'lucide-react';
import { houseFavicon } from '@/lib/bookmakers/logos';
import type { Leg } from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--b)',
  borderRadius: 14,
  padding: '18px 18px 16px',
};

const HOUSE_COLORS = [
  '#4DA6FF', '#3DFF8F', '#FFCB2F', '#FF8F3D', '#C084FC',
  '#34D399', '#F472B6', '#60A5FA', '#A78BFA', '#FB923C',
  '#38BDF8', '#FCD34D', '#86EFAC', '#FDA4AF', '#67E8F9',
];

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg3)',
  border: '1px solid var(--b2)',
  borderRadius: 12,
  color: 'var(--t)',
  boxShadow: '0 8px 32px rgba(0,0,0,.5)',
};

function abbr(name: string) { return (name || '??').slice(0, 3).toUpperCase(); }

function sportEmoji(sp: string): string {
  const s = (sp || '').toLowerCase();
  if (s.includes('futebol') && !s.includes('amer')) return '⚽';
  if (s.includes('americano'))  return '🏈';
  if (s.includes('tênis') || s.includes('tenis')) return '🎾';
  if (s.includes('basquete'))   return '🏀';
  if (s.includes('hockey'))     return '🏒';
  if (s.includes('e-') || s.includes('esport')) return '🎮';
  if (s.includes('volei') || s.includes('vôlei')) return '🏐';
  if (s.includes('baseball'))   return '⚾';
  if (s.includes('mma') || s.includes('ufc')) return '🥊';
  if (s.includes('tênis de mesa') || s.includes('table')) return '🏓';
  return '🎯';
}

// ── House favicon badge ────────────────────────────────────────────────────────

function HouseFaviconBadge({ name, size = 24 }: { name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const url = houseFavicon(name);
  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: 6,
    background: 'var(--sur2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
  if (url && !err) {
    return (
      <span style={style}>
        <img src={url} alt={name} width={size - 8} height={size - 8} onError={() => setErr(true)}
          style={{ borderRadius: 2, objectFit: 'contain' }} />
      </span>
    );
  }
  return (
    <span style={{ ...style, fontSize: Math.max(8, size / 3), fontWeight: 700, color: 'var(--t2)' }}>
      {abbr(name)}
    </span>
  );
}

// ── Crossings by Sport ────────────────────────────────────────────────────────

function CrossingsBySport({ legs }: { legs: Leg[] }) {
  const sports = useMemo(() => {
    const map = new Map<string, number>();
    legs.forEach(l => { if (l.sp) map.set(l.sp, (map.get(l.sp) || 0) + 1); });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sp]) => sp);
  }, [legs]);

  const [activeSport, setActiveSport] = useState('');
  const sport = (activeSport && sports.includes(activeSport)) ? activeSport : (sports[0] || '');

  const pairs = useMemo(() => {
    const sportLegs = sport ? legs.filter(l => l.sp === sport) : legs;
    const ops = groupLegsIntoOps(sportLegs);
    const map = new Map<string, { count: number; profit: number }>();
    ops.forEach(op => {
      const houses = [...new Set(op.legs.map(l => l.ho).filter(Boolean))];
      for (let i = 0; i < houses.length; i++) {
        for (let j = i + 1; j < houses.length; j++) {
          const key = [houses[i], houses[j]].sort().join('|||');
          const cur = map.get(key) ?? { count: 0, profit: 0 };
          map.set(key, { count: cur.count + 1, profit: cur.profit + op.profit });
        }
      }
    });
    return Array.from(map.entries())
      .map(([key, v]) => ({ houses: key.split('|||'), ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [legs, sport]);

  const max = pairs[0]?.count || 1;

  if (!sports.length) {
    return (
      <div style={cardStyle}>
        <div className="flex items-center justify-center h-28 text-sm" style={{ color: 'var(--t3)' }}>
          Nenhum dado no período selecionado
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <Shuffle size={14} style={{ color: 'var(--t3)' }} />
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>Cruzamentos por Esporte</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
            Pares de casas mais frequentes por modalidade — selecione o esporte
          </div>
        </div>
      </div>

      {/* Sport tabs */}
      {sports.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4 pb-4" style={{ borderBottom: '1px solid var(--b)' }}>
          {sports.slice(0, 12).map(s => (
            <button
              key={s}
              onClick={() => setActiveSport(s)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={s === sport
                ? { background: 'rgba(0,255,136,.1)', color: 'var(--g)', border: '1px solid rgba(0,255,136,.2)' }
                : { background: 'rgba(255,255,255,.04)', color: 'var(--t3)', border: '1px solid rgba(255,255,255,.06)' }
              }
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {!pairs.length ? (
        <div className="flex items-center justify-center h-24 text-sm" style={{ color: 'var(--t3)' }}>
          Nenhum cruzamento registrado para {sport}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pairs.map((p, i) => {
            const pct = (p.count / max) * 100;
            const profitColor = p.profit >= 0 ? '#3DFF8F' : '#FF4545';
            const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--t3)';
            return (
              <div key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: i < 3 ? 'rgba(0,255,136,.03)' : 'rgba(255,255,255,.02)',
                  border: i < 3 ? '1px solid rgba(0,255,136,.08)' : '1px solid rgba(255,255,255,.04)',
                }}
              >
                <span className="text-xs font-bold w-5 text-center flex-shrink-0"
                  style={{ color: rankColor, fontFamily: "'JetBrains Mono', monospace" }}>
                  {i + 1}
                </span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <HouseFaviconBadge name={p.houses[0]} size={20} />
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>{p.houses[0]}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--t3)' }}>×</span>
                  <HouseFaviconBadge name={p.houses[1]} size={20} />
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>{p.houses[1]}</span>
                </div>
                <div className="w-14 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,.06)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: 'var(--g)', opacity: 0.4, transition: 'width .4s' }} />
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0" style={{ minWidth: 52 }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--t2)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.count}×
                  </span>
                  <span className="text-[10px]" style={{ color: profitColor, fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.profit >= 0 ? '+' : ''}R${Math.abs(p.profit).toFixed(0)}
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

// ── Top Houses by usage bar chart ─────────────────────────────────────────────

function TopHousesByUsageChart({ legs }: { legs: Leg[] }) {
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    legs.forEach(l => { if (l.ho) map[l.ho] = (map[l.ho] || 0) + 1; });
    return Object.entries(map)
      .map(([house, count]) => ({ house, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [legs]);

  return (
    <div style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} style={{ color: 'var(--t3)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>Casas Mais Usadas</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded font-mono"
          style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)' }}>
          Top {data.length}
        </span>
      </div>
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
            <Tooltip formatter={(val: number) => [val, 'Apostas']} contentStyle={tooltipStyle}
              cursor={{ fill: 'rgba(255,255,255,.03)' }} />
            <Bar dataKey="count" radius={[0, 5, 5, 0]}>
              {data.map((_, i) => <Cell key={i} fill={HOUSE_COLORS[i % HOUSE_COLORS.length]} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}



// ── House efficiency summary ──────────────────────────────────────────────────

function HouseEfficiency({ legs }: { legs: Leg[] }) {
  const data = useMemo(() => {
    const map: Record<string, { ops: number; profit: number; stake: number; crossings: number }> = {};
    legs.forEach(l => {
      if (!l.ho) return;
      if (!map[l.ho]) map[l.ho] = { ops: 0, profit: 0, stake: 0, crossings: 0 };
      map[l.ho].ops++;
      map[l.ho].profit += calcLegProfit(l);
      if (l.re !== 'Pendente' && l.re !== 'Devolvido') map[l.ho].stake += l.st;
    });

    // Count crossings per house
    const ops = groupLegsIntoOps(legs);
    ops.forEach(op => {
      const houses = [...new Set(op.legs.map(l => l.ho).filter(Boolean))];
      if (houses.length > 1) {
        houses.forEach(h => { if (map[h]) map[h].crossings++; });
      }
    });

    return Object.entries(map)
      .map(([house, v]) => ({
        house,
        ops: v.ops,
        profit: +v.profit.toFixed(2),
        roi: v.stake > 0 ? +(v.profit / v.stake * 100).toFixed(2) : 0,
        crossings: v.crossings,
      }))
      .sort((a, b) => b.crossings - a.crossings)
      .slice(0, 10);
  }, [legs]);

  if (!data.length) return null;

  const maxCross = Math.max(...data.map(d => d.crossings), 1);

  return (
    <div style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <Target size={14} style={{ color: 'var(--t3)' }} />
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--t)' }}>Eficiência das Casas</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Casas com mais cruzamentos e melhor ROI</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {data.map((d, i) => {
          const crossPct = (d.crossings / maxCross) * 100;
          const roiColor = d.roi >= 0 ? '#3DFF8F' : '#FF4545';
          return (
            <div key={d.house} className="flex items-center gap-3 px-2 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,.02)' }}>
              <span className="text-xs font-bold w-6 text-center flex-shrink-0"
                style={{ color: i < 3 ? ['#FFD700','#C0C0C0','#CD7F32'][i] : 'var(--t3)' }}>
                {i + 1}
              </span>
              <HouseFaviconBadge name={d.house} size={22} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate mb-1" style={{ color: 'var(--t)' }}>{d.house}</div>
                {/* Crossings bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,203,47,.1)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${crossPct}%`, background: '#FFCB2F', transition: 'width .4s' }} />
                  </div>
                  <span className="text-[10px] font-mono font-bold flex-shrink-0" style={{ color: '#FFCB2F', minWidth: 28 }}>
                    {d.crossings}×
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <span className="text-xs font-mono font-bold" style={{ color: roiColor }}>
                  ROI {d.roi >= 0 ? '+' : ''}{d.roi}%
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--t3)' }}>
                  {d.ops} apostas
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 px-3 py-2.5 rounded-xl text-xs"
        style={{ background: 'rgba(255,255,255,.03)', color: 'var(--t3)', border: '1px solid rgba(255,255,255,.06)' }}>
        Casas com mais cruzamentos e maior ROI são as mais estratégicas para surebets.
      </div>
    </div>
  );
}

// ── Summary KPI chips ─────────────────────────────────────────────────────────

function KpiChip({ label, value, sub, valueColor, icon }: {
  label: string; value: string; sub?: string; valueColor?: string; icon?: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--b)',
      borderRadius: 14,
      padding: '16px 18px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.35)' }}>
          {label}
        </span>
        {icon && <span style={{ color: 'rgba(255,255,255,.2)' }}>{icon}</span>}
      </div>
      <span style={{ fontSize: 20, fontWeight: 800, color: valueColor ?? 'var(--t)', fontFamily: "'JetBrains Mono',monospace", display: 'block' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 4, display: 'block' }}>{sub}</span>}
    </div>
  );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      {icon && <span style={{ color: 'rgba(255,255,255,.3)' }}>{icon}</span>}
      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.3)' }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.05)', marginLeft: 8 }} />
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

  const filtered = useMemo(() => filterByDate(legs, from, to), [legs, from, to]);

  const sports = useMemo(() => calcBySport(filtered), [filtered]);
  const hours  = useMemo(() => calcByHour(filtered),  [filtered]);

  const totalProfit = +filtered.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);

  const monthLegs   = useMemo(() => filterByDate(legs, month + '-01', today), [legs, month, today]);
  const monthProfit = +monthLegs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);

  const yearLegs    = useMemo(() => filterByDate(legs, year + '-01-01', today), [legs, year, today]);
  const yearProfit  = +yearLegs.reduce((s, l) => s + calcLegProfit(l), 0).toFixed(2);

  const totalStake  = filtered.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido').reduce((s, l) => s + l.st, 0);
  const roi         = totalStake > 0 ? +(totalProfit / totalStake * 100).toFixed(2) : 0;

  const housesCount = useMemo(() => new Set(filtered.map(l => l.ho).filter(Boolean)).size, [filtered]);
  const totalOps    = useMemo(() => new Set(filtered.map(l => l.oid)).size,                [filtered]);

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
          <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,.35)' }}>
            Desempenho detalhado por período
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
          <span style={{ color: 'rgba(255,255,255,.3)' }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiChip label="Operações" value={String(totalOps)} sub={`${filtered.length} apostas`}
          icon={<BarChart2 size={15} />} />
        <KpiChip label="Casas" value={String(housesCount)} sub="distintas"
          icon={<Target size={15} />} />
        <KpiChip label="Lucro do Mês" value={fmtBRL(monthProfit)} sub={month}
          valueColor={monthProfit >= 0 ? '#4ade80' : '#f87171'}
          icon={<Activity size={15} />} />
        <KpiChip label="Lucro do Ano" value={fmtBRL(yearProfit)} sub={year}
          valueColor={yearProfit >= 0 ? '#4ade80' : '#f87171'}
          icon={<TrendingUp size={15} />} />
      </div>

      {/* Anomaly alert */}
      {withFlagsOids.size > 0 && (
        <div style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#f59e0b' }}>
              <strong>{withFlagsOids.size}</strong> operações com anomalias · <strong>{criticalOids.size}</strong> críticas
            </span>
          </div>
          <button onClick={() => setView('ops')}
            style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, background: 'rgba(245,158,11,.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.3)', cursor: 'pointer' }}>
            Ver Operações →
          </button>
        </div>
      )}

      {/* ── Distribuição ── */}
      <SectionLabel icon={<Activity size={13} />}>Distribuição de Resultados</SectionLabel>

      <SportChart data={sports} />

      {/* ── Uso de casas ── */}
      <SectionLabel icon={<TrendingUp size={13} />}>Uso de Casas</SectionLabel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopHousesByUsageChart legs={filtered} />
        <HourlyChart data={hours} />
      </div>

      {/* ── Cruzamentos ── */}
      <SectionLabel icon={<Shuffle size={13} />}>Cruzamentos e Eficiência</SectionLabel>

      <CrossingsBySport legs={filtered} />

      <HouseEfficiency legs={filtered} />
    </div>
  );
}
