'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp, CircleHelp, X } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = v < 0 ? '−' : '';
  return `${s}R$ ${abs}`;
}

function fmtPct(v: number): string {
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface MonthStat {
  month: number;  // 0-11
  ops: number;
  staked: number;
  profit: number;
  roi: number;
  isCurrentMonth: boolean;
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
      <span className="text-[11px] font-black uppercase tracking-[.12em] truncate" style={{ color: 'var(--t3)' }}>
        {label}
      </span>
      <span className="text-sm font-black leading-none font-mono truncate" style={{ color: accent ?? 'var(--t)' }}>
        {value}
      </span>
    </div>
  );
}

// ── Guide Modal ───────────────────────────────────────────────────────────────

function GuideModal({ onClose }: { onClose: () => void }) {
  const items = [
    {
      q: 'O que é o Histórico Mensal?',
      a: 'Mostra o desempenho mês a mês do ano selecionado: operações realizadas, total apostado, lucro e ROI.',
    },
    {
      q: 'Como o lucro é calculado?',
      a: 'Soma dos lucros de todas as legs com resultado diferente de Pendente no período, excluindo operações importadas da planilha que ainda não afetam saldo.',
    },
    {
      q: 'O que é ROI?',
      a: 'Return on Investment — lucro dividido pelo total apostado no mês, em percentual. Um ROI positivo indica lucro.',
    },
    {
      q: 'Mes atual em destaque',
      a: 'O mês atual aparece com borda verde destacada para facilitar a leitura do progresso em andamento.',
    },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: '1px solid var(--b)' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--t)' }}>Guia — Histórico Mensal</h2>
            <p className="text-xs" style={{ color: 'var(--t3)' }}>Balanço financeiro anual mês a mês</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)' }}>
            <X size={14} />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)}
                className="flex items-center justify-between gap-3 w-full px-4 py-3 text-left text-sm font-bold"
                style={{ color: 'var(--t)', background: open === i ? 'rgba(63,255,33,.05)' : 'transparent' }}>
                {item.q}
                <ChevronRight size={14} style={{ transform: open === i ? 'rotate(90deg)' : 'none', transition: 'transform .2s', color: 'var(--t3)', flexShrink: 0 }} />
              </button>
              {open === i && (
                <div className="px-4 pb-4 pt-1 text-sm leading-relaxed" style={{ color: 'var(--t3)', borderTop: '1px solid var(--b)', background: 'rgba(255,255,255,.02)' }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ResumoPage() {
  const legs = useStore(s => s.legs);
  const [year, setYear] = useState(new Date().getFullYear());
  const [guideOpen, setGuideOpen] = useState(false);
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  // Aggregate legs by month
  const stats = useMemo<MonthStat[]>(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
      const monthLegs = legs.filter(l =>
        l.bd.startsWith(prefix) && l.re !== 'Pendente'
      );
      const ops    = new Set(monthLegs.map(l => l.oid)).size;
      const staked = monthLegs.reduce((s, l) => s + l.st, 0);
      const profit = monthLegs.reduce((s, l) => s + l.pr, 0);
      const roi    = staked > 0 ? (profit / staked) * 100 : 0;
      return { month: m, ops, staked, profit, roi, isCurrentMonth: year === currentYear && m === currentMonth };
    });
  }, [legs, year, currentYear, currentMonth]);

  // Annual totals
  const annual = useMemo(() => {
    const ops    = stats.reduce((s, m) => s + m.ops, 0);
    const staked = stats.reduce((s, m) => s + m.staked, 0);
    const profit = stats.reduce((s, m) => s + m.profit, 0);
    const roi    = staked > 0 ? (profit / staked) * 100 : 0;
    return { ops, staked, profit, roi };
  }, [stats]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>Histórico Mensal</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Balanço financeiro anual — resumo mês a mês</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setGuideOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
            <CircleHelp size={13} /> Guia
          </button>
          {/* Year navigation */}
          <div className="flex items-center gap-1 rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)', background: 'var(--bg2)' }}>
            <button type="button" onClick={() => setYear(y => y - 1)}
              className="px-2 py-2 flex items-center justify-center" style={{ color: 'var(--t3)' }}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-black px-2 min-w-[3.5rem] text-center" style={{ color: 'var(--t)' }}>{year}</span>
            <button type="button" onClick={() => setYear(y => y + 1)} disabled={year >= currentYear}
              className="px-2 py-2 flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--t3)' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Annual summary card */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={14} style={{ color: 'var(--g)' }} />
          <span className="text-sm font-black" style={{ color: 'var(--t)' }}>Resumo Geral — {year}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatChip label="Operações" value={String(annual.ops)} />
          <StatChip label="Total Apostado" value={fmtBRL(annual.staked)} />
          <StatChip label="Lucro" value={fmtBRL(annual.profit)} accent={annual.profit >= 0 ? 'var(--g)' : 'var(--r)'} />
          <StatChip label="ROI" value={fmtPct(annual.roi)} accent={annual.roi >= 0 ? 'var(--g)' : 'var(--r)'} />
        </div>
      </div>

      {/* Month cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(m => (
          <div
            key={m.month}
            className="rounded-2xl p-4 transition-all"
            style={{
              background: 'var(--bg2)',
              border: m.isCurrentMonth
                ? '2px solid rgba(63,255,33,.45)'
                : '1px solid var(--b)',
              boxShadow: m.isCurrentMonth ? '0 0 24px rgba(63,255,33,.07)' : 'none',
            }}
          >
            {/* Month header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black" style={{ color: 'var(--t)' }}>{MONTHS[m.month]}</h3>
              <div className="flex items-center gap-2">
                {m.isCurrentMonth && (
                  <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }}>
                    Mês Atual
                  </span>
                )}
                <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{m.ops} op{m.ops !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
              <span style={{ color: 'var(--t3)' }}>Total Apostado</span>
              <span style={{ color: 'var(--t3)' }}>Lucro</span>
              <span className="font-mono font-bold" style={{ color: 'var(--t2)' }}>
                {m.staked > 0 ? fmtBRL(m.staked) : '—'}
              </span>
              <span className="font-mono font-bold" style={{ color: m.profit >= 0 ? 'var(--g)' : 'var(--r)' }}>
                {m.ops > 0 ? fmtBRL(m.profit) : '—'}
              </span>
            </div>

            {m.ops > 0 && (
              <div className="pt-3 border-t grid grid-cols-2 gap-x-4 text-xs" style={{ borderColor: 'var(--b)' }}>
                <div>
                  <span style={{ color: 'var(--t3)' }}>ROI</span>
                  <p className="font-mono font-black mt-0.5" style={{ color: m.roi >= 0 ? 'var(--g)' : 'var(--r)' }}>
                    {fmtPct(m.roi)}
                  </p>
                </div>
                <div>
                  <span style={{ color: 'var(--t3)' }}>Performance</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <TrendingUp size={11} style={{ color: m.profit >= 0 ? 'var(--g)' : 'var(--r)' }} />
                    <span className="font-bold text-[11px]" style={{ color: m.profit >= 0 ? 'var(--g)' : 'var(--r)' }}>
                      {m.profit >= 0 ? 'Positivo' : 'Negativo'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {m.ops === 0 && (
              <p className="text-[11px] text-center py-2" style={{ color: 'var(--t3)' }}>Sem operações</p>
            )}
          </div>
        ))}
      </div>

      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
