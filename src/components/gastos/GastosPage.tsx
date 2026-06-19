'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Modal }  from '@/components/ui/Modal';
import {
  Plus, Trash2, Search, Filter, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, Zap,
  Briefcase, User, ChevronDown, ChevronRight, Pencil,
} from 'lucide-react';
import type { Expense, ExpenseGroup, RecurringExpense } from '@/types';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';

// ── Taxonomy ──────────────────────────────────────────────────────────────────

interface Classification {
  group: ExpenseGroup;
  category: string;
  subcategory?: string;
}

const RULES: Array<{ kw: string[]; result: Classification }> = [
  // Operacional — Anti-detect
  { kw: ['multilogin','gologin','adspower','morelogin','kameleo','octo','linken','vmlogin','incognition','anti-detect','antidetect'],
    result: { group: 'operacional', category: 'Anti-detect', subcategory: 'Navegador' } },
  // Operacional — Infraestrutura
  { kw: ['vps','servidor','server','hospedagem','hostinger','domínio','domain','aws','digitalocean','cloudflare','contabo','vultr','linode','oracle cloud','hetzner'],
    result: { group: 'operacional', category: 'Infraestrutura', subcategory: 'VPS/Servidor' } },
  // Operacional — Telecomunicações
  { kw: ['chip','sim card','claro','vivo','tim','oi','nextel','plano móvel','recarga','dados móveis','anatel'],
    result: { group: 'operacional', category: 'Telecomunicações', subcategory: 'Chip/Celular' } },
  // Operacional — Software & Ferramentas
  { kw: ['canva','figma','notion','chatgpt','claude','openai','gpt','suredge','photoshop','adobe','capcut','davinci','davinci resolve','editor de vídeo','premiere','after effects'],
    result: { group: 'operacional', category: 'Software', subcategory: 'Criação/IA' } },
  { kw: ['assinatura','mensalidade','licença','plano anual','plano mensal'],
    result: { group: 'operacional', category: 'Software', subcategory: 'Assinatura' } },
  // Pessoal — Alimentação
  { kw: ['mercado','supermercado','extra','carrefour','pão de açúcar','atacadão','assaí','hortifruti','açougue','padaria','feira','ifood','rappi','delivery','restaurante','lanche','pizza','hambúrguer','comida','almoço','jantar','café da manhã'],
    result: { group: 'pessoal', category: 'Alimentação' } },
  // Pessoal — Transporte
  { kw: ['gasolina','combustível','etanol','diesel','posto','shell','ipiranga','uber','99pop','ônibus','metrô','trem','estacionamento','pedágio','passagem'],
    result: { group: 'pessoal', category: 'Transporte', subcategory: 'Combustível' } },
  // Pessoal — Saúde & Bem-estar
  { kw: ['academia','gym','smart fit','smartfit','bodytech','farmácia','remédio','médico','dentista','saúde','exame','hospital','clínica','nutricionista','psicólogo','terapia','unimed','amil'],
    result: { group: 'pessoal', category: 'Saúde & Bem-estar' } },
  // Pessoal — Moradia
  { kw: ['aluguel','condomínio','iptu','energia','luz','conta de água','gás','manutenção','reparo','internet residencial'],
    result: { group: 'pessoal', category: 'Moradia' } },
  // Pessoal — Entretenimento
  { kw: ['netflix','spotify','disney','prime video','hbo','youtube premium','crunchyroll','cinema','show','ingresso','playstation','xbox','nintendo','steam'],
    result: { group: 'pessoal', category: 'Entretenimento' } },
  // Pessoal — Vestuário
  { kw: ['roupa','sapato','tênis','calçado','moda','camisa','calça','vestido','jaqueta','shein','zara','renner','hering'],
    result: { group: 'pessoal', category: 'Vestuário' } },
];

function classify(description: string): Classification | null {
  if (!description.trim()) return null;
  const lower = description.toLowerCase();
  for (const rule of RULES) {
    if (rule.kw.some(k => lower.includes(k))) return rule.result;
  }
  return null;
}

// ── Categoria configs ─────────────────────────────────────────────────────────

const OP_CATS = ['Anti-detect', 'Infraestrutura', 'Telecomunicações', 'Software', 'Taxas', 'Outros Operacional'];
const PS_CATS = ['Alimentação', 'Transporte', 'Saúde & Bem-estar', 'Moradia', 'Entretenimento', 'Vestuário', 'Outros Pessoal'];

const CAT_COLOR: Record<string, string> = {
  'Anti-detect':       '#A78BFA',
  'Infraestrutura':    '#60A5FA',
  'Telecomunicações':  '#34D399',
  'Software':          '#818CF8',
  'Taxas':             '#F87171',
  'Outros Operacional':'#6B7280',
  'Alimentação':       '#FB923C',
  'Transporte':        '#FBBF24',
  'Saúde & Bem-estar': '#4ADE80',
  'Moradia':           '#F472B6',
  'Entretenimento':    '#C084FC',
  'Vestuário':         '#FCA5A5',
  'Outros Pessoal':    '#9CA3AF',
};

function catColor(cat: string): string {
  return CAT_COLOR[cat] ?? '#6B7280';
}

function groupLabel(g: ExpenseGroup) {
  return g === 'operacional' ? 'Operacional' : 'Pessoal';
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
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

  const [date,        setDate]        = useState(existing?.date        ?? todayStr());
  const [desc,        setDesc]        = useState(existing?.description ?? '');
  const [amount,      setAmount]      = useState(existing ? String(existing.amount) : '');
  const [notes,       setNotes]       = useState(existing?.notes       ?? '');
  const [recurring,   setRecurring]   = useState(existing?.recurring   ?? false);

  const suggested = useMemo(() => classify(desc), [desc]);

  const [group,       setGroup]       = useState<ExpenseGroup | ''>(existing?.group ?? '');
  const [category,    setCategory]    = useState(existing?.category    ?? '');
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? '');
  const [overridden,  setOverridden]  = useState(!!existing?.group);

  function applyClassification(c: Classification) {
    setGroup(c.group);
    setCategory(c.category);
    setSubcategory(c.subcategory ?? '');
    setOverridden(false);
  }

  function handleDescChange(v: string) {
    setDesc(v);
    if (!overridden) {
      const c = classify(v);
      if (c) applyClassification(c);
    }
  }

  function save() {
    if (!desc.trim())   { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast('Valor deve ser maior que zero', 'wrn'); return; }

    const payload: Omit<Expense, 'id'> = {
      date,
      category:    category || 'Outros',
      subcategory: subcategory || undefined,
      group:       (group || undefined) as ExpenseGroup | undefined,
      description: desc.trim(),
      amount:      amt,
      notes:       notes || undefined,
      recurring,
    };

    if (existing) {
      updateExpense(existing.id, payload);
      toast('Gasto atualizado', 'ok');
    } else {
      addExpense(payload);
      toast('Gasto registrado', 'ok');
    }
    onClose();
  }

  const s = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  const allCats = group === 'operacional' ? OP_CATS : group === 'pessoal' ? PS_CATS : [...OP_CATS, ...PS_CATS];

  return (
    <Modal title={existing ? 'Editar Gasto' : 'Novo Gasto'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">

        {/* Descrição — primeira, pois dispara a classificação */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DESCRIÇÃO</span>
          <input
            autoFocus
            value={desc}
            onChange={e => handleDescChange(e.target.value)}
            placeholder="Ex: Mercado, Gasolina, Chip Claro, Canva Pro..."
            className="px-3 py-2.5 rounded-lg text-sm"
            style={s}
          />
        </label>

        {/* Sugestão de classificação */}
        {suggested && !overridden && group && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.2)', color: '#C4B5FD' }}>
            <Zap size={11} />
            <span>Classificado como <strong>{groupLabel(group as ExpenseGroup)}</strong> › <strong>{category}</strong>
              {subcategory && <> › {subcategory}</>}
            </span>
            <button
              type="button"
              onClick={() => setOverridden(true)}
              className="ml-auto text-xs underline"
              style={{ color: '#A78BFA' }}
            >
              Alterar
            </button>
          </div>
        )}

        {/* Campos manuais de grupo/categoria (sempre visíveis se override ou sem sugestão) */}
        {(overridden || !suggested || !group) && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>GRUPO</span>
              <select value={group} onChange={e => { setGroup(e.target.value as ExpenseGroup); setCategory(''); setSubcategory(''); }} className="px-3 py-2.5 rounded-lg text-sm" style={s}>
                <option value="">Selecione...</option>
                <option value="operacional">Operacional</option>
                <option value="pessoal">Pessoal</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CATEGORIA</span>
              <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s}>
                <option value="">Selecione...</option>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DATA</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s} />
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
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        <button
          type="button"
          onClick={() => setRecurring(v => !v)}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left w-full transition-all"
          style={{
            background: recurring ? 'rgba(109,40,217,.12)' : 'var(--sur)',
            border: `1px solid ${recurring ? 'rgba(109,40,217,.3)' : 'var(--b2)'}`,
            color: recurring ? '#A78BFA' : 'var(--t3)',
          }}
        >
          <RefreshCw size={13} />
          {recurring ? 'Recorrente — aparece todo mês automaticamente' : 'Marcar como recorrente (mensal)'}
        </button>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Salvar' : 'Registrar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Recurring expense form ────────────────────────────────────────────────────

interface RecurringFormProps {
  existing?: RecurringExpense;
  onClose:   () => void;
}

function RecurringForm({ existing, onClose }: RecurringFormProps) {
  const addRec    = useStore(s => s.addRecurringExpense);
  const updateRec = useStore(s => s.updateRecurringExpense);
  const toast     = useStore(s => s.toast);

  const [desc,        setDesc]        = useState(existing?.description ?? '');
  const [amount,      setAmount]      = useState(existing ? String(existing.amount) : '');
  const [group,       setGroup]       = useState<ExpenseGroup>(existing?.group ?? 'operacional');
  const [category,    setCategory]    = useState(existing?.category    ?? '');
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? '');
  const [billingDay,  setBillingDay]  = useState(existing?.billingDay  ?? 1);
  const [notes,       setNotes]       = useState(existing?.notes       ?? '');

  const suggested = useMemo(() => classify(desc), [desc]);

  function handleDescChange(v: string) {
    setDesc(v);
    const c = classify(v);
    if (c && !existing) {
      setGroup(c.group);
      setCategory(c.category);
      setSubcategory(c.subcategory ?? '');
    }
  }

  function save() {
    if (!desc.trim())   { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast('Valor deve ser maior que zero', 'wrn'); return; }
    if (!category)       { toast('Selecione uma categoria', 'wrn'); return; }

    const payload: Omit<RecurringExpense, 'id'> = {
      description: desc.trim(),
      group,
      category,
      subcategory: subcategory || undefined,
      amount: amt,
      billingDay,
      active: existing?.active ?? true,
      notes: notes || undefined,
    };

    if (existing) {
      updateRec(existing.id, payload);
      toast('Recorrente atualizado', 'ok');
    } else {
      addRec(payload);
      toast('Despesa recorrente cadastrada', 'ok');
    }
    onClose();
  }

  const s = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  const allCats = group === 'operacional' ? OP_CATS : PS_CATS;

  return (
    <Modal title={existing ? 'Editar Recorrente' : 'Nova Despesa Recorrente'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DESCRIÇÃO</span>
          <input autoFocus value={desc} onChange={e => handleDescChange(e.target.value)}
            placeholder="Ex: Academia Smart Fit, VPS Contabo, Netflix..." className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        {suggested && !existing && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.2)', color: '#C4B5FD' }}>
            <Zap size={11} />
            <span>Classificado: <strong>{groupLabel(group)}</strong> › <strong>{category || suggested.category}</strong></span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>GRUPO</span>
            <select value={group} onChange={e => { setGroup(e.target.value as ExpenseGroup); setCategory(''); }} className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              <option value="operacional">Operacional</option>
              <option value="pessoal">Pessoal</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CATEGORIA</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              <option value="">Selecione...</option>
              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>VALOR MENSAL (R$)</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00"
              className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DIA DO MÊS</span>
            <input type="number" min={1} max={28} value={billingDay}
              onChange={e => setBillingDay(Number(e.target.value))}
              className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Salvar' : 'Cadastrar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Insights ──────────────────────────────────────────────────────────────────

interface InsightItem {
  icon: 'alert' | 'up' | 'down' | 'info';
  text: string;
}

function computeInsights(
  current: Expense[],
  previous: Expense[],
  fixedCost: number,
): InsightItem[] {
  const insights: InsightItem[] = [];

  const total = current.reduce((s, e) => s + e.amount, 0);
  const prevTotal = previous.reduce((s, e) => s + e.amount, 0);

  // By category
  const byCat: Record<string, number> = {};
  current.forEach(e => { byCat[e.category] = (byCat[e.category] ?? 0) + e.amount; });
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const topCat = sortedCats[0];

  // Operacional vs pessoal
  const opTotal  = current.filter(e => e.group === 'operacional').reduce((s, e) => s + e.amount, 0);
  const psTotal  = current.filter(e => e.group === 'pessoal').reduce((s, e) => s + e.amount, 0);

  if (topCat && topCat[1] / total > 0.5) {
    insights.push({ icon: 'alert', text: `${topCat[0]} representa ${Math.round(topCat[1] / total * 100)}% das despesas do mês — concentração elevada.` });
  }

  if (prevTotal > 0 && total > prevTotal * 1.2) {
    const pct = Math.round((total / prevTotal - 1) * 100);
    insights.push({ icon: 'up', text: `Gastos ${pct}% maiores que no mês anterior.` });
  } else if (prevTotal > 0 && total < prevTotal * 0.8) {
    const pct = Math.round((1 - total / prevTotal) * 100);
    insights.push({ icon: 'down', text: `Gastos ${pct}% menores que no mês anterior. Bom controle.` });
  }

  if (fixedCost > 0) {
    insights.push({ icon: 'info', text: `Custo fixo mensal: ${fmtBRL(fixedCost)}. Precisa gerar pelo menos esse valor em lucro para cobrir os fixos.` });
  }

  if (opTotal > 0 && psTotal > 0) {
    const opPct = Math.round(opTotal / (opTotal + psTotal) * 100);
    insights.push({ icon: 'info', text: `${opPct}% operacional vs ${100 - opPct}% pessoal este mês.` });
  }

  // Check category growth vs prev month
  const prevByCat: Record<string, number> = {};
  previous.forEach(e => { prevByCat[e.category] = (prevByCat[e.category] ?? 0) + e.amount; });
  for (const [cat, amt] of sortedCats.slice(0, 3)) {
    const prev = prevByCat[cat] ?? 0;
    if (prev > 0 && amt > prev * 1.5) {
      insights.push({ icon: 'up', text: `${cat} cresceu ${Math.round(amt / prev * 100 - 100)}% em relação ao mês anterior.` });
    }
  }

  return insights.slice(0, 4);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function GastosPage() {
  const expenses          = useStore(s => s.expenses);
  const recurringExpenses = useStore(s => s.recurringExpenses ?? []);
  const deleteExpense     = useStore(s => s.deleteExpense);
  const deleteRec         = useStore(s => s.deleteRecurringExpense);
  const updateRec         = useStore(s => s.updateRecurringExpense);
  const addExpense        = useStore(s => s.addExpense);
  const toast             = useStore(s => s.toast);

  type Tab = 'visao' | 'gastos' | 'recorrentes';
  const [tab,          setTab]          = useState<Tab>('gastos');
  const [filterMonth,  setFilterMonth]  = useState(currentMonth());
  const [filterGroup,  setFilterGroup]  = useState<'todos' | 'operacional' | 'pessoal'>('todos');
  const [search,       setSearch]       = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [editing,      setEditing]      = useState<Expense | undefined>(undefined);
  const [showRecForm,  setShowRecForm]  = useState(false);
  const [editingRec,   setEditingRec]   = useState<RecurringExpense | undefined>(undefined);

  // ── Derived — current month expenses ──────────────────────────────────────

  const currentMonthExpenses = useMemo(
    () => expenses.filter(e => !e.recurring || e.date.slice(0, 7) === filterMonth)
      .filter(e => {
        const inMonth = e.date.slice(0, 7) === filterMonth;
        const isPrevio = e.recurring && e.date.slice(0, 7) <= filterMonth;
        return inMonth || isPrevio;
      }),
    [expenses, filterMonth],
  );

  const previousMonthExpenses = useMemo(
    () => expenses.filter(e => e.date.slice(0, 7) === prevMonth(filterMonth)),
    [expenses, filterMonth],
  );

  const fixedCost = useMemo(
    () => recurringExpenses.filter(r => r.active).reduce((s, r) => s + r.amount, 0),
    [recurringExpenses],
  );

  // ── Filtered list for Gastos tab ──────────────────────────────────────────

  const filtered = useMemo(() => {
    const result: (Expense & { isPrevisto: boolean })[] = [];
    expenses.forEach(e => {
      const expMonth = e.date.slice(0, 7);
      if (expMonth === filterMonth) {
        result.push({ ...e, isPrevisto: false });
      } else if (e.recurring && expMonth <= filterMonth) {
        result.push({ ...e, isPrevisto: true });
      }
    });
    return result
      .filter(e => filterGroup === 'todos' || e.group === filterGroup)
      .filter(e => !search || e.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (a.isPrevisto !== b.isPrevisto) return a.isPrevisto ? 1 : -1;
        return b.date.localeCompare(a.date);
      });
  }, [expenses, filterMonth, filterGroup, search]);

  const totalMonth = filtered.reduce((s, e) => s + e.amount, 0);

  // ── Summary for Visão Geral ───────────────────────────────────────────────

  const totalOp  = currentMonthExpenses.filter(e => e.group === 'operacional').reduce((s, e) => s + e.amount, 0);
  const totalPs  = currentMonthExpenses.filter(e => e.group === 'pessoal').reduce((s, e) => s + e.amount, 0);
  const totalAll = totalOp + totalPs;

  const topCategories = useMemo(() => {
    const map: Record<string, { total: number; group: string }> = {};
    currentMonthExpenses.forEach(e => {
      const k = e.category || 'Outros';
      if (!map[k]) map[k] = { total: 0, group: e.group ?? 'pessoal' };
      map[k].total += e.amount;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, total: v.total, group: v.group }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [currentMonthExpenses]);

  const insights = useMemo(
    () => computeInsights(currentMonthExpenses, previousMonthExpenses, fixedCost),
    [currentMonthExpenses, previousMonthExpenses, fixedCost],
  );

  // ── Recurring metrics ─────────────────────────────────────────────────────

  const activeRec    = recurringExpenses.filter(r => r.active);
  const fixedMonthly = activeRec.reduce((s, r) => s + r.amount, 0);
  const fixedWeekly  = +(fixedMonthly / 4.33).toFixed(2);
  const fixedDaily   = +(fixedMonthly / 30).toFixed(2);
  const fixedByGroup = {
    operacional: activeRec.filter(r => r.group === 'operacional').reduce((s, r) => s + r.amount, 0),
    pessoal:     activeRec.filter(r => r.group === 'pessoal').reduce((s, r) => s + r.amount, 0),
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const opPct = totalAll > 0 ? Math.round(totalOp / totalAll * 100) : 50;

  const InsightIcon = ({ type }: { type: InsightItem['icon'] }) => {
    if (type === 'alert') return <AlertTriangle size={13} style={{ color: '#FBBF24', flexShrink: 0 }} />;
    if (type === 'up')    return <TrendingUp   size={13} style={{ color: '#F87171', flexShrink: 0 }} />;
    if (type === 'down')  return <TrendingDown size={13} style={{ color: '#4ADE80', flexShrink: 0 }} />;
    return <Zap size={13} style={{ color: '#A78BFA', flexShrink: 0 }} />;
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Gestão Financeira</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>Gastos operacionais e pessoais da operação</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-xl gap-0.5" style={{ background: 'var(--sur)' }}>
            {(['visao', 'gastos', 'recorrentes'] as const).map(t => {
              const labels: Record<Tab, string> = { visao: 'Visão Geral', gastos: 'Gastos', recorrentes: 'Fixos' };
              return (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={tab === t
                    ? { background: 'var(--bg2)', color: 'var(--t)', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }
                    : { color: 'var(--t3)', background: 'transparent' }}>
                  {labels[t]}
                </button>
              );
            })}
          </div>
          <Button variant="primary" onClick={() => { setEditing(undefined); setShowForm(true); }}>
            <Plus size={14} /> Registrar Gasto
          </Button>
        </div>
      </div>

      {/* ── TAB: VISÃO GERAL ── */}
      {tab === 'visao' && (
        <>
          {/* Month filter */}
          <div className="flex items-center gap-2">
            <Filter size={13} style={{ color: 'var(--t3)' }} />
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total do Mês',   value: totalAll, color: 'var(--r)' },
              { label: 'Operacional',    value: totalOp,  color: '#818CF8' },
              { label: 'Pessoal',        value: totalPs,  color: '#FB923C' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl px-4 py-3.5"
                style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
                <div className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--t3)' }}>{label}</div>
                <div className="text-lg font-black font-mono" style={{ color }}>
                  {value > 0 ? `− ${fmtBRL(value)}` : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Operacional vs Pessoal split bar */}
          {totalAll > 0 && (
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold" style={{ color: 'var(--t2)' }}>Distribuição</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#818CF8' }} />Operacional {opPct}%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#FB923C' }} />Pessoal {100 - opPct}%</span>
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--sur)' }}>
                <div style={{ width: `${opPct}%`, background: '#818CF8', transition: 'width .4s ease' }} />
                <div style={{ width: `${100 - opPct}%`, background: '#FB923C', transition: 'width .4s ease' }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top categories */}
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="text-xs font-bold mb-3" style={{ color: 'var(--t2)' }}>Maiores Categorias</div>
              {topCategories.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--t3)' }}>Nenhum gasto registrado neste mês.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {topCategories.map(cat => {
                    const pct = Math.round(cat.total / totalAll * 100);
                    const color = catColor(cat.name);
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium" style={{ color: 'var(--t)' }}>{cat.name}</span>
                          <span className="text-xs font-mono" style={{ color }}>{fmtBRL(cat.total)}</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: 'var(--sur)' }}>
                          <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: '9999px', transition: 'width .3s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Insights */}
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="text-xs font-bold mb-3" style={{ color: 'var(--t2)' }}>Análise Automática</div>
              {insights.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--t3)' }}>Registre gastos para ver análises aqui.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs" style={{ color: 'var(--t2)' }}>
                      <InsightIcon type={ins.icon} />
                      <span>{ins.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── TAB: GASTOS ── */}
      {tab === 'gastos' && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--b2)' }}>
              {(['todos', 'operacional', 'pessoal'] as const).map(g => (
                <button key={g} type="button" onClick={() => setFilterGroup(g)}
                  className="px-3 py-1.5 text-xs font-bold transition-all"
                  style={{
                    background: filterGroup === g ? (g === 'operacional' ? '#818CF822' : g === 'pessoal' ? '#FB923C22' : 'var(--bg2)') : 'var(--sur)',
                    color: filterGroup === g ? (g === 'operacional' ? '#818CF8' : g === 'pessoal' ? '#FB923C' : 'var(--t)') : 'var(--t3)',
                    borderRight: g !== 'pessoal' ? '1px solid var(--b2)' : undefined,
                  }}>
                  {g === 'todos' ? 'Todos' : g === 'operacional' ? 'Operacional' : 'Pessoal'}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
            </div>

            <span className="ml-auto text-sm font-bold font-mono" style={{ color: 'var(--r)' }}>
              {totalMonth > 0 ? `− ${fmtBRL(totalMonth)}` : '—'}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">🧾</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhum gasto encontrado</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>Use o botão "Registrar Gasto" para adicionar despesas.</p>
              <Button variant="primary" onClick={() => setShowForm(true)}>+ Registrar Gasto</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map(e => {
                const color = e.group ? (e.group === 'operacional' ? '#818CF8' : '#FB923C') : '#6B7280';
                const catC  = catColor(e.category);
                return (
                  <div key={e.isPrevisto ? `prev_${e.id}` : e.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: e.isPrevisto ? 'rgba(255,191,0,.04)' : 'var(--bg2)',
                      border:     e.isPrevisto ? '1px solid rgba(255,191,0,.18)' : '1px solid var(--b)',
                    }}>

                    {/* Group indicator */}
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18` }}>
                      {e.group === 'operacional'
                        ? <Briefcase size={13} style={{ color }} />
                        : <User size={13} style={{ color }} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--t)' }}>{e.description}</span>
                        {e.isPrevisto && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold shrink-0"
                            style={{ background: 'rgba(255,191,0,.15)', color: '#FFBF00', border: '1px solid rgba(255,191,0,.3)' }}>
                            Previsto
                          </span>
                        )}
                        {e.recurring && !e.isPrevisto && (
                          <RefreshCw size={10} style={{ color: '#A78BFA', flexShrink: 0 }} />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {e.category && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ background: `${catC}18`, color: catC }}>
                            {e.category}
                          </span>
                        )}
                        {e.subcategory && (
                          <span className="text-xs" style={{ color: 'var(--t3)' }}>{e.subcategory}</span>
                        )}
                        <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>
                          {e.isPrevisto ? `desde ${fmtDate(e.date)}` : fmtDate(e.date)}
                        </span>
                        {e.notes && <span className="text-xs truncate" style={{ color: 'var(--t3)' }}>{e.notes}</span>}
                      </div>
                    </div>

                    <div className="text-sm font-bold font-mono flex-shrink-0"
                      style={{ color: e.isPrevisto ? '#FFBF00' : 'var(--r)' }}>
                      − {fmtBRL(e.amount)}
                    </div>

                    {!e.isPrevisto && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => { setEditing(e); setShowForm(true); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ color: 'var(--t3)' }}
                          onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                          onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => { if (confirm('Remover este gasto?')) { deleteExpense(e.id); toast('Gasto removido', 'ok'); } }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ color: 'var(--r)', background: 'var(--rd)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}

                    {e.isPrevisto && (
                      <button
                        onClick={() => {
                          addExpense({ date: todayStr(), category: e.category, subcategory: e.subcategory, group: e.group, description: e.description, amount: e.amount, notes: e.notes, recurring: false });
                          toast(`"${e.description}" registrado como pago`, 'ok');
                        }}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-bold shrink-0"
                        style={{ background: 'rgba(63,255,33,.08)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                        ✓ Pago
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB: RECORRENTES ── */}
      {tab === 'recorrentes' && (
        <>
          {/* Custo fixo summary */}
          {fixedMonthly > 0 && (
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="text-xs font-bold mb-3" style={{ color: 'var(--t2)' }}>Custo Fixo Calculado</div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Por Mês',    value: fixedMonthly },
                  { label: 'Por Semana', value: fixedWeekly  },
                  { label: 'Por Dia',    value: fixedDaily   },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-[11px]" style={{ color: 'var(--t3)' }}>{label}</div>
                    <div className="text-base font-black font-mono mt-0.5" style={{ color: 'var(--r)' }}>− {fmtBRL(value)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 flex items-center gap-4 flex-wrap" style={{ borderTop: '1px solid var(--b)' }}>
                <span className="text-xs" style={{ color: 'var(--t3)' }}>
                  Operacional: <span style={{ color: '#818CF8' }}>{fmtBRL(fixedByGroup.operacional)}</span>
                </span>
                <span className="text-xs" style={{ color: 'var(--t3)' }}>
                  Pessoal: <span style={{ color: '#FB923C' }}>{fmtBRL(fixedByGroup.pessoal)}</span>
                </span>
                <div className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'rgba(63,255,33,.06)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.15)' }}>
                  <TrendingUp size={12} />
                  Meta mínima de lucro: <strong className="ml-1 font-mono">{fmtBRL(fixedMonthly)}/mês</strong>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: 'var(--t2)' }}>
              {activeRec.length} despesa{activeRec.length !== 1 ? 's' : ''} fixa{activeRec.length !== 1 ? 's' : ''} ativa{activeRec.length !== 1 ? 's' : ''}
            </span>
            <Button variant="primary" onClick={() => { setEditingRec(undefined); setShowRecForm(true); }}>
              <Plus size={14} /> Adicionar Fixo
            </Button>
          </div>

          {recurringExpenses.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">📅</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhuma despesa fixa cadastrada</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
                Cadastre academia, softwares, VPS, multilogin e qualquer custo mensal fixo para calcular seu custo mínimo de operação.
              </p>
              <Button variant="primary" onClick={() => setShowRecForm(true)}>+ Adicionar Fixo</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recurringExpenses.map(r => {
                const color = r.group === 'operacional' ? '#818CF8' : '#FB923C';
                const catC  = catColor(r.category);
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: 'var(--bg2)', border: '1px solid var(--b)',
                      opacity: r.active ? 1 : 0.5,
                    }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18` }}>
                      {r.group === 'operacional' ? <Briefcase size={13} style={{ color }} /> : <User size={13} style={{ color }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--t)' }}>{r.description}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{ background: `${catC}18`, color: catC }}>
                          {r.category}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>dia {r.billingDay}</span>
                        {!r.active && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--sur)', color: 'var(--t3)' }}>inativo</span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold font-mono shrink-0" style={{ color: 'var(--r)' }}>
                      − {fmtBRL(r.amount)}/mês
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { updateRec(r.id, { active: !r.active }); toast(r.active ? 'Recorrente pausado' : 'Recorrente ativado', 'ok'); }}
                        className="text-xs px-2 py-1 rounded-lg font-bold transition-colors"
                        style={{ color: r.active ? '#FBBF24' : '#4ADE80', background: r.active ? 'rgba(251,191,36,.1)' : 'rgba(74,222,128,.1)' }}>
                        {r.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button onClick={() => { setEditingRec(r); setShowRecForm(true); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                        style={{ color: 'var(--t3)' }}
                        onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                        onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => { if (confirm('Remover este fixo?')) { deleteRec(r.id); toast('Removido', 'ok'); } }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
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
      {showForm   && <ExpenseForm    existing={editing}    onClose={() => { setShowForm(false);    setEditing(undefined);    }} />}
      {showRecForm && <RecurringForm existing={editingRec} onClose={() => { setShowRecForm(false); setEditingRec(undefined); }} />}
    </div>
  );
}
