'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { PLAN_PRICES, PLAN_LABELS, type PlanId } from '@/lib/supabase/subscription';
import {
  Zap, TrendingUp, Shield, BarChart2, Calculator,
  Upload, ChevronDown, Check, ArrowRight,
  LogOut, QrCode, CreditCard, Gift, Wallet,
  Users, Star, Filter, Target, Database, Activity,
  Building2, Sparkles, Trophy,
} from 'lucide-react';

// ─── Pricing ──────────────────────────────────────────────────────────────────

interface LandingPlan {
  id: PlanId;
  label: string;
  price: number;
  perMonth: number;
  period: string;
  savings?: string;
  badge?: string;
  features: string[];
}

const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'monthly', label: 'Mensal',
    price: PLAN_PRICES.monthly, perMonth: PLAN_PRICES.monthly,
    period: 'por mês',
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
    features: ['Tudo do Trimestral', '12 meses de acesso', 'Acesso antecipado a recursos', 'Planilha personalizada (não Green Surebet)', 'Curso de operações ao vivo'],
  },
];

function landingCheckoutUrl(planId: PlanId, email: string): string {
  const base =
    planId === 'monthly'   ? process.env.NEXT_PUBLIC_CAKTO_URL_MONTHLY   :
    planId === 'quarterly' ? process.env.NEXT_PUBLIC_CAKTO_URL_QUARTERLY :
                             process.env.NEXT_PUBLIC_CAKTO_URL_ANNUAL;
  if (!base) return '/pricing';
  try {
    const url = new URL(base);
    if (email) url.searchParams.set('email', email);
    return url.toString();
  } catch { return base; }
}

// ─── Static data ──────────────────────────────────────────────────────────────

const BOOKMAKERS = [
  'Bet365', 'Pinnacle', 'Betfair', 'Sportingbet', 'Betano', 'Betsson',
  'KTO', 'Superbet', 'Betway', 'Stake', 'Bwin', '1xBet',
  'Novibet', 'EstrelaBet', 'PixBet', 'Galera.bet', 'Betfast', 'Vbet',
];

const FEATURES = [
  {
    icon: Filter,
    color: '#A78BFA',
    tag: 'exclusivo',
    title: 'Extração de Freebet',
    desc: 'Identifique os jogos com maior taxa de conversão de freebet em mais de 30 casas. Transforme bônus em saldo real com eficiência cirúrgica.',
  },
  {
    icon: TrendingUp,
    color: '#3FFF21',
    tag: 'tempo real',
    title: 'Analytics Avançado',
    desc: 'ROI por bookmaker, evolução do saldo e win rate por esporte. Filtros por período para descobrir onde você ganha mais e onde está perdendo.',
  },
  {
    icon: Calculator,
    color: '#FFD600',
    tag: 'automático',
    title: 'Calculadora de Surebet',
    desc: 'Stakes precisas para operações de 2 e 3 outcomes com alocação automática. Lucro garantido, sem margem para erro humano.',
  },
  {
    icon: Wallet,
    color: '#4DA6FF',
    tag: 'gestão',
    title: 'Gestão de Bancas',
    desc: 'Cadastre todas as suas casas de apostas, controle saldos, depósitos e saques em uma visão unificada. Chega de aba perdida em planilha.',
  },
  {
    icon: Users,
    color: '#FF6B6B',
    tag: 'multi-conta',
    title: 'Controle de Clientes',
    desc: 'Organize contas de terceiros com privacidade total. Saiba sempre quem está operando o quê, quanto rendeu e o status de cada conta.',
  },
  {
    icon: Upload,
    color: '#4DA6FF',
    tag: '1 clique',
    title: 'Importação Automática',
    desc: 'Conecte sua planilha da Green Surebet via Google Sheets. Sincronização contínua a cada 60 segundos — sem copiar, sem colar, sem esforço.',
  },
];

const WORKFLOW = [
  {
    n: '01', icon: Building2,
    title: 'Conecte suas casas',
    desc: 'Adicione bancas, saldos iniciais e contas em segundos. Pré-configuramos 37+ casas para você.',
  },
  {
    n: '02', icon: Sparkles,
    title: 'Encontre a operação',
    desc: 'Use extração de freebet ou calculadora de surebet. O sistema entrega a melhor opção filtrada.',
  },
  {
    n: '03', icon: Activity,
    title: 'Registre e acompanhe',
    desc: 'Importe planilhas ou registre manualmente. Acompanhe ROI, lucro e performance por casa em tempo real.',
  },
  {
    n: '04', icon: Trophy,
    title: 'Cresça com dados',
    desc: 'Relatórios em tempo real mostram onde está o lucro real. Pare de operar no escuro.',
  },
];

const FAQ = [
  {
    q: 'O sistema encontra surebets e freebets automaticamente?',
    a: 'O SureEdge é uma plataforma de gestão e analytics. Você registra suas operações e a plataforma analisa performance, calcula ROI e organiza seu histórico. A calculadora integrada distribui stakes automaticamente e a ferramenta de freebet identifica as melhores conversões em 30+ casas.',
  },
  {
    q: 'Posso importar minha planilha da Green Surebet?',
    a: 'Pode. Aceitamos importação via Google Sheets — incluindo a planilha da Green Surebet. Configure o link uma vez e o sistema sincroniza automaticamente a cada minuto, sem copiar e colar.',
  },
  {
    q: 'Como funciona a gestão de várias contas e CPFs?',
    a: 'Você cadastra clientes, vincula às casas de apostas e o sistema separa saldos, lucros e operações de cada um. Ideal para quem opera com terceiros.',
  },
  {
    q: 'Quantas casas de apostas são suportadas?',
    a: 'Mais de 37 casas pré-configuradas com logos e dados, incluindo Bet365, Betfair, Pinnacle, Betano, Sportingbet, KTO, Superbet e muitas outras. Você também pode adicionar casas personalizadas.',
  },
  {
    q: 'Preciso de conhecimento técnico para usar?',
    a: 'Não. Em menos de 5 minutos você cadastra sua primeira casa, registra uma operação e já vê seu dashboard com métricas em tempo real.',
  },
  {
    q: 'O pagamento é seguro? Tem garantia?',
    a: 'Sim. Utilizamos a Cakto para pagamentos com total segurança. Aceitamos PIX e cartão de crédito. Acesso liberado imediatamente após a confirmação do pagamento.',
  },
];

// ─── FAQ JSON-LD ──────────────────────────────────────────────────────────────

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

// ─── Particles (canvas, no deps) ─────────────────────────────────────────────

type Particle = { x: number; y: number; vx: number; vy: number; r: number; a: number };

function ParticlesField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const N = 60;
    const parts: Particle[] = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.35 + 0.06,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(63,255,33,${p.a})`;
        ctx.fill();
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = parts[i].x - parts[j].x, dy = parts[i].y - parts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(parts[i].x, parts[i].y);
            ctx.lineTo(parts[j].x, parts[j].y);
            ctx.strokeStyle = `rgba(63,255,33,${0.06 * (1 - d / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.65 }} />;
}

// ─── Counter hook ─────────────────────────────────────────────────────────────

function useCounter(target: number, duration = 2500, decimals = 0) {
  const [value, setValue] = useState(0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - t0) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(+(eased * target).toFixed(decimals));
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

// ─── Section label pill ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      borderRadius: 999, border: '1px solid rgba(63,255,33,.22)',
      background: 'rgba(63,255,33,.08)',
      padding: '6px 14px',
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
      color: '#3FFF21', marginBottom: 20,
    }}>
      <span className="lp-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#3FFF21', display: 'block' }} />
      {children}
    </div>
  );
}

// ─── Hero Mockup ──────────────────────────────────────────────────────────────

function HeroMockup() {
  return (
    <div style={{
      overflow: 'hidden', borderRadius: 16,
      border: '1px solid rgba(63,255,33,.15)',
      background: 'oklch(0.16 0.018 240)',
      boxShadow: '0 0 60px -10px rgba(63,255,33,.3), 0 40px 100px rgba(0,0,0,.6)',
    }}>
      {/* Window chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '10px 16px',
        background: 'oklch(0.18 0.02 240)',
        borderBottom: '1px solid rgba(255,255,255,.05)',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56', display: 'block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3FFF21', display: 'block' }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(63,255,33,.6)' }}>sureedge.app/dashboard</span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', gap: 14, padding: 16 }}>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[BarChart2, TrendingUp, Calculator, Target, Database, Activity].map((Icon, i) => (
            <div key={i} style={{
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10,
              background: i === 0 ? 'rgba(63,255,33,.14)' : 'rgba(255,255,255,.03)',
              border: i === 0 ? '1px solid rgba(63,255,33,.28)' : '1px solid rgba(255,255,255,.05)',
              animation: `lp-mockup-in .45s ease-out both`,
              animationDelay: `${0.1 + i * 0.05}s`,
            }}>
              <Icon size={15} color={i === 0 ? '#3FFF21' : 'rgba(255,255,255,.25)'} />
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Lucro Total', value: 'R$ 4.820', color: '#3FFF21', sub: '↑ +12.4%' },
              { label: 'Operações',   value: '247',      color: '#4DA6FF', sub: '↑ +8 hoje' },
              { label: 'ROI Médio',   value: '3.8%',     color: '#FFD600', sub: '↑ +0.3%'  },
            ].map((k, i) => (
              <div key={k.label} style={{
                borderRadius: 12, border: '1px solid rgba(255,255,255,.05)',
                background: 'rgba(255,255,255,.02)', padding: '10px 12px',
                animation: `lp-mockup-in .45s ease-out both`,
                animationDelay: `${0.2 + i * 0.08}s`,
              }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'oklch(0.55 0.018 240)', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 9, color: 'rgba(63,255,33,.65)', marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'oklch(0.55 0.018 240)', marginBottom: 8 }}>Evolução do saldo</div>
            <svg width="100%" height={54} viewBox="0 0 260 54" preserveAspectRatio="none">
              <defs>
                <linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3FFF21" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#3FFF21" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 50 L32 44 L65 36 L97 28 L130 20 L162 14 L195 9 L227 5 L260 2 L260 54 L0 54Z" fill="url(#hg1)" />
              <path
                d="M0 50 L32 44 L65 36 L97 28 L130 20 L162 14 L195 9 L227 5 L260 2"
                stroke="#3FFF21" strokeWidth="2" fill="none" strokeLinecap="round"
                style={{ strokeDasharray: 600, strokeDashoffset: 600, animation: 'lp-chart-draw 1.6s ease-out 0.4s both' }}
              />
              <circle cx="260" cy="2" r="3" fill="#3FFF21" />
            </svg>
          </div>

          {/* Recent ops */}
          <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', overflow: 'hidden' }}>
            {[
              { casa: 'Bet365',   evento: 'Man City vs Arsenal',   roi: '+4.2%' },
              { casa: 'Pinnacle', evento: 'PSG vs Bayern Munich',  roi: '+5.1%' },
              { casa: 'Betfair',  evento: 'Djokovic vs Alcaraz',   roi: '+2.8%' },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,.04)' : undefined,
                animation: `lp-mockup-in .45s ease-out both`,
                animationDelay: `${0.5 + i * 0.1}s`,
              }}>
                <span style={{ width: 52, fontSize: 10, color: 'rgba(255,255,255,.55)', flexShrink: 0 }}>{row.casa}</span>
                <span style={{ flex: 1, fontSize: 10, color: 'rgba(255,255,255,.35)' }}>{row.evento}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: '#3FFF21' }}>{row.roi}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LandingPage() {
  const [email,    setEmail]    = useState('');
  const [openFaq,  setOpenFaq]  = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);

  // Counters
  const ops    = useCounter(2847, 2200);
  const lucro  = useCounter(1243890, 2500);
  const casas  = useCounter(37, 1400);
  const acerto = useCounter(94.2, 2000, 1);

  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = async () => {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="lp-root" style={{ background: 'oklch(0.16 0.018 240)', color: '#F0F4F8', minHeight: '100vh', overflowX: 'hidden', fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* ══════════ NAV ══════════ */}
      <nav style={{
        position: 'fixed', inset: '0 0 auto 0', zIndex: 100,
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px',
        background: scrolled ? 'oklch(0.16 0.018 240 / 0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : '1px solid transparent',
        transition: 'background .3s, border-color .3s',
      }}>
        {/* Logo */}
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #3FFF21, #22e010)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(63,255,33,.4)',
          }}>
            <Zap size={17} color="#0a1a05" strokeWidth={2.6} />
          </div>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 900, fontSize: 17, letterSpacing: '-0.02em', color: '#F0F4F8' }}>SureEdge</span>
        </a>

        {/* Links */}
        <div className="hidden lg:flex" style={{ alignItems: 'center', gap: 28 }}>
          {[['Recursos', '#recursos'], ['Como funciona', '#como-funciona'], ['Planos', '#planos'], ['FAQ', '#faq']].map(([label, href]) => (
            <a key={href} href={href} style={{ fontFamily: '"Inter", sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(240,244,248,.55)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.55)')}>
              {label}
            </a>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {email ? (
            <button onClick={handleLogout} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: '"Inter", sans-serif', fontSize: 12, fontWeight: 600,
              color: 'rgba(240,244,248,.55)', background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.08)', borderRadius: 8,
              padding: '6px 12px', cursor: 'pointer',
            }}>
              <LogOut size={12} /> Sair
            </button>
          ) : (
            <a href="/login" style={{ fontFamily: '"Inter", sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(240,244,248,.55)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.55)')}>
              Entrar
            </a>
          )}
          <a href="#planos" className="lp-btn-cta" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #3FFF21, #22e010)',
            color: '#0a1a05', borderRadius: 999,
            padding: '9px 20px', fontSize: 13, fontWeight: 700,
            fontFamily: '"Inter", sans-serif', textDecoration: 'none',
            transition: 'transform .2s, box-shadow .2s',
          }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 0 28px rgba(63,255,33,.55)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = 'none'; }}
          >
            Começar <ArrowRight size={14} />
          </a>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '128px 24px 96px', textAlign: 'center' }}>
        {/* Grid bg */}
        <div className="lp-bg-grid" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

        {/* Aurora */}
        <div className="lp-aurora" style={{
          position: 'absolute', left: '50%', top: 0,
          width: 1200, height: 600,
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse at top, rgba(63,255,33,.18), transparent 60%)',
          pointerEvents: 'none',
        }} />

        {/* Particles */}
        <ParticlesField />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto' }}>
          <div className="lp-fade-in lp-d1">
            <SectionLabel>Plataforma de Trading Esportivo</SectionLabel>
          </div>

          <h1 className="lp-fade-in lp-d2" style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 900, fontSize: 'clamp(38px,5.5vw,72px)',
            lineHeight: 1.03, letterSpacing: '-0.03em',
            color: '#F0F4F8', marginBottom: 24,
          }}>
            O mercado{' '}
            <span style={{ color: '#3FFF21' }}>se move rápido.</span>
            <br />Você ainda mais.
          </h1>

          <p className="lp-fade-in lp-d3" style={{
            fontFamily: '"Inter", sans-serif', fontSize: 18, lineHeight: 1.7,
            color: 'rgba(240,244,248,.55)', maxWidth: '58ch', margin: '0 auto 40px',
          }}>
            Encontre surebets, extraia freebets e gerencie bancas varrendo{' '}
            <span style={{ fontWeight: 600, color: 'rgba(240,244,248,.85)' }}>30+ casas em tempo real</span>.
            Organize operações e contas num único painel feito para quem vive de odds.
          </p>

          <div className="lp-fade-in lp-d4" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 36 }}>
            <a href="#planos" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #3FFF21, #22e010)',
              color: '#0a1a05', borderRadius: 999, padding: '14px 32px',
              fontSize: 15, fontWeight: 700, fontFamily: '"Inter", sans-serif',
              textDecoration: 'none', transition: 'transform .2s, box-shadow .2s',
              boxShadow: '0 10px 40px -10px rgba(63,255,33,.6)',
            }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 15px 50px -10px rgba(63,255,33,.8)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = '0 10px 40px -10px rgba(63,255,33,.6)'; }}
            >
              Começar agora <ArrowRight size={16} />
            </a>
            <a href="#recursos" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.03)',
              color: 'rgba(240,244,248,.8)', borderRadius: 999, padding: '14px 28px',
              fontSize: 15, fontWeight: 600, fontFamily: '"Inter", sans-serif',
              textDecoration: 'none', transition: 'background .2s, border-color .2s',
            }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,.06)'; el.style.borderColor = 'rgba(255,255,255,.22)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,.03)'; el.style.borderColor = 'rgba(255,255,255,.12)'; }}
            >
              Ver recursos
            </a>
          </div>

          {/* Stars */}
          <div className="lp-fade-in lp-d5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 64 }}>
            <div style={{ display: 'flex' }}>
              {[0,1,2,3,4].map(i => <Star key={i} size={13} color="#3FFF21" fill="#3FFF21" />)}
            </div>
            <span style={{ fontFamily: '"Inter", sans-serif', fontSize: 12, color: 'rgba(240,244,248,.4)' }}>4.9 — usado por traders profissionais em todo o Brasil</span>
          </div>

          {/* Mockup */}
          <div className="lp-fade-in lp-d6">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* ══════════ STATS STRIP ══════════ */}
      <section style={{
        borderTop: '1px solid rgba(255,255,255,.06)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        background: 'rgba(255,255,255,.02)',
        padding: '48px 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 32 }} className="md:grid-cols-4">
          {[
            { ref: ops.ref,    value: ops.value.toLocaleString('pt-BR'),                      label: 'Operações registradas'    },
            { ref: lucro.ref,  value: 'R$ ' + Math.round(lucro.value).toLocaleString('pt-BR'), label: 'Lucro gerado por traders'  },
            { ref: casas.ref,  value: casas.value + '+',                                       label: 'Casas monitoradas'         },
            { ref: acerto.ref, value: acerto.value.toFixed(1) + '%',                           label: 'Taxa de acerto média'      },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900,
                letterSpacing: '-0.02em', color: '#3FFF21',
              }}>
                <span ref={s.ref}>{s.value}</span>
              </div>
              <div style={{ fontFamily: '"Inter", sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(240,244,248,.35)', marginTop: 8 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ BOOKMAKER MARQUEE ══════════ */}
      <section style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,.06)', padding: '40px 0' }}>
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(240,244,248,.28)' }}>
            Integrado com as principais casas do mercado
          </p>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
          <div style={{ display: 'flex', animation: 'lp-marquee 36s linear infinite', width: 'max-content' }}>
            {[...BOOKMAKERS, ...BOOKMAKERS].map((b, i) => (
              <span key={i} style={{
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700,
                letterSpacing: '-0.01em', color: 'rgba(240,244,248,.28)',
                paddingRight: 48, whiteSpace: 'nowrap',
                transition: 'color .2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.28)')}
              >{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FEATURES GRID ══════════ */}
      <section id="recursos" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <SectionLabel>Ferramentas</SectionLabel>
            <h2 style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 900, fontSize: 'clamp(32px,4vw,52px)',
              letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 18,
            }}>
              Tudo que um trader sério precisa
              <br />
              <span style={{ color: '#3FFF21' }}>numa única plataforma.</span>
            </h2>
            <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 17, color: 'rgba(240,244,248,.5)', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.7 }}>
              Surebet, extração de freebet, gestão de bancas e múltiplas contas. Pare de pular entre planilhas, sites e abas do navegador.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                style={{
                  position: 'relative', overflow: 'hidden',
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,.08)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,.04) 0%, transparent 100%)',
                  padding: 28,
                  transition: 'border-color .25s, transform .25s',
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = `${f.color}44`;
                  el.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(255,255,255,.08)';
                  el.style.transform = 'translateY(0)';
                }}
              >
                {/* Hover glow */}
                <div style={{
                  position: 'absolute', right: 0, top: 0,
                  width: 120, height: 120,
                  transform: 'translate(50%, -50%)',
                  borderRadius: '50%',
                  background: `${f.color}18`,
                  filter: 'blur(32px)',
                  pointerEvents: 'none',
                }} />

                <div style={{ position: 'relative' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    border: `1px solid ${f.color}28`,
                    background: `${f.color}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20,
                  }}>
                    <f.icon size={22} color={f.color} />
                  </div>

                  <div style={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.2em',
                    color: `${f.color}bb`, marginBottom: 8,
                  }}>{f.tag}</div>

                  <h3 style={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontWeight: 700, fontSize: 20,
                    letterSpacing: '-0.02em', marginBottom: 12, color: '#F0F4F8',
                  }}>{f.title}</h3>

                  <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 14, lineHeight: 1.75, color: 'rgba(240,244,248,.5)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FREEBET SHOWCASE ══════════ */}
      <section style={{
        borderTop: '1px solid rgba(255,255,255,.06)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        background: 'linear-gradient(180deg, transparent, rgba(63,255,33,.02) 50%, transparent)',
        padding: '100px 24px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 64 }} className="grid grid-cols-1 lg:grid-cols-2 items-center">
          {/* Copy */}
          <div>
            <SectionLabel>Exclusivo</SectionLabel>
            <h2 style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 900, fontSize: 'clamp(28px,3.5vw,48px)',
              letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 20,
            }}>
              Extração de freebet que <span style={{ color: '#3FFF21' }}>paga sozinha</span> a mensalidade.
            </h2>
            <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 16, color: 'rgba(240,244,248,.55)', lineHeight: 1.75, marginBottom: 32 }}>
              Ferramenta proprietária que identifica os jogos com maior taxa de conversão de freebets em tempo real. Mais de 30 casas filtradas simultaneamente — você recebe pronto qual jogo, qual odd, qual stake.
            </p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                'Identificação automática das melhores conversões',
                'Filtros por mercado, esporte, casa e valor mínimo',
                'Cálculo de stake e ROI já feito para você',
                'Alertas em tempo real quando aparece oportunidade',
              ].map(t => (
                <li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(63,255,33,.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 2,
                  }}>
                    <Check size={11} color="#3FFF21" strokeWidth={3} />
                  </div>
                  <span style={{ fontFamily: '"Inter", sans-serif', fontSize: 15, color: 'rgba(240,244,248,.8)', lineHeight: 1.6 }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Freebet table */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', inset: -24, borderRadius: 32, background: 'rgba(63,255,33,.08)', filter: 'blur(40px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, border: '1px solid rgba(63,255,33,.2)', background: 'oklch(0.18 0.02 240)', boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'oklch(0.20 0.02 240)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Gift size={14} color="#3FFF21" />
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#F0F4F8' }}>Extração de Freebet</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="lp-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#3FFF21', display: 'block' }} />
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#3FFF21' }}>LIVE</span>
                </div>
              </div>

              {/* Rows */}
              {[
                { match: 'Liverpool vs Chelsea',     market: 'Over 2.5',    conv: 87, odd: '2.10', houses: 4 },
                { match: 'Real Madrid vs Atlético',  market: 'BTTS',        conv: 82, odd: '1.95', houses: 6 },
                { match: 'Inter vs Milan',            market: 'Match Result', conv: 78, odd: '2.40', houses: 5 },
                { match: 'Flamengo vs Palmeiras',    market: 'Over 1.5',    conv: 74, odd: '1.45', houses: 3 },
                { match: 'Bayern vs Dortmund',       market: 'Over 3.5',    conv: 71, odd: '2.85', houses: 4 },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 20px',
                  borderBottom: i < 4 ? '1px solid rgba(255,255,255,.05)' : undefined,
                  transition: 'background .15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: '"Inter", sans-serif', fontSize: 13, fontWeight: 600, color: '#F0F4F8', marginBottom: 3 }}>{row.match}</div>
                    <div style={{ fontFamily: '"Inter", sans-serif', fontSize: 11, color: 'rgba(240,244,248,.4)' }}>{row.market} · {row.houses} casas</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 15, fontWeight: 700, color: '#3FFF21' }}>{row.conv}%</div>
                    <div style={{ fontSize: 10, color: 'rgba(240,244,248,.35)' }}>conversão</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 700, color: '#F0F4F8' }}>{row.odd}</div>
                    <div style={{ fontSize: 10, color: 'rgba(240,244,248,.35)' }}>odd</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ WORKFLOW ══════════ */}
      <section id="como-funciona" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <SectionLabel>Como funciona</SectionLabel>
            <h2 style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 900, fontSize: 'clamp(28px,3.8vw,52px)',
              letterSpacing: '-0.03em', lineHeight: 1.08,
            }}>
              Em 4 passos você está <span style={{ color: '#3FFF21' }}>operando lucro real.</span>
            </h2>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Connector line */}
            <div className="hidden lg:block" style={{
              position: 'absolute', left: 0, right: 0, top: 48,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(63,255,33,.3), transparent)',
              pointerEvents: 'none',
            }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 24 }}>
              {WORKFLOW.map((w, i) => (
                <div key={w.n} style={{ position: 'relative' }}>
                  <div style={{
                    position: 'relative', zIndex: 1,
                    width: 96, height: 96,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 20, marginBottom: 20,
                    border: '1px solid rgba(63,255,33,.2)',
                    background: 'oklch(0.20 0.02 240)',
                    boxShadow: '0 1px 0 rgba(255,255,255,.05) inset, 0 30px 80px -30px rgba(0,0,0,.6)',
                  }}>
                    <w.icon size={28} color="#3FFF21" />
                    <span style={{
                      position: 'absolute', top: -8, right: -8,
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3FFF21, #22e010)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 900,
                      color: '#0a1a05',
                    }}>{w.n}</span>
                  </div>
                  <h3 style={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontWeight: 700, fontSize: 18,
                    letterSpacing: '-0.02em', marginBottom: 10, color: '#F0F4F8',
                  }}>{w.title}</h3>
                  <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 14, color: 'rgba(240,244,248,.45)', lineHeight: 1.7 }}>{w.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ PRICING ══════════ */}
      <section id="planos" style={{
        background: 'rgba(255,255,255,.015)',
        borderTop: '1px solid rgba(255,255,255,.06)',
        padding: '100px 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <SectionLabel>Planos</SectionLabel>
            <h2 style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 900, fontSize: 'clamp(28px,3.8vw,52px)',
              letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 16,
            }}>
              Investimento que <span style={{ color: '#3FFF21' }}>se paga na primeira semana.</span>
            </h2>
            <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 16, color: 'rgba(240,244,248,.45)', lineHeight: 1.65, maxWidth: '44ch', margin: '0 auto' }}>
              Comece em poucos minutos. Cancele quando quiser. Garantia de 7 dias.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {LANDING_PLANS.map((plan, i) => {
              const isFeatured = plan.id === 'quarterly';
              const url = landingCheckoutUrl(plan.id, email);
              return (
                <div key={plan.id} style={{
                  position: 'relative', borderRadius: 24, padding: 32,
                  border: isFeatured ? '1.5px solid rgba(63,255,33,.4)' : '1px solid rgba(255,255,255,.08)',
                  background: isFeatured
                    ? 'linear-gradient(180deg, rgba(63,255,33,.08) 0%, transparent 100%)'
                    : 'rgba(255,255,255,.02)',
                  boxShadow: isFeatured ? '0 30px 80px -30px rgba(63,255,33,.35)' : 'none',
                  display: 'flex', flexDirection: 'column',
                  transition: 'transform .25s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  {plan.badge && (
                    <div style={{
                      position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #3FFF21, #22e010)',
                      borderRadius: 999, padding: '4px 14px',
                      fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                      fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                      color: '#0a1a05', whiteSpace: 'nowrap',
                    }}>{plan.badge}</div>
                  )}

                  <h3 style={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em',
                    color: '#F0F4F8', marginBottom: 20,
                  }}>{plan.label}</h3>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 900, fontSize: 48, letterSpacing: '-0.03em', color: '#F0F4F8', lineHeight: 1 }}>
                      R$ {plan.price.toLocaleString('pt-BR')}
                    </span>
                    <span style={{ fontFamily: '"Inter", sans-serif', fontSize: 13, color: 'rgba(240,244,248,.35)' }}>/{plan.period.replace('por ', '')}</span>
                  </div>

                  {plan.id !== 'monthly' && (
                    <div style={{ fontFamily: '"Inter", sans-serif', fontSize: 13, color: 'rgba(240,244,248,.45)', marginBottom: 6 }}>
                      R$ {plan.perMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                    </div>
                  )}

                  {plan.savings && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      marginBottom: 24, padding: '3px 10px', borderRadius: 6,
                      background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.2)',
                      fontFamily: '"Inter", sans-serif', fontSize: 12, fontWeight: 700, color: '#3FFF21',
                    }}>
                      <TrendingUp size={10} /> {plan.savings}
                    </div>
                  )}

                  {!plan.savings && <div style={{ marginBottom: 24 }} />}

                  <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, marginBottom: 24 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <Check size={16} color="#3FFF21" style={{ flexShrink: 0, marginTop: 2 }} strokeWidth={2.5} />
                        <span style={{ fontFamily: '"Inter", sans-serif', fontSize: 14, color: 'rgba(240,244,248,.75)' }}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Payment badges */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {[{ Icon: QrCode, label: 'PIX' }, { Icon: CreditCard, label: 'Cartão' }].map(({ Icon, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,.05)', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 700, color: 'rgba(240,244,248,.4)' }}>
                        <Icon size={10} /> {label}
                      </div>
                    ))}
                  </div>

                  <a
                    href={url}
                    target={url.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px 20px', borderRadius: 999,
                      fontFamily: '"Inter", sans-serif', fontSize: 14, fontWeight: 700,
                      textDecoration: 'none', transition: 'transform .2s, box-shadow .2s',
                      ...(isFeatured
                        ? { background: 'linear-gradient(135deg, #3FFF21, #22e010)', color: '#0a1a05', boxShadow: '0 10px 30px -10px rgba(63,255,33,.6)' }
                        : { background: 'rgba(255,255,255,.06)', color: '#F0F4F8', border: '1px solid rgba(255,255,255,.1)' }),
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.transform = 'scale(1.02)';
                      if (!isFeatured) { el.style.background = 'rgba(63,255,33,.1)'; el.style.borderColor = 'rgba(63,255,33,.3)'; }
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.transform = 'scale(1)';
                      if (!isFeatured) { el.style.background = 'rgba(255,255,255,.06)'; el.style.borderColor = 'rgba(255,255,255,.1)'; }
                    }}
                  >
                    <Zap size={13} /> Assinar {PLAN_LABELS[plan.id]}
                  </a>
                </div>
              );
            })}
          </div>

          {/* Trust signals */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginTop: 36, flexWrap: 'wrap' }}>
            {[
              { icon: <Shield size={13} />, text: 'Pagamento seguro via Cakto' },
              { icon: <Zap size={13} />, text: 'Acesso imediato após pagamento' },
              { icon: <TrendingUp size={13} />, text: 'Cancele quando quiser' },
            ].map(item => (
              <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: '"Inter", sans-serif', fontSize: 12, color: 'rgba(240,244,248,.35)' }}>
                {item.icon} {item.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section id="faq" style={{
        borderTop: '1px solid rgba(255,255,255,.06)',
        padding: '100px 24px',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <SectionLabel>Dúvidas</SectionLabel>
            <h2 style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 900, fontSize: 'clamp(28px,3.5vw,48px)',
              letterSpacing: '-0.03em',
            }}>Perguntas frequentes</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{
                overflow: 'hidden', borderRadius: 16,
                border: openFaq === i ? '1px solid rgba(63,255,33,.3)' : '1px solid rgba(255,255,255,.08)',
                background: openFaq === i ? 'rgba(63,255,33,.04)' : 'rgba(255,255,255,.02)',
                transition: 'border-color .2s, background .2s',
              }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 16, padding: '20px 24px',
                    background: 'none', border: 'none', color: '#F0F4F8', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>{item.q}</span>
                  <ChevronDown size={20} color="#3FFF21" style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform .3s cubic-bezier(0.22, 1, 0.36, 1)' }} />
                </button>
                <div style={{
                  maxHeight: openFaq === i ? '400px' : 0,
                  overflow: 'hidden',
                  transition: 'max-height 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                }}>
                  <p style={{ padding: '0 24px 20px', fontFamily: '"Inter", sans-serif', fontSize: 14, lineHeight: 1.8, color: 'rgba(240,244,248,.5)' }}>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CTA FINAL ══════════ */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '100px 24px', textAlign: 'center' }}>
        <div className="lp-bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }} />
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 800, height: 400,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: 'rgba(63,255,33,.12)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 900, fontSize: 'clamp(36px,5.5vw,68px)',
            letterSpacing: '-0.04em', lineHeight: 0.99, marginBottom: 24,
            color: '#F0F4F8',
          }}>
            Pare de operar no escuro.<br />
            <span style={{ color: '#3FFF21' }}>Comece hoje.</span>
          </h2>
          <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 17, color: 'rgba(240,244,248,.5)', lineHeight: 1.65, marginBottom: 44 }}>
            Junte-se aos traders que transformaram apostas em uma operação séria, organizada e lucrativa.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
            <a href="/pricing" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'linear-gradient(135deg, #3FFF21, #22e010)',
              color: '#0a1a05', borderRadius: 999,
              padding: '16px 44px', fontSize: 16, fontWeight: 800,
              fontFamily: '"Inter", sans-serif', textDecoration: 'none',
              boxShadow: '0 10px 40px -10px rgba(63,255,33,.7)',
              transition: 'transform .2s, box-shadow .2s',
            }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1.03)'; el.style.boxShadow = '0 16px 56px -10px rgba(63,255,33,.9)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'scale(1)'; el.style.boxShadow = '0 10px 40px -10px rgba(63,255,33,.7)'; }}
            >
              Garantir meu acesso <ArrowRight size={18} />
            </a>
            <span style={{ fontFamily: '"Inter", sans-serif', fontSize: 13, color: 'rgba(240,244,248,.35)' }}>Garantia incondicional de 7 dias</span>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '36px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #3FFF21, #22e010)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={14} color="#0a1a05" strokeWidth={2.6} />
            </div>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 900, fontSize: 16, letterSpacing: '-0.02em' }}>SureEdge</span>
          </div>
          <p style={{ fontFamily: '"Inter", sans-serif', color: 'rgba(240,244,248,.28)', fontSize: 12 }}>
            © {new Date().getFullYear()} SureEdge. Trading esportivo, organizado.
          </p>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Termos', 'Privacidade', 'Suporte', 'Login'].map(l => (
              <a key={l} href={l === 'Login' ? '/login' : '#'} style={{ fontFamily: '"Inter", sans-serif', color: 'rgba(240,244,248,.28)', fontSize: 12, textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#F0F4F8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,244,248,.28)')}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* ══════════ STYLES ══════════ */}
      <style>{`
        .lp-root { --lp-primary: #3FFF21; }

        /* Background grid */
        .lp-bg-grid {
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent 75%);
        }

        /* Aurora pulse */
        @keyframes lp-aurora {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.55; }
          50%       { transform: translateX(-50%) translateY(2%) scale(1.08); opacity: 0.75; }
        }
        .lp-aurora { animation: lp-aurora 14s ease-in-out infinite; }

        /* Pulse dot */
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.85); }
        }
        .lp-pulse-dot { animation: lp-pulse 1.6s ease-in-out infinite; }

        /* Hero fade-in stagger */
        @keyframes lp-fade-up {
          from { opacity: 0; transform: translateY(24px); filter: blur(4px); }
          to   { opacity: 1; transform: none; filter: blur(0); }
        }
        .lp-fade-in { animation: lp-fade-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .lp-d1 { animation-delay: 0ms; }
        .lp-d2 { animation-delay: 80ms; }
        .lp-d3 { animation-delay: 160ms; }
        .lp-d4 { animation-delay: 240ms; }
        .lp-d5 { animation-delay: 320ms; }
        .lp-d6 { animation-delay: 500ms; }

        /* Mockup items */
        @keyframes lp-mockup-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }

        /* Chart path draw */
        @keyframes lp-chart-draw {
          from { stroke-dashoffset: 600; }
          to   { stroke-dashoffset: 0; }
        }

        /* Bookmaker marquee */
        @keyframes lp-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* FAQ structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
    </div>
  );
}
