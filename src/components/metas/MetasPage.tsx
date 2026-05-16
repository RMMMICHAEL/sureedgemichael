'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Target, Settings, X, ChevronRight, Trash2 } from 'lucide-react';
import type { GoalConfig } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `R$ ${abs}`;
}

function getDaysInMode(mode: GoalConfig['daysMode'], year: number, month: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (mode === 'all')        return daysInMonth;
  if (mode === 'weekdays') {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month, d).getDay();
      if (dow > 0 && dow < 6) count++;
    }
    return count;
  }
  if (mode === 'custom_20') return 20;
  if (mode === 'custom_25') return 25;
  return daysInMonth;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const over    = pct > 100;
  return (
    <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${clamped}%`,
          background: over
            ? 'linear-gradient(90deg, var(--g), #00FF88)'
            : `linear-gradient(90deg, ${color}99, ${color})`,
          boxShadow: over ? '0 0 12px rgba(63,255,33,.6)' : 'none',
        }}
      />
    </div>
  );
}

// ── Guide Modal ───────────────────────────────────────────────────────────────

function GuideModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(0);
  const items = [
    { q: 'O que são Metas?', a: 'Configure uma meta diária de lucro. O sistema calcula automaticamente quanto você precisa ganhar por dia e por mês, e mostra o progresso em tempo real.' },
    { q: 'Como configurar?', a: 'Clique em "Configurar Metas", informe o valor diário desejado e escolha quantos dias por mês deseja operar.' },
    { q: 'Meta mensal automática', a: 'A meta mensal é calculada como Meta Diária × Dias do Modo. Você pode sobrescrever manualmente se preferir um valor fixo.' },
    { q: 'Progresso', a: 'O gráfico de progresso mostra o lucro atual versus a meta do mês corrente. Operações Pendentes não são contadas.' },
  ];
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: '1px solid var(--b)' }}>
          <h2 className="font-bold text-base" style={{ color: 'var(--t)' }}>Guia — Metas</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)' }}>
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

// ── Config Modal ──────────────────────────────────────────────────────────────

function ConfigModal({ current, onSave, onClose }: {
  current?: GoalConfig;
  onSave: (cfg: GoalConfig) => void;
  onClose: () => void;
}) {
  const [daily,    setDaily]    = useState(String(current?.dailyGoal ?? ''));
  const [mode,     setMode]     = useState<GoalConfig['daysMode']>(current?.daysMode ?? 'all');
  const [monthly,  setMonthly]  = useState(String(current?.monthlyGoal ?? ''));

  function handleSave() {
    const dailyGoal = parseFloat(daily);
    if (!dailyGoal || dailyGoal <= 0) return;
    onSave({
      dailyGoal,
      daysMode: mode,
      monthlyGoal: monthly ? parseFloat(monthly) || undefined : undefined,
    });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2 mb-5">
          <Settings size={18} style={{ color: 'var(--g)' }} />
          <h2 className="font-bold text-base" style={{ color: 'var(--t)' }}>Configuração de Metas</h2>
          <button type="button" onClick={onClose} className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)' }}>
            <X size={12} />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Meta Diária (R$)</label>
            <input type="number" step="0.01" placeholder="Ex: 35.00" value={daily} onChange={e => setDaily(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Considerar dias</label>
            <select value={mode} onChange={e => setMode(e.target.value as GoalConfig['daysMode'])}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }}>
              <option value="all">Todos os dias do mês</option>
              <option value="weekdays">Apenas dias úteis</option>
              <option value="custom_20">20 dias</option>
              <option value="custom_25">25 dias</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Meta Mensal Manual (opcional)</label>
            <input type="number" step="0.01" placeholder="Deixe vazio para calcular automaticamente" value={monthly} onChange={e => setMonthly(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }} />
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--t3)' }}>Se preenchido, sobrescreve o cálculo automático.</p>
          </div>
          <button type="button" onClick={handleSave} disabled={!daily || parseFloat(daily) <= 0}
            className="w-full rounded-xl py-2.5 text-sm font-black disabled:opacity-40"
            style={{ background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }}>
            Salvar Configuração
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function MetasPage() {
  const legs        = useStore(s => s.legs);
  const goalConfig  = useStore(s => s.goalConfig);
  const setGoalConfig = useStore(s => s.setGoalConfig);

  const [configOpen, setConfigOpen] = useState(false);
  const [guideOpen,  setGuideOpen]  = useState(false);

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const today = now.toISOString().slice(0, 10);

  // Monthly stats
  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLegs = legs.filter(l => l.bd.startsWith(prefix) && l.re !== 'Pendente');
    const todayLegs = legs.filter(l => l.bd.startsWith(today) && l.re !== 'Pendente');
    return {
      monthlyProfit: monthLegs.reduce((s, l) => s + l.pr, 0),
      dailyProfit:   todayLegs.reduce((s, l) => s + l.pr, 0),
      ops:           new Set(monthLegs.map(l => l.oid)).size,
    };
  }, [legs, year, month, today]);

  const monthlyGoal = useMemo(() => {
    if (!goalConfig) return null;
    if (goalConfig.monthlyGoal) return goalConfig.monthlyGoal;
    return goalConfig.dailyGoal * getDaysInMode(goalConfig.daysMode, year, month);
  }, [goalConfig, year, month]);

  const dailyGoal   = goalConfig?.dailyGoal ?? null;
  const monthPct    = monthlyGoal ? (monthStats.monthlyProfit / monthlyGoal) * 100 : 0;
  const dailyPct    = dailyGoal   ? (monthStats.dailyProfit   / dailyGoal)   * 100 : 0;
  const monthOver   = monthPct > 100;
  const dailyOver   = dailyPct  > 100;

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>Metas</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Acompanhe suas metas diárias e mensais</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setGuideOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
            <Target size={13} /> Guia
          </button>
          {goalConfig && (
            <button type="button" onClick={() => { if (confirm('Remover configuração de metas?')) setGoalConfig(undefined); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.2)', color: '#ef4444' }}>
              <Trash2 size={13} /> Remover
            </button>
          )}
          <button type="button" onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(63,255,33,.10)', border: '1px solid rgba(63,255,33,.2)', color: 'var(--g)' }}>
            <Settings size={13} /> Configurar Metas
          </button>
        </div>
      </div>

      {!goalConfig ? (
        /* Empty state */
        <div className="rounded-2xl p-16 flex flex-col items-center justify-center text-center gap-4"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)' }}>
            <Target size={32} style={{ color: 'var(--t3)' }} />
          </div>
          <div>
            <p className="font-bold text-base" style={{ color: 'var(--t)' }}>Nenhuma meta configurada</p>
            <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>Configure sua meta diária para começar a acompanhar</p>
          </div>
          <button type="button" onClick={() => setConfigOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: 'rgba(63,255,33,.10)', border: '1px solid rgba(63,255,33,.2)', color: 'var(--g)' }}>
            <Settings size={14} /> Configurar Metas
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Month header */}
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
            {MONTHS[month]} {year}
          </p>

          {/* Monthly goal card */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: 'var(--t3)' }}>Meta Mensal</p>
                <p className="text-2xl font-black" style={{ color: monthOver ? 'var(--g)' : 'var(--t)' }}>
                  {fmtBRL(monthStats.monthlyProfit)}
                  <span className="text-sm font-medium ml-2" style={{ color: 'var(--t3)' }}>
                    / {monthlyGoal ? fmtBRL(monthlyGoal) : '—'}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold" style={{ color: 'var(--t3)' }}>{monthStats.ops} operações</p>
                {monthOver ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full mt-1 inline-block"
                    style={{ background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }}>
                    META ATINGIDA
                  </span>
                ) : monthlyGoal && (
                  <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                    Faltam {fmtBRL(monthlyGoal - monthStats.monthlyProfit)}
                  </p>
                )}
              </div>
            </div>
            <ProgressBar pct={monthPct} color="#3FFF21" />
            <div className="flex justify-between mt-2">
              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>0%</span>
              <span className="text-[10px] font-bold" style={{ color: monthOver ? 'var(--g)' : 'var(--t3)' }}>
                {monthPct.toFixed(1)}%
              </span>
              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>100%</span>
            </div>
          </div>

          {/* Daily goal card */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: 'var(--t3)' }}>Meta Hoje</p>
                <p className="text-2xl font-black" style={{ color: dailyOver ? 'var(--g)' : 'var(--t)' }}>
                  {fmtBRL(monthStats.dailyProfit)}
                  <span className="text-sm font-medium ml-2" style={{ color: 'var(--t3)' }}>
                    / {fmtBRL(goalConfig.dailyGoal)}
                  </span>
                </p>
              </div>
              {dailyOver && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }}>
                  META ATINGIDA
                </span>
              )}
            </div>
            <ProgressBar pct={dailyPct} color="#0A84FF" />
            <div className="flex justify-between mt-2">
              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>0%</span>
              <span className="text-[10px] font-bold" style={{ color: dailyOver ? 'var(--g)' : '#0A84FF' }}>
                {dailyPct.toFixed(1)}%
              </span>
              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>100%</span>
            </div>
          </div>

          {/* Config summary */}
          <div className="rounded-xl px-4 py-3 flex items-center justify-between text-xs"
            style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--b)' }}>
            <div className="flex items-center gap-4">
              <span style={{ color: 'var(--t3)' }}>
                Meta diária: <strong style={{ color: 'var(--t)' }}>{fmtBRL(goalConfig.dailyGoal)}</strong>
              </span>
              <span style={{ color: 'var(--t3)' }}>
                Dias: <strong style={{ color: 'var(--t)' }}>
                  {goalConfig.daysMode === 'all' ? 'Todos' :
                   goalConfig.daysMode === 'weekdays' ? 'Úteis' :
                   goalConfig.daysMode === 'custom_20' ? '20 dias' : '25 dias'}
                </strong>
              </span>
            </div>
            <button type="button" onClick={() => setConfigOpen(true)}
              className="flex items-center gap-1 font-bold" style={{ color: 'var(--g)' }}>
              <Settings size={11} /> Editar
            </button>
          </div>
        </div>
      )}

      {configOpen && (
        <ConfigModal current={goalConfig} onSave={setGoalConfig} onClose={() => setConfigOpen(false)} />
      )}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
