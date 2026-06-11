'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { PLAN_PRICES, PLAN_LABELS, type PlanId } from '@/lib/supabase/subscription';
import {
  Zap, TrendingUp, Shield,
  Upload, ChevronDown, Check, ArrowRight,
  LogOut, QrCode, CreditCard, Wallet,
  Users, Star, Filter, Activity,
  Building2, Sparkles, Trophy, X, AlertTriangle, Search,
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
    features: [
      'Dashboard completo de operações',
      'Operações ilimitadas',
      'Calculadora de surebet com stake automático',
      'Buscador de odds em 30+ casas',
      'Extração de freebet',
      'Importação Google Sheets',
      'Gestão de bancas e saldos',
      'Suporte por e-mail',
    ],
  },
  {
    id: 'quarterly', label: 'Trimestral',
    price: PLAN_PRICES.quarterly, perMonth: +(PLAN_PRICES.quarterly / 3).toFixed(2),
    period: 'por trimestre', savings: 'Economize 15%', badge: 'MAIS POPULAR',
    features: [
      'Tudo do Mensal',
      'Extração de freebet avançada com alertas',
      'Controle de clientes e contas',
      'Relatórios detalhados de ROI',
      'Organização de surebets por casa',
      'Suporte prioritário',
      'Economize 15% vs mensal',
    ],
  },
  {
    id: 'annual', label: 'Anual',
    price: PLAN_PRICES.annual, perMonth: +(PLAN_PRICES.annual / 12).toFixed(2),
    period: 'por ano', savings: 'Economize 32%', badge: 'ECONOMIZE 32%',
    features: [
      'Tudo do Trimestral',
      '12 meses de acesso completo',
      'Acesso antecipado a novos recursos',
      'Planilha personalizada inclusa',
      'Curso de operações ao vivo',
      'Suporte VIP direto no WhatsApp',
      'Economize 32% vs mensal',
    ],
  },
];

const UTM_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid'];

function landingCheckoutUrl(planId: PlanId, email: string): string {
  const base =
    planId === 'monthly'   ? process.env.NEXT_PUBLIC_CAKTO_URL_MONTHLY   :
    planId === 'quarterly' ? process.env.NEXT_PUBLIC_CAKTO_URL_QUARTERLY :
                             process.env.NEXT_PUBLIC_CAKTO_URL_ANNUAL;
  if (!base) return '/pricing';
  try {
    const u = new URL(base);
    if (email) u.searchParams.set('email', email);
    // Repassa UTMs e fbclid da URL atual para o checkout
    if (typeof window !== 'undefined') {
      const pageParams = new URLSearchParams(window.location.search);
      UTM_PARAMS.forEach(p => {
        const v = pageParams.get(p);
        if (v) u.searchParams.set(p, v);
      });
    }
    return u.toString();
  }
  catch { return base; }
}

// ─── Static data ──────────────────────────────────────────────────────────────

const BOOKMAKERS = [
  'Bet365','Pinnacle','Betfair','Sportingbet','Betano','Betsson',
  'KTO','Superbet','Betway','Stake','Bwin','1xBet',
  'Novibet','EstrelaBet','PixBet','Galera.bet','Betfast','Vbet',
];

const FEATURES = [
  { icon: Search,    color: '#FFD600', tag: '30+ casas',  title: 'Buscador de Odds',      desc: 'Compare odds em 30+ casas ao mesmo tempo numa única tela. Encontre a melhor linha sem abrir aba por aba. Atualizado em tempo real.' },
  { icon: Filter,    color: '#A78BFA', tag: 'exclusivo',  title: 'Extração de Freebet',   desc: 'Identifique os jogos com maior taxa de conversão de freebet em mais de 30 casas. Transforme bônus em saldo real com eficiência cirúrgica.' },
  { icon: TrendingUp,color: '#3FFF21', tag: 'tempo real', title: 'Analytics Avançado',    desc: 'ROI por bookmaker, evolução do saldo e win rate por esporte. Filtros por período para descobrir onde você ganha mais e onde está perdendo.' },
  { icon: Wallet,    color: '#4DA6FF', tag: 'gestão',     title: 'Gestão de Bancas',      desc: 'Cadastre todas as suas casas de apostas, controle saldos, depósitos e saques em uma visão unificada. Chega de aba perdida em planilha.' },
  { icon: Users,     color: '#FF6B6B', tag: 'multi-conta',title: 'Controle de Clientes',  desc: 'Organize contas de terceiros com privacidade total. Saiba sempre quem está operando o quê, quanto rendeu e o status de cada conta.' },
  { icon: Upload,    color: '#4DA6FF', tag: '1 clique',   title: 'Importação Automática', desc: 'Conecte sua planilha da Green Surebet via Google Sheets. Sincronização contínua a cada 60 segundos, sem copiar, sem colar.' },
  { icon: Activity,  color: '#3FFF21', tag: 'organização',title: 'Organização de Surebets', desc: 'Registre cada operação em segundos. Histórico completo por casa, esporte e período. Saiba exatamente de onde vem cada centavo.' },
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

const TESTIMONIALS = [
  {
    name: 'Everton M.', role: 'Trader desde 2023', city: 'São Paulo',
    text: 'Antes usava planilha e não sabia qual casa estava me dando prejuízo. Com o SureEdge descobri em 3 dias que estava perdendo 18% numa casa específica. Tirei ela e meu lucro subiu.',
    highlight: '+18% de lucro recuperado', stars: 5,
  },
  {
    name: 'Lucas R.', role: 'Opera com 3 CPFs', city: 'Rio de Janeiro',
    text: 'Controlar clientes é outra história aqui. Cada um tem saldo separado, lucro separado. Acabou a confusão. Hoje gerencio 3 contas sem misturar nada.',
    highlight: '3 contas organizadas', stars: 5,
  },
  {
    name: 'Rodrigo S.', role: 'Surebet profissional', city: 'Belo Horizonte',
    text: 'A ferramenta de freebet se pagou na primeira semana. Peguei R$340 de freebet num único dia usando os filtros. É impossível fazer isso na mão.',
    highlight: 'R$340 em 1 dia de freebet', stars: 5,
  },
  {
    name: 'Marcos T.', role: 'Iniciante em surebets', city: 'Curitiba',
    text: 'Faz 2 semanas que uso. A calculadora de stakes me salva toda hora — antes eu calculava no papel e errava. Agora é automático.',
    highlight: 'Zero erro de stake', stars: 5,
  },
  {
    name: 'Felipe A.', role: 'Opera em 5 casas', city: 'Porto Alegre',
    text: 'O buscador de odds em 30 casas ao mesmo tempo é absurdo. Antes eu ficava abrindo aba por aba. Agora vejo tudo numa tela só.',
    highlight: '30 casas numa tela só', stars: 5,
  },
  {
    name: 'Bruno C.', role: 'Trader há 8 meses', city: 'Recife',
    text: 'Tentei usar planilha por 3 meses e desisti. Tava perdendo mais tempo organizando do que operando. Com o SureEdge registro em 30 segundos e sigo.',
    highlight: 'Registro em 30 segundos', stars: 5,
  },
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
    }, { threshold: 0.07, rootMargin: '-20px 0px' });
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
      borderRadius: 999, border: `1px solid rgba(${rgb},.22)`,
      background: `rgba(${rgb},.07)`, padding: '6px 14px',
      fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
      fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
      color, marginBottom: 20,
    }}>
      <span className="lp-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'block' }} />
      {children}
    </div>
  );
}

// ─── Freebet table mockup ─────────────────────────────────────────────────────

const FB_ROWS = [
  { event: 'Flamengo × Botafogo', house: 'Novibet',    value: 50,  odd: 1.86, conv: 67.3, stake: 33,  lucro: 17,  isNew: true  },
  { event: 'Santos × Grêmio',     house: 'Betano',     value: 100, odd: 2.10, conv: 71.9, stake: 72,  lucro: 28,  isNew: false },
  { event: 'Inter × Atlético-MG', house: 'KTO',        value: 80,  odd: 1.95, conv: 67.7, stake: 54,  lucro: 26,  isNew: false },
  { event: 'Cruzeiro × Fla',      house: 'EstrelaBet', value: 200, odd: 2.40, conv: 77.9, stake: 156, lucro: 56,  isNew: false },
  { event: 'Cuiabá × Bragança',   house: 'Superbet',   value: 30,  odd: 2.00, conv: 70.0, stake: 21,  lucro: 9,   isNew: false },
];

function FreebetTable() {
  return (
    <div style={{ borderRadius: 18, border: '1px solid rgba(167,139,250,.18)', background: '#0D1117', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,.03), 0 30px 60px -15px rgba(0,0,0,.7)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', background: '#161D27', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <Filter size={13} color="#A78BFA" />
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#F0F4F8' }}>Melhores conversões agora</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="lp-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#A78BFA', display: 'block' }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#A78BFA', letterSpacing: '0.1em' }}>LIVE</span>
        </div>
      </div>
      {/* Column headers — hidden on mobile via class */}
      <div className="lp-fb-header" style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 70px', padding: '7px 20px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
        {['Evento','Casa','Freebet','Você recebe'].map(c => (
          <div key={c} style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#4A5E6E' }}>{c}</div>
        ))}
      </div>
      {FB_ROWS.map((row, i) => (
        <div key={i} className="lp-fb-row" style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 70px 70px',
          padding: '11px 20px', alignItems: 'center',
          borderBottom: i < FB_ROWS.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
          background: i === 0 ? 'rgba(167,139,250,.035)' : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: '#F0F4F8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.event}</span>
            {row.isNew && <span className="lp-new-badge" style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: 'rgba(167,139,250,.15)', color: '#A78BFA', border: '1px solid rgba(167,139,250,.25)', flexShrink: 0, lineHeight: 1.5 }}>NOVO</span>}
          </div>
          <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 12, color: '#6A7E8E' }}>{row.house}</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#F0F4F8' }}>R$ {row.value}</div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 800, color: '#3FFF21' }}>+R$ {row.lucro} 💰</div>
        </div>
      ))}
    </div>
  );
}

// ─── Duplo Green Card — Premium ───────────────────────────────────────────────

function DuploGreenCard() {
  const TL = [
    { min: "13'", score: '1×0', text: 'Pedro abriu o placar pro Flamengo', event: null },
    { min: "26'", score: '2×0', text: 'Bruno Henrique fez o segundo.', event: { text: 'Pagamento antecipado dispara · Novibet paga a aposta no Flamengo', type: 'g' as const } },
    { min: "38'", score: '2×1', text: 'Igor Jesus descontou pro Botafogo', event: null },
    { min: "49'", score: '2×2', text: 'Almada empatou', event: null },
    { min: "53'", score: '2×3', text: 'Savarino virou pro Botafogo (pênalti)', event: null },
    { min: "74'", score: '2×4', text: 'Tiquinho fechou. Botafogo abriu 2 gols.', event: { text: 'Pagamento antecipado dispara · Estrela Bet paga a aposta no Botafogo', type: 'o' as const } },
  ];

  return (
    <div className="lp-dg-card" style={{
      borderRadius: 20, border: '1px solid rgba(63,255,33,.22)',
      background: '#0D1117', overflow: 'hidden',
      boxShadow: '0 0 0 1px rgba(255,255,255,.03), 0 40px 100px -20px rgba(0,0,0,.9), 0 0 100px -30px rgba(63,255,33,.15)',
      maxWidth: 760, margin: '0 auto',
    }}>

      {/* Card header */}
      <div className="lp-dg-header" style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,.07)', background: '#161D27', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#3FFF21', background: 'rgba(63,255,33,.1)', padding: '4px 10px', borderRadius: 6, flexShrink: 0 }}>Brasileirão A</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: '#F0F4F8', whiteSpace: 'nowrap' }}>Flamengo × Botafogo</div>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 11, color: '#4A5E6E', marginTop: 2 }}>Caso real — placar final: 2 × 4</div>
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.22)', flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="#3FFF21" viewBox="0 0 256 256">
            <path d="M111.49,52.63a15.8,15.8,0,0,0-26,5.77L33,202.78A15.83,15.83,0,0,0,47.76,224a16,16,0,0,0,5.46-1l144.37-52.5a15.8,15.8,0,0,0,5.78-26ZM65.14,161.13l19.2-52.79,63.32,63.32-52.8,19.2ZM160,72a37.8,37.8,0,0,1,3.84-15.58C169.14,45.83,179.14,40,192,40c6.7,0,11-2.29,13.65-7.21A22,22,0,0,0,208,23.94,8,8,0,0,1,224,24c0,12.86-8.52,32-32,32-6.7,0-11,2.29-13.65,7.21A22,22,0,0,0,176,72.06,8,8,0,0,1,160,72ZM136,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm101.66,82.34a8,8,0,1,1-11.32,11.31l-16-16a8,8,0,0,1,11.32-11.32Zm4.87-42.75-24,8a8,8,0,0,1-5.06-15.18l24-8a8,8,0,0,1,5.06,15.18Z"/>
          </svg>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3FFF21' }}>Duplo Green</span>
        </div>
      </div>

      <div className="lp-dg-inner" style={{ padding: '24px 28px' }}>

        {/* Linha de base — o que se esperava */}
        <div style={{ marginBottom: 24, padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#4A5E6E', marginBottom: 4 }}>Sem duplo green — retorno calculado</div>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 14, color: '#6A7E8E' }}>Surebet padrão 3 vias · ROI <strong style={{ color: '#F0F4F8' }}>0,20%</strong> · lucro esperado <strong style={{ color: '#F0F4F8' }}>R$ 2,00</strong></div>
          </div>
          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 22, color: '#4A5E6E', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>+ R$ 2,00</div>
        </div>

        {/* Pre-game setup */}
        <div style={{ background: '#161D27', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#FF8F3D', marginBottom: 12 }}>Antes do jogo · sistema detectou duplo green</div>
          <div className="lp-dg-grid3">
            {[
              { house: 'Novibet',    outcome: 'Flamengo', odd: '1,86', stake: 'R$ 538' },
              { house: 'Estrela Bet',outcome: 'Empate',   odd: '4,20', stake: 'R$ 239' },
              { house: 'Estrela Bet',outcome: 'Botafogo', odd: '4,50', stake: 'R$ 223' },
            ].map((r, i) => (
              <div key={i} style={{ border: '1px solid rgba(255,255,255,.07)', background: '#0D1117', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4A5E6E', marginBottom: 5 }}>{r.house}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, fontWeight: 600, color: '#F0F4F8' }}>{r.outcome}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#6A7E8E' }}>@{r.odd}</span>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#FF8F3D', marginTop: 4 }}>{r.stake}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', marginBottom: 28 }}>
          {/* Vertical guide line */}
          <div style={{ position: 'absolute', left: 38, top: 8, bottom: 8, width: 1, background: 'linear-gradient(to bottom, rgba(63,255,33,.3), rgba(63,255,33,.05))', pointerEvents: 'none' }} />

          {TL.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '10px 0', borderBottom: i < TL.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
              {/* Time + score */}
              <div className="lp-dg-tl-time" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 76, flexShrink: 0, paddingTop: 2 }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#4A5E6E', lineHeight: 1 }}>{t.min}</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.event ? (t.event.type === 'g' ? '#3FFF21' : '#FF8F3D') : 'rgba(255,255,255,.15)', margin: '5px 0', position: 'relative', zIndex: 1 }} />
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 900, color: '#F0F4F8', lineHeight: 1 }}>{t.score}</span>
              </div>
              {/* Content */}
              <div style={{ flex: 1, paddingLeft: 12 }}>
                <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: '#8899AA', lineHeight: 1.5, paddingTop: 2 }}>{t.text}</div>
                {t.event && (
                  <div className="lp-dg-event" style={{
                    marginTop: 8, display: 'inline-flex', alignItems: 'flex-start', gap: 7,
                    fontFamily: 'Manrope, sans-serif', fontSize: 12, fontWeight: 700, lineHeight: 1.45,
                    padding: '8px 12px', borderRadius: 8,
                    background: t.event.type === 'g' ? 'rgba(63,255,33,.09)' : 'rgba(255,143,61,.09)',
                    color: t.event.type === 'g' ? '#3FFF21' : '#FF8F3D',
                    border: `1px solid ${t.event.type === 'g' ? 'rgba(63,255,33,.2)' : 'rgba(255,143,61,.2)'}`,
                  }}>
                    <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚡</span>
                    {t.event.text}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Result — the hero moment */}
        <div style={{ borderRadius: 16, background: 'rgba(63,255,33,.06)', border: '1px solid rgba(63,255,33,.2)', padding: '24px 28px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          {/* Background glow */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, height: 150, background: 'radial-gradient(ellipse, rgba(63,255,33,.12), transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(63,255,33,.6)', marginBottom: 10 }}>Resultado final</div>

            {/* The number */}
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 'clamp(52px,8vw,72px)' as unknown as number, letterSpacing: '-0.04em', color: '#3FFF21', lineHeight: 1, marginBottom: 8 }}>
              +R$ 1.005
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: 'rgba(63,255,33,.7)', background: 'rgba(63,255,33,.1)', padding: '5px 14px', borderRadius: 999, marginBottom: 20 }}>
              ROI 100,5% · ×500 acima do esperado
            </div>

            {/* Before / After */}
            <div className="lp-dg-result-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4A5E6E', marginBottom: 6 }}>Apostado</div>
                <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20, color: '#6A7E8E', letterSpacing: '-0.02em' }}>R$ 1.000</div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 18, color: '#3FFF21', fontWeight: 900 }}>→</div>
              <div style={{ textAlign: 'center', padding: '14px 16px', borderRadius: 10, background: 'rgba(63,255,33,.07)', border: '1px solid rgba(63,255,33,.2)' }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(63,255,33,.6)', marginBottom: 6 }}>Recebido</div>
                <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20, color: '#3FFF21', letterSpacing: '-0.02em' }}>R$ 2.005</div>
              </div>
            </div>
          </div>
        </div>

      </div>
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
    root: { background: '#030507', color: '#F0F4F8', minHeight: '100vh', overflowX: 'hidden' as const, fontFamily: 'Manrope, system-ui, sans-serif' },
    h: (sz: string) => ({ fontFamily: 'Manrope, sans-serif', fontWeight: 900 as const, fontSize: sz as unknown as number, letterSpacing: '-0.03em', lineHeight: 1.05 }),
    sub: { fontFamily: 'Manrope, sans-serif', fontSize: 17, lineHeight: 1.7, color: 'rgba(240,244,248,.5)' },
  };

  return (
    <div style={s.root}>

      {/* ══════════ NAV ══════════ */}
      <nav style={{
        position: 'fixed', inset: '0 0 auto 0', zIndex: 100, height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px',
        background: scrolled ? 'rgba(3,5,7,.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : '1px solid transparent',
        transition: 'background .3s, border-color .3s',
      }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(63,255,33,.35)', flexShrink: 0 }}>
            <Zap size={16} color="#030507" strokeWidth={2.8} />
          </div>
          <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 16, letterSpacing: '-0.025em', color: '#F0F4F8' }}>SureEdge</span>
        </a>

        <div className="hidden lg:flex" style={{ alignItems: 'center', gap: 28 }}>
          {[['Recursos','#recursos'],['Como funciona','#como-funciona'],['Planos','#planos'],['FAQ','#faq']].map(([label, href]) => (
            <a key={href} href={href} style={{ fontFamily: 'Manrope, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(240,244,248,.45)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.45)')}>
              {label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {email ? (
            <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Manrope, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(240,244,248,.45)', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>
              <LogOut size={12} /> Sair
            </button>
          ) : (
            <a href="/login" className="hidden sm:block" style={{ fontFamily: 'Manrope, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(240,244,248,.45)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.45)')}>
              Entrar
            </a>
          )}
          <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#3FFF21', color: '#030507', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'Manrope, sans-serif', textDecoration: 'none', transition: 'transform .2s, box-shadow .2s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 0 24px rgba(63,255,33,.5)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = 'none'; }}>
            Começar <ArrowRight size={13} />
          </a>
        </div>
      </nav>

      {/* ══════════ HERO — centered, no mockup ══════════ */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(100px,14vw,160px) 20px clamp(80px,10vw,120px)' }}>
        <div className="lp-bg-grid" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.55 }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 'min(900px,100%)', height: 560, transform: 'translateX(-50%)', background: 'radial-gradient(ellipse at top, rgba(63,255,33,.14), transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div className="lp-fade-in lp-d1">
            <SectionLabel>Plataforma de Trading Esportivo</SectionLabel>
          </div>

          <h1 className="lp-fade-in lp-d2" style={{ ...s.h('clamp(36px,6.5vw,76px)'), color: '#F0F4F8', marginBottom: 24 }}>
            Saiba exatamente{' '}
            <span style={{ color: '#3FFF21' }}>quanto você lucra</span>
            <br />em cada operação.
          </h1>

          <p className="lp-fade-in lp-d3" style={{ fontFamily: 'Manrope, sans-serif', fontSize: 'clamp(15px,2vw,18px)' as unknown as number, lineHeight: 1.7, color: 'rgba(240,244,248,.5)', maxWidth: '50ch', margin: '0 auto 12px' }}>
            Gestão completa de surebets e freebets em{' '}
            <span style={{ fontWeight: 600, color: 'rgba(240,244,248,.8)' }}>30+ casas em tempo real</span>.
            Pare de operar no escuro.
          </p>

          {/* Preço visível antes do clique — elimina abandono no checkout */}
          <p className="lp-fade-in lp-d3" style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.28)', marginBottom: 36 }}>
            A partir de <strong style={{ color: 'rgba(240,244,248,.55)' }}>R$97/mês</strong> · Acesso imediato · Garantia de 7 dias
          </p>

          <div className="lp-fade-in lp-d4" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28, justifyContent: 'center' }}>
            <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#3FFF21', color: '#030507', borderRadius: 999, padding: '15px 36px', fontSize: 15, fontWeight: 700, fontFamily: 'Manrope, sans-serif', textDecoration: 'none', transition: 'transform .2s, box-shadow .2s', boxShadow: '0 8px 32px -8px rgba(63,255,33,.6)' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 12px 44px -8px rgba(63,255,33,.85)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = '0 8px 32px -8px rgba(63,255,33,.6)'; }}>
              Começar agora <ArrowRight size={16} />
            </a>
          </div>

          {/* Prova social imediata */}
          <div className="lp-fade-in lp-d5" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex' }}>
                {[0,1,2,3,4].map(i => <Star key={i} size={13} color="#3FFF21" fill="#3FFF21" />)}
              </div>
              <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(240,244,248,.55)' }}>4.9/5</span>
              <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.28)' }}>· 127 traders ativos</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3FFF21', flexShrink: 0, animation: 'lp-pulse 1.8s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.4)' }}>
                <strong style={{ color: 'rgba(240,244,248,.7)' }}>12 traders</strong> entraram nos últimos 7 dias
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ MARQUEE ══════════ */}
      <section style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)', padding: '28px 0' }}>
        <div style={{ marginBottom: 12, textAlign: 'center' }}>
          <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(240,244,248,.2)' }}>Integrado com as principais casas do mercado</p>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
          <div style={{ display: 'flex', animation: 'lp-marquee 36s linear infinite', width: 'max-content' }}>
            {[...BOOKMAKERS, ...BOOKMAKERS].map((b, i) => (
              <span key={i} style={{ fontFamily: 'Manrope, sans-serif', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'rgba(240,244,248,.2)', paddingRight: 44, whiteSpace: 'nowrap', transition: 'color .2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.2)')}>
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ STATS ══════════ */}
      <div ref={rStrip} className="lp-reveal" style={{ padding: 'clamp(40px,6vw,60px) 20px', background: 'rgba(255,255,255,.015)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 'clamp(20px,4vw,32px)' }} className="md:grid-cols-4">
          {[
            { ref: ops.ref,    v: ops.value.toLocaleString('pt-BR'),                        label: 'Operações registradas'   },
            { ref: lucro.ref,  v: 'R$ ' + Math.round(lucro.value).toLocaleString('pt-BR'),  label: 'Lucro gerado por traders' },
            { ref: casas.ref,  v: casas.value + '+',                                         label: 'Casas monitoradas'        },
            { ref: acerto.ref, v: acerto.value.toFixed(1) + '%',                             label: 'Taxa de acerto média'     },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 'clamp(24px,3vw,40px)' as unknown as number, fontWeight: 900, letterSpacing: '-0.025em', color: '#3FFF21' }}>
                <span ref={stat.ref}>{stat.v}</span>
              </div>
              <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.16em', color: 'rgba(240,244,248,.28)', marginTop: 6 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ TESTIMONIALS ══════════ */}
      <section style={{ padding: 'clamp(56px,7vw,88px) 20px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <SectionLabel>Avaliações reais</SectionLabel>
            <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 'clamp(22px,3vw,40px)' as unknown as number, letterSpacing: '-0.03em', color: '#F0F4F8', marginBottom: 12 }}>
              Traders que saíram da planilha
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ display: 'flex' }}>{[0,1,2,3,4].map(i => <Star key={i} size={16} color="#3FFF21" fill="#3FFF21" />)}</div>
              <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 18, color: '#F0F4F8' }}>4.9</span>
              <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.35)' }}>de 5 · 127 avaliações verificadas</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 14 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.02)', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Stars */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {[0,1,2,3,4].map(s => <Star key={s} size={12} color="#3FFF21" fill="#3FFF21" />)}
                </div>
                {/* Highlight badge */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.18)', width: 'fit-content' }}>
                  <Check size={10} color="#3FFF21" strokeWidth={3} />
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, color: '#3FFF21', letterSpacing: '0.08em' }}>{t.highlight}</span>
                </div>
                {/* Text */}
                <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 14, lineHeight: 1.75, color: 'rgba(240,244,248,.52)', flex: 1 }}>"{t.text}"</p>
                {/* Author */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(63,255,33,.12)', border: '1px solid rgba(63,255,33,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 13, color: '#3FFF21' }}>{t.name[0]}</span>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13, color: '#F0F4F8' }}>{t.name}</div>
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 11, color: 'rgba(240,244,248,.28)' }}>{t.role} · {t.city}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ COMPARAÇÃO COM / SEM SUREEDGE ══════════ */}
      <section style={{ padding: 'clamp(56px,7vw,88px) 20px', borderTop: '1px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.01)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <SectionLabel color="#FF6B6B">A diferença é gritante</SectionLabel>
            <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 'clamp(22px,3vw,42px)' as unknown as number, letterSpacing: '-0.03em', color: '#F0F4F8' }}>
              Sem controle, você está trabalhando de graça.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="lp-split-grid">
            {/* SEM SureEdge */}
            <div style={{ borderRadius: 20, border: '1.5px solid rgba(255,77,77,.25)', background: 'rgba(255,77,77,.04)', padding: '28px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,77,77,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} color="#FF4D4D" />
                </div>
                <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 16, color: '#FF4D4D' }}>Sem anotar nada</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Não sabe qual casa está dando prejuízo',
                  'Perde horas calculando stake na mão',
                  'Confunde saldo de clientes diferentes',
                  'Sem histórico — repete os mesmos erros',
                  'Freebet vence sem aproveitar',
                  'Não sabe seu ROI real no mês',
                  'Trabalha muito, lucra pouco',
                  'Planilha sempre desatualizada',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <X size={14} color="rgba(255,77,77,.6)" style={{ flexShrink: 0, marginTop: 3 }} />
                    <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.4)', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* COM SureEdge */}
            <div style={{ borderRadius: 20, border: '1.5px solid rgba(63,255,33,.28)', background: 'rgba(63,255,33,.04)', padding: '28px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(63,255,33,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={16} color="#3FFF21" />
                </div>
                <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 16, color: '#3FFF21' }}>Com SureEdge</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'ROI por casa — sabe exatamente onde lucra',
                  'Calculadora distribui stakes em segundos',
                  'Cada cliente com saldo e lucro separados',
                  'Histórico completo de todas as operações',
                  'Buscador de freebet com os melhores now',
                  'Dashboard com lucro real atualizado sempre',
                  'Opera mais em menos tempo',
                  'Importação automática do Google Sheets',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Check size={14} color="#3FFF21" style={{ flexShrink: 0, marginTop: 3 }} strokeWidth={2.5} />
                    <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.7)', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* CTA após comparação */}
          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#3FFF21', color: '#030507', borderRadius: 999, padding: '14px 32px', fontSize: 14, fontWeight: 700, fontFamily: 'Manrope, sans-serif', textDecoration: 'none', boxShadow: '0 8px 28px -8px rgba(63,255,33,.55)' }}>
              Quero organizar minhas operações <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </section>

      {/* ══════════ FREEBET SECTION ══════════ */}
      <section ref={rFreebet} className="lp-reveal" style={{ padding: 'clamp(64px,8vw,100px) 20px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(32px,5vw,64px)', alignItems: 'center' }} className="lp-split-grid">
            <div>
              <SectionLabel color="#A78BFA">Exclusivo</SectionLabel>
              <h2 style={{ ...s.h('clamp(26px,3.2vw,46px)'), color: '#F0F4F8', marginBottom: 18 }}>
                Extração de freebet que{' '}
                <span style={{ color: '#A78BFA' }}>paga sozinha</span>{' '}
                a mensalidade.
              </h2>
              <p style={{ ...s.sub, fontSize: 'clamp(14px,1.5vw,17px)' as unknown as number, maxWidth: '44ch', marginBottom: 28 }}>
                Ferramenta proprietária que identifica os jogos com maior taxa de conversão em tempo real. Transforme bônus em saldo real.
              </p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Identificação automática das melhores conversões','Filtros por mercado, esporte, casa e valor mínimo','Cálculo de stake e ROI já feito para você','Alertas quando aparece oportunidade'].map(t => (
                  <li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(167,139,250,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 3 }}>
                      <Check size={10} color="#A78BFA" strokeWidth={3} />
                    </div>
                    <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 14, color: 'rgba(240,244,248,.65)', lineHeight: 1.6 }}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <FreebetTable />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ DUPLO GREEN ══════════ */}
      <section ref={rDG} className="lp-reveal" id="duplo-green" style={{ padding: 'clamp(64px,8vw,100px) 20px', background: 'rgba(63,255,33,.015)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <SectionLabel>Caso real</SectionLabel>
            <h2 style={{ ...s.h('clamp(26px,3.2vw,48px)'), color: '#F0F4F8', marginBottom: 14 }}>
              De <span style={{ color: 'rgba(240,244,248,.4)' }}>0,20%</span> para{' '}
              <span style={{ color: '#3FFF21' }}>100,5%</span>{' '}
              no mesmo jogo.
            </h2>
            <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 'clamp(14px,1.5vw,16px)' as unknown as number, color: 'rgba(240,244,248,.4)', maxWidth: '50ch', margin: '0 auto' }}>
              Veja exatamente como aconteceu, gol a gol. Nada inventado.
            </p>
          </div>
          <DuploGreenCard />
        </div>
      </section>

      {/* ══════════ FEATURES ══════════ */}
      <section ref={rFeatures} className="lp-reveal" id="recursos" style={{ padding: 'clamp(64px,8vw,100px) 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <SectionLabel>Ferramentas</SectionLabel>
            <h2 style={{ ...s.h('clamp(26px,3.5vw,50px)'), color: '#F0F4F8', marginBottom: 14 }}>
              Tudo que um trader sério precisa<br />
              <span style={{ color: '#3FFF21' }}>numa única plataforma.</span>
            </h2>
            <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 'clamp(14px,1.5vw,17px)' as unknown as number, color: 'rgba(240,244,248,.4)', maxWidth: '48ch', margin: '0 auto' }}>
              Surebet, freebet, gestão de bancas e múltiplas contas. Pare de pular entre planilhas, sites e abas.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.02)', padding: 24, transition: 'border-color .25s, transform .25s', cursor: 'default' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${f.color}44`; el.style.transform = 'translateY(-3px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,.07)'; el.style.transform = 'translateY(0)'; }}>
                <div style={{ position: 'absolute', right: 0, top: 0, width: 90, height: 90, transform: 'translate(50%,-50%)', borderRadius: '50%', background: `${f.color}12`, filter: 'blur(24px)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${f.color}28`, background: `${f.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <f.icon size={20} color={f.color} />
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.2em', color: `${f.color}aa`, marginBottom: 7 }}>{f.tag}</div>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 8, color: '#F0F4F8' }}>{f.title}</h3>
                  <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, lineHeight: 1.75, color: 'rgba(240,244,248,.42)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ WORKFLOW ══════════ */}
      <section ref={rWorkflow} className="lp-reveal" id="como-funciona" style={{ padding: 'clamp(64px,8vw,100px) 20px', background: 'rgba(255,255,255,.015)', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <SectionLabel>Como funciona</SectionLabel>
            <h2 style={{ ...s.h('clamp(26px,3.5vw,50px)'), color: '#F0F4F8' }}>
              Em 4 passos você está{' '}<span style={{ color: '#3FFF21' }}>operando lucro real.</span>
            </h2>
          </div>
          <div style={{ position: 'relative' }}>
            <div className="hidden lg:block" style={{ position: 'absolute', left: 0, right: 0, top: 48, height: 1, background: 'linear-gradient(90deg, transparent, rgba(63,255,33,.22), transparent)', pointerEvents: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'clamp(20px,3vw,24px)' }}>
              {WORKFLOW.map(w => (
                <div key={w.n} style={{ position: 'relative' }}>
                  <div style={{ position: 'relative', zIndex: 1, width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginBottom: 18, border: '1px solid rgba(63,255,33,.18)', background: '#161D27' }}>
                    <w.icon size={24} color="#3FFF21" />
                    <span style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 900, color: '#030507' }}>{w.n}</span>
                  </div>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 7, color: '#F0F4F8' }}>{w.title}</h3>
                  <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.38)', lineHeight: 1.7 }}>{w.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ PRICING ══════════ */}
      <section ref={rPricing} className="lp-reveal" id="planos" style={{ padding: 'clamp(64px,8vw,100px) 20px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Banner de escassez/promoção */}
          <div style={{ maxWidth: 700, margin: '0 auto 40px', padding: '16px 24px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(255,143,61,.12), rgba(255,77,77,.08))', border: '1px solid rgba(255,143,61,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <AlertTriangle size={15} color="#FF8F3D" />
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#FF8F3D' }}>Oferta especial ativa</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 14, color: 'rgba(240,244,248,.35)', textDecoration: 'line-through' }}>R$149,90/mês</span>
              <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 20, color: '#F0F4F8', letterSpacing: '-0.02em' }}>R$97/mês</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#FF8F3D', color: '#030507' }}>-35%</span>
            </div>
            <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.35)' }}>Não garantimos manutenção desse preço</span>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <SectionLabel>Planos</SectionLabel>
            <h2 style={{ ...s.h('clamp(26px,3.5vw,50px)'), color: '#F0F4F8', marginBottom: 12 }}>
              Investimento que{' '}<span style={{ color: '#3FFF21' }}>se paga na primeira semana.</span>
            </h2>
            {/* Garantia em destaque */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 20px', borderRadius: 999, background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.2)' }}>
              <Shield size={14} color="#3FFF21" />
              <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, fontWeight: 700, color: '#3FFF21' }}>Garantia incondicional de 7 dias — devolução total sem perguntas</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {LANDING_PLANS.map(plan => {
              const isFeatured = plan.id === 'quarterly';
              const url = landingCheckoutUrl(plan.id, email);
              return (
                <div key={plan.id} style={{ position: 'relative', borderRadius: 20, padding: '28px 24px', border: isFeatured ? '1.5px solid rgba(63,255,33,.38)' : '1px solid rgba(255,255,255,.07)', background: isFeatured ? 'rgba(63,255,33,.055)' : 'rgba(255,255,255,.02)', boxShadow: isFeatured ? '0 20px 60px -20px rgba(63,255,33,.22)' : 'none', display: 'flex', flexDirection: 'column', transition: 'transform .25s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                  {plan.badge && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#3FFF21', borderRadius: 999, padding: '4px 13px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#030507', whiteSpace: 'nowrap' }}>{plan.badge}</div>
                  )}
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: '#F0F4F8', marginBottom: 16 }}>{plan.label}</h3>
                  {/* Preço riscado — escassez */}
                  {plan.id === 'monthly' && (
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.3)', textDecoration: 'line-through', marginBottom: 2 }}>R$149,90/mês</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 5 }}>
                    <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 42, letterSpacing: '-0.03em', color: '#F0F4F8', lineHeight: 1 }}>R$ {plan.price.toLocaleString('pt-BR')}</span>
                    <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.3)' }}>/{plan.period.replace('por ','')}</span>
                  </div>
                  {plan.id !== 'monthly' && <div style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.38)', marginBottom: 5 }}>R$ {plan.perMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</div>}
                  {plan.savings && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 20, padding: '3px 9px', borderRadius: 6, background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.2)', fontFamily: 'Manrope, sans-serif', fontSize: 11, fontWeight: 700, color: '#3FFF21' }}><TrendingUp size={10} /> {plan.savings}</div>}
                  {!plan.savings && <div style={{ marginBottom: 20 }} />}
                  <ul style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, marginBottom: 20 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                        <Check size={14} color="#3FFF21" style={{ flexShrink: 0, marginTop: 3 }} strokeWidth={2.5} />
                        <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 13, color: 'rgba(240,244,248,.65)' }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {[{ Icon: QrCode, label: 'PIX' }, { Icon: CreditCard, label: 'Cartão' }].map(({ Icon, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,.04)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: 'rgba(240,244,248,.32)' }}>
                        <Icon size={9} /> {label}
                      </div>
                    ))}
                  </div>
                  <a href={url} target={url.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 20px', borderRadius: 999, fontFamily: 'Manrope, sans-serif', fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'transform .2s, box-shadow .2s', ...(isFeatured ? { background: '#3FFF21', color: '#030507', boxShadow: '0 8px 24px -8px rgba(63,255,33,.55)' } : { background: 'rgba(255,255,255,.05)', color: '#F0F4F8', border: '1px solid rgba(255,255,255,.09)' }) }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.02)'; if (!isFeatured) { el.style.background = 'rgba(63,255,33,.08)'; el.style.borderColor = 'rgba(63,255,33,.25)'; } }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; if (!isFeatured) { el.style.background = 'rgba(255,255,255,.05)'; el.style.borderColor = 'rgba(255,255,255,.09)'; } }}>
                    <Zap size={13} /> ASSINAR AGORA
                  </a>
                </div>
              );
            })}
          </div>
          {/* Trust bar expandida */}
          <div style={{ marginTop: 32, padding: '18px 24px', borderRadius: 14, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(16px,3vw,36px)', flexWrap: 'wrap' }}>
              {[
                { icon: <Shield size={14} />, text: 'Pagamento 100% seguro via Cakto', color: '#3FFF21' },
                { icon: <Zap size={14} />,    text: 'Acesso liberado em até 5 minutos', color: '#3FFF21' },
                { icon: <Check size={14} />,  text: 'Cancele quando quiser, sem multa', color: '#3FFF21' },
                { icon: <Star size={14} fill="#FFD600" />, text: '4.9 de satisfação · 127 traders', color: '#FFD600' },
              ].map(item => (
                <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Manrope, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.45)', whiteSpace: 'nowrap' }}>
                  <span style={{ color: item.color }}>{item.icon}</span>
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section ref={rFaq} className="lp-reveal" id="faq" style={{ padding: 'clamp(64px,8vw,100px) 20px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <SectionLabel>Dúvidas</SectionLabel>
            <h2 style={{ ...s.h('clamp(24px,3vw,44px)'), color: '#F0F4F8' }}>Perguntas frequentes</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ overflow: 'hidden', borderRadius: 14, border: openFaq === i ? '1px solid rgba(63,255,33,.28)' : '1px solid rgba(255,255,255,.07)', background: openFaq === i ? 'rgba(63,255,33,.035)' : 'rgba(255,255,255,.02)', transition: 'border-color .2s, background .2s' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '16px 20px', background: 'none', border: 'none', color: '#F0F4F8', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 'clamp(13px,1.5vw,15px)' as unknown as number, letterSpacing: '-0.01em', lineHeight: 1.4 }}>{item.q}</span>
                  <ChevronDown size={17} color="#3FFF21" style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform .3s cubic-bezier(0.22,1,0.36,1)' }} />
                </button>
                <div style={{ display: 'grid', gridTemplateRows: openFaq === i ? '1fr' : '0fr', transition: 'grid-template-rows 0.35s cubic-bezier(0.22,1,0.36,1)' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ padding: '0 20px 16px', fontFamily: 'Manrope, sans-serif', fontSize: 14, lineHeight: 1.8, color: 'rgba(240,244,248,.42)' }}>{item.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CTA FINAL ══════════ */}
      <section ref={rCta} className="lp-reveal" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(80px,10vw,120px) 20px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div className="lp-bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 600, height: 300, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'rgba(63,255,33,.1)', filter: 'blur(70px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ ...s.h('clamp(32px,5vw,62px)'), color: '#F0F4F8', marginBottom: 18 }}>
            Pare de operar no escuro.<br /><span style={{ color: '#3FFF21' }}>Comece hoje.</span>
          </h2>
          <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 'clamp(14px,1.5vw,17px)' as unknown as number, color: 'rgba(240,244,248,.42)', lineHeight: 1.65, marginBottom: 36 }}>
            Junte-se aos traders que transformaram apostas em uma operação séria, organizada e lucrativa.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', alignItems: 'center' }}>
            <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#3FFF21', color: '#030507', borderRadius: 999, padding: '16px 40px', fontSize: 15, fontWeight: 700, fontFamily: 'Manrope, sans-serif', textDecoration: 'none', boxShadow: '0 8px 32px -8px rgba(63,255,33,.65)', transition: 'transform .2s, box-shadow .2s' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 14px 48px -8px rgba(63,255,33,.9)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = '0 8px 32px -8px rgba(63,255,33,.65)'; }}>
              Garantir meu acesso <ArrowRight size={16} />
            </a>
            <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: 12, color: 'rgba(240,244,248,.25)' }}>Garantia incondicional de 7 dias</span>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.05)', padding: '28px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={12} color="#030507" strokeWidth={2.8} />
            </div>
            <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em', color: '#F0F4F8' }}>SureEdge</span>
          </div>
          <p style={{ fontFamily: 'Manrope, sans-serif', color: 'rgba(240,244,248,.2)', fontSize: 12 }}>
            © {new Date().getFullYear()} SureEdge. Trading esportivo, organizado.
          </p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {['Termos','Privacidade','Suporte','Login'].map(l => (
              <a key={l} href={l === 'Login' ? '/login' : '#'} style={{ fontFamily: 'Manrope, sans-serif', color: 'rgba(240,244,248,.2)', fontSize: 12, textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.2)')}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* ══════════ STYLES ══════════ */}
      <style>{`
        .lp-bg-grid {
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.032) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.032) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent 80%);
        }

        @keyframes lp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }
        .lp-pulse-dot { animation: lp-pulse 1.8s ease-in-out infinite; }

        @keyframes lp-new-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        .lp-new-badge { animation: lp-new-pulse 2.2s ease-in-out infinite; }

        @keyframes lp-fade-up {
          from { opacity: 0; transform: translateY(20px); filter: blur(5px); }
          to   { opacity: 1; transform: none; filter: blur(0); }
        }
        .lp-fade-in { animation: lp-fade-up 0.75s cubic-bezier(0.22,1,0.36,1) both; }
        .lp-d1 { animation-delay: 0ms; }
        .lp-d2 { animation-delay: 70ms; }
        .lp-d3 { animation-delay: 140ms; }
        .lp-d4 { animation-delay: 210ms; }
        .lp-d5 { animation-delay: 280ms; }

        .lp-reveal {
          opacity: 0;
          transform: translateY(16px);
          filter: blur(3px);
          transition:
            opacity 0.7s cubic-bezier(0.22,1,0.36,1),
            transform 0.7s cubic-bezier(0.22,1,0.36,1),
            filter 0.7s cubic-bezier(0.22,1,0.36,1);
        }
        .lp-reveal.lp-revealed { opacity: 1; transform: none; filter: blur(0); }

        @keyframes lp-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* ── Split grid (2-col → 1-col on mobile) ── */
        .lp-split-grid { grid-template-columns: 1fr 1fr; }
        @media (max-width: 860px) {
          .lp-split-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
        }

        /* ── Duplo Green card inner grids ── */
        .lp-dg-grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
        .lp-dg-result-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; }
        @media (max-width: 560px) {
          .lp-dg-card { border-radius: 12px !important; }
          .lp-dg-header { padding: 14px 16px !important; flex-direction: column !important; align-items: flex-start !important; }
          .lp-dg-inner { padding: 16px !important; }
          .lp-dg-grid3 { grid-template-columns: 1fr 1fr !important; }
          .lp-dg-result-grid { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
          .lp-dg-result-grid > div:nth-child(2) { display: none; }
          .lp-dg-tl-time { width: 54px !important; }
          .lp-dg-event { font-size: 11px !important; width: 100% !important; box-sizing: border-box !important; }
        }

        /* ── Freebet table mobile ── */
        @media (max-width: 600px) {
          .lp-fb-header { display: none !important; }
          .lp-fb-row {
            grid-template-columns: 1fr 70px 52px !important;
          }
          .lp-fb-conv, .lp-fb-stake { display: none !important; }
        }

        /* ── Pricing: 1-col on small mobile ── */
        @media (max-width: 400px) {
          #planos > div > div[style*="grid"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
    </div>
  );
}
