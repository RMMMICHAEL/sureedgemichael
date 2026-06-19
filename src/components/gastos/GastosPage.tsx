'use client';

import { useState, useMemo } from 'react';
import { useStore }  from '@/store/useStore';
import { Button }    from '@/components/ui/Button';
import { Modal }     from '@/components/ui/Modal';
import {
  Plus, Trash2, Search, RefreshCw, Pencil,
  TrendingUp, TrendingDown, AlertTriangle, Zap, Target,
  Briefcase, User, ShieldCheck, ShieldAlert, ShieldX,
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Expense, ExpenseGroup, RecurringExpense } from '@/types';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';

// ── Taxonomy ──────────────────────────────────────────────────────────────────

interface Classification {
  group: ExpenseGroup;
  category: string;
  subcategory?: string;
}

const RULES: Array<{ kw: string[]; result: Classification }> = [
  // ── OPERACIONAL ──────────────────────────────────────────────────────────
  { kw: ['chip','sim card','claro chip','vivo chip','tim chip','oi chip','nextel','anatel','plano móvel','dados móveis','recarga celular','linha claro','linha vivo','linha tim'],
    result: { group: 'operacional', category: 'Chips' } },
  { kw: ['multilogin','gologin','adspower','morelogin','kameleo','octo browser','linken sphere','vmlogin','incognition','antidetect','anti-detect','navegador perfil','browser profile'],
    result: { group: 'operacional', category: 'Multilogin' } },
  { kw: ['vps','servidor','server','contabo','hetzner','digitalocean','aws','linode','vultr','oracle cloud','cloud server','máquina virtual'],
    result: { group: 'operacional', category: 'VPS/Servidor' } },
  { kw: ['canva','figma','notion','chatgpt','openai','claude','suredge','photoshop','adobe','capcut','premiere','after effects','davinci resolve','lightroom','assinatura ferramenta','assinatura soft'],
    result: { group: 'operacional', category: 'Software' } },
  { kw: ['api ','webhook','zapier','make.com','n8n','integromat','automação','bot aposta','bot odds'],
    result: { group: 'operacional', category: 'APIs' } },
  { kw: ['domínio','domain','hostinger','cloudflare','ssl','cdn','hospedagem web','registro domínio'],
    result: { group: 'operacional', category: 'Infraestrutura' } },
  { kw: ['taxa bancária','tarifa bancária','anuidade cartão','anuidade banco','tarifas banco','taxa manutenção conta'],
    result: { group: 'operacional', category: 'Taxas Bancárias' } },
  { kw: ['facebook ads','google ads','meta ads','tráfego pago','publicidade online','impulsionamento'],
    result: { group: 'operacional', category: 'Marketing' } },
  { kw: ['saque bet','saque casa','retirada apostas','saque apostas','saque bookmaker'],
    result: { group: 'operacional', category: 'Saques' } },
  { kw: ['depósito bet','deposito casa','aporte bet','depositar casa','depósito bookmaker','depósito apostas'],
    result: { group: 'operacional', category: 'Depósitos' } },
  // ── PESSOAL — Alimentação ─────────────────────────────────────────────────
  { kw: ['mercado','supermercado','carrefour','pão de açúcar','atacadão','assaí','hortifruti','açougue','feira livre','hiper'],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Mercado' } },
  { kw: ['lanche','hambúrguer','pizza','fast food','mcdonalds','burger','subway','kfc','salgado','pastel','esfiha','tapioca'],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Lanche' } },
  { kw: ['restaurante','almoço','jantar','ifood','rappi','delivery comida','refeição','café da manhã','marmita'],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Restaurante' } },
  { kw: ['padaria','pão','café padaria','confeitaria'],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Padaria' } },
  // ── PESSOAL — Transporte ──────────────────────────────────────────────────
  { kw: ['gasolina','combustível','etanol','diesel','posto','shell','ipiranga','abastecimento','brum'],
    result: { group: 'pessoal', category: 'Transporte', subcategory: 'Combustível' } },
  { kw: ['uber','99pop','táxi','ônibus','metrô','trem','passagem','estacionamento','pedágio','transporte por app'],
    result: { group: 'pessoal', category: 'Transporte', subcategory: 'Veículo/App' } },
  // ── PESSOAL — Saúde ───────────────────────────────────────────────────────
  { kw: ['academia','gym','smart fit','smartfit','bodytech','crossfit','personal trainer','musculação'],
    result: { group: 'pessoal', category: 'Saúde', subcategory: 'Academia' } },
  { kw: ['farmácia','remédio','médico','dentista','exame','hospital','clínica','nutricionista','psicólogo','terapia','unimed','amil','sulamerica','plano saúde'],
    result: { group: 'pessoal', category: 'Saúde', subcategory: 'Saúde Geral' } },
  // ── PESSOAL — Lazer ───────────────────────────────────────────────────────
  { kw: ['netflix','spotify','disney','prime video','hbo max','youtube premium','crunchyroll','cinema','show ao vivo','ingresso','steam','xbox','playstation','nintendo','twitch'],
    result: { group: 'pessoal', category: 'Lazer' } },
  // ── PESSOAL — Compras ─────────────────────────────────────────────────────
  { kw: ['roupa','sapato','tênis','calçado','shein','zara','renner','hering','amazon','mercado livre','shopee','aliexpress','magazine luiza','americanas'],
    result: { group: 'pessoal', category: 'Compras' } },
  // ── PESSOAL — Cartão ──────────────────────────────────────────────────────
  { kw: ['fatura cartão','fatura nubank','fatura itaú','fatura bradesco','fatura santander','fatura inter','fatura c6','pagar cartão','pagamento fatura'],
    result: { group: 'pessoal', category: 'Cartão de Crédito' } },
  // ── PESSOAL — Moradia ─────────────────────────────────────────────────────
  { kw: ['aluguel','condomínio','iptu','energia elétrica','conta de luz','conta de água','gás residencial','internet residencial','manutenção casa','água esgoto'],
    result: { group: 'pessoal', category: 'Moradia' } },
];

const OP_CATS = [
  'Casas de Aposta','Chips','Multilogin','VPS/Servidor','Software','APIs',
  'Infraestrutura','Taxas Bancárias','Marketing','Saques','Depósitos','Ferramentas','Outros',
];
const PS_CATS = [
  'Alimentação','Transporte','Saúde','Lazer','Compras','Cartão de Crédito','Moradia','Outros',
];

const CAT_COLOR: Record<string, string> = {
  'Casas de Aposta':   '#F59E0B',
  'Chips':             '#34D399',
  'Multilogin':        '#A78BFA',
  'VPS/Servidor':      '#60A5FA',
  'Software':          '#818CF8',
  'APIs':              '#6EE7B7',
  'Infraestrutura':    '#93C5FD',
  'Taxas Bancárias':   '#FCA5A5',
  'Marketing':         '#F472B6',
  'Saques':            '#FBBF24',
  'Depósitos':         '#4ADE80',
  'Ferramentas':       '#C084FC',
  'Alimentação':       '#FB923C',
  'Transporte':        '#FBBF24',
  'Saúde':             '#4ADE80',
  'Lazer':             '#C084FC',
  'Compras':           '#F472B6',
  'Cartão de Crédito': '#F87171',
  'Moradia':           '#93C5FD',
  'Outros':            '#6B7280',
  // legacy categories (from before taxonomy expansion)
  'Assinatura':        '#A78BFA',
  'Gastos Pessoais':   '#FB923C',
};

function classify(description: string): Classification | null {
  if (!description.trim()) return null;
  const lower = description.toLowerCase();
  for (const rule of RULES) {
    if (rule.kw.some(k => lower.includes(k.trim()))) return rule.result;
  }
  return null;
}

function catColor(cat: string): string {
  return CAT_COLOR[cat] ?? '#6B7280';
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
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return names[m - 1] ?? ym;
}

// ── Date grouping ─────────────────────────────────────────────────────────────

function getDateGroup(dateStr: string): string {
  const now  = new Date();
  const date = new Date(dateStr + 'T12:00:00');
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 0)  return 'Futuros';
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays <= 6)  return 'Esta semana';
  if (diffDays <= 13) return 'Semana passada';
  const sameMonth =
    date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  return sameMonth
    ? 'Mais cedo este mês'
    : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

const DATE_GROUP_ORDER = ['Futuros','Hoje','Ontem','Esta semana','Semana passada','Mais cedo este mês'];

// ── Insights engine ───────────────────────────────────────────────────────────

interface InsightItem {
  icon: 'alert' | 'up' | 'down' | 'info' | 'missing';
  text: string;
}

function computeInsights(
  current:    Expense[],
  previous:   Expense[],
  recurring:  RecurringExpense[],
  filterMonth: string,
): InsightItem[] {
  const out: InsightItem[] = [];
  const now = new Date();

  const total     = current.reduce((s, e) => s + e.amount, 0);
  const prevTotal = previous.reduce((s, e) => s + e.amount, 0);
  const opExps    = current.filter(e => e.group === 'operacional');
  const psExps    = current.filter(e => e.group === 'pessoal');
  const opTotal   = opExps.reduce((s, e) => s + e.amount, 0);
  const psTotal   = psExps.reduce((s, e) => s + e.amount, 0);

  const byCat: Record<string, number>     = {};
  const prevByCat: Record<string, number> = {};
  current.forEach(e  => { const k = e.category || 'Outros'; byCat[k]     = (byCat[k]     ?? 0) + e.amount; });
  previous.forEach(e => { const k = e.category || 'Outros'; prevByCat[k] = (prevByCat[k] ?? 0) + e.amount; });
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  // Top operacional category
  const topOp = sorted.find(([k]) => opExps.some(e => e.category === k));
  if (topOp) {
    out.push({ icon: 'info', text: `${topOp[0]} é seu maior custo operacional este mês (${fmtBRL(topOp[1])}).` });
  }

  // Top pessoal percentage
  const topPs = sorted.find(([k]) => psExps.some(e => e.category === k));
  if (topPs && psTotal > 0) {
    const pct = Math.round(topPs[1] / psTotal * 100);
    out.push({ icon: 'info', text: `${topPs[0]} representa ${pct}% dos seus gastos pessoais (${fmtBRL(topPs[1])}).` });
  }

  // Category growth vs previous month
  for (const [cat, amt] of sorted.slice(0, 5)) {
    const prev = prevByCat[cat] ?? 0;
    if (prev > 0 && amt > prev * 1.25) {
      const pct = Math.round((amt / prev - 1) * 100);
      out.push({ icon: 'up', text: `${cat} aumentou ${pct}% em relação ao mês passado.` });
      break;
    }
  }

  // Overall comparison
  if (prevTotal > 0 && total > prevTotal * 1.2) {
    const pct = Math.round((total / prevTotal - 1) * 100);
    out.push({ icon: 'alert', text: `Gastos ${pct}% maiores que no mês anterior. Revise as categorias acima.` });
  } else if (prevTotal > 0 && total < prevTotal * 0.85) {
    out.push({ icon: 'down', text: `Gastos ${Math.round((1 - total / prevTotal) * 100)}% menores que no mês anterior.` });
  }

  // Projection (only for current month)
  const [fy, fm] = filterMonth.split('-').map(Number);
  const isCurrentMonth = fy === now.getFullYear() && fm === now.getMonth() + 1;
  if (isCurrentMonth && now.getDate() > 3 && total > 0) {
    const daysInMonth = new Date(fy, fm, 0).getDate();
    const projected   = (total / now.getDate()) * daysInMonth;
    out.push({ icon: 'info', text: `Projeção: se mantiver o ritmo, encerrará o mês com ${fmtBRL(projected)} em despesas.` });
  }

  // Commitment vs previous total
  if (prevTotal > 0 && opTotal > 0) {
    const pct = Math.round(opTotal / prevTotal * 100);
    if (pct >= 50) {
      out.push({ icon: 'alert', text: `Custos operacionais já representam ${pct}% do total gasto no mês anterior.` });
    }
  }

  // Missing recurring (first one not found this month)
  const descSet = current.map(e => e.description.toLowerCase());
  for (const r of recurring.filter(r => r.active)) {
    const key = r.description.toLowerCase().slice(0, 6);
    if (!descSet.some(d => d.includes(key))) {
      out.push({ icon: 'missing', text: `${r.description} (${fmtBRL(r.amount)}/mês) não teve lançamento registrado ainda.` });
      break;
    }
  }

  return out.slice(0, 5);
}

// ── Health indicator ──────────────────────────────────────────────────────────

type Health = 'ok' | 'warn' | 'bad' | 'neutral';

function computeHealth(current: number, previous: number): Health {
  if (previous === 0) return 'neutral';
  const ratio = current / previous;
  if (ratio <= 1.0)  return 'ok';
  if (ratio <= 1.25) return 'warn';
  return 'bad';
}

const HEALTH_CONFIG: Record<Health, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  ok:      { label: 'Gastos dentro da média', color: '#3FFF21', bg: 'rgba(63,255,33,.06)', Icon: ShieldCheck  },
  warn:    { label: 'Gastos acima da média', color: '#FBBF24',  bg: 'rgba(251,191,36,.06)', Icon: ShieldAlert },
  bad:     { label: 'Crescimento acelerado', color: '#F87171',  bg: 'rgba(248,113,113,.06)', Icon: ShieldX  },
  neutral: { label: 'Sem histórico anterior', color: '#6B7280', bg: 'rgba(107,114,128,.06)', Icon: ShieldCheck },
};

// ── Expense form ──────────────────────────────────────────────────────────────

interface ExpenseFormProps { existing?: Expense; onClose: () => void; }

function ExpenseForm({ existing, onClose }: ExpenseFormProps) {
  const addExpense    = useStore(s => s.addExpense);
  const updateExpense = useStore(s => s.updateExpense);
  const toast         = useStore(s => s.toast);

  const [date,        setDate]        = useState(existing?.date        ?? todayStr());
  const [desc,        setDesc]        = useState(existing?.description ?? '');
  const [amount,      setAmount]      = useState(existing ? String(existing.amount) : '');
  const [notes,       setNotes]       = useState(existing?.notes       ?? '');
  const [recurring,   setRecurring]   = useState(existing?.recurring   ?? false);
  const [group,       setGroup]       = useState<ExpenseGroup | ''>(existing?.group ?? '');
  const [category,    setCategory]    = useState(existing?.category    ?? '');
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? '');
  const [overridden,  setOverridden]  = useState(!!existing?.group);

  const suggested = useMemo(() => classify(desc), [desc]);

  function handleDescChange(v: string) {
    setDesc(v);
    if (!overridden) {
      const c = classify(v);
      if (c) { setGroup(c.group); setCategory(c.category); setSubcategory(c.subcategory ?? ''); }
    }
  }

  function save() {
    if (!desc.trim()) { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast('Valor deve ser maior que zero', 'wrn'); return; }

    const payload: Omit<Expense, 'id'> = {
      date, category: category || 'Outros',
      subcategory: subcategory || undefined,
      group:       (group || undefined) as ExpenseGroup | undefined,
      description: desc.trim(), amount: amt,
      notes: notes || undefined, recurring,
    };
    if (existing) { updateExpense(existing.id, payload); toast('Gasto atualizado', 'ok'); }
    else          { addExpense(payload);                 toast('Gasto registrado', 'ok'); }
    onClose();
  }

  const s = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  const cats = group === 'operacional' ? OP_CATS : group === 'pessoal' ? PS_CATS : [...OP_CATS, ...PS_CATS];

  return (
    <Modal title={existing ? 'Editar Gasto' : 'Novo Gasto'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DESCRIÇÃO</span>
          <input autoFocus value={desc} onChange={e => handleDescChange(e.target.value)}
            placeholder="Ex: Mercado, Gasolina, Chip Claro, VPS Contabo..."
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        {suggested && !overridden && group && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.2)', color: '#C4B5FD' }}>
            <Zap size={11} />
            <span>
              Classificado: <strong>{group === 'operacional' ? 'Operacional' : 'Pessoal'}</strong>
              {' › '}<strong>{category}</strong>
              {subcategory && <> › {subcategory}</>}
            </span>
            <button type="button" onClick={() => setOverridden(true)}
              className="ml-auto text-xs underline" style={{ color: '#A78BFA' }}>
              Alterar
            </button>
          </div>
        )}

        {(overridden || !suggested || !group) && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>GRUPO</span>
              <select value={group}
                onChange={e => { setGroup(e.target.value as ExpenseGroup); setCategory(''); setSubcategory(''); }}
                className="px-3 py-2.5 rounded-lg text-sm" style={s}>
                <option value="">Selecione...</option>
                <option value="operacional">Operacional</option>
                <option value="pessoal">Pessoal</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CATEGORIA</span>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="px-3 py-2.5 rounded-lg text-sm" style={s}>
                <option value="">Selecione...</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DATA</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2.5 rounded-lg text-sm" style={s} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>VALOR (R$)</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00"
              className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        <button type="button" onClick={() => setRecurring(v => !v)}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left w-full transition-all"
          style={{
            background: recurring ? 'rgba(109,40,217,.12)' : 'var(--sur)',
            border: `1px solid ${recurring ? 'rgba(109,40,217,.3)' : 'var(--b2)'}`,
            color:  recurring ? '#A78BFA' : 'var(--t3)',
          }}>
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

interface RecurringFormProps { existing?: RecurringExpense; onClose: () => void; }

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

  function handleDescChange(v: string) {
    setDesc(v);
    if (!existing) {
      const c = classify(v);
      if (c) { setGroup(c.group); setCategory(c.category); setSubcategory(c.subcategory ?? ''); }
    }
  }

  function save() {
    if (!desc.trim()) { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast('Valor deve ser maior que zero', 'wrn'); return; }
    if (!category)        { toast('Selecione uma categoria', 'wrn'); return; }

    const payload: Omit<RecurringExpense, 'id'> = {
      description: desc.trim(), group, category,
      subcategory: subcategory || undefined,
      amount: amt, billingDay,
      active: existing?.active ?? true,
      notes:  notes || undefined,
    };
    if (existing) { updateRec(existing.id, payload); toast('Recorrente atualizado', 'ok'); }
    else          { addRec(payload);                  toast('Fixo cadastrado', 'ok'); }
    onClose();
  }

  const s    = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  const cats = group === 'operacional' ? OP_CATS : PS_CATS;
  const sug  = useMemo(() => classify(desc), [desc]);

  return (
    <Modal title={existing ? 'Editar Fixo' : 'Nova Despesa Fixa'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>DESCRIÇÃO</span>
          <input autoFocus value={desc} onChange={e => handleDescChange(e.target.value)}
            placeholder="Ex: Academia Smart Fit, VPS Contabo, Netflix..."
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        {sug && !existing && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.2)', color: '#C4B5FD' }}>
            <Zap size={11} />
            <span>Detectado: <strong>{group === 'operacional' ? 'Operacional' : 'Pessoal'}</strong> › <strong>{category || sug.category}</strong></span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>GRUPO</span>
            <select value={group}
              onChange={e => { setGroup(e.target.value as ExpenseGroup); setCategory(''); }}
              className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              <option value="operacional">Operacional</option>
              <option value="pessoal">Pessoal</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>CATEGORIA</span>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              <option value="">Selecione...</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
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
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Salvar' : 'Cadastrar'}</Button>
        </div>
      </div>
    </Modal>
  );
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

  type Tab = 'visao' | 'gastos' | 'fixos';
  const [tab,          setTab]         = useState<Tab>('gastos');
  const [filterMonth,  setFilterMonth] = useState(currentMonth());
  const [filterGroup,  setFilterGroup] = useState<'todos' | 'operacional' | 'pessoal'>('todos');
  const [search,       setSearch]      = useState('');
  const [showForm,     setShowForm]    = useState(false);
  const [editing,      setEditing]     = useState<Expense | undefined>(undefined);
  const [showRecForm,  setShowRecForm] = useState(false);
  const [editingRec,   setEditingRec]  = useState<RecurringExpense | undefined>(undefined);

  // ── Derived ────────────────────────────────────────────────────────────────

  const currentMonthExpenses = useMemo(() => {
    const result: Expense[] = [];
    expenses.forEach(e => {
      if (e.date.slice(0, 7) === filterMonth) result.push(e);
      else if (e.recurring && e.date.slice(0, 7) < filterMonth) result.push(e);
    });
    return result;
  }, [expenses, filterMonth]);

  const previousMonthExpenses = useMemo(
    () => expenses.filter(e => e.date.slice(0, 7) === prevMonth(filterMonth)),
    [expenses, filterMonth],
  );

  const totalAll  = currentMonthExpenses.reduce((s, e) => s + e.amount, 0);
  const prevTotal = previousMonthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalOp   = currentMonthExpenses.filter(e => e.group === 'operacional').reduce((s, e) => s + e.amount, 0);
  const totalPs   = currentMonthExpenses.filter(e => e.group === 'pessoal').reduce((s, e) => s + e.amount, 0);

  // Largest single expense
  const largestExpense = useMemo(
    () => currentMonthExpenses.length > 0
      ? currentMonthExpenses.reduce((a, b) => b.amount > a.amount ? b : a)
      : null,
    [currentMonthExpenses],
  );

  // Top category
  const topCategory = useMemo(() => {
    const map: Record<string, number> = {};
    currentMonthExpenses.forEach(e => { const k = e.category || 'Outros'; map[k] = (map[k] ?? 0) + e.amount; });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return entries[0] ?? null;
  }, [currentMonthExpenses]);

  // Top 7 categories for chart
  const topCategories = useMemo(() => {
    const map: Record<string, number> = {};
    currentMonthExpenses.forEach(e => { const k = e.category || 'Outros'; map[k] = (map[k] ?? 0) + e.amount; });
    return Object.entries(map).map(([name, total]) => ({ name, total: +total.toFixed(2) }))
      .sort((a, b) => b.total - a.total).slice(0, 7);
  }, [currentMonthExpenses]);

  // Projection
  const projecao = useMemo(() => {
    const now = new Date();
    const [y, m] = filterMonth.split('-').map(Number);
    const isNow = y === now.getFullYear() && m === now.getMonth() + 1;
    if (!isNow || now.getDate() < 3 || totalAll === 0) return null;
    const daysInMonth = new Date(y, m, 0).getDate();
    return +((totalAll / now.getDate()) * daysInMonth).toFixed(2);
  }, [filterMonth, totalAll]);

  // Health
  const health = computeHealth(totalAll, prevTotal);
  const hCfg   = HEALTH_CONFIG[health];

  // Insights
  const insights = useMemo(
    () => computeInsights(currentMonthExpenses, previousMonthExpenses, recurringExpenses, filterMonth),
    [currentMonthExpenses, previousMonthExpenses, recurringExpenses, filterMonth],
  );

  // Monthly evolution (6 months)
  const evolution = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const op = expenses.filter(e => e.date.slice(0, 7) === ym && e.group === 'operacional').reduce((s, e) => s + e.amount, 0);
      const ps = expenses.filter(e => e.date.slice(0, 7) === ym && e.group === 'pessoal').reduce((s, e) => s + e.amount, 0);
      return { label: monthLabel(ym), op: +op.toFixed(2), ps: +ps.toFixed(2) };
    });
  }, [expenses]);

  // Filtered list for Gastos tab
  const filtered = useMemo(() => {
    const result: (Expense & { isPrevisto: boolean })[] = [];
    expenses.forEach(e => {
      const eMonth = e.date.slice(0, 7);
      if (eMonth === filterMonth)                           result.push({ ...e, isPrevisto: false });
      else if (e.recurring && eMonth <= filterMonth)       result.push({ ...e, isPrevisto: true });
    });
    return result
      .filter(e => filterGroup === 'todos' || e.group === filterGroup)
      .filter(e => !search || e.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (a.isPrevisto !== b.isPrevisto) return a.isPrevisto ? 1 : -1;
        return b.date.localeCompare(a.date);
      });
  }, [expenses, filterMonth, filterGroup, search]);

  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);

  // Grouped list
  const groupedFiltered = useMemo(() => {
    const groups: Record<string, (Expense & { isPrevisto: boolean })[]> = {};
    filtered.forEach(e => {
      const g = e.isPrevisto ? 'Previstos' : getDateGroup(e.date);
      if (!groups[g]) groups[g] = [];
      groups[g].push(e);
    });
    const order = [...DATE_GROUP_ORDER, 'Previstos'];
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = order.indexOf(a), bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [filtered]);

  // Fixed costs
  const activeRec     = recurringExpenses.filter(r => r.active);
  const fixedMonthly  = activeRec.reduce((s, r) => s + r.amount, 0);
  const fixedWeekly   = +(fixedMonthly / 4.33).toFixed(2);
  const fixedDaily    = +(fixedMonthly / 30).toFixed(2);
  const fixedOp       = activeRec.filter(r => r.group === 'operacional').reduce((s, r) => s + r.amount, 0);
  const fixedPs       = activeRec.filter(r => r.group === 'pessoal').reduce((s, r) => s + r.amount, 0);
  const fixedOpDays22 = +(fixedOp / 22).toFixed(2);

  // ── Tooltip for chart ─────────────────────────────────────────────────────

  const ChartTip = ({ active, payload, label }: Record<string, unknown>) => {
    if (!active || !Array.isArray(payload) || !payload.length) return null;
    const op = (payload as Array<{ name: string; value: number }>).find(p => p.name === 'op')?.value ?? 0;
    const ps = (payload as Array<{ name: string; value: number }>).find(p => p.name === 'ps')?.value ?? 0;
    return (
      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t)' }}>
        <div className="font-bold mb-1">{String(label)}</div>
        {op > 0 && <div style={{ color: '#818CF8' }}>Oper. {fmtBRL(op)}</div>}
        {ps > 0 && <div style={{ color: '#FB923C' }}>Pess. {fmtBRL(ps)}</div>}
        <div className="font-bold mt-0.5" style={{ color: 'var(--t2)' }}>Total {fmtBRL(op + ps)}</div>
      </div>
    );
  };

  const opPct = totalAll > 0 ? Math.round(totalOp / totalAll * 100) : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Gestão Financeira</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>
            Controle operacional e pessoal da operação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-xl gap-0.5" style={{ background: 'var(--sur)' }}>
            {(['visao', 'gastos', 'fixos'] as const).map(t => {
              const labels: Record<Tab, string> = { visao: 'Visão Geral', gastos: 'Gastos', fixos: 'Fixos' };
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

      {/* ══════════════ TAB: VISÃO GERAL ══════════════ */}
      {tab === 'visao' && (
        <>
          {/* Month filter */}
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="w-fit px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

          {/* Health banner */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: hCfg.bg, border: `1px solid ${hCfg.color}22` }}>
            <hCfg.Icon size={16} style={{ color: hCfg.color, flexShrink: 0 }} />
            <span className="text-sm font-bold" style={{ color: hCfg.color }}>{hCfg.label}</span>
            {prevTotal > 0 && (
              <span className="text-xs ml-auto font-mono" style={{ color: 'var(--t3)' }}>
                Mês anterior: {fmtBRL(prevTotal)}
              </span>
            )}
          </div>

          {/* 6 metric chips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total do Mês',        value: totalAll,            color: 'var(--r)',  sign: true },
              { label: 'Operacional',          value: totalOp,             color: '#818CF8',  sign: true },
              { label: 'Pessoal',              value: totalPs,             color: '#FB923C',  sign: true },
              { label: 'Maior Categoria',      value: topCategory?.[1] ?? 0, color: topCategory ? catColor(topCategory[0]) : '#6B7280', sign: true, label2: topCategory?.[0] },
              { label: 'Maior Gasto',          value: largestExpense?.amount ?? 0, color: 'var(--t2)', sign: true, label2: largestExpense?.description },
              { label: 'Projeção do Mês',      value: projecao ?? 0,       color: projecao && projecao > totalAll * 1.1 ? '#FBBF24' : 'var(--t2)', sign: true, label2: projecao ? 'estimativa' : 'mês atual' },
            ].map(({ label, value, color, sign, label2 }) => (
              <div key={label} className="rounded-xl px-4 py-3.5"
                style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
                <div className="text-[11px] font-black uppercase tracking-wider mb-1" style={{ color: 'var(--t3)' }}>{label}</div>
                {label2 && <div className="text-[11px] truncate mb-0.5" style={{ color: 'var(--t3)' }}>{label2}</div>}
                <div className="text-base font-black font-mono" style={{ color }}>
                  {value > 0 ? `${sign ? '− ' : ''}${fmtBRL(value)}` : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Split bar */}
          {totalAll > 0 && (
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold" style={{ color: 'var(--t2)' }}>Distribuição</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#818CF8' }} />
                    Operacional {opPct}%
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#FB923C' }} />
                    Pessoal {100 - opPct}%
                  </span>
                </div>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--sur)' }}>
                {opPct > 0 && <div style={{ width: `${opPct}%`, background: '#818CF8', transition: 'width .4s ease' }} />}
                {(100 - opPct) > 0 && <div style={{ width: `${100 - opPct}%`, background: '#FB923C', transition: 'width .4s ease' }} />}
              </div>
            </div>
          )}

          {/* Chart + categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly evolution */}
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="text-xs font-bold mb-4" style={{ color: 'var(--t2)' }}>Evolução Mensal</div>
              {evolution.every(m => m.op === 0 && m.ps === 0) ? (
                <p className="text-xs" style={{ color: 'var(--t3)' }}>Nenhum dado histórico ainda.</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={evolution} barSize={14} barGap={2}
                    margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                    <Bar dataKey="op" stackId="a" fill="#818CF8" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="ps" stackId="a" fill="#FB923C" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top categories */}
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="text-xs font-bold mb-4" style={{ color: 'var(--t2)' }}>Top Categorias</div>
              {topCategories.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--t3)' }}>Nenhum gasto neste mês.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {topCategories.map(cat => {
                    const pct   = totalAll > 0 ? Math.round(cat.total / totalAll * 100) : 0;
                    const color = catColor(cat.name);
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="text-xs" style={{ color: 'var(--t)' }}>{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: 'var(--t3)' }}>{pct}%</span>
                            <span className="text-xs font-mono font-bold" style={{ color }}>{fmtBRL(cat.total)}</span>
                          </div>
                        </div>
                        <div className="h-1 rounded-full" style={{ background: 'var(--sur)' }}>
                          <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 9999, transition: 'width .3s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="text-xs font-bold mb-3" style={{ color: 'var(--t2)' }}>Análise Automática</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {insights.map((ins, i) => {
                  const cfg: Record<InsightItem['icon'], { color: string; Icon: React.ElementType }> = {
                    alert:   { color: '#FBBF24', Icon: AlertTriangle },
                    up:      { color: '#F87171', Icon: TrendingUp    },
                    down:    { color: '#4ADE80', Icon: TrendingDown   },
                    info:    { color: '#A78BFA', Icon: Zap            },
                    missing: { color: '#6B7280', Icon: Target         },
                  };
                  const { color, Icon } = cfg[ins.icon];
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--t2)' }}>
                      <Icon size={13} style={{ color, flexShrink: 0, marginTop: 1 }} />
                      <span>{ins.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════ TAB: GASTOS ══════════════ */}
      {tab === 'gastos' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--b2)' }}>
              {(['todos', 'operacional', 'pessoal'] as const).map((g, idx) => (
                <button key={g} type="button" onClick={() => setFilterGroup(g)}
                  className="px-3 py-1.5 text-xs font-bold transition-all"
                  style={{
                    background: filterGroup === g
                      ? (g === 'operacional' ? '#818CF822' : g === 'pessoal' ? '#FB923C22' : 'var(--bg2)')
                      : 'var(--sur)',
                    color: filterGroup === g
                      ? (g === 'operacional' ? '#818CF8' : g === 'pessoal' ? '#FB923C' : 'var(--t)')
                      : 'var(--t3)',
                    borderRight: idx < 2 ? '1px solid var(--b2)' : undefined,
                  }}>
                  {g === 'todos' ? 'Todos' : g === 'operacional' ? 'Operacional' : 'Pessoal'}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[140px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
            </div>

            {filteredTotal > 0 && (
              <span className="ml-auto text-sm font-bold font-mono" style={{ color: 'var(--r)' }}>
                − {fmtBRL(filteredTotal)}
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">🧾</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhum gasto encontrado</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>Use "Registrar Gasto" para adicionar despesas.</p>
              <Button variant="primary" onClick={() => setShowForm(true)}>+ Registrar Gasto</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedFiltered.map(([groupName, items]) => (
                <div key={groupName}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>{groupName}</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--b)' }} />
                    <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>
                      {fmtBRL(items.reduce((s, e) => s + e.amount, 0))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {items.map(e => {
                      const groupColor = e.group === 'operacional' ? '#818CF8' : e.group === 'pessoal' ? '#FB923C' : '#6B7280';
                      const catC       = catColor(e.category);
                      return (
                        <div key={e.isPrevisto ? `prev_${e.id}` : e.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl"
                          style={{
                            background: e.isPrevisto ? 'rgba(255,191,0,.04)' : 'var(--bg2)',
                            border:     e.isPrevisto ? '1px solid rgba(255,191,0,.18)' : '1px solid var(--b)',
                          }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: `${groupColor}18` }}>
                            {e.group === 'operacional' ? <Briefcase size={13} style={{ color: groupColor }} /> : <User size={13} style={{ color: groupColor }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate" style={{ color: 'var(--t)' }}>{e.description}</span>
                              {e.recurring && !e.isPrevisto && <RefreshCw size={10} style={{ color: '#A78BFA', flexShrink: 0 }} />}
                              {e.isPrevisto && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-bold shrink-0"
                                  style={{ background: 'rgba(255,191,0,.15)', color: '#FFBF00', border: '1px solid rgba(255,191,0,.3)' }}>
                                  Previsto
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {e.category && (
                                <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                                  style={{ background: `${catC}18`, color: catC }}>
                                  {e.category}
                                </span>
                              )}
                              {e.subcategory && <span className="text-xs" style={{ color: 'var(--t3)' }}>{e.subcategory}</span>}
                              <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>
                                {e.isPrevisto ? `desde ${fmtDate(e.date)}` : fmtDate(e.date)}
                              </span>
                              {e.notes && <span className="text-xs truncate" style={{ color: 'var(--t3)' }}>{e.notes}</span>}
                            </div>
                          </div>
                          <div className="text-sm font-bold font-mono shrink-0"
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
                                toast(`"${e.description}" registrado`, 'ok');
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
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════ TAB: FIXOS ══════════════ */}
      {tab === 'fixos' && (
        <>
          {/* Meta de Cobertura */}
          {fixedMonthly > 0 && (
            <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Target size={14} style={{ color: '#3FFF21' }} />
                <span className="text-xs font-bold" style={{ color: 'var(--t2)' }}>Meta de Cobertura dos Fixos</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'Por Mês',           value: fixedMonthly,  color: 'var(--r)' },
                  { label: 'Por Semana',         value: fixedWeekly,   color: '#FBBF24' },
                  { label: 'Por Dia',            value: fixedDaily,    color: '#FB923C' },
                  { label: 'Por Dia Útil (22d)', value: fixedOpDays22, color: '#A78BFA' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="text-[11px] mb-1" style={{ color: 'var(--t3)' }}>{label}</div>
                    <div className="text-base font-black font-mono" style={{ color }}>− {fmtBRL(value)}</div>
                  </div>
                ))}
              </div>

              <div className="pt-3 flex items-center justify-between flex-wrap gap-3"
                style={{ borderTop: '1px solid var(--b)' }}>
                <div className="flex items-center gap-4 text-xs">
                  <span style={{ color: 'var(--t3)' }}>
                    Operacional: <span style={{ color: '#818CF8' }}>{fmtBRL(fixedOp)}</span>
                  </span>
                  <span style={{ color: 'var(--t3)' }}>
                    Pessoal: <span style={{ color: '#FB923C' }}>{fmtBRL(fixedPs)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(63,255,33,.06)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.15)' }}>
                  <TrendingUp size={12} />
                  Lucro mínimo para cobrir fixos:
                  <strong className="ml-1 font-mono">{fmtBRL(fixedMonthly)}/mês</strong>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: 'var(--t2)' }}>
              {activeRec.length} fixo{activeRec.length !== 1 ? 's' : ''} ativo{activeRec.length !== 1 ? 's' : ''}
              {recurringExpenses.length > activeRec.length && (
                <span style={{ color: 'var(--t3)' }}> · {recurringExpenses.length - activeRec.length} pausado{recurringExpenses.length - activeRec.length !== 1 ? 's' : ''}</span>
              )}
            </span>
            <Button variant="primary" onClick={() => { setEditingRec(undefined); setShowRecForm(true); }}>
              <Plus size={14} /> Adicionar Fixo
            </Button>
          </div>

          {recurringExpenses.length === 0 ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">📅</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhuma despesa fixa cadastrada</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
                Cadastre academia, softwares, VPS, multilogin, chips e assinaturas para calcular seu custo fixo mensal e meta de lucro mínimo.
              </p>
              <Button variant="primary" onClick={() => setShowRecForm(true)}>+ Adicionar Fixo</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recurringExpenses.map(r => {
                const gColor = r.group === 'operacional' ? '#818CF8' : '#FB923C';
                const catC   = catColor(r.category);
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--b)', opacity: r.active ? 1 : 0.5 }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${gColor}18` }}>
                      {r.group === 'operacional'
                        ? <Briefcase size={13} style={{ color: gColor }} />
                        : <User      size={13} style={{ color: gColor }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--t)' }}>{r.description}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{ background: `${catC}18`, color: catC }}>
                          {r.category}
                        </span>
                        {r.subcategory && <span className="text-xs" style={{ color: 'var(--t3)' }}>{r.subcategory}</span>}
                        <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>dia {r.billingDay}</span>
                        {!r.active && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--sur)', color: 'var(--t3)' }}>pausado</span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold font-mono shrink-0" style={{ color: 'var(--r)' }}>
                      − {fmtBRL(r.amount)}<span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>/mês</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => { updateRec(r.id, { active: !r.active }); toast(r.active ? 'Pausado' : 'Ativado', 'ok'); }}
                        className="text-xs px-2 py-1 rounded-lg font-bold"
                        style={{
                          color:      r.active ? '#FBBF24' : '#4ADE80',
                          background: r.active ? 'rgba(251,191,36,.1)' : 'rgba(74,222,128,.1)',
                        }}>
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

      {showForm    && <ExpenseForm    existing={editing}    onClose={() => { setShowForm(false);    setEditing(undefined);    }} />}
      {showRecForm && <RecurringForm  existing={editingRec} onClose={() => { setShowRecForm(false); setEditingRec(undefined); }} />}
    </div>
  );
}
