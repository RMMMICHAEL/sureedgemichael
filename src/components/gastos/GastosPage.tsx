'use client';

import { useState, useMemo, useCallback } from 'react';
import { useStore }  from '@/store/useStore';
import { parseBRLInput } from '@/lib/parseBRL';
import { Button }    from '@/components/ui/Button';
import { Modal }     from '@/components/ui/Modal';
import {
  Plus, Trash2, Search, RefreshCw, Pencil,
  TrendingUp, TrendingDown, AlertTriangle, Zap, Target,
  Briefcase, User, ShieldCheck, ShieldAlert, ShieldX,
  ChevronRight, ChevronDown, Sparkles, BookMarked,
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Expense, ExpenseGroup, RecurringExpense } from '@/types';
import { currentMonth, todayStr } from '@/lib/parsers/dateParser';
import { calcLegProfit }          from '@/lib/finance/calculator';

// ── Taxonomy ──────────────────────────────────────────────────────────────────

export interface Classification {
  group: ExpenseGroup;
  category: string;
  subcategory?: string;
}

// Rules are checked top-to-bottom — more specific rules should come first.
const RULES: Array<{ kw: string[]; result: Classification }> = [
  // ── OPERACIONAL: Chips ────────────────────────────────────────────────────
  { kw: [
      'chip','sim card','simcard','claro chip','vivo chip','tim chip','oi chip','nextel','anatel',
      'plano móvel','dados móveis','recarga celular','linha claro','linha vivo','linha tim','linha oi',
      'conta claro','conta vivo','conta tim','conta oi','plano pós','plano pré','pacote dados',
      'internet celular','4g','5g','portabilidade',
    ],
    result: { group: 'operacional', category: 'Chips' } },

  // ── OPERACIONAL: Multilogin / Anti-detect ─────────────────────────────────
  { kw: [
      'multilogin','gologin','go login','adspower','ads power','morelogin','kameleo',
      'octo browser','octobrowser','linken sphere','vmlogin','incognition','antidetect',
      'anti-detect','anti detect','lauth','bablosoft','browser profile','session box',
      'undetectable','hyperbrowser',
    ],
    result: { group: 'operacional', category: 'Multilogin' } },

  // ── OPERACIONAL: VPS / Servidor ───────────────────────────────────────────
  { kw: [
      'vps','servidor','contabo','hetzner','digitalocean','aws','linode','vultr',
      'oracle cloud','cloud server','máquina virtual','cloud vps','servidor dedicado',
      'hostgator vps','locaweb vps','servidor linux','ubuntu server','windows server',
      'rdp','remote desktop','teamviewer','anydesk',
    ],
    result: { group: 'operacional', category: 'VPS/Servidor' } },

  // ── OPERACIONAL: Proxy / VPN ──────────────────────────────────────────────
  { kw: [
      'proxy','proxies','rotating proxy','proxy residencial','residential proxy',
      'proxy datacenter','datacenter proxy','bright data','oxylabs','smartproxy',
      'netnut','soax','socks5','socks4','vpn','nordvpn','expressvpn','purevpn',
      'mullvad','cyberghost','ipv6 proxy','ipv4 proxy','proxy 4g',
    ],
    result: { group: 'operacional', category: 'Infraestrutura', subcategory: 'Proxy/VPN' } },

  // ── OPERACIONAL: Software / SaaS ──────────────────────────────────────────
  { kw: [
      'canva','figma','notion','chatgpt','openai','claude ai','suredge','photoshop',
      'adobe','capcut','premiere','after effects','davinci resolve','lightroom',
      'microsoft 365','office 365','google workspace','grammarly','loom','zoom',
      'zapier','slack','trello','asana','monday','clickup','airtable',
    ],
    result: { group: 'operacional', category: 'Software' } },

  // ── OPERACIONAL: APIs / Automação ─────────────────────────────────────────
  { kw: [
      'api ','webhook','make.com','n8n','integromat','automação bot','bot automação',
      'twilio','sendgrid','mailchimp','hubspot api','stripe api','pusher',
      'openai api','anthropic api','google api',
    ],
    result: { group: 'operacional', category: 'APIs' } },

  // ── OPERACIONAL: Infraestrutura Web ──────────────────────────────────────
  { kw: [
      'domínio','domain','hostinger','cloudflare','ssl','cdn','hospedagem web',
      'registro domínio','dns','namecheap','godaddy','wix','squarespace',
      'vercel','netlify','railway','render.com','supabase','firebase',
    ],
    result: { group: 'operacional', category: 'Infraestrutura', subcategory: 'Hospedagem Web' } },

  // ── OPERACIONAL: Taxas Bancárias ─────────────────────────────────────────
  { kw: [
      'taxa bancária','tarifa bancária','anuidade cartão','anuidade banco',
      'tarifas banco','taxa manutenção conta','ted fee','taxa ted','taxa transferência',
      'iof','taxa câmbio',
    ],
    result: { group: 'operacional', category: 'Taxas Bancárias' } },

  // ── OPERACIONAL: Marketing ────────────────────────────────────────────────
  { kw: [
      'facebook ads','google ads','meta ads','tráfego pago','publicidade online',
      'impulsionamento','instagram ads','youtube ads','tiktok ads',
    ],
    result: { group: 'operacional', category: 'Marketing' } },

  // ── OPERACIONAL: Saques ───────────────────────────────────────────────────
  { kw: [
      'saque bet','saque casa','retirada apostas','saque apostas','saque bookmaker',
      'saque esporte','saque mercado','withdrawal',
    ],
    result: { group: 'operacional', category: 'Saques' } },

  // ── OPERACIONAL: Depósitos ────────────────────────────────────────────────
  { kw: [
      'depósito bet','deposito bet','deposito casa','aporte bet','depositar casa',
      'depósito bookmaker','depósito apostas','deposit bet',
    ],
    result: { group: 'operacional', category: 'Depósitos' } },

  // ── PESSOAL: Cartão de Crédito ────────────────────────────────────────────
  // Checked before generic categories to avoid misclassifying credit card payments
  { kw: [
      'fatura cartão','fatura nubank','fatura itaú','fatura bradesco','fatura santander',
      'fatura inter','fatura c6','fatura bb','fatura caixa','fatura sicoob',
      'pagar cartão','pagamento fatura','cartão de crédito','pagamento nubank',
    ],
    result: { group: 'pessoal', category: 'Cartão de Crédito' } },

  // ── PESSOAL: Moradia ──────────────────────────────────────────────────────
  { kw: [
      'aluguel','condomínio','iptu','energia elétrica','conta de luz','conta de água',
      'gás residencial','internet residencial','manutenção casa','água esgoto',
      'internet fibra','vivo fibra','claro fibra','tim fibra','net claro',
      'financiamento imóvel','prestação casa','prestação apartamento',
    ],
    result: { group: 'pessoal', category: 'Moradia' } },

  // ── PESSOAL: Alimentação — Mercado ────────────────────────────────────────
  { kw: [
      'mercado','supermercado','carrefour','pão de açúcar','atacadão','assaí',
      'hortifruti','açougue','feira livre','hiper','extra supermercado','bistek',
      'compra semana','compras semana','feira','verdura','fruta','carne açougue',
    ],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Mercado' } },

  // ── PESSOAL: Alimentação — Restaurante / Delivery ────────────────────────
  { kw: [
      'restaurante','almoço','jantar','ifood','iFood','rappi','delivery comida',
      'refeição','marmita','prato feito','comida delivery','delivery almoco',
    ],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Restaurante' } },

  // ── PESSOAL: Alimentação — Lanche / Bar ───────────────────────────────────
  { kw: [
      'lanche','hambúrguer','hamburger','pizza','fast food','mcdonalds','burger king',
      'subway','kfc','salgado','pastel','esfiha','tapioca','açaí','coxinha',
      'vinho','adega','cerveja','chopp','churrasco','churrascaria','espetinho',
      'boteco','bar ','petisco','cachaça','drink','drinks','cocktail','coquetel',
      'cervejaria','skol','brahma','heineken','stella','corona','budweiser',
    ],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Lanche/Bar' } },

  // ── PESSOAL: Alimentação — Padaria / Café ────────────────────────────────
  { kw: [
      'padaria','confeitaria','café ','cafezinho','starbucks','cafeteria',
      'pão','croissant','bolo padaria',
    ],
    result: { group: 'pessoal', category: 'Alimentação', subcategory: 'Padaria/Café' } },

  // ── PESSOAL: Transporte — Manutenção ─────────────────────────────────────
  { kw: [
      'troca de óleo','troca óleo','revisão carro','revisão moto','oficina',
      'mecânico','borracharia','auto center','funilaria','pintura carro',
      'bateria carro','pneu','freio','amortecedor','filtro carro','embreagem',
      'cinto segurança','para-brisa','chave carro','crlv','ipva','licenciamento',
    ],
    result: { group: 'pessoal', category: 'Transporte', subcategory: 'Manutenção' } },

  // ── PESSOAL: Transporte — Combustível / Moto ─────────────────────────────
  { kw: [
      'gasolina','combustível','etanol','diesel','posto','shell','ipiranga',
      'abastecimento','moto ','manutenção moto','manutenção carro','br distribuidora',
      'posto combustível','litro gasolina',
    ],
    result: { group: 'pessoal', category: 'Transporte', subcategory: 'Combustível' } },

  // ── PESSOAL: Transporte — App / Passagem ─────────────────────────────────
  { kw: [
      'uber','99pop','táxi','ônibus','metrô','trem','passagem','estacionamento',
      'pedágio','cabify','indriver','lalamove','passagem aérea','voo ','avião',
      'latam','gol ','azul ','airfrance','emirates','companhia aérea','embarque',
      'aeroporto','passagem ônibus',
    ],
    result: { group: 'pessoal', category: 'Transporte', subcategory: 'App/Passagem' } },

  // ── PESSOAL: Saúde — Academia ─────────────────────────────────────────────
  { kw: [
      'academia','gym','smart fit','smartfit','bodytech','crossfit',
      'personal trainer','musculação','pilates','yoga','natação',
    ],
    result: { group: 'pessoal', category: 'Saúde', subcategory: 'Academia' } },

  // ── PESSOAL: Saúde — Geral ───────────────────────────────────────────────
  { kw: [
      'farmácia','remédio','médico','dentista','exame','hospital','clínica',
      'nutricionista','psicólogo','terapia','unimed','amil','sulamerica',
      'plano saúde','consulta','ultrassom','raio x','cirurgia','vacina','drogasil',
    ],
    result: { group: 'pessoal', category: 'Saúde', subcategory: 'Saúde Geral' } },

  // ── PESSOAL: Lazer — Hospedagem / Viagem ─────────────────────────────────
  { kw: [
      'hospedagem','pousada','hotel','airbnb','hostel','resort','chalé',
      'booking','trivago','hotelaria','diária','reserva hotel',
    ],
    result: { group: 'pessoal', category: 'Lazer', subcategory: 'Viagem' } },

  // ── PESSOAL: Lazer — Streaming / Entretenimento ───────────────────────────
  { kw: [
      'netflix','spotify','disney','disney plus','prime video','hbo max','hbomax',
      'youtube premium','crunchyroll','cinema','show ao vivo','ingresso','steam',
      'xbox','playstation','nintendo','twitch','globoplay','telecine','deezer',
      'apple tv','apple music','tidal',
    ],
    result: { group: 'pessoal', category: 'Lazer', subcategory: 'Streaming' } },

  // ── PESSOAL: Lazer — Geral ────────────────────────────────────────────────
  { kw: [
      'jogo ','joguinho','parque','passeio','evento','festa','balada','show ',
      'bilhete','ingresso ','flipmob','topgolf',
    ],
    result: { group: 'pessoal', category: 'Lazer' } },

  // ── PESSOAL: Compras — Presentes ──────────────────────────────────────────
  { kw: [
      'presente','presentes','gift','brinde','lembrança','aniversário presente',
      'natal compra','dia das mães','dia dos pais',
    ],
    result: { group: 'pessoal', category: 'Compras', subcategory: 'Presentes' } },

  // ── PESSOAL: Compras — Geral ──────────────────────────────────────────────
  { kw: [
      'roupa','sapato','tênis','calçado','shein','zara','renner','hering',
      'amazon','mercado livre','shopee','aliexpress','magazine luiza','americanas',
      'casas bahia','c&a','ri happy','petz','leroy merlin','casa do construtor',
    ],
    result: { group: 'pessoal', category: 'Compras' } },
];

// ── Learned keywords persistence ──────────────────────────────────────────────

const LEARNED_KEY = 'se_v5_learnedKw';

function loadLearnedKw(): Record<string, Classification> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(LEARNED_KEY) ?? '{}'); } catch { return {}; }
}

function persistLearnedKw(kw: Record<string, Classification>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LEARNED_KEY, JSON.stringify(kw));
}

// ── Core classify functions ────────────────────────────────────────────────────

export function classify(description: string): Classification | null {
  if (!description.trim()) return null;
  const lower = description.toLowerCase();
  for (const rule of RULES) {
    if (rule.kw.some(k => lower.includes(k.trim()))) return rule.result;
  }
  return null;
}

function classifyFull(
  description: string,
  learned: Record<string, Classification>,
): Classification | null {
  if (!description.trim()) return null;
  const lower = description.toLowerCase().trim();
  // Exact learned match first
  if (learned[lower]) return learned[lower];
  // Substring learned match
  for (const [kw, cls] of Object.entries(learned)) {
    if (kw.length >= 3 && lower.includes(kw)) return cls;
  }
  return classify(description);
}

// ── Category metadata ──────────────────────────────────────────────────────────

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

interface Insight { icon: 'alert' | 'up' | 'down' | 'info' | 'missing' | 'learn'; text: string; }

function buildInsights(
  cur: Expense[],
  prev: Expense[],
  allExpenses: Expense[],
  rec: RecurringExpense[],
  ym: string,
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

  // Top operational cost
  const topOp = sorted.find(([k]) => opExps.some(e => e.category === k));
  if (topOp) out.push({ icon: 'info', text: `${topOp[0]} é o maior custo operacional este mês (${fmtBRL(topOp[1])}).` });

  // Top personal category as % of personal
  const topPs = sorted.find(([k]) => psExps.some(e => e.category === k));
  if (topPs && psTot > 0) {
    const pct = Math.round(topPs[1] / psTot * 100);
    out.push({ icon: pct > 45 ? 'alert' : 'info', text: `${topPs[0]} representa ${pct}% dos gastos pessoais (${fmtBRL(topPs[1])}).` });
  }

  // Fastest-growing category
  let maxGrowth = 0, growthCat = '';
  for (const [cat, amt] of sorted.slice(0, 6)) {
    const p = prevByCat[cat] ?? 0;
    if (p > 0 && amt > p * 1.2) {
      const growth = (amt / p - 1) * 100;
      if (growth > maxGrowth) { maxGrowth = growth; growthCat = cat; }
    }
  }
  if (growthCat) out.push({ icon: 'up', text: `${growthCat} cresceu ${Math.round(maxGrowth)}% em relação ao mês passado.` });

  // Detect potential new recurrents (description appears in 2+ distinct months and isn't already a fixed)
  const recDescLower = rec.map(r => r.description.toLowerCase().slice(0, 8));
  const byDescMonths: Record<string, Set<string>> = {};
  allExpenses.forEach(e => {
    const key = e.description.toLowerCase().trim().slice(0, 20);
    if (!byDescMonths[key]) byDescMonths[key] = new Set();
    byDescMonths[key].add(e.date.slice(0, 7));
  });
  const potentialRec = Object.entries(byDescMonths)
    .filter(([desc, months]) =>
      months.size >= 2 &&
      !recDescLower.some(r => desc.startsWith(r) || r.startsWith(desc.slice(0, 6))),
    )
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 1);
  if (potentialRec.length > 0) {
    const [desc, months] = potentialRec[0];
    out.push({ icon: 'learn', text: `"${desc}" apareceu em ${months.size} meses — considere cadastrá-lo como fixo.` });
  }

  // MoM comparison
  if (prevTot > 0 && total > prevTot * 1.2) {
    out.push({ icon: 'alert', text: `Gastos ${Math.round((total / prevTot - 1) * 100)}% maiores que no mês anterior.` });
  } else if (prevTot > 0 && total < prevTot * 0.85) {
    out.push({ icon: 'down', text: `Gastos ${Math.round((1 - total / prevTot) * 100)}% menores que no mês anterior.` });
  }

  // Month projection
  const [fy, fm] = ym.split('-').map(Number);
  const isNow = fy === now.getFullYear() && fm === now.getMonth() + 1;
  if (isNow && now.getDate() > 3 && total > 0) {
    const proj = (total / now.getDate()) * new Date(fy, fm, 0).getDate();
    out.push({ icon: 'info', text: `Projeção: encerrar o mês em torno de ${fmtBRL(proj)} em despesas.` });
  }

  // Missing registered fixed expense this month
  const descLower = cur.map(e => e.description.toLowerCase());
  for (const r of rec.filter(r => r.active)) {
    if (!descLower.some(d => d.includes(r.description.toLowerCase().slice(0, 6)))) {
      out.push({ icon: 'missing', text: `${r.description} (${fmtBRL(r.amount)}/mês) sem lançamento neste mês.` });
      break;
    }
  }

  return out.slice(0, 6);
}

// ── Health indicator ──────────────────────────────────────────────────────────

type Health = 'ok' | 'warn' | 'bad' | 'neutral';
function health(cur: number, prev: number): Health {
  if (prev === 0) return 'neutral';
  const r = cur / prev;
  if (r <= 1.0)  return 'ok';
  if (r <= 1.25) return 'warn';
  return 'bad';
}
const HCFG: Record<Health, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  ok:      { label: 'Gastos dentro da média histórica', color: '#3FFF21', bg: 'rgba(63,255,33,.05)',    Icon: ShieldCheck },
  warn:    { label: 'Gastos acima da média histórica',  color: '#FBBF24', bg: 'rgba(251,191,36,.05)',   Icon: ShieldAlert },
  bad:     { label: 'Crescimento acelerado de gastos',  color: '#F87171', bg: 'rgba(248,113,113,.05)',  Icon: ShieldX     },
  neutral: { label: 'Sem histórico para comparar',      color: '#6B7280', bg: 'rgba(107,114,128,.05)', Icon: ShieldCheck },
};

// ── Financial decision panel ──────────────────────────────────────────────────

type FinHealthLevel = 'critico' | 'atencao' | 'saudavel' | 'excelente';

const FH_CFG: Record<FinHealthLevel, {
  label:    string;
  color:    string;
  bg:       string;
  border:   string;
  Icon:     React.ElementType;
  subtitle: (proj: number, fixed: number) => string;
}> = {
  critico:   {
    label:    'Crítico',
    color:    '#F87171',
    bg:       'rgba(248,113,113,.04)',
    border:   'rgba(248,113,113,.18)',
    Icon:     ShieldX,
    subtitle: (proj, fixed) =>
      proj <= 0
        ? 'Sem operações registradas no mês. Registre seus resultados para ativar a análise.'
        : `Projeção ${fmtBRL(proj)} não cobre os custos fixos de ${fmtBRL(fixed)}. Ritmo insuficiente — ação necessária.`,
  },
  atencao:   {
    label:    'Atenção',
    color:    '#FBBF24',
    bg:       'rgba(251,191,36,.04)',
    border:   'rgba(251,191,36,.18)',
    Icon:     ShieldAlert,
    subtitle: (proj, fixed) =>
      `Projeção ${fmtBRL(proj)} cobre os fixos com margem mínima de +${Math.round((proj / fixed - 1) * 100)}%. Aumente o ritmo para garantir segurança.`,
  },
  saudavel:  {
    label:    'Saudável',
    color:    '#34D399',
    bg:       'rgba(52,211,153,.04)',
    border:   'rgba(52,211,153,.18)',
    Icon:     ShieldCheck,
    subtitle: (proj, fixed) =>
      `Projeção ${fmtBRL(proj)} supera os custos fixos com +${Math.round((proj / fixed - 1) * 100)}% de margem. No caminho certo.`,
  },
  excelente: {
    label:    'Excelente',
    color:    '#3FFF21',
    bg:       'rgba(63,255,33,.04)',
    border:   'rgba(63,255,33,.18)',
    Icon:     ShieldCheck,
    subtitle: (proj, fixed) =>
      `Projeção ${fmtBRL(proj)} supera em +${Math.round((proj / fixed - 1) * 100)}% a meta mínima. Performance acima do ideal.`,
  },
};

function PlanRow({ label, val, note, color }: { label: string; val: string; note: string; color?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs shrink-0" style={{ color: 'var(--t3)' }}>{label}</span>
      <div className="text-right">
        <div className="text-xs font-bold font-mono" style={{ color: color ?? 'var(--t)' }}>{val}</div>
        <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{note}</div>
      </div>
    </div>
  );
}

// ── Expense form ──────────────────────────────────────────────────────────────

interface ExpenseFormProps {
  existing?: Expense;
  learnedKw: Record<string, Classification>;
  onLearn:   (kw: string, cls: Classification) => void;
  onClose:   () => void;
}

function ExpenseForm({ existing, learnedKw, onLearn, onClose }: ExpenseFormProps) {
  const addExpense    = useStore(s => s.addExpense);
  const updateExpense = useStore(s => s.updateExpense);
  const updateBank    = useStore(s => s.updateBank);
  const banks         = useStore(s => s.banks);
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
  const [shouldLearn, setShouldLearn] = useState(false);
  const [bankId,      setBankId]      = useState(existing?.bankId ?? '');

  const suggested = useMemo(() => classifyFull(desc, learnedKw), [desc, learnedKw]);

  function handleDesc(v: string) {
    setDesc(v);
    if (!overridden) {
      const c = classifyFull(v, learnedKw);
      if (c) { setGroup(c.group); setCategory(c.category); setSubcategory(c.subcategory ?? ''); }
      else   { setGroup(''); setCategory(''); setSubcategory(''); }
    }
  }

  function save() {
    if (!desc.trim())              { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseBRLInput(amount);
    if (!amt || amt <= 0)          { toast('Valor inválido', 'wrn'); return; }

    const payload: Omit<Expense, 'id'> = {
      date, description: desc.trim(), amount: amt,
      category:    category || 'Outros',
      subcategory: subcategory || undefined,
      group:       (group || undefined) as ExpenseGroup | undefined,
      notes:       notes || undefined,
      recurring,
      bankId:      bankId || undefined,
    };

    // Bank balance adjustments (read fresh state to avoid stale closures)
    if (existing?.bankId) {
      // Editing: restore amount to old bank first
      const oldBank = useStore.getState().banks.find(b => b.id === existing.bankId);
      if (oldBank) updateBank(existing.bankId, { balance: oldBank.balance + existing.amount });
    }
    if (bankId) {
      // Deduct from the selected bank (reads fresh after potential restore above)
      const freshBank = useStore.getState().banks.find(b => b.id === bankId);
      if (freshBank) updateBank(bankId, { balance: freshBank.balance - amt });
    }

    if (existing) { updateExpense(existing.id, payload); toast('Gasto atualizado', 'ok'); }
    else          { addExpense(payload);                  toast('Gasto registrado', 'ok'); }

    // Persist learned keyword
    if (shouldLearn && group && category && desc.trim().length >= 3) {
      const kw = desc.trim().toLowerCase().split(' ').slice(0, 3).join(' ');
      onLearn(kw, { group: group as ExpenseGroup, category, subcategory: subcategory || undefined });
    }
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
            placeholder="Ex: Mercado, Chip Claro, VPS Contabo, Fatura Nubank, Vinho, AdsPower..."
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        {/* Auto-classification suggestion */}
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

        {/* Manual classification */}
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

        {/* Learn checkbox — only on manual classification */}
        {overridden && group && category && desc.trim().length >= 3 && (
          <button type="button" onClick={() => setShouldLearn(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left"
            style={{
              background: shouldLearn ? 'rgba(63,255,33,.06)' : 'var(--sur)',
              border: `1px solid ${shouldLearn ? 'rgba(63,255,33,.2)' : 'var(--b2)'}`,
              color: shouldLearn ? 'var(--g)' : 'var(--t3)',
            }}>
            <BookMarked size={11} />
            <span>Lembrar <strong>"{desc.trim().split(' ').slice(0, 3).join(' ')}"</strong> como {category} nas próximas vezes</span>
          </button>
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

        {/* Bank account selector */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Conta Bancária</span>
          <select value={bankId} onChange={e => setBankId(e.target.value)}
            className="px-3 py-2.5 rounded-lg text-sm" style={s}>
            <option value="">Sem conta atrelada</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} — {fmtBRL(b.balance)}
              </option>
            ))}
          </select>
        </label>

        {/* Balance preview after deduction */}
        {bankId && (() => {
          const bank = banks.find(b => b.id === bankId);
          const amt  = parseBRLInput(amount) || 0;
          if (!bank || amt === 0) return null;
          const after    = bank.balance - amt;
          const negative = after < 0;
          return (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
              style={{
                background: negative ? 'rgba(248,113,113,.06)' : 'rgba(63,255,33,.04)',
                border:     `1px solid ${negative ? 'rgba(248,113,113,.2)' : 'rgba(63,255,33,.15)'}`,
              }}>
              <span style={{ color: 'var(--t3)' }}>
                Saldo atual: <strong style={{ color: 'var(--t2)' }}>{fmtBRL(bank.balance)}</strong>
              </span>
              <span style={{ color: 'var(--t3)' }}>→</span>
              <span style={{ color: negative ? '#F87171' : '#3FFF21' }}>
                <strong>{negative ? '−' : ''}{fmtBRL(Math.abs(after))}</strong>
                {negative && <span style={{ color: '#F87171' }}> (saldo negativo)</span>}
              </span>
            </div>
          );
        })()}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Observações</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm" style={s} />
        </label>

        <button type="button" onClick={() => setRecurring(v => !v)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left"
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

// ── Recurring expense form ─────────────────────────────────────────────────────

interface RecurringFormProps {
  existing?:  RecurringExpense;
  learnedKw:  Record<string, Classification>;
  onClose:    () => void;
}

function RecurringForm({ existing, learnedKw, onClose }: RecurringFormProps) {
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
      const c = classifyFull(v, learnedKw);
      if (c) { setGroup(c.group); setCategory(c.category); setSubcategory(c.subcategory ?? ''); }
    }
  }

  function save() {
    if (!desc.trim()) { toast('Descrição obrigatória', 'wrn'); return; }
    const amt = parseBRLInput(amount);
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
            placeholder="Ex: Academia Smart Fit, VPS Contabo, Netflix, Chip Claro..."
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
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Vencimento (dia)</span>
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
  const legs              = useStore(s => s.legs);
  const recurringExpenses = useStore(s => s.recurringExpenses ?? []);
  const deleteExpense     = useStore(s => s.deleteExpense);
  const deleteRec         = useStore(s => s.deleteRecurringExpense);
  const updateRec         = useStore(s => s.updateRecurringExpense);
  const updateBank        = useStore(s => s.updateBank);
  const banks             = useStore(s => s.banks);
  const bms               = useStore(s => s.bms);
  const bulkPatch         = useStore(s => s.bulkPatchExpenses);
  const toast             = useStore(s => s.toast);

  type Tab = 'visao' | 'gastos' | 'fixos';
  const [tab,              setTab]             = useState<Tab>('gastos');
  const [filterMonth,      setFilterMonth]     = useState(currentMonth());
  const [filterGroup,      setFilterGroup]     = useState<'todos' | 'operacional' | 'pessoal'>('todos');
  const [search,           setSearch]          = useState('');
  const [filterUnclassified, setFilterUnclassified] = useState(false);
  const [showForm,         setShowForm]        = useState(false);
  const [editing,          setEditing]         = useState<Expense | undefined>(undefined);
  const [showRecForm,      setShowRecForm]     = useState(false);
  const [editingRec,       setEditingRec]      = useState<RecurringExpense | undefined>(undefined);
  const [expandedGroups,   setExpandedGroups]  = useState<Set<string>>(new Set(['operacional','pessoal']));
  const [expandedCats,     setExpandedCats]    = useState<Set<string>>(new Set());

  // Learned keywords — reactive, persisted to localStorage
  const [learnedKw, setLearnedKw] = useState<Record<string, Classification>>(() => loadLearnedKw());
  const learnKeyword = useCallback((kw: string, cls: Classification) => {
    setLearnedKw(prev => {
      const next = { ...prev, [kw]: cls };
      persistLearnedKw(next);
      return next;
    });
    toast(`"${kw}" lembrado como ${cls.category}`, 'ok');
  }, [toast]);

  // ── Reclassification ──────────────────────────────────────────────────────

  const unclassified = useMemo(() => expenses.filter(e => !e.group), [expenses]);

  function reclassifyAll() {
    const patches: Array<{ id: string; patch: Partial<Omit<Expense, 'id'>> }> = [];
    expenses.forEach(e => {
      const c = classifyFull(e.description, learnedKw);
      if (c) patches.push({ id: e.id, patch: { group: c.group, category: c.category, subcategory: c.subcategory } });
    });
    if (patches.length === 0) { toast('Nenhum gasto reconhecido pelas regras atuais', 'wrn'); return; }
    bulkPatch(patches);
    toast(`${patches.length} gastos reclassificados`, 'ok');
  }

  function openUnclassifiedFilter() {
    setTab('gastos');
    setFilterUnclassified(true);
    setFilterGroup('todos');
    setSearch('');
  }

  function handleDeleteExpense(e: Expense) {
    if (!confirm('Remover gasto?')) return;
    // Restore amount to the bank that was debited
    if (e.bankId) {
      const bank = useStore.getState().banks.find(b => b.id === e.bankId);
      if (bank) updateBank(e.bankId, { balance: bank.balance + e.amount });
    }
    deleteExpense(e.id);
    toast('Removido', 'ok');
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const curMonth  = useMemo(() => expenses.filter(e => e.date.slice(0, 7) === filterMonth),  [expenses, filterMonth]);
  const prevMonth = useMemo(() => expenses.filter(e => e.date.slice(0, 7) === prevMonthStr(filterMonth)), [expenses, filterMonth]);

  const totalAll = curMonth.reduce((s, e) => s + e.amount, 0);
  const prevTotal= prevMonth.reduce((s, e) => s + e.amount, 0);
  const opExps   = curMonth.filter(e => e.group === 'operacional');
  const psExps   = curMonth.filter(e => e.group === 'pessoal');
  const opTotal  = opExps.reduce((s, e) => s + e.amount, 0);
  const psTotal  = psExps.reduce((s, e) => s + e.amount, 0);
  const opPct    = totalAll > 0 ? Math.round(opTotal / totalAll * 100) : 0;

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

  // ── Category drill-down ───────────────────────────────────────────────────

  const opByCat = useMemo(() => {
    const map: Record<string, { total: number; subs: Record<string, number>; items: Expense[] }> = {};
    opExps.forEach(e => {
      const k = e.category || 'Outros';
      if (!map[k]) map[k] = { total: 0, subs: {}, items: [] };
      map[k].total += e.amount;
      map[k].items.push(e);
      if (e.subcategory) map[k].subs[e.subcategory] = (map[k].subs[e.subcategory] ?? 0) + e.amount;
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
      if (e.subcategory) map[k].subs[e.subcategory] = (map[k].subs[e.subcategory] ?? 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [psExps]);

  // ── 6-month chart ─────────────────────────────────────────────────────────

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

  // ── Insights ──────────────────────────────────────────────────────────────

  const insights = useMemo(
    () => buildInsights(curMonth, prevMonth, expenses, recurringExpenses, filterMonth),
    [curMonth, prevMonth, expenses, recurringExpenses, filterMonth],
  );

  const hcfg = HCFG[health(totalAll, prevTotal)];

  // ── Fixed costs ───────────────────────────────────────────────────────────

  const activeRec         = recurringExpenses.filter(r => r.active);
  const fixedMonthly      = activeRec.reduce((s, r) => s + r.amount, 0);
  const fixedWeekly       = +(fixedMonthly / 4.33).toFixed(2);
  const fixedDaily        = +(fixedMonthly / 30).toFixed(2);
  const fixedOp           = activeRec.filter(r => r.group === 'operacional').reduce((s, r) => s + r.amount, 0);
  const fixedPs           = activeRec.filter(r => r.group === 'pessoal').reduce((s, r) => s + r.amount, 0);
  const fixedTotalDaily22 = +(fixedMonthly / 22).toFixed(2);
  const fixedOpDaily22    = +(fixedOp / 22).toFixed(2);

  // ── Financial decision panel ──────────────────────────────────────────────

  const monthlyBetProfit = useMemo(() => {
    return +legs
      .filter(l => l.source !== 'import' && l.re !== 'Pendente' && l.re !== 'Devolvido' && (l.bd ?? '').slice(0, 7) === filterMonth)
      .reduce((s, l) => s + calcLegProfit(l), 0)
      .toFixed(2);
  }, [legs, filterMonth]);

  // lucro líquido = lucro das apostas − despesas do mês selecionado
  const netMonthlyProfit = +(monthlyBetProfit - totalAll).toFixed(2);

  const last3MonthsAvgProfit = useMemo(() => {
    const now = new Date();
    let total = 0;
    for (let i = 1; i <= 3; i++) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      total += legs
        .filter(l => l.source !== 'import' && l.re !== 'Pendente' && l.re !== 'Devolvido' && (l.bd ?? '').slice(0, 7) === ym)
        .reduce((s, l) => s + calcLegProfit(l), 0);
    }
    return +(total / 3).toFixed(2);
  }, [legs]);

  const { daysElapsed, daysInMonth, daysRemaining, workdaysRemaining } = useMemo(() => {
    const now = new Date();
    const [y, m] = filterMonth.split('-').map(Number);
    const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
    const dim      = new Date(y, m, 0).getDate();
    const elapsed  = isCurrentMonth ? Math.max(1, now.getDate()) : dim;
    const remaining      = isCurrentMonth ? dim - now.getDate() : 0;
    const workdaysRem    = Math.round(remaining * 22 / 30);
    return { daysElapsed: elapsed, daysInMonth: dim, daysRemaining: remaining, workdaysRemaining: workdaysRem };
  }, [filterMonth]);

  // todos os cálculos abaixo usam lucro líquido (apostas − despesas do mês)
  const dailyPace              = daysElapsed > 0 ? +(netMonthlyProfit / daysElapsed).toFixed(2) : 0;
  const projectedMonthProfit   = +(dailyPace * daysInMonth).toFixed(2);
  const recommendedGoal        = +(fixedMonthly * 1.2).toFixed(2);
  const idealGoal              = +(fixedMonthly * 1.5).toFixed(2);
  const progressPct            = fixedMonthly > 0 ? Math.round(netMonthlyProfit / fixedMonthly * 100) : 0;
  const remainingToBreakeven   = Math.max(0, +(fixedMonthly - netMonthlyProfit).toFixed(2));
  const remainingToRecommended = Math.max(0, +(recommendedGoal - netMonthlyProfit).toFixed(2));
  const dailyNeededForRecommended = workdaysRemaining > 0 ? +(remainingToRecommended / workdaysRemaining).toFixed(2) : 0;
  const daysToBreakevenAtPace  = dailyPace > 0 && remainingToBreakeven > 0
    ? Math.ceil(remainingToBreakeven / dailyPace)
    : remainingToBreakeven === 0 ? 0 : -1;
  const safetyMargin           = +(netMonthlyProfit - fixedMonthly).toFixed(2);
  const fixedCostEfficiency    = last3MonthsAvgProfit > 0 ? Math.round(fixedMonthly / last3MonthsAvgProfit * 100) : 0;

  // ── Patrimônio operacional ────────────────────────────────────────────────
  const bmsTotal            = +bms.reduce((s, b) => s + b.balance, 0).toFixed(2);
  const banksTotal          = +banks.reduce((s, b) => s + b.balance, 0).toFixed(2);
  const operationalAssets   = +(bmsTotal + banksTotal).toFixed(2);
  const assetsProfitPct     = operationalAssets > 0 ? +(netMonthlyProfit / operationalAssets * 100).toFixed(1) : 0;
  const withdrawableAboveBreakeven   = Math.max(0, +(netMonthlyProfit - fixedMonthly).toFixed(2));
  const withdrawableAboveRecommended = Math.max(0, +(netMonthlyProfit - recommendedGoal).toFixed(2));

  const finHealth: FinHealthLevel = (() => {
    if (fixedMonthly === 0) return 'saudavel';
    if (projectedMonthProfit <= 0) return 'critico';
    const ratio = projectedMonthProfit / fixedMonthly;
    if (ratio < 1)   return 'critico';
    if (ratio < 1.2) return 'atencao';
    if (ratio < 1.5) return 'saudavel';
    return 'excelente';
  })();

  const topFixed    = activeRec.length > 0 ? activeRec.reduce((a, b) => b.amount > a.amount ? b : a) : null;
  const topFixedPct = topFixed && fixedMonthly > 0 ? Math.round(topFixed.amount / fixedMonthly * 100) : 0;

  const decisaoHoje: string | null = (() => {
    if (fixedMonthly === 0) return null;
    if (netMonthlyProfit >= recommendedGoal) {
      const pct = Math.round((netMonthlyProfit / recommendedGoal - 1) * 100);
      return `Meta recomendada já atingida${pct > 0 ? ` — você está ${pct}% acima do necessário (líquido)` : ''}.`;
    }
    if (dailyNeededForRecommended > 0 && workdaysRemaining > 0) {
      return `Para atingir a meta recomendada, você precisa de ${fmtBRL(dailyNeededForRecommended)} líquidos por dia útil nos próximos ${workdaysRemaining} dias.`;
    }
    if (workdaysRemaining === 0) {
      return `Mês encerrado. Líquido: ${fmtBRL(netMonthlyProfit)} (${progressPct}% da meta mínima).`;
    }
    return `Meta mínima: ${fmtBRL(fixedMonthly)}. Líquido atual: ${fmtBRL(netMonthlyProfit)} (${progressPct}% da meta).`;
  })();

  const finInsights: Array<{ icon: string; text: string; color: string }> = (() => {
    if (fixedMonthly === 0 || daysElapsed < 3) return [];
    const out: Array<{ icon: string; text: string; color: string }> = [];
    if (projectedMonthProfit !== 0) {
      const pct  = Math.round((projectedMonthProfit / fixedMonthly - 1) * 100);
      const sign = pct >= 0 ? '+' : '';
      out.push({
        icon:  pct >= 0 ? '↑' : '↓',
        color: pct >= 0 ? '#3FFF21' : '#F87171',
        text:  `No ritmo atual, encerrará o mês com ${fmtBRL(projectedMonthProfit)} líquidos (${sign}${pct}% ${pct >= 0 ? 'acima' : 'abaixo'} da meta mínima).`,
      });
    }
    if (dailyPace > 0 && remainingToBreakeven > 0) {
      const daysLeft = Math.ceil(remainingToBreakeven / dailyPace);
      out.push({
        icon:  '→',
        color: daysLeft <= daysRemaining ? '#3FFF21' : '#FBBF24',
        text:  `Se mantiver ${fmtBRL(dailyPace)} líquido/dia, atingirá o breakeven em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}.`,
      });
    }
    if (topFixed && topFixedPct > 30) {
      out.push({
        icon:  '·',
        color: 'var(--t3)',
        text:  `${topFixed.description} representa ${topFixedPct}% dos custos fixos (${fmtBRL(topFixed.amount)}/mês).`,
      });
    }
    if (fixedCostEfficiency > 0) {
      out.push({
        icon:  '%',
        color: fixedCostEfficiency > 60 ? '#F87171' : fixedCostEfficiency > 40 ? '#FBBF24' : '#3FFF21',
        text:  `Custos fixos consomem ${fixedCostEfficiency}% do lucro médio dos últimos 3 meses (${fmtBRL(last3MonthsAvgProfit)}/mês).`,
      });
    }
    const spendable = projectedMonthProfit > 0 ? Math.max(0, +(projectedMonthProfit * 0.8 - fixedMonthly).toFixed(2)) : 0;
    if (spendable > 0) {
      out.push({
        icon:  '+',
        color: '#3FFF21',
        text:  `Pode adicionar até ${fmtBRL(spendable)} em novos custos fixos sem comprometer a saúde financeira.`,
      });
    }
    return out;
  })();

  // ── Gastos tab filtering ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return curMonth
      .filter(e => {
        if (filterUnclassified) return !e.group;
        if (filterGroup !== 'todos' && e.group !== filterGroup) return false;
        if (search && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [curMonth, filterGroup, search, filterUnclassified]);

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
    setExpandedGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }
  function toggleCat(c: string) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
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
                <button key={t} onClick={() => { setTab(t); if (t !== 'gastos') setFilterUnclassified(false); }}
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

      {/* Reclassification banner — reactive to current expenses state */}
      {unclassified.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)' }}>
          <Sparkles size={14} style={{ color: '#FBBF24', flexShrink: 0 }} />
          <span className="text-sm flex-1" style={{ color: 'var(--t2)' }}>
            <strong style={{ color: '#FBBF24' }}>{unclassified.length} gasto{unclassified.length !== 1 ? 's' : ''}</strong>{' '}
            sem categoria. Gráficos e insights dependem desta classificação.
          </span>
          <button onClick={openUnclassifiedFilter}
            className="text-xs font-medium shrink-0 underline"
            style={{ color: '#FBBF24' }}>
            Ver lista
          </button>
          <button onClick={reclassifyAll}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg shrink-0"
            style={{ background: 'rgba(251,191,36,.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,.3)' }}>
            <Zap size={12} /> Reclassificar tudo
          </button>
        </div>
      )}

      {/* ═══ VISÃO GERAL ═══ */}
      {tab === 'visao' && (
        <>
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="w-fit px-3 py-1.5 rounded-lg text-sm font-mono"
            style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

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

          {/* Key metrics */}
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
                <div className="text-base font-black font-mono" style={{ color }}>{value > 0 ? fmtBRL(value) : '—'}</div>
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
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#818CF8' }} /> Oper. {opPct}%
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#FB923C' }} /> Pess. {100 - opPct}%
                  </span>
                </div>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--sur)' }}>
                {opPct > 0 && <div style={{ width: `${opPct}%`, background: '#818CF8', transition: 'width .4s ease' }} />}
                {100 - opPct > 0 && <div style={{ width: `${100 - opPct}%`, background: '#FB923C', transition: 'width .4s ease' }} />}
              </div>
            </div>
          )}

          {/* Chart + Meta de Cobertura */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div style={card} className="px-4 py-4">
              <div className="text-xs font-bold mb-4" style={{ color: 'var(--t2)' }}>Evolução 6 Meses</div>
              {evolution.every(m => m.op === 0 && m.ps === 0) ? (
                <p className="text-xs py-8 text-center" style={{ color: 'var(--t3)' }}>Sem dados históricos ainda.</p>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={evolution} barSize={14} barGap={2} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                    <Bar dataKey="op" stackId="a" fill="#818CF8" />
                    <Bar dataKey="ps" stackId="a" fill="#FB923C" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={card} className="px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Target size={14} style={{ color: '#3FFF21' }} />
                <span className="text-xs font-bold" style={{ color: 'var(--t2)' }}>Cobertura dos Fixos</span>
              </div>
              {fixedMonthly === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <p className="text-xs text-center" style={{ color: 'var(--t3)' }}>
                    Cadastre despesas fixas na aba <strong>Fixos</strong> para ver quanto precisa lucrar.
                  </p>
                  <button onClick={() => setTab('fixos')}
                    className="text-xs px-3 py-1.5 rounded-lg font-bold"
                    style={{ background: 'rgba(63,255,33,.08)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}>
                    Ir para Fixos →
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Breakeven mensal</div>
                      <div className="text-lg font-black font-mono" style={{ color: 'var(--t)' }}>{fmtBRL(fixedMonthly)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Por dia útil</div>
                      <div className="text-sm font-bold font-mono" style={{ color: 'var(--t2)' }}>{fmtBRL(fixedTotalDaily22)}</div>
                    </div>
                  </div>
                  {netMonthlyProfit !== 0 && (
                    <div className="mb-3">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, progressPct))}%`, background: progressPct >= 100 ? '#3FFF21' : progressPct >= 60 ? '#FBBF24' : '#F87171' }} />
                      </div>
                      <div className="mt-1 text-[10px]" style={{ color: 'var(--t3)' }}>
                        {progressPct}% coberto este mês (líquido)
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setTab('fixos')}
                      className="flex-1 text-[11px] py-1.5 rounded-lg font-bold"
                      style={{ background: 'rgba(255,255,255,.04)', color: 'var(--t2)', border: '1px solid var(--b)' }}>
                      Análise completa →
                    </button>
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
                {/* Operacional */}
                {opTotal > 0 && (
                  <>
                    <button onClick={() => toggleGroup('operacional')}
                      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left"
                      style={{ background: 'rgba(129,140,248,.06)' }}>
                      {expandedGroups.has('operacional') ? <ChevronDown size={14} style={{ color: '#818CF8' }} /> : <ChevronRight size={14} style={{ color: '#818CF8' }} />}
                      <Briefcase size={13} style={{ color: '#818CF8' }} />
                      <span className="text-sm font-bold flex-1" style={{ color: '#818CF8' }}>Operacional</span>
                      <span className="text-sm font-black font-mono" style={{ color: '#818CF8' }}>− {fmtBRL(opTotal)}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--t3)' }}>{opPct}%</span>
                    </button>
                    {expandedGroups.has('operacional') && opByCat.map(([cat, { total, subs, items }]) => {
                      const pct     = opTotal > 0 ? Math.round(total / opTotal * 100) : 0;
                      const color   = catColor(cat);
                      const key     = `op_${cat}`;
                      const isExp   = expandedCats.has(key);
                      const subEnts = Object.entries(subs).sort((a, b) => b[1] - a[1]);
                      return (
                        <div key={cat}>
                          <button onClick={() => toggleCat(key)}
                            className="flex items-center gap-2 w-full pl-8 pr-3 py-2 rounded-lg text-left"
                            style={{ color: 'var(--t2)' }}>
                            {isExp ? <ChevronDown size={12} style={{ color: 'var(--t3)' }} /> : <ChevronRight size={12} style={{ color: 'var(--t3)' }} />}
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs flex-1">{cat}</span>
                            <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{pct}%</span>
                            <span className="text-xs font-mono font-bold ml-2" style={{ color }}>{fmtBRL(total)}</span>
                          </button>
                          {isExp && (
                            <div className="pl-14 pr-3 pb-1 flex flex-col gap-0.5">
                              {subEnts.length > 0
                                ? subEnts.map(([sub, amt]) => (
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
                                    <span className="font-mono shrink-0">{fmtBRL(e.amount)}</span>
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Pessoal */}
                {psTotal > 0 && (
                  <>
                    <button onClick={() => toggleGroup('pessoal')}
                      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left mt-1"
                      style={{ background: 'rgba(251,146,60,.06)' }}>
                      {expandedGroups.has('pessoal') ? <ChevronDown size={14} style={{ color: '#FB923C' }} /> : <ChevronRight size={14} style={{ color: '#FB923C' }} />}
                      <User size={13} style={{ color: '#FB923C' }} />
                      <span className="text-sm font-bold flex-1" style={{ color: '#FB923C' }}>Pessoal</span>
                      <span className="text-sm font-black font-mono" style={{ color: '#FB923C' }}>− {fmtBRL(psTotal)}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--t3)' }}>{100 - opPct}%</span>
                    </button>
                    {expandedGroups.has('pessoal') && psByCat.map(([cat, { total, subs, items }]) => {
                      const pct     = psTotal > 0 ? Math.round(total / psTotal * 100) : 0;
                      const color   = catColor(cat);
                      const key     = `ps_${cat}`;
                      const isExp   = expandedCats.has(key);
                      const subEnts = Object.entries(subs).sort((a, b) => b[1] - a[1]);
                      return (
                        <div key={cat}>
                          <button onClick={() => toggleCat(key)}
                            className="flex items-center gap-2 w-full pl-8 pr-3 py-2 rounded-lg text-left"
                            style={{ color: 'var(--t2)' }}>
                            {isExp ? <ChevronDown size={12} style={{ color: 'var(--t3)' }} /> : <ChevronRight size={12} style={{ color: 'var(--t3)' }} />}
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs flex-1">{cat}</span>
                            <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{pct}%</span>
                            <span className="text-xs font-mono font-bold ml-2" style={{ color }}>{fmtBRL(total)}</span>
                          </button>
                          {isExp && (
                            <div className="pl-14 pr-3 pb-1 flex flex-col gap-0.5">
                              {/* Show subcategory grouping if available, else individual expenses */}
                              {subEnts.length > 0
                                ? subEnts.map(([sub, amt]) => (
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
                                    <span className="font-mono shrink-0">{fmtBRL(e.amount)}</span>
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {totalAll > 0 && opTotal === 0 && psTotal === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--t3)' }}>
                    Gastos sem classificação. Use o banner para reclassificar.
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
                    learn:   { color: '#34D399', Icon: BookMarked     },
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

      {/* ═══ GASTOS ═══ */}
      {tab === 'gastos' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-mono"
              style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />

            {/* Group filter or unclassified filter */}
            {filterUnclassified ? (
              <button onClick={() => setFilterUnclassified(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg"
                style={{ background: 'rgba(251,191,36,.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,.3)' }}>
                <Sparkles size={11} /> Sem categoria  ×
              </button>
            ) : (
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
            )}

            <div className="relative flex-1 min-w-[130px]">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setFilterUnclassified(false); }}
                placeholder="Buscar..."
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
              {filterUnclassified ? (
                <>
                  <p className="text-3xl mb-2">✅</p>
                  <p className="font-bold" style={{ color: 'var(--t)' }}>Todos os gastos estão classificados!</p>
                </>
              ) : (
                <>
                  <p className="text-3xl mb-2">🧾</p>
                  <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhum gasto encontrado</p>
                  <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>Use "Registrar Gasto" para adicionar despesas.</p>
                  <Button variant="primary" onClick={() => setShowForm(true)}>+ Registrar Gasto</Button>
                </>
              )}
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
                      const gc = e.group === 'operacional' ? '#818CF8' : e.group === 'pessoal' ? '#FB923C' : '#6B7280';
                      const cc = catColor(e.category);
                      return (
                        <div key={e.id} style={card} className="flex items-center gap-3 px-4 py-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${gc}18` }}>
                            {e.group === 'operacional'
                              ? <Briefcase size={13} style={{ color: gc }} />
                              : e.group === 'pessoal'
                              ? <User      size={13} style={{ color: gc }} />
                              : <Sparkles  size={13} style={{ color: '#FBBF24' }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate" style={{ color: 'var(--t)' }}>{e.description}</span>
                              {e.recurring && <RefreshCw size={10} style={{ color: '#A78BFA', flexShrink: 0 }} />}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {e.category ? (
                                <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ background: `${cc}18`, color: cc }}>
                                  {e.category}
                                </span>
                              ) : (
                                <span className="text-[11px] px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(251,191,36,.1)', color: '#FBBF24' }}>
                                  sem categoria
                                </span>
                              )}
                              {e.subcategory && <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{e.subcategory}</span>}
                              <span className="text-[11px] font-mono" style={{ color: 'var(--t3)' }}>{fmtDate(e.date)}</span>
                              {e.bankId && (() => {
                                const bank = banks.find(b => b.id === e.bankId);
                                return bank ? (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                                    style={{ background: 'rgba(96,165,250,.1)', color: '#60A5FA' }}>
                                    {bank.name}
                                  </span>
                                ) : null;
                              })()}
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
                              onClick={() => handleDeleteExpense(e)}
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

      {/* ═══ FIXOS ═══ */}
      {tab === 'fixos' && (
        <>
          {/* ── Painel de Decisão Financeira ─────────────────────── */}
          {fixedMonthly === 0 ? (
            <div style={card} className="px-5 py-6 text-center">
              <Target size={22} className="mx-auto mb-2.5" style={{ color: '#3FFF21', opacity: 0.35 }} />
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--t)' }}>Nenhum custo fixo cadastrado</p>
              <p className="text-xs" style={{ color: 'var(--t3)' }}>
                Cadastre academia, softwares, VPS, chips e assinaturas abaixo para ver quanto você precisa lucrar para cobri-los.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">

              {/* Saúde financeira */}
              {(() => {
                const fhc    = FH_CFG[finHealth];
                const FHIcon = fhc.Icon;
                return (
                  <div style={{ background: fhc.bg, border: `1px solid ${fhc.border}`, borderRadius: '0.75rem' }}
                    className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <FHIcon size={13} style={{ color: fhc.color }} />
                        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: fhc.color }}>
                          {fhc.label}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono" style={{ color: 'var(--t3)' }}>
                        {activeRec.length} fixo{activeRec.length !== 1 ? 's' : ''} · {fmtBRL(fixedMonthly)}/mês
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>
                      {fhc.subtitle(projectedMonthProfit, fixedMonthly)}
                    </p>
                  </div>
                );
              })()}

              {/* Progresso do mês */}
              <div style={card} className="px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
                  Progresso do Mês
                </div>
                {/* Bruto / Gastos / Líquido */}
                <div className="grid grid-cols-3 gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--b)' }}>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Lucro bruto</div>
                    <div className="text-sm font-bold font-mono" style={{ color: 'var(--t2)' }}>{fmtBRL(monthlyBetProfit)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Gastos</div>
                    <div className="text-sm font-bold font-mono" style={{ color: totalAll > 0 ? '#F87171' : 'var(--t3)' }}>
                      {totalAll > 0 ? `− ${fmtBRL(totalAll)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Líquido</div>
                    <div className="text-sm font-bold font-mono" style={{ color: netMonthlyProfit >= 0 ? 'var(--t)' : '#F87171' }}>
                      {fmtBRL(netMonthlyProfit)}
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <span className="text-[11px] mr-1.5" style={{ color: 'var(--t3)' }}>Líquido gerado</span>
                    <span className="text-2xl font-black font-mono"
                      style={{ color: netMonthlyProfit >= fixedMonthly ? '#3FFF21' : 'var(--t)' }}>
                      {fmtBRL(netMonthlyProfit)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px]" style={{ color: 'var(--t3)' }}>Meta mínima</div>
                    <div className="text-sm font-bold font-mono" style={{ color: 'var(--t2)' }}>{fmtBRL(fixedMonthly)}</div>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: 'var(--sur)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, progressPct))}%`,
                      background: progressPct >= 100 ? '#3FFF21' : progressPct >= 70 ? '#FBBF24' : '#F87171',
                    }} />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: 'var(--t3)' }}>
                    {progressPct >= 100
                      ? `Meta atingida — ${progressPct - 100}% acima`
                      : `${Math.max(0, progressPct)}% · faltam ${fmtBRL(remainingToBreakeven)}`}
                  </span>
                  {dailyPace !== 0 && (
                    <span style={{ color: projectedMonthProfit >= fixedMonthly ? '#3FFF21' : '#F87171' }}>
                      Projeção: {fmtBRL(projectedMonthProfit)}
                    </span>
                  )}
                </div>
              </div>

              {/* Decisão de hoje */}
              {decisaoHoje && (
                <div style={{ background: 'rgba(63,255,33,.04)', border: '1px solid rgba(63,255,33,.15)', borderRadius: '0.75rem' }}
                  className="px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#3FFF21' }}>
                    Decisão de Hoje
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--t)' }}>{decisaoHoje}</p>
                </div>
              )}

              {/* Metas operacionais */}
              <div style={card} className="px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
                  Metas Operacionais
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    { label: 'Breakeven',          val: fixedMonthly,      note: 'cobrir custos fixos'  },
                    { label: 'Recomendado (+20%)', val: recommendedGoal,   note: 'margem de segurança'  },
                    { label: 'Ideal (+50%)',        val: idealGoal,          note: 'crescimento sólido'   },
                    { label: 'Média por dia útil',  val: fixedTotalDaily22,  note: '÷ 22 dias úteis'      },
                  ].map(({ label, val, note }) => (
                    <div key={label}>
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>{label}</div>
                      <div className="text-sm font-bold font-mono" style={{ color: 'var(--t)' }}>{fmtBRL(val)}</div>
                      <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{note}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Patrimônio Operacional */}
              {operationalAssets > 0 && (
                <div style={card} className="px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
                    Patrimônio Operacional
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Total</div>
                      <div className="text-sm font-bold font-mono" style={{ color: 'var(--t)' }}>{fmtBRL(operationalAssets)}</div>
                      <div className="text-[10px]" style={{ color: 'var(--t3)' }}>saldo atual</div>
                    </div>
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Casas</div>
                      <div className="text-sm font-bold font-mono" style={{ color: 'var(--t2)' }}>{fmtBRL(bmsTotal)}</div>
                      <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{bms.filter(b => b.balance > 0).length} ativas</div>
                    </div>
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>Bancos</div>
                      <div className="text-sm font-bold font-mono" style={{ color: 'var(--t2)' }}>{fmtBRL(banksTotal)}</div>
                      <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{banks.filter(b => b.balance > 0).length} com saldo</div>
                    </div>
                  </div>
                  {netMonthlyProfit !== 0 && (
                    <div className="pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--b)' }}>
                      <PlanRow
                        label="Retorno sobre patrimônio"
                        val={`${assetsProfitPct > 0 ? '+' : ''}${assetsProfitPct}%`}
                        note="lucro líquido do mês ÷ capital total"
                        color={assetsProfitPct >= 0 ? '#3FFF21' : '#F87171'}
                      />
                      <PlanRow
                        label="Disponível para retirada"
                        val={withdrawableAboveRecommended > 0
                          ? fmtBRL(withdrawableAboveRecommended)
                          : withdrawableAboveBreakeven > 0
                            ? fmtBRL(withdrawableAboveBreakeven)
                            : 'Aguardar breakeven'}
                        note={withdrawableAboveRecommended > 0
                          ? 'sem comprometer meta recomendada (+20%)'
                          : withdrawableAboveBreakeven > 0
                            ? 'acima do breakeven — meta recomendada em risco'
                            : 'breakeven ainda não atingido este mês'}
                        color={withdrawableAboveRecommended > 0 ? '#3FFF21' : withdrawableAboveBreakeven > 0 ? '#FBBF24' : '#F87171'}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Planejamento */}
              <div style={card} className="px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
                  Planejamento
                </div>
                <div className="flex flex-col gap-2.5">
                  <PlanRow
                    label="Ritmo atual"
                    val={dailyPace !== 0 ? `${fmtBRL(dailyPace)}/dia` : '—'}
                    note={`baseado em ${daysElapsed} dia${daysElapsed !== 1 ? 's' : ''}`}
                  />
                  <PlanRow
                    label="Necessário p/ meta recomendada"
                    val={dailyNeededForRecommended > 0 ? `${fmtBRL(dailyNeededForRecommended)}/dia útil` : 'Meta atingida'}
                    note={`${workdaysRemaining} dia${workdaysRemaining !== 1 ? 's' : ''} útil${workdaysRemaining !== 1 ? 'is' : ''} restante${workdaysRemaining !== 1 ? 's' : ''}`}
                    color={dailyNeededForRecommended > 0 ? (dailyPace < dailyNeededForRecommended ? '#FBBF24' : '#3FFF21') : '#3FFF21'}
                  />
                  <PlanRow
                    label="Dias para breakeven"
                    val={daysToBreakevenAtPace === 0 ? 'Já atingido' : daysToBreakevenAtPace > 0 ? `${daysToBreakevenAtPace} dias` : '—'}
                    note="no ritmo atual"
                    color={daysToBreakevenAtPace === 0 ? '#3FFF21' : daysToBreakevenAtPace > daysRemaining ? '#F87171' : undefined}
                  />
                  <PlanRow
                    label="Margem de segurança"
                    val={safetyMargin >= 0 ? fmtBRL(safetyMargin) : `Déficit ${fmtBRL(Math.abs(safetyMargin))}`}
                    note="lucro gerado − custos fixos"
                    color={safetyMargin >= 0 ? '#3FFF21' : '#F87171'}
                  />
                  {fixedCostEfficiency > 0 && (
                    <PlanRow
                      label="Eficiência operacional"
                      val={`${fixedCostEfficiency}% comprometido`}
                      note="fixos vs lucro médio 3 meses"
                      color={fixedCostEfficiency > 60 ? '#F87171' : fixedCostEfficiency > 40 ? '#FBBF24' : '#3FFF21'}
                    />
                  )}
                </div>
              </div>

              {/* Inteligência financeira */}
              {finInsights.length > 0 && (
                <div style={card} className="px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
                    Inteligência Financeira
                  </div>
                  <div className="flex flex-col gap-2">
                    {finInsights.map((ins, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>
                        <span className="shrink-0 font-bold w-3 text-center mt-px" style={{ color: ins.color }}>{ins.icon}</span>
                        <span>{ins.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

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
                Cadastre academia, softwares, VPS, multilogin, chips e assinaturas para calcular seu custo fixo mensal.
              </p>
              <Button variant="primary" onClick={() => setShowRecForm(true)}>+ Adicionar Fixo</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recurringExpenses.map(r => {
                const gc = r.group === 'operacional' ? '#818CF8' : '#FB923C';
                const cc = catColor(r.category);
                return (
                  <div key={r.id} style={{ ...card, opacity: r.active ? 1 : 0.5 }}
                    className="flex items-center gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${gc}18` }}>
                      {r.group === 'operacional' ? <Briefcase size={13} style={{ color: gc }} /> : <User size={13} style={{ color: gc }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--t)' }}>{r.description}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: `${cc}18`, color: cc }}>{r.category}</span>
                        {r.subcategory && <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{r.subcategory}</span>}
                        <span className="text-[11px] font-mono" style={{ color: 'var(--t3)' }}>dia {r.billingDay}</span>
                        {!r.active && <span className="text-[11px] px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--sur)', color: 'var(--t3)' }}>pausado</span>}
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

      {showForm    && <ExpenseForm   existing={editing}    learnedKw={learnedKw} onLearn={learnKeyword} onClose={() => { setShowForm(false);    setEditing(undefined); }} />}
      {showRecForm && <RecurringForm existing={editingRec} learnedKw={learnedKw}                        onClose={() => { setShowRecForm(false); setEditingRec(undefined); }} />}
    </div>
  );
}
