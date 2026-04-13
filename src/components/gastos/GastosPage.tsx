'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Button }   from '@/components/ui/Button';
import { Modal }    from '@/components/ui/Modal';
import { Plus, Trash2, Receipt, Filter, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Expense, ExpenseCategory } from '@/types';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: ExpenseCategory[] = [
  'Assinatura', 'Saque', 'Deposito', 'Multilogin', 'Conta', 'Software', 'Outros',
];

const CATEGORY_COLORS: Record<string, string> = {
  Assinatura: '#6B21A8',
  Saque:      '#0E7490',
  Deposito:   '#166534',
  Multilogin: '#1D4ED8',
  Conta:      '#B45309',
  Software:   '#0F766E',
  Outros:     '#374151',
};

function fmtBRL(v: number) {
  return `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

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
            <RefreshCw size={14} style={{ flexShrink: 0 }} />
            <span>Gasto fixo mensal (recorrente)</span>
            <span className="ml-auto text-xs font-bold"
              style={{
                background: recurring ? 'rgba(109,40,217,.25)' : 'rgba(255,255,255,.05)',
                color: recurring ? '#A78BFA' : 'var(--t3)',
                padding: '2px 8px', borderRadius: 12,
              }}>
              {recurring ? 'ON' : 'OFF'}
            </span>
          </button>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--b)' }}>
        <Button variant="ghost"   onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>{existing ? 'Salvar' : 'Registrar Gasto'}</Button>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function GastosPage() {
  const expenses      = useStore(s => s.expenses);
  const addExpense    = useStore(s => s.addExpense);
  const deleteExpense = useStore(s => s.deleteExpense);
  const toast         = useStore(s => s.toast);

  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<Expense | undefined>(undefined);
  const [filterMonth, setFilterMonth] = useState(currentMonth());

  // Recurring expenses appear in every month from their acquisition date onward.
  // We tag each item with `isPrevisto: true` if it's a recurring expense being
  // projected into the filter month (i.e. the filter month ≠ its own date's month).
  const filtered = useMemo(() => {
    if (!filterMonth) {
      return expenses
        .map(e => ({ ...e, isPrevisto: false }))
        .sort((a, b) => b.date.localeCompare(a.date));
    }

    const result: (Expense & { isPrevisto: boolean })[] = [];

    expenses.forEach(e => {
      const expMonth = e.date.slice(0, 7);
      if (expMonth === filterMonth) {
        // Expense is in the exact filter month — show it normally
        result.push({ ...e, isPrevisto: false });
      } else if (e.recurring && expMonth <= filterMonth) {
        // Recurring expense from a prior month — project it as "previsto"
        result.push({ ...e, isPrevisto: true });
      }
    });

    return result.sort((a, b) => {
      // Confirmed first, previsto second; within each group sort by date desc
      if (a.isPrevisto !== b.isPrevisto) return a.isPrevisto ? 1 : -1;
      return b.date.localeCompare(a.date);
    });
  }, [expenses, filterMonth]);

  // Total includes confirmed entries; previsto shown separately
  const totalConfirmed = filtered.filter(e => !e.isPrevisto).reduce((s, e) => s + e.amount, 0);
  const totalPrevisto  = filtered.filter(e =>  e.isPrevisto).reduce((s, e) => s + e.amount, 0);
  const totalMonth     = totalConfirmed + totalPrevisto;

  // By category for pie chart
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

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
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Gastos</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>
            Controle de despesas da operação
          </p>
        </div>
        <Button variant="primary" onClick={() => { setEditing(undefined); setShowForm(true); }}>
          <Plus size={14} /> Registrar Gasto
        </Button>
      </div>

      {/* Month filter + total */}
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
          <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
            Registre assinaturas, taxas e outros custos da operação
          </p>
          <Button variant="primary" onClick={() => setShowForm(true)}>+ Registrar Gasto</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Expenses list */}
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
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: (CATEGORY_COLORS[e.category] || '#374151') + '22',
                    color:       CATEGORY_COLORS[e.category] || '#374151',
                  }}
                >
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
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: (CATEGORY_COLORS[e.category] || '#374151') + '22',
                        color:       CATEGORY_COLORS[e.category] || '#374151',
                      }}
                    >
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
                    <button
                      onClick={() => { setEditing(e); setShowForm(true); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                      style={{ color: 'var(--t3)' }}
                      onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                      onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Remover este gasto?')) {
                          deleteExpense(e.id);
                          toast('Gasto removido', 'ok');
                        }
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ color: 'var(--r)', background: 'var(--rd)' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
                {e.isPrevisto && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        addExpense({
                          date:        todayStr(),
                          category:    e.category,
                          description: e.description,
                          amount:      e.amount,
                          notes:       e.notes ?? '',
                          recurring:   false,
                        });
                        toast(`Pagamento de "${e.description}" registrado`, 'ok');
                      }}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-bold"
                      style={{ background: 'rgba(0,255,136,.1)', color: 'var(--g)', border: '1px solid rgba(0,255,136,.2)' }}
                      title="Registrar pagamento deste mês"
                    >
                      ✓ Pago
                    </button>
                    <button
                      onClick={() => { setEditing(e); setShowForm(true); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                      style={{ color: 'var(--t3)' }}
                      title="Editar gasto recorrente"
                      onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                      onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Category breakdown pie */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
            <div className="font-bold mb-1 text-sm" style={{ color: 'var(--t2)' }}>Por Categoria</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={byCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {byCategory.map((entry, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#374151'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1 mt-2">
              {byCategory.map(c => (
                <div key={c.name} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: CATEGORY_COLORS[c.name] || '#374151' }}
                  />
                  <span className="text-xs flex-1" style={{ color: 'var(--t2)' }}>{c.name}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--r)' }}>{fmtBRL(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <ExpenseForm
          existing={editing}
          onClose={() => { setShowForm(false); setEditing(undefined); }}
        />
      )}
    </div>
  );
}
