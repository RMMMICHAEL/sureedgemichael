'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { PLAN_PRICES, PLAN_LABELS, type PlanId } from '@/lib/supabase/subscription';
import {
  Zap, TrendingUp, Shield, Calculator,
  Upload, ChevronDown, Check, ArrowRight,
  LogOut, QrCode, CreditCard, Wallet,
  Users, Star, Filter, Activity,
  Building2, Sparkles, Trophy,
} from 'lucide-react';

// ─── Pricing ──────────────────────────────────────────────────────────────────

interface LandingPlan {
  id: PlanId; label: string; price: number; perMonth: number;
  period: string; savings?: string; badge?: string; features: string[];
}

const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'monthly', label: 'Mensal',
    price: PLAN_PRICES.monthly, perMonth: PLAN_PRICES.monthly, period: 'por mês',
    features: ['Dashboard completo', 'Operações ilimitadas', 'Calculadora de surebet', 'Importação Google Sheets', 'Suporte por e-mail'],
  },
  {
    id: 'quarterly', label: 'Trimestral',
    price: PLAN_PRICES.quarterly, perMonth: +(PLAN_PRICES.quarterly / 3).toFixed(2),
    period: 'por trimestre', savings: 'Economize 15%', badge: 'MAIS POPULAR',
    features: ['Tudo do Mensal', 'Extração de freebet avançada', 'Relatórios detalhados', 'Suporte prioritário', 'Economize 15%'],
  },
  {
    id: 'annual', label: 'Anual',
    price: PLAN_PRICES.annual, perMonth: +(PLAN_PRICES.annual / 12).toFixed(2),
    period: 'por ano', savings: 'Economize 32%', badge: 'ECONOMIZE 32%',
    features: ['Tudo do Trimestral', '12 meses de acesso', 'Acesso antecipado a recursos', 'Planilha personalizada', 'Curso de operações ao vivo'],
  },
];

function landingCheckoutUrl(planId: PlanId, email: string): string {
  const base =
    planId === 'monthly'   ? process.env.NEXT_PUBLIC_CAKTO_URL_MONTHLY   :
    planId === 'quarterly' ? process.env.NEXT_PUBLIC_CAKTO_URL_QUARTERLY :
                             process.env.NEXT_PUBLIC_CAKTO_URL_ANNUAL;
  if (!base) return '/pricing';
  try { const u = new URL(base); if (email) u.searchParams.set('email', email); return u.toString(); }
  catch { return base; }
}

// ─── Static data ──────────────────────────────────────────────────────────────

const BOOKMAKERS = [
  'Bet365','Pinnacle','Betfair','Sportingbet','Betano','Betsson',
  'KTO','Superbet','Betway','Stake','Bwin','1xBet',
  'Novibet','EstrelaBet','PixBet','Galera.bet','Betfast','Vbet',
];

const FEATURES = [
  { icon: Filter,    color: '#A78BFA', tag: 'exclusivo',  title: 'Extração de Freebet',   desc: 'Identifique os jogos com maior taxa de conversão de freebet em mais de 30 casas. Transforme bônus em saldo real com eficiência cirúrgica.' },
  { icon: TrendingUp,color: '#3FFF21', tag: 'tempo real', title: 'Analytics Avançado',    desc: 'ROI por bookmaker, evolução do saldo e win rate por esporte. Filtros por período para descobrir onde você ganha mais e onde está perdendo.' },
  { icon: Calculator,color: '#FFD600', tag: 'automático', title: 'Calculadora de Surebet',desc: 'Stakes precisas para operações de 2 e 3 outcomes com alocação automática. Lucro garantido, sem margem para erro humano.' },
  { icon: Wallet,    color: '#4DA6FF', tag: 'gestão',     title: 'Gestão de Bancas',      desc: 'Cadastre todas as suas casas de apostas, controle saldos, depósitos e saques em uma visão unificada. Chega de aba perdida em planilha.' },
  { icon: Users,     color: '#FF6B6B', tag: 'multi-conta',title: 'Controle de Clientes',  desc: 'Organize contas de terceiros com privacidade total. Saiba sempre quem está operando o quê, quanto rendeu e o status de cada conta.' },
  { icon: Upload,    color: '#4DA6FF', tag: '1 clique',   title: 'Importação Automática', desc: 'Conecte sua planilha da Green Surebet via Google Sheets. Sincronização contínua a cada 60 segundos, sem copiar, sem colar.' },
];

const WORKFLOW = [
  { n: '01', icon: Building2, title: 'Conecte suas casas',   desc: 'Adicione bancas, saldos iniciais e contas em segundos. Pré-configuramos 37+ casas para você.' },
  { n: '02', icon: Sparkles,  title: 'Encontre a operação',  desc: 'Use extração de freebet ou calculadora de surebet. O sistema entrega a melhor opção filtrada.' },
  { n: '03', icon: Activity,  title: 'Registre e acompanhe', desc: 'Importe planilhas ou registre manualmente. Acompanhe ROI, lucro e performance por casa em tempo real.' },
  { n: '04', icon: Trophy,    title: 'Cresça com dados',     desc: 'Relatórios em tempo real mostram onde está o lucro real. Pare de operar no escuro.' },
];

const FAQ = [
  { q: 'O sistema encontra surebets e freebets automaticamente?', a: 'O SureEdge é uma plataforma de gestão e analytics. Você registra suas operações e a plataforma analisa performance, calcula ROI e organiza seu histórico. A calculadora integrada distribui stakes automaticamente e a ferramenta de freebet identifica as melhores conversões em 30+ casas.' },
  { q: 'Posso importar minha planilha da Green Surebet?', a: 'Pode. Aceitamos importação via Google Sheets — incluindo a planilha da Green Surebet. Configure o link uma vez e o sistema sincroniza automaticamente a cada minuto, sem copiar e colar.' },
  { q: 'Como funciona a gestão de várias contas e CPFs?', a: 'Você cadastra clientes, vincula às casas de apostas e o sistema separa saldos, lucros e operações de cada um. Ideal para quem opera com terceiros.' },
  { q: 'Quantas casas de apostas são suportadas?', a: 'Mais de 37 casas pré-configuradas com logos e dados, incluindo Bet365, Betfair, Pinnacle, Betano, Sportingbet, KTO, Superbet e muitas outras. Você também pode adicionar casas personalizadas.' },
  { q: 'Preciso de conhecimento técnico para usar?', a: 'Não. Em menos de 5 minutos você cadastra sua primeira casa, registra uma operação e já vê seu dashboard com métricas em tempo real.' },
  { q: 'O pagamento é seguro? Tem garantia?', a: 'Sim. Utilizamos a Cakto para pagamentos com total segurança. Aceitamos PIX e cartão de crédito. Acesso liberado imediatamente após a confirmação do pagamento.' },
];

const FAQ_JSON_LD = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: FAQ.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
};

// ─── Surebet calculator logic ─────────────────────────────────────────────────

interface CalcRow { house: string; outcome: string; odd: number; }

function calcSurebet(rows: CalcRow[], total: number) {
  const implied = rows.map(r => 1 / r.odd);
  const sum     = implied.reduce((a, b) => a + b, 0);
  const stakes  = implied.map(p => Math.round(total * p / sum));
  const profit  = +(total * (1 / sum - 1)).toFixed(2);
  const roi     = +(profit / total * 100).toFixed(2);
  return { stakes, profit, roi };
}

// Each tuple: [odd_flamengo, odd_empate, odd_botafogo] — all valid surebets (sum implied < 1)
const ODD_SEQ: [number, number, number][] = [
  [1.86, 4.20, 4.50],
  [1.87, 4.20, 4.50],
  [1.87, 4.22, 4.50],
  [1.87, 4.22, 4.48],
  [1.88, 4.22, 4.48],
  [1.88, 4.24, 4.48],
  [1.87, 4.24, 4.50],
  [1.86, 4.24, 4.52],
  [1.86, 4.22, 4.52],
  [1.86, 4.20, 4.50],
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useCounter(target: number, duration = 2500, decimals = 0) {
  const [value, setValue] = useState(0);
  const spanRef  = useRef<HTMLSpanElement>(null);
  const started  = useRef(false);
  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - t0) / duration, 1);
          setValue(+(( 1 - Math.pow(1 - t, 3)) * target).toFixed(decimals));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration, decimals]);
  return { ref: spanRef, value };
}

function useReveal(delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        const go = () => el.classList.add('lp-revealed');
        delay > 0 ? setTimeout(go, delay) : go();
        obs.disconnect();
      }
    }, { threshold: 0.07, rootMargin: '-24px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);
  return ref;
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children, color = '#3FFF21' }: { children: React.ReactNode; color?: string }) {
  const rgb = color === '#3FFF21' ? '63,255,33' : color === '#A78BFA' ? '167,139,250' : '63,255,33';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      borderRadius: 999,
      border: `1px solid rgba(${rgb},.22)`,
      background: `rgba(${rgb},.07)`,
      padding: '6px 14px',
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
      color, marginBottom: 20,
    }}>
      <span className="lp-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'block' }} />
      {children}
    </div>
  );
}

// ─── Live Surebet Calculator ──────────────────────────────────────────────────

function LiveCalculator() {
  const [seqIdx,   setSeqIdx]   = useState(0);
  const [flashRow, setFlashRow] = useState<number | null>(null);
  const prevOdds   = useRef(ODD_SEQ[0]);

  const currentOdds = ODD_SEQ[seqIdx];
  const rows = useMemo<CalcRow[]>(() => [
    { house: 'Bet365', outcome: 'Flamengo', odd: currentOdds[0] },
    { house: 'Betano', outcome: 'Empate',   odd: currentOdds[1] },
    { house: 'KTO',    outcome: 'Botafogo', odd: currentOdds[2] },
  ], [currentOdds]);

  const { stakes, profit, roi } = calcSurebet(rows, 1000);

  useEffect(() => {
    const prev = prevOdds.current;
    const curr = ODD_SEQ[seqIdx];
    const changed = curr.findIndex((v, i) => v !== prev[i]);
    if (changed !== -1) {
      setFlashRow(changed);
      setTimeout(() => setFlashRow(null), 900);
    }
    prevOdds.current = curr;
  }, [seqIdx]);

  useEffect(() => {
    const id = setInterval(() => setSeqIdx(i => (i + 1) % ODD_SEQ.length), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      borderRadius: 18,
      border: '1px solid rgba(63,255,33,.18)',
      background: '#0D1117',
      overflow: 'hidden',
      boxShadow: '0 0 0 1px rgba(255,255,255,.04), 0 40px 80px -20px rgba(0,0,0,.85), 0 0 60px -20px rgba(63,255,33,.1)',
    }}>
      {/* Window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: '#161D27', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56', display: 'block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3FFF21', display: 'block' }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(63,255,33,.5)' }}>sureedge.app/calculadora</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 10 }}>
          <span className="lp-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#3FFF21', display: 'block' }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: '#3FFF21', letterSpacing: '0.1em' }}>LIVE</span>
        </div>
      </div>

      <div style={{ padding: '20px 20px 24px' }}>
        {/* Event header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(63,255,33,.65)', marginBottom: 6 }}>Calculadora Surebet</div>
          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 16, color: '#F0F4F8', letterSpacing: '-0.02em' }}>Flamengo × Botafogo</div>
          <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 12, color: '#6A7E8E', marginTop: 2 }}>Brasileirão Série A · 3 outcomes cobertos</div>
        </div>

        {/* Total row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', marginBottom: 10,
          background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10,
        }}>
          <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, color: '#6A7E8E' }}>Total a investir</span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: '#F0F4F8' }}>R$ 1.000</span>
        </div>

        {/* Outcome rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 52px 8px 64px',
              alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10,
              border: flashRow === i ? '1px solid rgba(63,255,33,.38)' : '1px solid rgba(255,255,255,.05)',
              background: flashRow === i ? 'rgba(63,255,33,.055)' : 'rgba(255,255,255,.018)',
              transition: 'background 0.45s ease, border-color 0.45s ease',
            }}>
              <div>
                <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 10, fontWeight: 700, color: '#4A5E6E', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{row.house}</div>
                <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, fontWeight: 600, color: '#F0F4F8', marginTop: 1 }}>{row.outcome}</div>
              </div>
              <div style={{
                fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, textAlign: 'right',
                color: flashRow === i ? '#3FFF21' : '#8899AA',
                transition: 'color 0.45s ease',
              }}>@{row.odd.toFixed(2)}</div>
              <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.06)', justifySelf: 'center' }} />
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#F0F4F8', textAlign: 'right' }}>
                R$ {stakes[i].toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </div>

        {/* Profit */}
        <div style={{
          padding: '14px 18px', borderRadius: 12,
          background: 'rgba(63,255,33,.055)', border: '1px solid rgba(63,255,33,.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(63,255,33,.65)' }}>Lucro garantido</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: 'rgba(63,255,33,.65)' }}>ROI {roi}%</span>
          </div>
          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 28, letterSpacing: '-0.03em', color: '#3FFF21', lineHeight: 1 }}>
            +R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 11, color: 'rgba(240,244,248,.28)', marginTop: 5 }}>
            Qualquer resultado retorna R$ {(1000 + profit).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Freebet table mockup ─────────────────────────────────────────────────────

const FB_ROWS = [
  { event: 'Flamengo × Botafogo', house: 'Novibet',    value: 50,  odd: 1.86, conv: 67.3, stake: 33,  isNew: true  },
  { event: 'Santos × Grêmio',     house: 'Betano',     value: 100, odd: 2.10, conv: 71.9, stake: 72,  isNew: false },
  { event: 'Inter × Atlético-MG', house: 'KTO',        value: 80,  odd: 1.95, conv: 67.7, stake: 54,  isNew: false },
  { event: 'Cruzeiro × Fla',      house: 'EstrelaBet', value: 200, odd: 2.40, conv: 77.9, stake: 156, isNew: false },
  { event: 'Cuiabá × Bragança',   house: 'Superbet',   value: 30,  odd: 2.00, conv: 70.0, stake: 21,  isNew: false },
];

function FreebetTable() {
  return (
    <div style={{ borderRadius: 18, border: '1px solid rgba(167,139,250,.18)', background: '#0D1117', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,.03), 0 30px 60px -15px rgba(0,0,0,.7)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', background: '#161D27', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <Filter size={13} color="#A78BFA" />
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#F0F4F8' }}>Melhores conversões agora</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="lp-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#A78BFA', display: 'block' }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: '#A78BFA', letterSpacing: '0.1em' }}>LIVE</span>
        </div>
      </div>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 62px 56px 58px 54px', padding: '7px 20px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
        {['Evento','Casa','Freebet','Odd','Conv.','Stake'].map(c => (
          <div key={c} style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#4A5E6E' }}>{c}</div>
        ))}
      </div>
      {/* Rows */}
      {FB_ROWS.map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 62px 56px 58px 54px',
          padding: '11px 20px', alignItems: 'center',
          borderBottom: i < FB_ROWS.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
          background: i === 0 ? 'rgba(167,139,250,.035)' : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, color: '#F0F4F8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.event}</span>
            {row.isNew && (
              <span className="lp-new-badge" style={{ fontFamily: 'JetBrains Mono', fontSize: 8, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: 'rgba(167,139,250,.15)', color: '#A78BFA', border: '1px solid rgba(167,139,250,.25)', flexShrink: 0, lineHeight: 1.5 }}>NOVO</span>
            )}
          </div>
          <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 12, color: '#6A7E8E' }}>{row.house}</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#F0F4F8' }}>R$ {row.value}</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#F0F4F8' }}>@{row.odd.toFixed(2)}</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#3FFF21' }}>{row.conv}%</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#6A7E8E' }}>R$ {row.stake}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Duplo Green Card ─────────────────────────────────────────────────────────

function DuploGreenCard() {
  const TL = [
    { min: "13'", score: '1×0', text: 'Pedro abriu o placar pro Flamengo',       event: null },
    { min: "26'", score: '2×0', text: 'Bruno Henrique fez o segundo. 2 gols de vantagem.', event: { text: '⚡ Pagamento antecipado · Novibet paga a aposta no Flamengo', type: 'g' as const } },
    { min: "38'", score: '2×1', text: 'Igor Jesus descontou pro Botafogo',        event: null },
    { min: "49'", score: '2×2', text: 'Almada empatou',                           event: null },
    { min: "53'", score: '2×3', text: 'Savarino virou pro Botafogo (pênalti)',    event: null },
    { min: "74'", score: '2×4', text: 'Tiquinho fechou. Botafogo abriu 2 gols.',  event: { text: '⚡ Pagamento antecipado · Estrela Bet paga a aposta no Botafogo', type: 'o' as const } },
  ];

  return (
    <div style={{ borderRadius: 20, border: '2px solid rgba(63,255,33,.28)', background: '#161D27', padding: '28px 32px', boxShadow: '0 0 0 1px rgba(255,255,255,.04), 0 40px 100px -20px rgba(0,0,0,.8), 0 0 80px -20px rgba(63,255,33,.12)', maxWidth: 740, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.07)', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#3FFF21', background: 'rgba(63,255,33,.1)', padding: '4px 10px', borderRadius: 6 }}>Brasileirão Série A</div>
          <div>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#F0F4F8' }}>Flamengo × Botafogo</div>
            <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 12, color: '#6A7E8E', marginTop: 2 }}>Caso real do Duplo Green · placar final: 2 × 4</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.2)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#3FFF21" viewBox="0 0 256 256">
            <path d="M111.49,52.63a15.8,15.8,0,0,0-26,5.77L33,202.78A15.83,15.83,0,0,0,47.76,224a16,16,0,0,0,5.46-1l144.37-52.5a15.8,15.8,0,0,0,5.78-26ZM65.14,161.13l19.2-52.79,63.32,63.32-52.8,19.2ZM160,72a37.8,37.8,0,0,1,3.84-15.58C169.14,45.83,179.14,40,192,40c6.7,0,11-2.29,13.65-7.21A22,22,0,0,0,208,23.94,8,8,0,0,1,224,24c0,12.86-8.52,32-32,32-6.7,0-11,2.29-13.65,7.21A22,22,0,0,0,176,72.06,8,8,0,0,1,160,72ZM136,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm101.66,82.34a8,8,0,1,1-11.32,11.31l-16-16a8,8,0,0,1,11.32-11.32Zm4.87-42.75-24,8a8,8,0,0,1-5.06-15.18l24-8a8,8,0,0,1,5.06,15.18Z"/>
          </svg>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3FFF21' }}>Duplo green</span>
        </div>
      </div>

      {/* Pre-game box */}
      <div style={{ background: '#0D1117', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#FF8F3D', marginBottom: 10 }}>Antes do jogo · Duplo Green detectou</div>
        <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, color: '#8899AA', lineHeight: 1.7, marginBottom: 14 }}>
          Surebet pré-jogo cobrindo os 3 resultados, em casas que pagam antecipado se um time abrir 2 gols. <strong style={{ color: '#F0F4F8' }}>ROI calculado de 0,20%</strong>. Parece pouco — mas se rolar duplo green, o retorno multiplica.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { house: 'Novibet',    outcome: 'Flamengo', odd: '1,86', stake: 'R$ 538' },
            { house: 'Estrela Bet',outcome: 'Empate',   odd: '4,20', stake: 'R$ 239' },
            { house: 'Estrela Bet',outcome: 'Botafogo', odd: '4,50', stake: 'R$ 223' },
          ].map((r, i) => (
            <div key={i} style={{ border: '1px solid rgba(255,255,255,.06)', background: '#161D27', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#4A5E6E', marginBottom: 4 }}>{r.house}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
                <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 12, fontWeight: 600, color: '#F0F4F8' }}>{r.outcome}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#6A7E8E' }}>@{r.odd}</span>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#FF8F3D', marginTop: 4 }}>{r.stake}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 22 }}>
        {TL.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: i < TL.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0, width: 82 }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: '#4A5E6E' }}>{t.min}</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 900, color: '#F0F4F8' }}>{t.score}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, color: '#8899AA', lineHeight: 1.5 }}>{t.text}</div>
              {t.event && (
                <div style={{
                  marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'Figtree, sans-serif', fontSize: 11, fontWeight: 700,
                  padding: '4px 10px', borderRadius: 6,
                  background: t.event.type === 'g' ? 'rgba(63,255,33,.1)' : 'rgba(255,143,61,.1)',
                  color: t.event.type === 'g' ? '#3FFF21' : '#FF8F3D',
                  border: `1px solid ${t.event.type === 'g' ? 'rgba(63,255,33,.22)' : 'rgba(255,143,61,.22)'}`,
                }}>{t.event.text}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Result */}
      <div style={{ borderRadius: 14, background: 'rgba(63,255,33,.05)', border: '1px solid rgba(63,255,33,.18)', padding: '20px 24px', marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, textAlign: 'center' }}>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4A5E6E', marginBottom: 6 }}>Apostou</div>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20, color: '#F0F4F8', letterSpacing: '-0.02em' }}>R$ 1.000</div>
          </div>
          <div style={{ borderLeft: '1px solid rgba(255,255,255,.06)', borderRight: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4A5E6E', marginBottom: 6 }}>Recebeu (2 lados)</div>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20, color: '#F0F4F8', letterSpacing: '-0.02em' }}>R$ 2.005</div>
          </div>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3FFF21', marginBottom: 6 }}>Lucro</div>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 32, color: '#3FFF21', letterSpacing: '-0.03em', lineHeight: 1 }}>+R$ 1.005</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: 'rgba(63,255,33,.65)', marginTop: 4 }}>ROI 100,5%</div>
          </div>
        </div>
      </div>

      <p style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, color: '#4A5E6E', lineHeight: 1.75, textAlign: 'center', maxWidth: '54ch', margin: '0 auto' }}>
        Sem o duplo green, o retorno calculado seria <strong style={{ color: '#6A7E8E' }}>R$ 2,00</strong> (0,20%). Com pagamento antecipado dos dois lados, virou <strong style={{ color: '#3FFF21' }}>R$ 1.005,00</strong> no mesmo jogo. <strong style={{ color: '#F0F4F8' }}>~500× mais.</strong>
      </p>
    </div>
  );
}

// ─── Main landing page ────────────────────────────────────────────────────────

export function LandingPage() {
  const [email,    setEmail]    = useState('');
  const [openFaq,  setOpenFaq]  = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);

  const ops    = useCounter(2847, 2200);
  const lucro  = useCounter(1243890, 2500);
  const casas  = useCounter(37, 1400);
  const acerto = useCounter(94.2, 2000, 1);

  // Reveal refs
  const rStrip    = useReveal();
  const rFreebet  = useReveal();
  const rDG       = useReveal();
  const rFeatures = useReveal();
  const rWorkflow = useReveal();
  const rPricing  = useReveal();
  const rFaq      = useReveal();
  const rCta      = useReveal();

  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => { if (data.user?.email) setEmail(data.user.email); });
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Meta Pixel carregado via layout.tsx no <head> estático

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = async () => { await getSupabaseClient().auth.signOut(); window.location.href = '/login'; };

  const s = {
    root: { background: '#030507', color: '#F0F4F8', minHeight: '100vh', overflowX: 'hidden' as const, fontFamily: 'Figtree, system-ui, sans-serif' },
    h: (sz: string) => ({ fontFamily: 'Manrope, sans-serif', fontWeight: 900 as const, fontSize: sz as unknown as number, letterSpacing: '-0.03em', lineHeight: 1.05 }),
    mono: (sz: number) => ({ fontFamily: 'JetBrains Mono, monospace', fontSize: sz }),
    sub: { fontFamily: 'Figtree, sans-serif', fontSize: 17, lineHeight: 1.7, color: 'rgba(240,244,248,.5)' },
  };

  return (
    <div style={s.root}>

      {/* ══════════ NAV ══════════ */}
      <nav style={{
        position: 'fixed', inset: '0 0 auto 0', zIndex: 100, height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px',
        background: scrolled ? 'rgba(3,5,7,.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : '1px solid transparent',
        transition: 'background .3s, border-color .3s',
      }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(63,255,33,.35)' }}>
            <Zap size={17} color="#030507" strokeWidth={2.8} />
          </div>
          <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 17, letterSpacing: '-0.025em', color: '#F0F4F8' }}>SureEdge</span>
        </a>

        <div className="hidden lg:flex" style={{ alignItems: 'center', gap: 28 }}>
          {[['Recursos','#recursos'],['Como funciona','#como-funciona'],['Planos','#planos'],['FAQ','#faq']].map(([label, href]) => (
            <a key={href} href={href} style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(240,244,248,.45)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.45)')}>
              {label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {email ? (
            <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Figtree, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(240,244,248,.45)', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
              <LogOut size={12} /> Sair
            </button>
          ) : (
            <a href="/login" style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(240,244,248,.45)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.45)')}>
              Entrar
            </a>
          )}
          <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#3FFF21', color: '#030507', borderRadius: 999, padding: '9px 20px', fontSize: 13, fontWeight: 700, fontFamily: 'Figtree, sans-serif', textDecoration: 'none', transition: 'transform .2s, box-shadow .2s' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 0 28px rgba(63,255,33,.5)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = 'none'; }}>
            Começar <ArrowRight size={13} />
          </a>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '140px 24px 100px' }}>
        {/* Subtle grid */}
        <div className="lp-bg-grid" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6 }} />
        {/* Radial glow */}
        <div style={{ position: 'absolute', left: '30%', top: 0, width: 800, height: 500, background: 'radial-gradient(ellipse at top, rgba(63,255,33,.12), transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }} className="lp-hero-grid">

          {/* Left: text */}
          <div>
            <div className="lp-fade-in lp-d1">
              <SectionLabel>Plataforma de Trading Esportivo</SectionLabel>
            </div>

            <h1 className="lp-fade-in lp-d2" style={{ ...s.h('clamp(40px,4.8vw,68px)'), color: '#F0F4F8', marginBottom: 24 }}>
              O mercado{' '}
              <span style={{ color: '#3FFF21' }}>se move rápido.</span>
              <br />Você ainda mais.
            </h1>

            <p className="lp-fade-in lp-d3" style={{ ...s.sub, maxWidth: '48ch', marginBottom: 40 }}>
              Encontre surebets, extraia freebets e gerencie bancas varrendo{' '}
              <span style={{ fontWeight: 600, color: 'rgba(240,244,248,.8)' }}>30+ casas em tempo real</span>.
              Organize operações e contas num único painel feito para quem vive de odds.
            </p>

            <div className="lp-fade-in lp-d4" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 40 }}>
              <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#3FFF21', color: '#030507', borderRadius: 999, padding: '14px 32px', fontSize: 15, fontWeight: 700, fontFamily: 'Figtree, sans-serif', textDecoration: 'none', transition: 'transform .2s, box-shadow .2s', boxShadow: '0 8px 32px -8px rgba(63,255,33,.55)' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 12px 44px -8px rgba(63,255,33,.8)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = '0 8px 32px -8px rgba(63,255,33,.55)'; }}>
                Começar agora <ArrowRight size={16} />
              </a>
              <a href="#recursos" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)', color: 'rgba(240,244,248,.7)', borderRadius: 999, padding: '14px 28px', fontSize: 15, fontWeight: 600, fontFamily: 'Figtree, sans-serif', textDecoration: 'none', transition: 'background .2s, border-color .2s' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,.06)'; el.style.borderColor = 'rgba(255,255,255,.2)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,.03)'; el.style.borderColor = 'rgba(255,255,255,.1)'; }}>
                Ver recursos
              </a>
            </div>

            <div className="lp-fade-in lp-d5" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex' }}>
                {[0,1,2,3,4].map(i => <Star key={i} size={13} color="#3FFF21" fill="#3FFF21" />)}
              </div>
              <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.35)' }}>4.9 — usado por traders profissionais em todo o Brasil</span>
            </div>
          </div>

          {/* Right: calculator */}
          <div className="lp-fade-in lp-d6 lp-hero-calc">
            <LiveCalculator />
          </div>
        </div>
      </section>

      {/* ══════════ MARQUEE ══════════ */}
      <section style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)', padding: '32px 0' }}>
        <div style={{ marginBottom: 14, textAlign: 'center' }}>
          <p style={{ fontFamily: 'Figtree, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(240,244,248,.22)' }}>Integrado com as principais casas do mercado</p>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
          <div style={{ display: 'flex', animation: 'lp-marquee 36s linear infinite', width: 'max-content' }}>
            {[...BOOKMAKERS, ...BOOKMAKERS].map((b, i) => (
              <span key={i} style={{ fontFamily: 'Manrope, sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: 'rgba(240,244,248,.22)', paddingRight: 48, whiteSpace: 'nowrap', transition: 'color .2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.22)')}>
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ STATS ══════════ */}
      <div ref={rStrip} className="lp-reveal" style={{ padding: '60px 24px', background: 'rgba(255,255,255,.015)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 32 }} className="md:grid-cols-4">
          {[
            { ref: ops.ref,    v: ops.value.toLocaleString('pt-BR'),                        label: 'Operações registradas'   },
            { ref: lucro.ref,  v: 'R$ ' + Math.round(lucro.value).toLocaleString('pt-BR'),  label: 'Lucro gerado por traders' },
            { ref: casas.ref,  v: casas.value + '+',                                         label: 'Casas monitoradas'        },
            { ref: acerto.ref, v: acerto.value.toFixed(1) + '%',                             label: 'Taxa de acerto média'     },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 'clamp(26px,3vw,40px)', fontWeight: 900, letterSpacing: '-0.025em', color: '#3FFF21' }}>
                <span ref={stat.ref}>{stat.v}</span>
              </div>
              <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.18em', color: 'rgba(240,244,248,.3)', marginTop: 8 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ FREEBET SECTION ══════════ */}
      <section ref={rFreebet} className="lp-reveal" style={{ padding: '100px 24px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }} className="lp-split-grid">
            <div>
              <SectionLabel color="#A78BFA">Exclusivo</SectionLabel>
              <h2 style={{ ...s.h('clamp(28px,3.2vw,46px)'), color: '#F0F4F8', marginBottom: 20 }}>
                Extração de freebet que{' '}
                <span style={{ color: '#A78BFA' }}>paga sozinha</span>{' '}
                a mensalidade.
              </h2>
              <p style={{ ...s.sub, maxWidth: '44ch', marginBottom: 32 }}>
                Ferramenta proprietária que identifica os jogos com maior taxa de conversão em tempo real. Transforme bônus em saldo real com eficiência cirúrgica.
              </p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Identificação automática das melhores conversões',
                  'Filtros por mercado, esporte, casa e valor mínimo',
                  'Cálculo de stake e ROI já feito para você',
                  'Alertas quando aparece oportunidade',
                ].map(t => (
                  <li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(167,139,250,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Check size={11} color="#A78BFA" strokeWidth={3} />
                    </div>
                    <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 15, color: 'rgba(240,244,248,.7)', lineHeight: 1.6 }}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <FreebetTable />
          </div>
        </div>
      </section>

      {/* ══════════ DUPLO GREEN ══════════ */}
      <section ref={rDG} className="lp-reveal" id="duplo-green" style={{ padding: '100px 24px', background: 'rgba(63,255,33,.018)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionLabel>Caso real</SectionLabel>
            <h2 style={{ ...s.h('clamp(28px,3.2vw,48px)'), color: '#F0F4F8', marginBottom: 16 }}>
              Duplo green:{' '}
              <span style={{ color: '#3FFF21' }}>0,20% que virou 100,5%.</span>
            </h2>
            <p style={{ ...s.sub, maxWidth: '52ch', margin: '0 auto' }}>
              Veja exatamente como a operação aconteceu, jogo a jogo, gol a gol. Nada inventado.
            </p>
          </div>
          <DuploGreenCard />
        </div>
      </section>

      {/* ══════════ FEATURES ══════════ */}
      <section ref={rFeatures} className="lp-reveal" id="recursos" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <SectionLabel>Ferramentas</SectionLabel>
            <h2 style={{ ...s.h('clamp(28px,3.5vw,50px)'), color: '#F0F4F8', marginBottom: 16 }}>
              Tudo que um trader sério precisa
              <br /><span style={{ color: '#3FFF21' }}>numa única plataforma.</span>
            </h2>
            <p style={{ ...s.sub, maxWidth: '50ch', margin: '0 auto' }}>
              Surebet, freebet, gestão de bancas e múltiplas contas. Pare de pular entre planilhas, sites e abas do navegador.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.02)', padding: 28, transition: 'border-color .25s, transform .25s', cursor: 'default' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${f.color}44`; el.style.transform = 'translateY(-3px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,.07)'; el.style.transform = 'translateY(0)'; }}>
                <div style={{ position: 'absolute', right: 0, top: 0, width: 100, height: 100, transform: 'translate(50%,-50%)', borderRadius: '50%', background: `${f.color}14`, filter: 'blur(28px)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, border: `1px solid ${f.color}28`, background: `${f.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                    <f.icon size={21} color={f.color} />
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.2em', color: `${f.color}aa`, marginBottom: 8 }}>{f.tag}</div>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', marginBottom: 10, color: '#F0F4F8' }}>{f.title}</h3>
                  <p style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, lineHeight: 1.75, color: 'rgba(240,244,248,.45)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ WORKFLOW ══════════ */}
      <section ref={rWorkflow} className="lp-reveal" id="como-funciona" style={{ padding: '100px 24px', background: 'rgba(255,255,255,.015)', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 72 }}>
            <SectionLabel>Como funciona</SectionLabel>
            <h2 style={{ ...s.h('clamp(28px,3.5vw,50px)'), color: '#F0F4F8' }}>
              Em 4 passos você está{' '}
              <span style={{ color: '#3FFF21' }}>operando lucro real.</span>
            </h2>
          </div>
          <div style={{ position: 'relative' }}>
            <div className="hidden lg:block" style={{ position: 'absolute', left: 0, right: 0, top: 48, height: 1, background: 'linear-gradient(90deg, transparent, rgba(63,255,33,.25), transparent)', pointerEvents: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 24 }}>
              {WORKFLOW.map(w => (
                <div key={w.n} style={{ position: 'relative' }}>
                  <div style={{ position: 'relative', zIndex: 1, width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: 20, border: '1px solid rgba(63,255,33,.2)', background: '#161D27', boxShadow: '0 1px 0 rgba(255,255,255,.04) inset' }}>
                    <w.icon size={26} color="#3FFF21" />
                    <span style={{ position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: '50%', background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 900, color: '#030507' }}>{w.n}</span>
                  </div>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 8, color: '#F0F4F8' }}>{w.title}</h3>
                  <p style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, color: 'rgba(240,244,248,.4)', lineHeight: 1.7 }}>{w.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ PRICING ══════════ */}
      <section ref={rPricing} className="lp-reveal" id="planos" style={{ padding: '100px 24px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <SectionLabel>Planos</SectionLabel>
            <h2 style={{ ...s.h('clamp(28px,3.5vw,50px)'), color: '#F0F4F8', marginBottom: 14 }}>
              Investimento que{' '}
              <span style={{ color: '#3FFF21' }}>se paga na primeira semana.</span>
            </h2>
            <p style={{ fontFamily: 'Figtree, sans-serif', fontSize: 16, color: 'rgba(240,244,248,.4)', lineHeight: 1.65, maxWidth: '40ch', margin: '0 auto' }}>
              Comece em poucos minutos. Cancele quando quiser. Garantia de 7 dias.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
            {LANDING_PLANS.map(plan => {
              const isFeatured = plan.id === 'quarterly';
              const url = landingCheckoutUrl(plan.id, email);
              return (
                <div key={plan.id} style={{ position: 'relative', borderRadius: 22, padding: 30, border: isFeatured ? '1.5px solid rgba(63,255,33,.38)' : '1px solid rgba(255,255,255,.07)', background: isFeatured ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.02)', boxShadow: isFeatured ? '0 24px 64px -20px rgba(63,255,33,.25)' : 'none', display: 'flex', flexDirection: 'column', transition: 'transform .25s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                  {plan.badge && (
                    <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#3FFF21', borderRadius: 999, padding: '4px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#030507', whiteSpace: 'nowrap' }}>{plan.badge}</div>
                  )}
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em', color: '#F0F4F8', marginBottom: 18 }}>{plan.label}</h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 46, letterSpacing: '-0.03em', color: '#F0F4F8', lineHeight: 1 }}>R$ {plan.price.toLocaleString('pt-BR')}</span>
                    <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.3)' }}>/{plan.period.replace('por ','')}</span>
                  </div>
                  {plan.id !== 'monthly' && <div style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.4)', marginBottom: 6 }}>R$ {plan.perMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</div>}
                  {plan.savings && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 22, padding: '3px 10px', borderRadius: 6, background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.2)', fontFamily: 'Figtree, sans-serif', fontSize: 12, fontWeight: 700, color: '#3FFF21' }}><TrendingUp size={10} /> {plan.savings}</div>}
                  {!plan.savings && <div style={{ marginBottom: 22 }} />}
                  <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, marginBottom: 22 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <Check size={15} color="#3FFF21" style={{ flexShrink: 0, marginTop: 3 }} strokeWidth={2.5} />
                        <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14, color: 'rgba(240,244,248,.7)' }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
                    {[{ Icon: QrCode, label: 'PIX' }, { Icon: CreditCard, label: 'Cartão' }].map(({ Icon, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, background: 'rgba(255,255,255,.04)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: 'rgba(240,244,248,.35)' }}>
                        <Icon size={9} /> {label}
                      </div>
                    ))}
                  </div>
                  <a href={url} target={url.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '13px 20px', borderRadius: 999, fontFamily: 'Figtree, sans-serif', fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'transform .2s, box-shadow .2s', ...(isFeatured ? { background: '#3FFF21', color: '#030507', boxShadow: '0 8px 24px -8px rgba(63,255,33,.55)' } : { background: 'rgba(255,255,255,.05)', color: '#F0F4F8', border: '1px solid rgba(255,255,255,.09)' }) }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.02)'; if (!isFeatured) { el.style.background = 'rgba(63,255,33,.08)'; el.style.borderColor = 'rgba(63,255,33,.25)'; } }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; if (!isFeatured) { el.style.background = 'rgba(255,255,255,.05)'; el.style.borderColor = 'rgba(255,255,255,.09)'; } }}>
                    <Zap size={13} /> ASSINAR AGORA
                  </a>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 32, flexWrap: 'wrap' }}>
            {[{ icon: <Shield size={13} />, text: 'Pagamento seguro via Cakto' }, { icon: <Zap size={13} />, text: 'Acesso imediato após pagamento' }, { icon: <TrendingUp size={13} />, text: 'Cancele quando quiser' }].map(item => (
              <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Figtree, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.3)' }}>{item.icon} {item.text}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section ref={rFaq} className="lp-reveal" id="faq" style={{ padding: '100px 24px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <SectionLabel>Dúvidas</SectionLabel>
            <h2 style={{ ...s.h('clamp(26px,3vw,44px)'), color: '#F0F4F8' }}>Perguntas frequentes</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ overflow: 'hidden', borderRadius: 14, border: openFaq === i ? '1px solid rgba(63,255,33,.28)' : '1px solid rgba(255,255,255,.07)', background: openFaq === i ? 'rgba(63,255,33,.035)' : 'rgba(255,255,255,.02)', transition: 'border-color .2s, background .2s' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 22px', background: 'none', border: 'none', color: '#F0F4F8', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{item.q}</span>
                  <ChevronDown size={18} color="#3FFF21" style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform .3s cubic-bezier(0.22,1,0.36,1)' }} />
                </button>
                <div style={{ maxHeight: openFaq === i ? '360px' : 0, overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.22,1,0.36,1)' }}>
                  <p style={{ padding: '0 22px 18px', fontFamily: 'Figtree, sans-serif', fontSize: 14, lineHeight: 1.8, color: 'rgba(240,244,248,.45)' }}>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CTA FINAL ══════════ */}
      <section ref={rCta} className="lp-reveal" style={{ position: 'relative', overflow: 'hidden', padding: '100px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div className="lp-bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.4, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 700, height: 350, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'rgba(63,255,33,.1)', filter: 'blur(70px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto' }}>
          <h2 style={{ ...s.h('clamp(36px,5vw,64px)'), color: '#F0F4F8', marginBottom: 20 }}>
            Pare de operar no escuro.<br />
            <span style={{ color: '#3FFF21' }}>Comece hoje.</span>
          </h2>
          <p style={{ fontFamily: 'Figtree, sans-serif', fontSize: 17, color: 'rgba(240,244,248,.45)', lineHeight: 1.65, marginBottom: 40 }}>
            Junte-se aos traders que transformaram apostas em uma operação séria, organizada e lucrativa.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
            <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#3FFF21', color: '#030507', borderRadius: 999, padding: '16px 44px', fontSize: 16, fontWeight: 700, fontFamily: 'Figtree, sans-serif', textDecoration: 'none', boxShadow: '0 8px 32px -8px rgba(63,255,33,.65)', transition: 'transform .2s, box-shadow .2s' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 14px 48px -8px rgba(63,255,33,.9)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = '0 8px 32px -8px rgba(63,255,33,.65)'; }}>
              Garantir meu acesso <ArrowRight size={17} />
            </a>
            <span style={{ fontFamily: 'Figtree, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.28)' }}>Garantia incondicional de 7 dias</span>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.05)', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={13} color="#030507" strokeWidth={2.8} />
            </div>
            <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 15, letterSpacing: '-0.02em', color: '#F0F4F8' }}>SureEdge</span>
          </div>
          <p style={{ fontFamily: 'Figtree, sans-serif', color: 'rgba(240,244,248,.22)', fontSize: 12 }}>
            © {new Date().getFullYear()} SureEdge. Trading esportivo, organizado.
          </p>
          <div style={{ display: 'flex', gap: 22 }}>
            {['Termos','Privacidade','Suporte','Login'].map(l => (
              <a key={l} href={l === 'Login' ? '/login' : '#'} style={{ fontFamily: 'Figtree, sans-serif', color: 'rgba(240,244,248,.22)', fontSize: 12, textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.22)')}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* ══════════ STYLES ══════════ */}
      <style>{`
        /* Background grid */
        .lp-bg-grid {
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent 80%);
        }

        /* Pulse dot */
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.45; transform: scale(0.8); }
        }
        .lp-pulse-dot { animation: lp-pulse 1.8s ease-in-out infinite; }

        /* New badge pulse */
        @keyframes lp-new-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
        .lp-new-badge { animation: lp-new-pulse 2s ease-in-out infinite; }

        /* Hero fade-in stagger */
        @keyframes lp-fade-up {
          from { opacity: 0; transform: translateY(22px); filter: blur(5px); }
          to   { opacity: 1; transform: none; filter: blur(0); }
        }
        .lp-fade-in { animation: lp-fade-up 0.75s cubic-bezier(0.22,1,0.36,1) both; }
        .lp-d1 { animation-delay: 0ms; }
        .lp-d2 { animation-delay: 70ms; }
        .lp-d3 { animation-delay: 140ms; }
        .lp-d4 { animation-delay: 210ms; }
        .lp-d5 { animation-delay: 280ms; }
        .lp-d6 { animation-delay: 420ms; }

        /* Scroll reveal */
        .lp-reveal {
          opacity: 0;
          transform: translateY(18px);
          filter: blur(3px);
          transition:
            opacity 0.75s cubic-bezier(0.22,1,0.36,1),
            transform 0.75s cubic-bezier(0.22,1,0.36,1),
            filter 0.75s cubic-bezier(0.22,1,0.36,1);
        }
        .lp-reveal.lp-revealed {
          opacity: 1;
          transform: none;
          filter: blur(0);
        }

        /* Bookmaker marquee */
        @keyframes lp-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* Hero: 2-col on desktop, stacked on mobile */
        .lp-hero-grid {
          grid-template-columns: 1fr 1fr;
          gap: 64px;
        }
        @media (max-width: 900px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .lp-hero-calc { max-width: 520px; }
        }

        /* Split section: text + mockup */
        .lp-split-grid {
          grid-template-columns: 1fr 1fr;
          gap: 64px;
        }
        @media (max-width: 900px) {
          .lp-split-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>

      {/* FAQ structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
    </div>
  );
}
