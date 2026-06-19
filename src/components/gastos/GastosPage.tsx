'use client';

import { useState, useMemo } from 'react';
import { useStore }  from '@/store/useStore';
import { Button }    from '@/components/ui/Button';
import { Modal }     from '@/components/ui/Modal';
import {
  Plus, Trash2, Search, RefreshCw, Pencil,
  TrendingUp, TrendingDown, AlertTriangle, Zap, Target,
  Briefcase, User, ShieldCheck, ShieldAlert, ShieldX,
  ChevronRight, ChevronDown, Sparkles,
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Expense, ExpenseGroup, RecurringExpense } from '@/types';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';

// ── Taxonomy ──────────────────────────────────────────────────────────────────

export interface Classification {
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
  { kw: ['canva','figma','notion','chatgpt','openai','claude ai','suredge','photoshop','adobe','capcut','premiere','after effects','davinci resolve','lightroom'],
    result: { group: 'operacional', category: 'Software' } },
  { kw: ['api ','webhook','zapier','make.com','n8n','integromat','automação bot'],
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
  { kw: ['lanche','hambúrguer','pizza','fast food','mcdonalds','burger','subway','kfc','salgado','pastel','esfiha','tapioca','açaí'],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Lanche' } },
  { kw: ['restaurante','almoço','jantar','ifood','rappi','delivery comida','refeição','marmita'],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Restaurante' } },
  { kw: ['padaria','confeitaria','café padaria'],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Padaria' } },
  // ── PESSOAL — Transporte ──────────────────────────────────────────────────
  { kw: ['gasolina','combustível','etanol','diesel','posto','shell','ipiranga','abastecimento','moto','manutenção moto','manutenção carro'],
    result: { group: 'pessoal', category: 'Transporte', subcategory: 'Combustível/Moto' } },
  { kw: ['uber','99pop','táxi','ônibus','metrô','trem','passagem','estacionamento','pedágio'],
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
  { kw: ['fatura cartão','fatura nubank','fatura itaú','fatura bradesco','fatura santander','fatura inter','fatura c6','pagar cartão','pagamento fatura','cartão de crédito'],
    result: { group: 'pessoal', category: 'Cartão de Crédito' } },
  // ── PESSOAL — Moradia ─────────────────────────────────────────────────────
  { kw: ['aluguel','condomínio','iptu','energia elétrica','conta de luz','conta de água','gás residencial','internet residencial','manutenção casa','água esgoto'],
    result: { group: 'pessoal', category: 'Moradia' } },
];

export function classify(description: string): Classification | null {
  if (!description.trim()) return null;
  const lower = description.toLowerCase();
  for (const rule of RULES) {
    if (rule.kw.some(k => lower.includes(k.trim()))) return rule.result;
  }
  return null;
}

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
  // legacy
  'Assinatura':        '#A78BFA',
  'Gastos Pessoais':   '#FB923C',
};

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

function prevMonthStr(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [, m] = ym.split('-').map(Number);
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m - 1] ?? ym;
}

// ── Date grouping ─────────────────────────────────────────────────────────────

function getDateGroup(dateStr: string): string {
  const now  = new Date();
  const date = new Date(dateStr + 'T12:00:00');
  const diff = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diff < 0)   return 'Futuros';
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff <= 6)  return 'Esta semana';
  if (diff <= 13) return 'Semana passada';
  const sameMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  return sameMonth ? 'Mais cedo este mês'
    : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

const DATE_GROUP_ORDER = ['Hoje','Ontem','Esta semana','Semana passada','Mais cedo este mês'];

// ── Insights engine ───────────────────────────────────────────────────────────

interface Insight { icon: 'alert' | 'up' | 'down' | 'info' | 'missing'; text: string; }

function buildInsights(
  cur: Expense[], prev: Expense[], rec: RecurringExpense[], ym: string,
): Insight[] {
  const out: Insight[] = [];
  const now = new Date();

  const total    = cur.reduce((s, e) => s + e.amount, 0);
  const prevTot  = prev.reduce((s, e) => s + e.amount, 0);
  const opExps   = cur.filter(e => e.group === 'operacional');
  const psExps   = cur.filter(e => e.group === 'pessoal');
  const opTot    = opExps.reduce((s, e) => s + e.amount, 0);
  const psTot    = psExps.reduce((s, e) => s + e.amount, 0);

  const byCat: Record<string, number>     = {};
  const prevByCat: Record<string, number> = {};
  cur.forEach(e  => { const k = e.category || 'Outros'; byCat[k]     = (byCat[k]     ?? 0) + e.amount; });
  prev.forEach(e => { const k = e.category || 'Outros'; prevByCat[k] = (prevByCat[k] ?? 0) + e.amount; });
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const topOp = sorted.find(([k]) => opExps.some(e => e.category === k));
  if (topOp) out.push({ icon: 'info', text: `${topOp[0]} é seu maior custo operacional este mês (${fmtBRL(topOp[1])}).` });

  const topPs = sorted.find(([k]) => psExps.some(e => e.category === k));
  if (topPs && psTot > 0) {
    const pct = Math.round(topPs[1] / psTot * 100);
    out.push({ icon: 'info', text: `${topPs[0]} representa ${pct}% dos gastos pessoais (${fmtBRL(topPs[1])}).` });
  }

  for (const [cat, amt] of sorted.slice(0, 5)) {
    const p = prevByCat[cat] ?? 0;
    if (p > 0 && amt > p * 1.25) {
      out.push({ icon: 'up', text: `${cat} cresceu ${Math.round((amt / p - 1) * 100)}% em relação ao mês passado.` });
      break;
    }
  }

  if (prevTot > 0 && total > prevTot * 1.2) {
    out.push({ icon: 'alert', text: `Gastos ${Math.round((total / prevTot - 1) * 100)}% maiores que no mês anterior.` });
  } else if (prevTot > 0 && total < prevTot * 0.85) {
    out.push({ icon: 'down', text: `Gastos ${Math.round((1 - total / prevTot) * 100)}% menores que no mês anterior. Bom controle.` });
  }

  const [fy, fm] = ym.split('-').map(Number);
  const isNow = fy === now.getFullYear() && fm === now.getMonth() + 1;
  if (isNow && now.getDate() > 3 && total > 0) {
    const proj = (total / now.getDate()) * new Date(fy, fm, 0).getDate();
    out.push({ icon: 'info', text: `Projeção: encerrar o mês com aproximadamente ${fmtBRL(proj)} em despesas.` });
  }

  if (prevTot > 0 && opTot > prevTot * 0.5) {
    out.push({ icon: 'alert', text: `Custos operacionais já consumiram ${Math.round(opTot / prevTot * 100)}% do total do mês passado.` });
  }

  const descLower = cur.map(e => e.description.toLowerCase());
  for (const r of rec.filter(r => r.active)) {
    if (!descLower.some(d => d.includes(r.description.toLowerCase().slice(0, 6)))) {
      out.push({ icon: 'missing', text: `${r.description} (${fmtBRL(r.amount)}/mês) sem lançamento registrado este mês.` });
      break;
    }
  }

  return out.slice(0, 5);
}

// ── Health ────────────────────────────────────────────────────────────────────

type Health = 'ok' | 'warn' | 'bad' | 'neutral';
function health(cur: number, prev: number): Health {
  if (prev === 0) return 'neutral';
  const r = cur / prev;
  if (r <= 1.0)  return 'ok';
  if (r <= 1.25) return 'warn';
  return 'bad';
}
const HCFG: Record<Health, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  ok:      { label: 'Gastos dentro da média histórica', color: '#3FFF21', bg: 'rgba(63,255,33,.05)',    Icon: ShieldCheck  },
  warn:    { label: 'Gastos acima da média histórica',  color: '#FBBF24', bg: 'rgba(251,191,36,.05)',   Icon: ShieldAlert  },
  bad:     { label: 'Crescimento acelerado de gastos',  color: '#F87171', bg: 'rgba(248,113,113,.05)',  Icon: ShieldX      },
  neutral: { label: 'Sem histórico para comparar',      color: '#6B7280', bg: 'rgba(107,114,128,.05)', Icon: ShieldCheck  },
};

// ── Forms ─────────────────────────────────────────────────────────────────────

function ExpenseForm({ existing, onClose }: { existing?: Expense; onClose: () => void }) {
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

  function handleDesc(v: string) {
    setDesc(v);
    if (!overridden) {
      const c = classify(v);
      if (c) { setGroup(c.group); setCategory(c.category); setSubcategory(c.subcategory ?? ''); }
      else   { setGroup(''); setCategory(''); setSubcategory(''); }
    }
  }

  function save() {
    if (!desc.trim())                     { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0)                 { toast('Valor inválido', 'wrn'); return; }

    const payload: Omit<Expense, 'id'> = {
      date, description: desc.trim(), amount: amt,
      category:    category || 'Outros',
      subcategory: subcategory || undefined,
      group:       (group || undefined) as ExpenseGroup | undefined,
      notes:       notes || undefined,
      recurring,
    };
    if (existing) { updateExpense(existing.id, payload); toast('Gasto atualizado', 'ok'); }
    else          { addExpense(payload);                  toast('Gasto registrado', 'ok'); }
    onClose();
  }

  const s    = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  const cats = group === 'operacional' ? OP_CATS : group === 'pessoal' ? PS_CATS : [...OP_CATS, ...PS_CATS];

  return (
    <Modal title={existing ? 'Editar Gasto' : 'Novo Gasto'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Descrição</span>
          <input autoFocus value={desc} onChange={e => handleDesc(e.target.value)}
            placeholder="Ex: Mercado, Chip Claro, VPS Contabo, Fatura Nubank..."
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        {suggested && !overridden && group && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.2)', color: '#C4B5FD' }}>
            <Zap size={11} />
            <span>
              <strong>{group === 'operacional' ? 'Operacional' : 'Pessoal'}</strong>
              {' › '}<strong>{category}</strong>
              {subcategory && <> › {subcategory}</>}
            </span>
            <button type="button" onClick={() => setOverridden(true)}
              className="ml-auto underline text-xs" style={{ color: '#A78BFA' }}>
              Alterar
            </button>
          </div>
        )}

        {(overridden || !suggested || !group) && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Grupo</span>
              <select value={group}
                onChange={e => { setGroup(e.target.value as ExpenseGroup); setCategory(''); setSubcategory(''); }}
                className="px-3 py-2.5 rounded-lg text-sm" style={s}>
                <option value="">Selecione...</option>
                <option value="operacional">Operacional</option>
                <option value="pessoal">Pessoal</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Categoria</span>
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
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Data</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2.5 rounded-lg text-sm" style={s} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Valor (R$)</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00"
              className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Observações</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        <button type="button" onClick={() => setRecurring(v => !v)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left transition-all"
          style={{
            background: recurring ? 'rgba(109,40,217,.12)' : 'var(--sur)',
            border: `1px solid ${recurring ? 'rgba(109,40,217,.3)' : 'var(--b2)'}`,
            color:  recurring ? '#A78BFA' : 'var(--t3)',
          }}>
          <RefreshCw size={13} />
          {recurring ? 'Recorrente — aparece todo mês' : 'Marcar como recorrente (mensal)'}
        </button>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Salvar' : 'Registrar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function RecurringForm({ existing, onClose }: { existing?: RecurringExpense; onClose: () => void }) {
  const addRec    = useStore(s => s.addRecurringExpense);
  const updateRec = useStore(s => s.updateRecurringExpense);
  const toast     = useStore(s => s.toast);

  const [desc,       setDesc]       = useState(existing?.description ?? '');
  const [amount,     setAmount]     = useState(existing ? String(existing.amount) : '');
  const [group,      setGroup]      = useState<ExpenseGroup>(existing?.group ?? 'operacional');
  const [category,   setCategory]   = useState(existing?.category   ?? '');
  const [subcategory,setSubcategory]= useState(existing?.subcategory ?? '');
  const [billingDay, setBillingDay] = useState(existing?.billingDay  ?? 1);
  const [notes,      setNotes]      = useState(existing?.notes       ?? '');

  function handleDesc(v: string) {
    setDesc(v);
    if (!existing) {
      const c = classify(v);
      if (c) { setGroup(c.group); setCategory(c.category); setSubcategory(c.subcategory ?? ''); }
    }
  }

  function save() {
    if (!desc.trim()) { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { toast('Valor inválido', 'wrn'); return; }
    if (!category)        { toast('Selecione uma categoria', 'wrn'); return; }

    const payload: Omit<RecurringExpense, 'id'> = {
      description: desc.trim(), group, category,
      subcategory: subcategory || undefined,
      amount: amt, billingDay,
      active: existing?.active ?? true,
      notes:  notes || undefined,
    };
    if (existing) { updateRec(existing.id, payload); toast('Fixo atualizado', 'ok'); }
    else          { addRec(payload);                  toast('Fixo cadastrado', 'ok'); }
    onClose();
  }

  const s    = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  const cats = group === 'operacional' ? OP_CATS : PS_CATS;

  return (
    <Modal title={existing ? 'Editar Fixo' : 'Nova Despesa Fixa'} onClose={onClose} size="md">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Descrição</span>
          <input autoFocus value={desc} onChange={e => handleDesc(e.target.value)}
            placeholder="Ex: Academia Smart Fit, VPS Contabo, Netflix..."
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Grupo</span>
            <select value={group}
              onChange={e => { setGroup(e.target.value as ExpenseGroup); setCategory(''); }}
              className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              <option value="operacional">Operacional</option>
              <option value="pessoal">Pessoal</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Categoria</span>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="px-3 py-2.5 rounded-lg text-sm" style={s}>
              <option value="">Selecione...</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Valor Mensal (R$)</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00"
              className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Dia do Vencimento</span>
            <input type="number" min={1} max={28} value={billingDay}
              onChange={e => setBillingDay(Number(e.target.value))}
              className="px-3 py-2.5 rounded-lg text-sm font-mono" style={s} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Observações</span>
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

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const op = (payload as Array<{ name: string; value: number }>).find(p => p.name === 'op')?.value ?? 0;
  const ps = (payload as Array<{ name: string; value: number }>).find(p => p.name === 'ps')?.value ?? 0;
  return (
    <div className="rounded-lg px-3 py-2 text-xs"
      style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t)' }}>
      <div className="font-bold mb-1">{String(label)}</div>
      {op > 0 && <div style={{ color: '#818CF8' }}>Oper. {fmtBRL(op)}</div>}
      {ps > 0 && <div style={{ color: '#FB923C' }}>Pess. {fmtBRL(ps)}</div>}
      <div className="font-bold mt-0.5" style={{ color: 'var(--t2)' }}>Total {fmtBRL(op + ps)}</div>
    </div>
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
  const bulkPatch         = useStore(s => s.bulkPatchExpenses);
  const toast             = useStore(s => s.toast);

  type Tab = 'visao' | 'gastos' | 'fixos';
  const [tab,         setTab]        = useState<Tab>('gastos');
  const [filterMonth, setFilterMonth]= useState(currentMonth());
  const [filterGroup, setFilterGroup]= useState<'todos' | 'operacional' | 'pessoal'>('todos');
  const [search,      setSearch]     = useState('');
  const [showForm,    setShowForm]   = useState(false);
  const [editing,     setEditing]    = useState<Expense | undefined>(undefined);
  const [showRecForm, setShowRecForm]= useState(false);
  const [editingRec,  setEditingRec] = useState<RecurringExpense | undefined>(undefined);

  // expanded category groups in Visão Geral
  const [expandedGroups, setExpandedGroups]= useState<Set<string>>(new Set(['operacional','pessoal']));
  const [expandedCats,   setExpandedCats]  = useState<Set<string>>(new Set());

  // ── Auto-reclassification ─────────────────────────────────────────────────

  const unclassified = useMemo(
    () => expenses.filter(e => !e.group),
    [expenses],
  );

  function reclassifyAll() {
    const patches: Array<{ id: string; patch: Partial<Omit<Expense, 'id'>> }> = [];
    expenses.forEach(e => {
      const c = classify(e.description);
      if (c) patches.push({ id: e.id, patch: { group: c.group, category: c.category, subcategory: c.subcategory } });
    });
    if (patches.length === 0) { toast('Nenhum gasto para reclassificar', 'wrn'); return; }
    bulkPatch(patches);
    toast(`${patches.length} gastos reclassificados automaticamente`, 'ok');
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const curMonth = useMemo(
    () => expenses.filter(e => e.date.slice(0, 7) === filterMonth),
    [expenses, filterMonth],
  );
  const prevMonth = useMemo(
    () => expenses.filter(e => e.date.slice(0, 7) === prevMonthStr(filterMonth)),
    [expenses, filterMonth],
  );

  const totalAll  = curMonth.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prevMonth.reduce((s, e) => s + e.amount, 0);
  const opExps    = curMonth.filter(e => e.group === 'operacional');
  const psExps    = curMonth.filter(e => e.group === 'pessoal');
  const opTotal   = opExps.reduce((s, e) => s + e.amount, 0);
  const psTotal   = psExps.reduce((s, e) => s + e.amount, 0);
  const opPct     = totalAll > 0 ? Math.round(opTotal / totalAll * 100) : 0;

  const largest = useMemo(
    () => curMonth.length > 0 ? curMonth.reduce((a, b) => b.amount > a.amount ? b : a) : null,
    [curMonth],
  );

  const projecao = useMemo(() => {
    const now = new Date();
    const [y, m] = filterMonth.split('-').map(Number);
    if (y !== now.getFullYear() || m !== now.getMonth() + 1 || now.getDate() < 3 || totalAll === 0) return null;
    return +((totalAll / now.getDate()) * new Date(y, m, 0).getDate()).toFixed(2);
  }, [filterMonth, totalAll]);

  // Category breakdown for drill-down
  const opByCat = useMemo(() => {
    const map: Record<string, { total: number; items: Expense[] }> = {};
    opExps.forEach(e => {
      const k = e.category || 'Outros';
      if (!map[k]) map[k] = { total: 0, items: [] };
      map[k].total += e.amount;
      map[k].items.push(e);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [opExps]);

  const psByCat = useMemo(() => {
    const map: Record<string, { total: number; subs: Record<string, number>; items: Expense[] }> = {};
    psExps.forEach(e => {
      const k = e.category || 'Outros';
      if (!map[k]) map[k] = { total: 0, subs: {}, items: [] };
      map[k].total += e.amount;
      map[k].items.push(e);
      if (e.subcategory) {
        map[k].subs[e.subcategory] = (map[k].subs[e.subcategory] ?? 0) + e.amount;
      }
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [psExps]);

  // 6-month evolution
  const evolution = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d  = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const opv = expenses.filter(e => e.date.slice(0, 7) === ym && e.group === 'operacional').reduce((s, e) => s + e.amount, 0);
      const psv = expenses.filter(e => e.date.slice(0, 7) === ym && e.group === 'pessoal').reduce((s, e) => s + e.amount, 0);
      return { label: monthLabel(ym), op: +opv.toFixed(2), ps: +psv.toFixed(2) };
    });
  }, [expenses]);

  const insights = useMemo(
    () => buildInsights(curMonth, prevMonth, recurringExpenses, filterMonth),
    [curMonth, prevMonth, recurringExpenses, filterMonth],
  );

  const hcfg = HCFG[health(totalAll, prevTotal)];

  // Fixed costs
  const activeRec    = recurringExpenses.filter(r => r.active);
  const fixedMonthly = activeRec.reduce((s, r) => s + r.amount, 0);
  const fixedWeekly  = +(fixedMonthly / 4.33).toFixed(2);
  const fixedDaily   = +(fixedMonthly / 30).toFixed(2);
  const fixedOp      = activeRec.filter(r => r.group === 'operacional').reduce((s, r) => s + r.amount, 0);
  const fixedPs      = activeRec.filter(r => r.group === 'pessoal').reduce((s, r) => s + r.amount, 0);
  const fixedOpDaily22 = +(fixedOp / 22).toFixed(2);
  const fixedTotalDaily22 = +(fixedMonthly / 22).toFixed(2);

  // Gastos tab
  const filtered = useMemo(() => {
    return curMonth
      .filter(e => filterGroup === 'todos' || e.group === filterGroup)
      .filter(e => !search || e.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [curMonth, filterGroup, search]);

  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);

  const grouped = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    filtered.forEach(e => {
      const g = getDateGroup(e.date);
      if (!map[g]) map[g] = [];
      map[g].push(e);
    });
    return Object.entries(map).sort(([a], [b]) => {
      const ai = DATE_GROUP_ORDER.indexOf(a), bi = DATE_GROUP_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [filtered]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toggleGroup(g: string) {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      n.has(g) ? n.delete(g) : n.add(g);
      return n;
    });
  }
  function toggleCat(c: string) {
    setExpandedCats(prev => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  }

  const card = { background: 'var(--bg2)', border: '1px solid var(--b)', borderRadius: '0.75rem' };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Gestão Financeira</h2>
          <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--t3)' }}>Operacional + Pessoal</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-1 rounded-xl gap-0.5" style={{ background: 'var(--sur)' }}>
            {(['visao', 'gastos', 'fixos'] as const).map(t => {
              const lbl: Record<Tab, string> = { visao: 'Visão Geral', gastos: 'Gastos', fixos: 'Fixos' };
              return (
                <button key={t} onClick={() => setTab(t)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={tab === t
                    ? { background: 'var(--bg2)', color: 'var(--t)', boxShadow: '0 1px 4px rgba(0,0,0,.35)' }
                    : { color: 'var(--t3)' }}>
                  {lbl[t]}
                </button>
              );
            })}
          </div>
          <Button variant="primary" onClick={() => { setEditing(undefined); setShowForm(true); }}>
            <Plus size={14} /> Registrar Gasto
          </Button>
        </div>
      </div>

      {/* Reclassification banner */}
      {unclassified.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)' }}>
          <Sparkles size={14} style={{ color: '#FBBF24', flexShrink: 0 }} />
          <span className="text-sm flex-1" style={{ color: 'var(--t2)' }}>
            <strong style={{ color: '#FBBF24' }}>{unclassified.length} gasto{unclassified.length !== 1 ? 's' : ''}</strong> sem categoria detectada.
            Reclassificar atualiza gráficos e insights automaticamente.
          </span>
          <button onClick={reclassifyAll}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0"
            style={{ background: 'rgba(251,191,36,.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,.3)' }}>
            <Zap size={12} /> Reclassificar tudo
          </button>
        </div>
      )}

      {/* ══════════════ VISÃO GERAL ══════════════ */}
      {tab === 'visao' && (
        <>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="w-fit px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

          {/* Health banner */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: hcfg.bg, border: `1px solid ${hcfg.color}22` }}>
            <hcfg.Icon size={15} style={{ color: hcfg.color, flexShrink: 0 }} />
            <span className="text-sm font-bold" style={{ color: hcfg.color }}>{hcfg.label}</span>
            {prevTotal > 0 && (
              <span className="ml-auto text-xs font-mono" style={{ color: 'var(--t3)' }}>
                Mês anterior: {fmtBRL(prevTotal)}
              </span>
            )}
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total do Mês',   value: totalAll, sub: prevTotal > 0 ? `${totalAll > prevTotal ? '+' : ''}${Math.round((totalAll / prevTotal - 1) * 100)}% vs anterior` : undefined, color: 'var(--r)' },
              { label: 'Operacional',    value: opTotal,  sub: totalAll > 0 ? `${opPct}% do total` : undefined, color: '#818CF8' },
              { label: 'Pessoal',        value: psTotal,  sub: totalAll > 0 ? `${100 - opPct}% do total` : undefined, color: '#FB923C' },
              { label: projecao ? 'Projeção do Mês' : 'Maior Gasto',
                value: projecao ?? (largest?.amount ?? 0),
                sub:   projecao ? 'se manter ritmo atual' : (largest?.description ?? undefined),
                color: projecao && projecao > totalAll * 1.15 ? '#FBBF24' : 'var(--t2)' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={card} className="px-4 py-3.5">
                <div className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--t3)' }}>{label}</div>
                <div className="text-base font-black font-mono" style={{ color }}>
                  {value > 0 ? fmtBRL(value) : '—'}
                </div>
                {sub && <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--t3)' }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Split bar */}
          {totalAll > 0 && (
            <div style={card} className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold" style={{ color: 'var(--t2)' }}>Distribuição</span>
                <div className="flex gap-4 text-xs" style={{ color: 'var(--t3)' }}>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: '#818CF8', display: 'inline-block' }} /> Oper. {opPct}%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: '#FB923C', display: 'inline-block' }} /> Pess. {100 - opPct}%</span>
                </div>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--sur)' }}>
                {opPct > 0 && <div style={{ width: `${opPct}%`, background: '#818CF8', transition: 'width .4s ease' }} />}
                {100 - opPct > 0 && <div style={{ width: `${100 - opPct}%`, background: '#FB923C', transition: 'width .4s ease' }} />}
              </div>
            </div>
          )}

          {/* Evolution chart + Meta de Cobertura */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly chart */}
            <div style={card} className="px-4 py-4">
              <div className="text-xs font-bold mb-4" style={{ color: 'var(--t2)' }}>Evolução 6 Meses</div>
              {evolution.every(m => m.op === 0 && m.ps === 0) ? (
                <p className="text-xs py-8 text-center" style={{ color: 'var(--t3)' }}>Sem dados históricos ainda.</p>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={evolution} barSize={14} barGap={2}
                    margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                    <Bar dataKey="op" stackId="a" fill="#818CF8" />
                    <Bar dataKey="ps" stackId="a" fill="#FB923C" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Meta de Cobertura summary */}
            <div style={card} className="px-4 py-4">
              <div className="flex items-center gap-2 mb-4">
                <Target size={14} style={{ color: '#3FFF21' }} />
                <span className="text-xs font-bold" style={{ color: 'var(--t2)' }}>Meta de Cobertura</span>
              </div>
              {fixedMonthly === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <p className="text-xs text-center" style={{ color: 'var(--t3)' }}>
                    Cadastre despesas fixas na aba <strong>Fixos</strong> para ver quanto precisa lucrar para empatá-las.
                  </p>
                  <button onClick={() => setTab('fixos')}
                    className="text-xs px-3 py-1.5 rounded-lg font-bold"
                    style={{ background: 'rgba(63,255,33,.08)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                    Ir para Fixos →
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[
                      { label: 'Por Mês',          val: fixedMonthly,     color: 'var(--r)' },
                      { label: 'Por Semana',        val: fixedWeekly,      color: '#FBBF24' },
                      { label: 'Por Dia',           val: fixedDaily,       color: '#FB923C' },
                      { label: 'Dia Útil (22d)',    val: fixedTotalDaily22,color: '#A78BFA' },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>{label}</div>
                        <div className="text-sm font-black font-mono" style={{ color }}>− {fmtBRL(val)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2.5 text-xs" style={{ borderTop: '1px solid var(--b)', color: 'var(--t3)' }}>
                    Oper. <span style={{ color: '#818CF8' }}>{fmtBRL(fixedOp)}</span> · Pess. <span style={{ color: '#FB923C' }}>{fmtBRL(fixedPs)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Category drill-down */}
          <div style={card} className="px-4 py-4">
            <div className="text-xs font-bold mb-4" style={{ color: 'var(--t2)' }}>Detalhamento por Categoria</div>

            {totalAll === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--t3)' }}>Nenhum gasto neste mês.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {/* Operacional group */}
                {opTotal > 0 && (
                  <>
                    <button onClick={() => toggleGroup('operacional')}
                      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left"
                      style={{ background: 'rgba(129,140,248,.06)' }}>
                      {expandedGroups.has('operacional')
                        ? <ChevronDown size={14} style={{ color: '#818CF8' }} />
                        : <ChevronRight size={14} style={{ color: '#818CF8' }} />}
                      <Briefcase size={13} style={{ color: '#818CF8' }} />
                      <span className="text-sm font-bold flex-1" style={{ color: '#818CF8' }}>Operacional</span>
                      <span className="text-sm font-black font-mono" style={{ color: '#818CF8' }}>− {fmtBRL(opTotal)}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--t3)' }}>{opPct}%</span>
                    </button>

                    {expandedGroups.has('operacional') && opByCat.map(([cat, { total, items }]) => {
                      const pct   = opTotal > 0 ? Math.round(total / opTotal * 100) : 0;
                      const color = catColor(cat);
                      const isExp = expandedCats.has(`op_${cat}`);
                      return (
                        <div key={cat}>
                          <button onClick={() => toggleCat(`op_${cat}`)}
                            className="flex items-center gap-2 w-full pl-8 pr-3 py-2 text-left rounded-lg"
                            style={{ color: 'var(--t2)' }}
                            onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                            onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                            {isExp
                              ? <ChevronDown  size={12} style={{ color: 'var(--t3)' }} />
                              : <ChevronRight size={12} style={{ color: 'var(--t3)' }} />}
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs flex-1">{cat}</span>
                            <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{pct}%</span>
                            <span className="text-xs font-mono font-bold ml-2" style={{ color }}>{fmtBRL(total)}</span>
                          </button>
                          {isExp && (
                            <div className="pl-14 pr-3 pb-1 flex flex-col gap-1">
                              {items.map(e => (
                                <div key={e.id} className="flex items-center justify-between text-xs py-1"
                                  style={{ borderBottom: '1px solid var(--b)', color: 'var(--t3)' }}>
                                  <span className="truncate flex-1">{e.description}</span>
                                  {e.subcategory && <span className="mx-2 shrink-0">{e.subcategory}</span>}
                                  <span className="font-mono shrink-0">{fmtBRL(e.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Pessoal group */}
                {psTotal > 0 && (
                  <>
                    <button onClick={() => toggleGroup('pessoal')}
                      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left mt-1"
                      style={{ background: 'rgba(251,146,60,.06)' }}>
                      {expandedGroups.has('pessoal')
                        ? <ChevronDown  size={14} style={{ color: '#FB923C' }} />
                        : <ChevronRight size={14} style={{ color: '#FB923C' }} />}
                      <User size={13} style={{ color: '#FB923C' }} />
                      <span className="text-sm font-bold flex-1" style={{ color: '#FB923C' }}>Pessoal</span>
                      <span className="text-sm font-black font-mono" style={{ color: '#FB923C' }}>− {fmtBRL(psTotal)}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--t3)' }}>{100 - opPct}%</span>
                    </button>

                    {expandedGroups.has('pessoal') && psByCat.map(([cat, { total, subs, items }]) => {
                      const pct   = psTotal > 0 ? Math.round(total / psTotal * 100) : 0;
                      const color = catColor(cat);
                      const isExp = expandedCats.has(`ps_${cat}`);
                      const subEntries = Object.entries(subs).sort((a, b) => b[1] - a[1]);
                      return (
                        <div key={cat}>
                          <button onClick={() => toggleCat(`ps_${cat}`)}
                            className="flex items-center gap-2 w-full pl-8 pr-3 py-2 text-left rounded-lg"
                            style={{ color: 'var(--t2)' }}
                            onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                            onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                            {isExp
                              ? <ChevronDown  size={12} style={{ color: 'var(--t3)' }} />
                              : <ChevronRight size={12} style={{ color: 'var(--t3)' }} />}
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs flex-1">{cat}</span>
                            <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{pct}%</span>
                            <span className="text-xs font-mono font-bold ml-2" style={{ color }}>{fmtBRL(total)}</span>
                          </button>
                          {isExp && (
                            <div className="pl-14 pr-3 pb-1 flex flex-col gap-0.5">
                              {subEntries.length > 0
                                ? subEntries.map(([sub, amt]) => (
                                  <div key={sub} className="flex items-center justify-between text-xs py-1"
                                    style={{ borderBottom: '1px solid var(--b)', color: 'var(--t3)' }}>
                                    <span className="flex-1">{sub}</span>
                                    <span className="font-mono">{fmtBRL(amt)}</span>
                                  </div>
                                ))
                                : items.map(e => (
                                  <div key={e.id} className="flex items-center justify-between text-xs py-1"
                                    style={{ borderBottom: '1px solid var(--b)', color: 'var(--t3)' }}>
                                    <span className="truncate flex-1">{e.description}</span>
                                    <span className="font-mono">{fmtBRL(e.amount)}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {totalAll > 0 && opTotal === 0 && psTotal === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--t3)' }}>
                    Gastos sem classificação. Use o banner acima para reclassificar automaticamente.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div style={card} className="px-4 py-4">
              <div className="text-xs font-bold mb-3" style={{ color: 'var(--t2)' }}>Análise Automática</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {insights.map((ins, i) => {
                  const cfg: Record<Insight['icon'], { color: string; Icon: React.ElementType }> = {
                    alert:   { color: '#FBBF24', Icon: AlertTriangle },
                    up:      { color: '#F87171', Icon: TrendingUp    },
                    down:    { color: '#4ADE80', Icon: TrendingDown   },
                    info:    { color: '#A78BFA', Icon: Zap            },
                    missing: { color: '#6B7280', Icon: Target         },
                  };
                  const { color, Icon } = cfg[ins.icon];
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--t2)' }}>
                      <Icon size={12} style={{ color, flexShrink: 0, marginTop: 1 }} />
                      <span>{ins.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════ GASTOS ══════════════ */}
      {tab === 'gastos' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--b2)' }}>
              {(['todos', 'operacional', 'pessoal'] as const).map((g, i) => (
                <button key={g} onClick={() => setFilterGroup(g)}
                  className="px-3 py-1.5 text-xs font-bold transition-all"
                  style={{
                    background: filterGroup === g
                      ? (g === 'operacional' ? '#818CF822' : g === 'pessoal' ? '#FB923C22' : 'var(--bg2)')
                      : 'var(--sur)',
                    color: filterGroup === g
                      ? (g === 'operacional' ? '#818CF8' : g === 'pessoal' ? '#FB923C' : 'var(--t)')
                      : 'var(--t3)',
                    borderRight: i < 2 ? '1px solid var(--b2)' : undefined,
                  }}>
                  {g === 'todos' ? 'Todos' : g === 'operacional' ? 'Operacional' : 'Pessoal'}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[130px]">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
            </div>

            {filteredTotal > 0 && (
              <span className="ml-auto text-sm font-bold font-mono shrink-0" style={{ color: 'var(--r)' }}>
                − {fmtBRL(filteredTotal)}
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={card} className="p-10 text-center">
              <p className="text-3xl mb-2">🧾</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhum gasto encontrado</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>Use "Registrar Gasto" para adicionar despesas.</p>
              <Button variant="primary" onClick={() => setShowForm(true)}>+ Registrar Gasto</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map(([groupName, items]) => (
                <div key={groupName}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>{groupName}</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--b)' }} />
                    <span className="text-xs font-mono" style={{ color: 'var(--t3)' }}>
                      {fmtBRL(items.reduce((s, e) => s + e.amount, 0))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {items.map(e => {
                      const gc  = e.group === 'operacional' ? '#818CF8' : e.group === 'pessoal' ? '#FB923C' : '#6B7280';
                      const cc  = catColor(e.category);
                      return (
                        <div key={e.id} style={card}
                          className="flex items-center gap-3 px-4 py-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${gc}18` }}>
                            {e.group === 'operacional'
                              ? <Briefcase size={13} style={{ color: gc }} />
                              : <User      size={13} style={{ color: gc }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate" style={{ color: 'var(--t)' }}>{e.description}</span>
                              {e.recurring && <RefreshCw size={10} style={{ color: '#A78BFA', flexShrink: 0 }} />}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {e.category && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ background: `${cc}18`, color: cc }}>
                                  {e.category}
                                </span>
                              )}
                              {e.subcategory && <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{e.subcategory}</span>}
                              <span className="text-[11px] font-mono" style={{ color: 'var(--t3)' }}>{fmtDate(e.date)}</span>
                              {e.notes && <span className="text-[11px] truncate" style={{ color: 'var(--t3)' }}>{e.notes}</span>}
                            </div>
                          </div>
                          <div className="text-sm font-bold font-mono shrink-0" style={{ color: 'var(--r)' }}>
                            − {fmtBRL(e.amount)}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => { setEditing(e); setShowForm(true); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center"
                              style={{ color: 'var(--t3)' }}
                              onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                              onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => { if (confirm('Remover gasto?')) { deleteExpense(e.id); toast('Removido', 'ok'); } }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center"
                              style={{ color: 'var(--r)', background: 'var(--rd)' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
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

      {/* ══════════════ FIXOS ══════════════ */}
      {tab === 'fixos' && (
        <>
          {/* Meta de Cobertura — center piece */}
          <div style={{ ...card, background: fixedMonthly > 0 ? 'rgba(63,255,33,.03)' : 'var(--bg2)' }}
            className="px-5 py-5">
            <div className="flex items-center gap-2 mb-5">
              <Target size={15} style={{ color: '#3FFF21' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>Meta de Cobertura dos Fixos</span>
              {fixedMonthly > 0 && (
                <span className="ml-auto text-xs font-mono" style={{ color: 'var(--t3)' }}>
                  {activeRec.length} fixo{activeRec.length !== 1 ? 's' : ''} ativo{activeRec.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {fixedMonthly === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm mb-2" style={{ color: 'var(--t2)' }}>
                  Cadastre suas despesas fixas mensais (academia, softwares, VPS, chips...) para calcular quanto você precisa lucrar para cobri-las.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'Por Mês',          val: fixedMonthly,      color: 'var(--r)',  desc: 'total fixo mensal' },
                    { label: 'Por Semana',        val: fixedWeekly,       color: '#FBBF24',   desc: '÷ 4,33 semanas' },
                    { label: 'Por Dia',           val: fixedDaily,        color: '#FB923C',   desc: '÷ 30 dias' },
                    { label: 'Por Dia Útil',      val: fixedTotalDaily22, color: '#A78BFA',   desc: '÷ 22 dias/mês' },
                  ].map(({ label, val, color, desc }) => (
                    <div key={label} className="text-center">
                      <div className="text-[11px] mb-1" style={{ color: 'var(--t3)' }}>{label}</div>
                      <div className="text-xl font-black font-mono" style={{ color }}>− {fmtBRL(val)}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{desc}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl px-4 py-3 flex flex-col gap-2"
                  style={{ background: 'rgba(63,255,33,.06)', border: '1px solid rgba(63,255,33,.15)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--g)' }}>
                    Para empatá-las, você precisa lucrar {fmtBRL(fixedMonthly)}/mês.
                  </p>
                  <div className="flex gap-6 text-xs flex-wrap" style={{ color: 'var(--t3)' }}>
                    <span>Oper. fixo: <strong style={{ color: '#818CF8' }}>{fmtBRL(fixedOp)}</strong></span>
                    <span>Pess. fixo: <strong style={{ color: '#FB923C' }}>{fmtBRL(fixedPs)}</strong></span>
                    <span>Oper. por dia útil: <strong style={{ color: '#A78BFA' }}>{fmtBRL(fixedOpDaily22)}</strong></span>
                  </div>
                </div>

                {projecao && projecao > fixedMonthly && (
                  <div className="mt-3 rounded-xl px-4 py-3"
                    style={{ background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.18)' }}>
                    <p className="text-xs" style={{ color: 'var(--t2)' }}>
                      <span style={{ color: '#FBBF24' }}>⚠ </span>
                      Projeção de gastos totais deste mês ({fmtBRL(projecao)}) está
                      <strong> {fmtBRL(projecao - fixedMonthly)} acima</strong> dos seus custos fixos.
                      Revise os gastos variáveis.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Recurring list */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: 'var(--t2)' }}>
              Despesas Fixas Cadastradas
              {recurringExpenses.length > 0 && (
                <span className="ml-2 font-mono text-xs" style={{ color: 'var(--t3)' }}>
                  {activeRec.length} ativo{activeRec.length !== 1 ? 's' : ''}
                  {recurringExpenses.length > activeRec.length && ` · ${recurringExpenses.length - activeRec.length} pausado${recurringExpenses.length - activeRec.length !== 1 ? 's' : ''}`}
                </span>
              )}
            </span>
            <Button variant="primary" onClick={() => { setEditingRec(undefined); setShowRecForm(true); }}>
              <Plus size={14} /> Adicionar Fixo
            </Button>
          </div>

          {recurringExpenses.length === 0 ? (
            <div style={card} className="p-10 text-center">
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
                const gc  = r.group === 'operacional' ? '#818CF8' : '#FB923C';
                const cc  = catColor(r.category);
                return (
                  <div key={r.id} style={{ ...card, opacity: r.active ? 1 : 0.5 }}
                    className="flex items-center gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${gc}18` }}>
                      {r.group === 'operacional'
                        ? <Briefcase size={13} style={{ color: gc }} />
                        : <User      size={13} style={{ color: gc }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--t)' }}>{r.description}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: `${cc}18`, color: cc }}>{r.category}</span>
                        {r.subcategory && <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{r.subcategory}</span>}
                        <span className="text-[11px] font-mono" style={{ color: 'var(--t3)' }}>dia {r.billingDay}</span>
                        {!r.active && <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--sur)', color: 'var(--t3)' }}>pausado</span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold font-mono shrink-0" style={{ color: 'var(--r)' }}>
                      − {fmtBRL(r.amount)}<span className="text-[11px] font-normal" style={{ color: 'var(--t3)' }}>/mês</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => { updateRec(r.id, { active: !r.active }); toast(r.active ? 'Pausado' : 'Ativado', 'ok'); }}
                        className="text-[11px] px-2 py-1 rounded-lg font-bold"
                        style={{ color: r.active ? '#FBBF24' : '#4ADE80', background: r.active ? 'rgba(251,191,36,.1)' : 'rgba(74,222,128,.1)' }}>
                        {r.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button onClick={() => { setEditingRec(r); setShowRecForm(true); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ color: 'var(--t3)' }}
                        onMouseEnter={el => { (el.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
                        onMouseLeave={el => { (el.currentTarget as HTMLElement).style.background = ''; }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => { if (confirm('Remover fixo?')) { deleteRec(r.id); toast('Removido', 'ok'); } }}
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

      {showForm    && <ExpenseForm   existing={editing}    onClose={() => { setShowForm(false);    setEditing(undefined); }} />}
      {showRecForm && <RecurringForm existing={editingRec} onClose={() => { setShowRecForm(false); setEditingRec(undefined); }} />}
    </div>
  );
}
