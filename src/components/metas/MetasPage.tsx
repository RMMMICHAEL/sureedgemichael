'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { parseBRLInput } from '@/lib/parseBRL';
import { Target, Settings, X, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import type { GoalConfig } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getDaysInMode(mode: GoalConfig['daysMode'], year: number, month: number): number {
  const dim = new Date(year, month + 1, 0).getDate();
  if (mode === 'weekdays') {
    let n = 0;
    for (let d = 1; d <= dim; d++) { const dow = new Date(year, month, d).getDay(); if (dow > 0 && dow < 6) n++; }
    return n;
  }
  if (mode === 'custom_20') return 20;
  if (mode === 'custom_25') return 25;
  return dim;
}

// ── Config Modal ──────────────────────────────────────────────────────────────

function ConfigModal({ current, onSave, onClose }: {
  current?: GoalConfig;
  onSave:  (cfg: GoalConfig) => void;
  onClose: () => void;
}) {
  const [daily,   setDaily]   = useState(String(current?.dailyGoal   ?? ''));
  const [mode,    setMode]    = useState<GoalConfig['daysMode']>(current?.daysMode ?? 'custom_20');
  const [monthly, setMonthly] = useState(String(current?.monthlyGoal ?? ''));

  function handleSave() {
    const dv = parseBRLInput(daily);
    if (!dv || dv <= 0) return;
    onSave({
      dailyGoal:   dv,
      daysMode:    mode,
      monthlyGoal: monthly ? parseBRLInput(monthly) || undefined : undefined,
    });
    onClose();
  }

  const labelMode = { all: 'Todos os dias', weekdays: 'Dias úteis', custom_20: '20 dias', custom_25: '25 dias' };

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2 mb-5">
          <Settings size={16} style={{ color: 'var(--g)' }} />
          <h2 className="font-bold text-sm" style={{ color: 'var(--t)' }}>Configurar Meta</h2>
          <button type="button" onClick={onClose} className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)' }}><X size={12} /></button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Meta Diária de Apostas (R$)</label>
            <input type="number" step="0.01" placeholder="Ex: 120,00" value={daily} onChange={e => setDaily(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>Lucro bruto das apostas por dia operado.</p>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Dias operados por mês</label>
            <div className="grid grid-cols-2 gap-2">
              {(['all', 'weekdays', 'custom_20', 'custom_25'] as GoalConfig['daysMode'][]).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className="py-2 rounded-xl text-xs font-bold"
                  style={{
                    background: mode === m ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${mode === m ? 'rgba(63,255,33,.3)' : 'var(--b)'}`,
                    color: mode === m ? 'var(--g)' : 'var(--t3)',
                  }}>
                  {labelMode[m]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--t3)' }}>Meta Mensal Manual (opcional)</label>
            <input type="number" step="0.01" placeholder="Calculada automaticamente" value={monthly} onChange={e => setMonthly(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--b)', color: 'var(--t)' }} />
          </div>
          <button type="button" onClick={handleSave} disabled={!daily || parseBRLInput(daily) <= 0}
            className="w-full rounded-xl py-2.5 text-sm font-black disabled:opacity-40"
            style={{ background: 'rgba(63,255,33,.15)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.25)' }}>
            Salvar
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function MetasPage() {
  const legs              = useStore(s => s.legs);
  const expenses          = useStore(s => s.expenses);
  const recurringExpenses = useStore(s => s.recurringExpenses ?? []);
  const goalConfig        = useStore(s => s.goalConfig);
  const setGoalConfig     = useStore(s => s.setGoalConfig);

  const [configOpen, setConfigOpen] = useState(false);

  // ── Date anchors ────────────────────────────────────────────────────────
  const now          = new Date();
  const year         = now.getFullYear();
  const month        = now.getMonth();
  const today        = now.toISOString().slice(0, 10);
  const monthPrefix  = `${year}-${String(month + 1).padStart(2, '0')}`;
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const dayOfMonth   = now.getDate();
  const remainingDays = daysInMonth - dayOfMonth;

  // ── Fixed costs ─────────────────────────────────────────────────────────
  const fixedMonthly = recurringExpenses.filter(r => r.active).reduce((s, r) => s + r.amount, 0);

  // ── Monthly financials ──────────────────────────────────────────────────
  const totalMonthlyExpenses = useMemo(() =>
    +expenses.filter(e => e.date.startsWith(monthPrefix)).reduce((s, e) => s + e.amount, 0).toFixed(2),
    [expenses, monthPrefix]);

  const monthlyBetProfit = useMemo(() =>
    +legs
      .filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido' && l.source !== 'import' && l.bd.startsWith(monthPrefix))
      .reduce((s, l) => s + (l.pr ?? 0), 0)
      .toFixed(2),
    [legs, monthPrefix]);

  const netMonthlyProfit = +(monthlyBetProfit - totalMonthlyExpenses).toFixed(2);

  // ── Goal ────────────────────────────────────────────────────────────────
  const monthlyGoal = useMemo(() => {
    if (!goalConfig) return null;
    if (goalConfig.monthlyGoal) return goalConfig.monthlyGoal;
    return +(goalConfig.dailyGoal * getDaysInMode(goalConfig.daysMode, year, month)).toFixed(2);
  }, [goalConfig, year, month]);

  const dailyGoal = goalConfig?.dailyGoal ?? null;

  // Adjusted daily goal: redistributes remaining net target across remaining days
  const adjustedDailyGoal = useMemo(() => {
    if (!monthlyGoal || remainingDays <= 0) return dailyGoal ?? 0;
    const remaining = monthlyGoal - netMonthlyProfit;
    return remaining <= 0 ? 0 : +(remaining / remainingDays).toFixed(2);
  }, [monthlyGoal, netMonthlyProfit, remainingDays, dailyGoal]);

  const monthPct = monthlyGoal ? Math.round((netMonthlyProfit / monthlyGoal) * 100) : 0;

  // Projection based on daily net pace
  const projectedNet = dayOfMonth > 1
    ? +((netMonthlyProfit / dayOfMonth) * daysInMonth).toFixed(2)
    : netMonthlyProfit;

  // ── Weekly breakdown ────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const dow    = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    return Array.from({ length: 7 }, (_, i) => {
      const dt      = new Date(monday);
      dt.setDate(monday.getDate() + i);
      const dateStr  = dt.toISOString().slice(0, 10);
      const dayNum   = dt.getDate();
      const isPast   = dateStr < today;
      const isToday  = dateStr === today;
      const isFuture = dateStr > today;
      const inMonth  = dateStr.startsWith(monthPrefix);

      const dayBet = inMonth
        ? +legs.filter(l => l.re !== 'Pendente' && l.re !== 'Devolvido' && l.source !== 'import' && l.bd.startsWith(dateStr))
            .reduce((s, l) => s + (l.pr ?? 0), 0).toFixed(2)
        : 0;

      const dayExp = inMonth
        ? +expenses.filter(e => e.date.startsWith(dateStr)).reduce((s, e) => s + e.amount, 0).toFixed(2)
        : 0;

      const dayNet = +(dayBet - dayExp).toFixed(2);

      // Past: compare vs original daily goal; today/future: compare vs adjusted (redistributed)
      const target = isPast ? (dailyGoal ?? 0) : (adjustedDailyGoal ?? dailyGoal ?? 0);
      const hit    = !isFuture && inMonth ? (target > 0 ? dayNet >= target : null) : null;

      return { label: labels[i], dayNum, date: dateStr, dayBet, dayExp, dayNet, target, isPast, isToday, isFuture, inMonth, hit };
    });
  }, [legs, expenses, today, monthPrefix, dailyGoal, adjustedDailyGoal, now]);

  // ── Weekly summary ─────────────────────────────────────────────────────
  const weekSummary = useMemo(() => {
    const worked = weekDays.filter(d => !d.isFuture && d.inMonth);
    const netTotal    = +worked.reduce((s, d) => s + d.dayNet, 0).toFixed(2);
    const targetTotal = +worked.filter(d => d.target > 0).reduce((s, d) => s + d.target, 0).toFixed(2);
    const hitCount    = worked.filter(d => d.hit === true).length;
    const missCount   = worked.filter(d => d.hit === false).length;
    const diff        = +(netTotal - targetTotal).toFixed(2);
    return { netTotal, targetTotal, hitCount, missCount, diff };
  }, [weekDays]);

  // ── Redistribution alert ─────────────────────────────────────────────
  const redistAlert = !!(goalConfig && dailyGoal && dailyGoal > 0 && adjustedDailyGoal > dailyGoal * 1.5 && remainingDays > 0);

  // ── Tier suggestions ────────────────────────────────────────────────────
  const TIERS = fixedMonthly > 0 ? [
    { label: 'Mínima',    sub: 'breakeven',   val: +fixedMonthly.toFixed(2),         color: '#6B7280' },
    { label: '+20%',      sub: 'recomendada', val: +(fixedMonthly * 1.2).toFixed(2), color: '#FBBF24' },
    { label: '+50%',      sub: 'ideal',       val: +(fixedMonthly * 1.5).toFixed(2), color: '#34D399' },
    { label: '+100%',     sub: 'agressiva',   val: +(fixedMonthly * 2).toFixed(2),   color: '#3FFF21' },
  ] : [];

  function applyTier(tier: { val: number }) {
    const days = getDaysInMode(goalConfig?.daysMode ?? 'custom_20', year, month);
    setGoalConfig({
      dailyGoal:   +(tier.val / days).toFixed(2),
      daysMode:    goalConfig?.daysMode ?? 'custom_20',
      monthlyGoal: tier.val,
    });
  }

  // ── Decisão de hoje ─────────────────────────────────────────────────────
  const todayTarget  = adjustedDailyGoal ?? dailyGoal ?? 0;
  const todayBet     = weekDays.find(d => d.isToday)?.dayBet ?? 0;
  const todayNet     = weekDays.find(d => d.isToday)?.dayNet ?? 0;

  const decisao = (() => {
    if (!goalConfig || !monthlyGoal) return null;
    if (netMonthlyProfit >= monthlyGoal) {
      const pct = Math.round((netMonthlyProfit / monthlyGoal - 1) * 100);
      return { type: 'ok' as const, text: `Meta mensal atingida — você está ${pct}% acima do necessário.` };
    }
    if (remainingDays <= 0) {
      return { type: 'info' as const, text: `Mês encerrado. Líquido: ${fmtBRL(netMonthlyProfit)} de ${fmtBRL(monthlyGoal)}.` };
    }
    const needed = Math.max(0, +(monthlyGoal - netMonthlyProfit).toFixed(2));
    const adjDaily = remainingDays > 0 ? +(needed / remainingDays).toFixed(2) : 0;
    return {
      type: adjDaily > (dailyGoal ?? 0) * 1.5 ? 'warn' as const : 'info' as const,
      text: `Você precisa de ${fmtBRL(adjDaily)} líquidos/dia nos próximos ${remainingDays} dias para atingir a meta.`,
    };
  })();

  const card = { background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: '0.75rem' };
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--t)' }}>Metas</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{MONTHS[month]} {year}</p>
        </div>
        <div className="flex items-center gap-2">
          {goalConfig && (
            <button type="button" onClick={() => { if (confirm('Remover configuração de metas?')) setGoalConfig(undefined); }}
              className="px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', color: '#ef4444' }}>
              Remover
            </button>
          )}
          <button type="button" onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(63,255,33,.10)', border: '1px solid rgba(63,255,33,.2)', color: 'var(--g)' }}>
            <Settings size={13} /> {goalConfig ? 'Editar Meta' : 'Configurar Meta'}
          </button>
        </div>
      </div>

      {/* ── Resumo financeiro (sempre visível) ──────────────────────── */}
      <div style={card} className="px-5 py-4">
        <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
          Resumo do Mês
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <div className="text-[10px] mb-1" style={{ color: 'var(--t3)' }}>Lucro bruto</div>
            <div className="text-lg font-black font-mono" style={{ color: 'var(--t)' }}>{fmtBRL(monthlyBetProfit)}</div>
            <div className="text-[10px]" style={{ color: 'var(--t3)' }}>das apostas</div>
          </div>
          <div>
            <div className="text-[10px] mb-1" style={{ color: 'var(--t3)' }}>Gastos</div>
            <div className="text-lg font-black font-mono" style={{ color: totalMonthlyExpenses > 0 ? '#F87171' : 'var(--t3)' }}>
              {totalMonthlyExpenses > 0 ? `− ${fmtBRL(totalMonthlyExpenses)}` : '—'}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--t3)' }}>despesas do mês</div>
          </div>
          <div>
            <div className="text-[10px] mb-1" style={{ color: 'var(--t3)' }}>Lucro líquido</div>
            <div className="text-lg font-black font-mono" style={{ color: netMonthlyProfit >= 0 ? '#3FFF21' : '#F87171' }}>
              {fmtBRL(netMonthlyProfit)}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--t3)' }}>resultado real</div>
          </div>
        </div>

        {/* Progresso vs meta */}
        {monthlyGoal ? (
          <>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
                {monthPct >= 100 ? `Meta atingida (+${monthPct - 100}%)` : `${Math.max(0, monthPct)}% da meta`}
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--t2)' }}>
                {fmtBRL(netMonthlyProfit)} / {fmtBRL(monthlyGoal)}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--sur)' }}>
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, monthPct))}%`,
                  background: monthPct >= 100 ? '#3FFF21' : monthPct >= 70 ? '#FBBF24' : '#F87171',
                }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: 'var(--t3)' }}>
                {monthPct < 100 ? `Faltam ${fmtBRL(Math.max(0, monthlyGoal - netMonthlyProfit))}` : 'Meta mensal concluída'}
              </span>
              {dayOfMonth > 2 && (
                <span style={{ color: projectedNet >= monthlyGoal ? '#3FFF21' : '#F87171' }}>
                  Projeção: {fmtBRL(projectedNet)}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="pt-2" style={{ borderTop: '1px solid var(--b)' }}>
            <p className="text-xs" style={{ color: 'var(--t3)' }}>
              Configure uma meta para ver o progresso.
              {TIERS.length > 0 && ' Ou use uma das sugestões abaixo baseadas nos seus custos fixos.'}
            </p>
          </div>
        )}
      </div>

      {/* ── Decisão de hoje ─────────────────────────────────────────── */}
      {decisao && (
        <div style={{
          background: decisao.type === 'ok' ? 'rgba(63,255,33,.04)' : decisao.type === 'warn' ? 'rgba(251,191,36,.04)' : 'rgba(255,255,255,.02)',
          border: `1px solid ${decisao.type === 'ok' ? 'rgba(63,255,33,.18)' : decisao.type === 'warn' ? 'rgba(251,191,36,.18)' : 'var(--b)'}`,
          borderRadius: '0.75rem',
        }} className="px-5 py-4">
          <div className="text-[11px] font-black uppercase tracking-widest mb-1.5"
            style={{ color: decisao.type === 'ok' ? '#3FFF21' : decisao.type === 'warn' ? '#FBBF24' : 'var(--t3)' }}>
            Decisão de Hoje
          </div>
          <p className="text-sm" style={{ color: 'var(--t)' }}>{decisao.text}</p>
          {goalConfig && todayTarget > 0 && (
            <div className="mt-2 flex items-center gap-4 text-[11px]" style={{ color: 'var(--t3)' }}>
              <span>Meta ajustada hoje: <strong style={{ color: 'var(--t)' }}>{fmtBRL(todayTarget)}</strong></span>
              {todayBet > 0 && <span>Bruto gerado: <strong style={{ color: todayBet >= todayTarget ? '#3FFF21' : 'var(--t2)' }}>{fmtBRL(todayBet)}</strong></span>}
            </div>
          )}
        </div>
      )}

      {/* ── Alerta de Replanejamento ────────────────────────────────── */}
      {redistAlert && (
        <div style={{
          background: 'rgba(251,191,36,.04)',
          border: '1px solid rgba(251,191,36,.18)',
          borderRadius: '0.75rem',
        }} className="px-5 py-4">
          <div className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#FBBF24' }}>
            Replanejamento Necessário
          </div>
          <p className="text-xs" style={{ color: 'var(--t2)' }}>
            A meta ajustada ({fmtBRL(adjustedDailyGoal)}/dia) está {Math.round((adjustedDailyGoal / (dailyGoal ?? 1)) * 100 - 100)}% acima da meta original ({fmtBRL(dailyGoal ?? 0)}/dia). Considere revisar a meta mensal ou aceitar que o mês fechará abaixo do objetivo.
          </p>
        </div>
      )}

      {/* ── Semana atual ────────────────────────────────────────────── */}
      <div style={card} className="px-5 py-4">
        <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
          Semana Atual
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(d => {
            const hitColor  = d.hit === true ? '#3FFF21' : d.hit === false ? '#F87171' : undefined;
            const cellBg    = d.isToday ? 'rgba(63,255,33,.06)' : d.isFuture ? 'transparent' : 'rgba(255,255,255,.025)';
            const cellBord  = d.isToday ? 'rgba(63,255,33,.2)' : 'var(--b)';

            return (
              <div key={d.date}
                className="rounded-xl px-1 py-2.5 flex flex-col items-center gap-1 text-center"
                style={{ background: cellBg, border: `1px solid ${cellBord}` }}>
                <div className="text-[10px] font-bold" style={{ color: d.isToday ? '#3FFF21' : 'var(--t3)' }}>
                  {d.label}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--t3)' }}>{d.dayNum}</div>
                {d.isFuture ? (
                  <>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--t3)' }}>—</div>
                    {d.target > 0 && (
                      <div className="text-[9px]" style={{ color: 'var(--t3)' }}>{fmtBRL(d.target)}</div>
                    )}
                  </>
                ) : d.inMonth ? (
                  <>
                    <div className="text-[11px] font-bold font-mono" style={{ color: hitColor ?? 'var(--t2)' }}>
                      {fmtBRL(d.dayBet)}
                    </div>
                    {d.target > 0 && (
                      <div className="text-[9px]" style={{ color: d.hit === true ? '#3FFF21' : d.hit === false ? '#F87171' : 'var(--t3)' }}>
                        {d.hit === true ? '✓' : d.hit === false ? `−${fmtBRL(d.target - d.dayNet)}` : '—'}
                      </div>
                    )}
                    {d.dayExp > 0 && (
                      <div className="text-[9px]" style={{ color: '#F87171' }}>−{fmtBRL(d.dayExp)}</div>
                    )}
                  </>
                ) : (
                  <div className="text-[10px]" style={{ color: 'var(--t3)' }}>—</div>
                )}
              </div>
            );
          })}
        </div>
        {goalConfig && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div>
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Meta da semana</div>
                <div className="text-xs font-bold font-mono" style={{ color: 'var(--t2)' }}>
                  {weekSummary.targetTotal > 0 ? fmtBRL(weekSummary.targetTotal) : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Resultado líquido</div>
                <div className="text-xs font-bold font-mono"
                  style={{ color: weekSummary.targetTotal > 0 ? (weekSummary.netTotal >= weekSummary.targetTotal ? '#3FFF21' : '#F87171') : 'var(--t2)' }}>
                  {fmtBRL(weekSummary.netTotal)}
                </div>
              </div>
              <div>
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Diferença</div>
                <div className="text-xs font-bold font-mono"
                  style={{ color: weekSummary.diff >= 0 ? '#3FFF21' : '#F87171' }}>
                  {weekSummary.targetTotal > 0 ? `${weekSummary.diff >= 0 ? '+' : ''}${fmtBRL(weekSummary.diff)}` : '—'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap text-[11px]" style={{ color: 'var(--t3)' }}>
              <span>
                {weekSummary.hitCount > 0
                  ? `${weekSummary.hitCount} dia${weekSummary.hitCount !== 1 ? 's' : ''} batido${weekSummary.hitCount !== 1 ? 's' : ''}`
                  : 'Nenhum dia batido ainda'}
                {weekSummary.missCount > 0 && ` · ${weekSummary.missCount} com déficit`}
              </span>
              {adjustedDailyGoal !== dailyGoal && adjustedDailyGoal !== null && (
                <span>
                  Meta ajustada: <strong style={{ color: adjustedDailyGoal > (dailyGoal ?? 0) ? '#FBBF24' : '#3FFF21' }}>
                    {fmtBRL(adjustedDailyGoal)}/dia
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Sugestões de meta baseadas nos fixos ────────────────────── */}
      {TIERS.length > 0 && (
        <div style={card} className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} style={{ color: '#FBBF24' }} />
            <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
              Sugestões de Meta — baseadas nos seus fixos
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TIERS.map(tier => {
              const isActive = monthlyGoal !== null && Math.abs(monthlyGoal - tier.val) < 1;
              return (
                <button key={tier.label} type="button" onClick={() => applyTier(tier)}
                  className="rounded-xl px-3 py-3 text-left"
                  style={{
                    background: isActive ? `${tier.color}14` : 'rgba(255,255,255,.03)',
                    border: `1px solid ${isActive ? tier.color + '40' : 'var(--b)'}`,
                  }}>
                  <div className="text-[10px] font-bold mb-0.5" style={{ color: tier.color }}>{tier.label}</div>
                  <div className="text-sm font-black font-mono mb-0.5" style={{ color: isActive ? tier.color : 'var(--t)' }}>
                    {fmtBRL(tier.val)}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{tier.sub}</div>
                  {isActive && (
                    <div className="text-[9px] mt-1 font-bold" style={{ color: tier.color }}>✓ ativa</div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] mt-2.5" style={{ color: 'var(--t3)' }}>
            Clique em qualquer sugestão para aplicar como meta mensal. A meta diária é calculada automaticamente.
          </p>
        </div>
      )}

      {/* ── Empty state: sem fixos nem config ───────────────────────── */}
      {!goalConfig && TIERS.length === 0 && (
        <div className="rounded-2xl p-12 flex flex-col items-center text-center gap-3"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <Target size={28} style={{ color: 'var(--t3)', opacity: 0.4 }} />
          <div>
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--t)' }}>Nenhuma meta configurada</p>
            <p className="text-xs" style={{ color: 'var(--t3)' }}>
              Configure uma meta diária ou cadastre custos fixos na aba Gastos para receber sugestões automáticas.
            </p>
          </div>
          <button type="button" onClick={() => setConfigOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(63,255,33,.10)', border: '1px solid rgba(63,255,33,.2)', color: 'var(--g)' }}>
            <Settings size={13} /> Configurar Meta
          </button>
        </div>
      )}

      {configOpen && (
        <ConfigModal current={goalConfig} onSave={setGoalConfig} onClose={() => setConfigOpen(false)} />
      )}
    </div>
  );
}
