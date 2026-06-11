'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Button }   from '@/components/ui/Button';
import { Modal }    from '@/components/ui/Modal';
import {
  Plus, Trash2, Receipt, Filter, RefreshCw,
  ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { Expense, ExpenseCategory, Transfer } from '@/types';
import { TRANSFER_CATEGORIES } from '@/types';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: ExpenseCategory[] = [
  'Assinatura', 'Saque', 'Deposito', 'Multilogin', 'Conta', 'Software', 'Gastos Pessoais', 'Outros',
];

const CATEGORY_COLORS: Record<string, string> = {
  Assinatura:       '#6B21A8',
  Saque:            '#0E7490',
  Deposito:         '#166534',
  Multilogin:       '#1D4ED8',
  Conta:            '#B45309',
  Software:         '#0F766E',
  'Gastos Pessoais': '#BE185D',
  Outros:           '#374151',
};

function fmtBRL(v: number) {
  return `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
}

// ── Expense form ──────────────────────────────────────────────────────────────

interface ExpenseFormProps {
  existing?: Expense;
  onClose:   () => void;
}

function ExpenseForm({ existing, onClose }: ExpenseFormProps) {
  const addExpense    = useStore(s => s.addExpense);
  const updateExpense = useStore(s => s.updateExpense);
  const toast         = useStore(s => s.toast);

  const [date,      setDate]      = useState(existing?.date        ?? todayStr());
  const [category,  setCategory]  = useState<string>(existing?.category ?? 'Assinatura');
  const [desc,      setDesc]      = useState(existing?.description ?? '');
  const [amount,    setAmount]    = useState(existing ? String(existing.amount) : '');
  const [notes,     setNotes]     = useState(existing?.notes       ?? '');
  const [recurring, setRecurring] = useState(existing?.recurring  ?? false);

  function save() {
    if (!desc.trim())   { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast('Valor deve ser maior que zero', 'wrn'); return; }

    const rec = category === 'Assinatura' ? recurring : false;
    if (existing) {
      updateExpense(existing.id, { date, category, description: desc.trim(), amount: amt, notes, recurring: rec });
      toast('Gasto atualizado', 'ok');
    } else {
      addExpense({ date, category, description: desc.trim(), amount: amt, notes, recurring: rec });
      toast('Gasto registrado', 'ok');
    }
    onClose();
  }

  const s = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  return (
    <Modal title={existing ? 'Editar Gasto' : 'Novo Gasto'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DATA</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CATEGORIA</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DESCRIÇÃO</span>
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Ex: Mensalidade SureEdge, Taxa Bet365..."
            className="px-3 py-2.5 rounded-lg text-sm"
            style={s}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>VALOR (R$)</span>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0,00"
            className="px-3 py-2.5 rounded-lg text-sm font-mono"
            style={s}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm"
            style={s}
          />
        </label>

        {category === 'Assinatura' && (
          <button
            type="button"
            onClick={() => setRecurring(v => !v)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left w-full transition-all"
            style={{
              background: recurring ? 'rgba(109,40,217,.15)' : 'var(--sur)',
              border: `1px solid ${recurring ? 'rgba(109,40,217,.35)' : 'var(--b2)'}`,
              color: recurring ? '#A78BFA' : 'var(--t3)',
            }}
          >
            <RefreshCw size={13} />
            {recurring ? 'Recorrente — aparece todo mês' : 'Marcar como recorrente (mensal)'}
          </button>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Salvar' : 'Registrar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Transfer form ─────────────────────────────────────────────────────────────

interface TransferFormProps {
  existing?: Transfer;
  onClose:   () => void;
}

function TransferForm({ existing, onClose }: TransferFormProps) {
  const addTransfer    = useStore(s => s.addTransfer);
  const updateTransfer = useStore(s => s.updateTransfer);
  const toast          = useStore(s => s.toast);

  const [date,      setDate]      = useState(existing?.date        ?? todayStr());
  const [direction, setDirection] = useState<'entrada' | 'saida'>(existing?.direction ?? 'entrada');
  const [category,  setCategory]  = useState(existing?.category   ?? 'Pagamento Recebido');
  const [desc,      setDesc]      = useState(existing?.description ?? '');
  const [amount,    setAmount]    = useState(existing ? String(existing.amount) : '');
  const [notes,     setNotes]     = useState(existing?.notes       ?? '');

  function save() {
    if (!desc.trim()) { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast('Valor deve ser maior que zero', 'wrn'); return; }

    if (existing) {
      updateTransfer(existing.id, { date, direction, category, description: desc.trim(), amount: amt, notes });
      toast('Transferência atualizada', 'ok');
    } else {
      addTransfer({ date, direction, category, description: desc.trim(), amount: amt, notes });
      toast('Transferência registrada', 'ok');
    }
    onClose();
  }

  const s = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };

  return (
    <Modal title={existing ? 'Editar Transferência' : 'Nova Transferência'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">

        {/* Direction toggle */}
        <div>
          <span className="text-xs font-bold block mb-1.5" style={{ color: 'var(--t3)' }}>TIPO</span>
          <div className="grid grid-cols-2 gap-2">
            {(['entrada', 'saida'] as const).map(d => {
              const active = direction === d;
              const color  = d === 'entrada' ? '#3FFF21' : '#FF4D6D';
              const Icon   = d === 'entrada' ? ArrowDownLeft : ArrowUpRight;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold transition-all"
                  style={{
                    background: active ? `${color}18` : 'var(--sur)',
                    border: `1px solid ${active ? color + '40' : 'var(--b2)'}`,
                    color: active ? color : 'var(--t3)',
                  }}
                >
                  <Icon size={14} />
                  {d === 'entrada' ? 'Entrada / Recebido' : 'Saída / Pago'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DATA</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CATEGORIA</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              {TRANSFER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DESCRIÇÃO</span>
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Ex: Pagamento cliente, Reembolso Bet365..."
            className="px-3 py-2.5 rounded-lg text-sm"
            style={s}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>VALOR (R$)</span>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0,00"
            className="px-3 py-2.5 rounded-lg text-sm font-mono"
            style={s}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm"
            style={s}
          />
        </label>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Salvar' : 'Registrar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function GastosPage() {
  const expenses       = useStore(s => s.expenses);
  const transfers      = useStore(s => s.transfers ?? []);
  const addExpense     = useStore(s => s.addExpense);
  const deleteExpense  = useStore(s => s.deleteExpense);
  const deleteTransfer = useStore(s => s.deleteTransfer);
  const toast          = useStore(s => s.toast);

  const [tab,         setTab]         = useState<'gastos' | 'transferencias'>('gastos');
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState<Expense | undefined>(undefined);
  const [showTxForm,  setShowTxForm]  = useState(false);
  const [editingTx,   setEditingTx]   = useState<Transfer | undefined>(undefined);
  const [filterMonth, setFilterMonth] = useState(currentMonth());

  // ── Gastos ──────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!filterMonth) {
      return expenses.map(e => ({ ...e, isPrevisto: false })).sort((a, b) => b.date.localeCompare(a.date));
    }
    const result: (Expense & { isPrevisto: boolean })[] = [];
    expenses.forEach(e => {
      const expMonth = e.date.slice(0, 7);
      if (expMonth === filterMonth) {
        result.push({ ...e, isPrevisto: false });
      } else if (e.recurring && expMonth <= filterMonth) {
        result.push({ ...e, isPrevisto: true });
      }
    });
    return result.sort((a, b) => {
      if (a.isPrevisto !== b.isPrevisto) return a.isPrevisto ? 1 : -1;
      return b.date.localeCompare(a.date);
    });
  }, [expenses, filterMonth]);

  const totalConfirmed = filtered.filter(e => !e.isPrevisto).reduce((s, e) => s + e.amount, 0);
  const totalPrevisto  = filtered.filter(e =>  e.isPrevisto).reduce((s, e) => s + e.amount, 0);
  const totalMonth     = totalConfirmed + totalPrevisto;

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ── Transfers ───────────────────────────────────────────────────────────────

  const sortedTransfers = useMemo(
    () => [...transfers].sort((a, b) => b.date.localeCompare(a.date)),
    [transfers],
  );

  const totalEntradas = transfers.filter(t => t.direction === 'entrada').reduce((s, t) => s + t.amount, 0);
  const totalSaidas   = transfers.filter(t => t.direction === 'saida').reduce((s, t) => s + t.amount, 0);
  const saldoTx       = totalEntradas - totalSaidas;

  // ── Render ──────────────────────────────────────────────────────────────────

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t)' }}>
        {payload[0].name}: {fmtBRL(payload[0].value)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>
            {tab === 'gastos' ? 'Gastos' : 'Transferências'}
          </h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>
            {tab === 'gastos' ? 'Controle de despesas da operação' : 'Entradas e saídas sem vínculo com operações'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--sur)' }}>
            {(['gastos', 'transferencias'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={tab === t
                  ? { background: 'var(--bg2)', color: 'var(--t)', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }
                  : { color: 'var(--t3)', background: 'transparent' }}
              >
                {t === 'gastos' ? 'Gastos' : 'Transferências'}
              </button>
            ))}
          </div>
          {tab === 'gastos' ? (
            <Button variant="primary" onClick={() => { setEditing(undefined); setShowForm(true); }}>
              <Plus size={14} /> Registrar Gasto
            </Button>
          ) : (
            <Button variant="primary" onClick={() => { setEditingTx(undefined); setShowTxForm(true); }}>
              <Plus size={14} /> Nova Transferência
            </Button>
          )}
        </div>
      </div>

      {/* ── Gastos tab ── */}
      {tab === 'gastos' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Filter size={14} style={{ color: 'var(--t3)' }} />
            <input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }}
            />
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              {totalPrevisto > 0 && (
                <span className="text-xs font-bold font-mono px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(255,191,0,.08)', color: '#FFBF00', border: '1px solid rgba(255,191,0,.2)' }}>
                  Previsto: − {fmtBRL(totalPrevisto)}
                </span>
              )}
              <span className="text-sm font-bold" style={{ color: 'var(--r)' }}>
                Total: − {fmtBRL(totalMonth)}
              </span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">🧾</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhum gasto registrado</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>Registre assinaturas, taxas e outros custos da operação</p>
              <Button variant="primary" onClick={() => setShowForm(true)}>+ Registrar Gasto</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 flex flex-col gap-2">
                {filtered.map(e => (
                  <div
                    key={e.isPrevisto ? `prev_${e.id}` : e.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: e.isPrevisto ? 'rgba(255,191,0,.04)' : 'var(--bg2)',
                      border:     e.isPrevisto ? '1px solid rgba(255,191,0,.2)' : '1px solid var(--b)',
                      opacity:    e.isPrevisto ? 0.85 : 1,
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: (CATEGORY_COLORS[e.category] || '#374151') + '22', color: CATEGORY_COLORS[e.category] || '#374151' }}>
                      <Receipt size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--t)' }}>{e.description}</div>
                        {e.isPrevisto && (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold shrink-0"
                            style={{ background: 'rgba(255,191,0,.15)', color: '#FFBF00', border: '1px solid rgba(255,191,0,.3)' }}>
                            ⏳ Previsto
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{ background: (CATEGORY_COLORS[e.category] || '#374151') + '22', color: CATEGORY_COLORS[e.category] || '#374151' }}>
                          {e.category}
                        </span>
                        {e.recurring && (
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ background: 'rgba(109,40,217,.12)', color: '#A78BFA', border: '1px solid rgba(109,40,217,.2)' }}>
                            <RefreshCw size={9} /> Recorrente
                          </span>
                        )}
                        <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>
                          {e.isPrevisto ? `desde ${fmtDate(e.date)}` : fmtDate(e.date)}
                        </span>
                        {e.notes && <span className="text-xs truncate" style={{ color: 'var(--t3)' }}>{e.notes}</span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold font-mono flex-shrink-0" style={{ color: e.isPrevisto ? '#FFBF00' : 'var(--r)' }}>
                      − {fmtBRL(e.amount)}
                    </div>
                    {!e.isPrevisto && (
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(e); setShowForm(true); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                          style={{ color: 'var(--t3)' }}
                          onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                          onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                          ✏️
                        </button>
                        <button onClick={() => { if (confirm('Remover este gasto?')) { deleteExpense(e.id); toast('Gasto removido', 'ok'); } }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ color: 'var(--r)', background: 'var(--rd)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                    {e.isPrevisto && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            addExpense({ date: todayStr(), category: e.category, description: e.description, amount: e.amount, notes: e.notes ?? '', recurring: false });
                            toast(`Pagamento de "${e.description}" registrado`, 'ok');
                          }}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-bold"
                          style={{ background: 'rgba(63,255,33,.1)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                          ✓ Pago
                        </button>
                        <button onClick={() => { setEditing(e); setShowForm(true); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs" style={{ color: 'var(--t3)' }}
                          onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                          onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                          ✏️
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
                <div className="font-bold mb-1 text-sm" style={{ color: 'var(--t2)' }}>Por Categoria</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={byCategory} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {byCategory.map((entry, i) => <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#374151'} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 mt-2">
                  {byCategory.map(c => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[c.name] || '#374151' }} />
                      <span className="text-xs flex-1" style={{ color: 'var(--t2)' }}>{c.name}</span>
                      <span className="text-xs font-mono font-bold" style={{ color: 'var(--r)' }}>{fmtBRL(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Transferências tab ── */}
      {tab === 'transferencias' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Entradas', value: totalEntradas, color: '#3FFF21', sign: '+' },
              { label: 'Total Saídas',   value: totalSaidas,   color: '#FF4D6D', sign: '−' },
              { label: 'Saldo',          value: saldoTx,       color: saldoTx >= 0 ? '#3FFF21' : '#FF4D6D', sign: saldoTx >= 0 ? '+' : '−' },
            ].map(({ label, value, color, sign }) => (
              <div key={label} className="rounded-xl p-4 flex flex-col gap-1.5"
                style={{ background: 'var(--bg2)', border: `1px solid ${color}22` }}>
                <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>{label}</span>
                <span className="text-xl font-black" style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
                  {sign} {fmtBRL(Math.abs(value))}
                </span>
              </div>
            ))}
          </div>

          {sortedTransfers.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">💸</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhuma transferência registrada</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
                Registre pagamentos recebidos, saques avulsos ou qualquer movimentação sem operação
              </p>
              <Button variant="primary" onClick={() => setShowTxForm(true)}>+ Nova Transferência</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedTransfers.map(tx => {
                const isIn  = tx.direction === 'entrada';
                const color = isIn ? '#3FFF21' : '#FF4D6D';
                const Icon  = isIn ? ArrowDownLeft : ArrowUpRight;
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18`, color }}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--t)' }}>{tx.description}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{ background: `${color}18`, color }}>
                          {tx.category}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>{fmtDate(tx.date)}</span>
                        {tx.notes && <span className="text-xs truncate" style={{ color: 'var(--t3)' }}>{tx.notes}</span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold font-mono flex-shrink-0" style={{ color }}>
                      {isIn ? '+' : '−'} {fmtBRL(tx.amount)}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingTx(tx); setShowTxForm(true); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                        style={{ color: 'var(--t3)' }}
                        onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                        onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                        ✏️
                      </button>
                      <button onClick={() => {
                        if (confirm('Remover esta transferência?')) {
                          deleteTransfer(tx.id);
                          toast('Transferência removida', 'ok');
                        }
                      }} className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ color: 'var(--r)', background: 'var(--rd)' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showForm && (
        <ExpenseForm existing={editing} onClose={() => { setShowForm(false); setEditing(undefined); }} />
      )}
      {showTxForm && (
        <TransferForm existing={editingTx} onClose={() => { setShowTxForm(false); setEditingTx(undefined); }} />
      )}
    </div>
  );
}
