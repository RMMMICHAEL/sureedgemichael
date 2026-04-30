'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { PLAN_PRICES, type PlanId } from '@/lib/supabase/subscription';
import {
  Zap, TrendingUp, Shield, BarChart2, Calculator,
  Upload, ChevronDown, Check, Star, ArrowRight,
  Target, Trophy, LogOut, Activity, Database,
} from 'lucide-react';

// ─── Canvas Particles ─────────────────────────────────────────────────────────

function ParticlesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; alpha: number };

    const N = 70;
    const particles: Particle[] = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.3 + 0.06,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(63,255,33,${p.alpha})`;
        ctx.fill();
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(63,255,33,${0.055 * (1 - dist / 110)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };

    draw();
    const onResize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

// ─── Animated Number Counter ──────────────────────────────────────────────────

function useCounter(target: number, duration = 2000, decimals = 0) {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(+(eased * target).toFixed(decimals));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration, decimals]);

  return { ref, value };
}

// ─── Scroll Reveal ────────────────────────────────────────────────────────────

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Fake Dashboard Mockup ────────────────────────────────────────────────────

function DashboardMockup() {
  return (
    <div style={{
      background: '#0A0F14', borderRadius: 16,
      border: '1px solid rgba(63,255,33,.15)', overflow: 'hidden',
      boxShadow: '0 40px 120px rgba(0,0,0,.85), 0 0 60px rgba(63,255,33,.09)',
    }}>
      {/* Window chrome */}
      <div style={{ background: '#0D1117', borderBottom: '1px solid rgba(255,255,255,.06)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: '#FF4D6D' }} />
        <div style={{ width: 10, height: 10, borderRadius: 5, background: '#FFD600' }} />
        <div style={{ width: 10, height: 10, borderRadius: 5, background: '#3FFF21' }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'rgba(63,255,33,.6)' }}>dashboard.sureedge.app</span>
      </div>
      {/* Content */}
      <div style={{ padding: 18, display: 'flex', gap: 14 }}>
        {/* Mini sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
          {[BarChart2, TrendingUp, Calculator, Target, Database].map((Icon, i) => (
            <div key={i} style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: i === 0 ? 'rgba(63,255,33,.14)' : 'rgba(255,255,255,.04)',
              border: i === 0 ? '1px solid rgba(63,255,33,.28)' : '1px solid rgba(255,255,255,.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={15} color={i === 0 ? '#3FFF21' : '#4A5E6E'} />
            </div>
          ))}
        </div>
        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Lucro Total', value: 'R$ 4.820', color: '#3FFF21', sub: '↑ +12.4%' },
              { label: 'Operações', value: '247', color: '#4DA6FF', sub: '↑ +8 hoje' },
              { label: 'ROI Médio', value: '3.8%', color: '#FFD600', sub: '↑ +0.3%' },
            ].map(k => (
              <div key={k.label} style={{ background: '#131920', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ fontSize: 9, color: '#6A7E8E', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color, fontFamily: 'JetBrains Mono' }}>{k.value}</div>
                <div style={{ fontSize: 9, color: 'rgba(63,255,33,.7)', marginTop: 3 }}>{k.sub}</div>
              </div>
            ))}
          </div>
          {/* Chart */}
          <div style={{ background: '#131920', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,.06)', marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: '#6A7E8E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evolução do Saldo</div>
            <svg width="100%" height={54} viewBox="0 0 260 54" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3FFF21" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#3FFF21" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 50 L32 44 L65 36 L97 28 L130 20 L162 14 L195 9 L227 5 L260 2"
                stroke="#3FFF21" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M0 50 L32 44 L65 36 L97 28 L130 20 L162 14 L195 9 L227 5 L260 2 L260 54 L0 54Z"
                fill="url(#dashGrad)" />
              <circle cx="260" cy="2" r="3" fill="#3FFF21" opacity="0.9" />
            </svg>
          </div>
          {/* Mini table */}
          <div style={{ background: '#131920', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
            {[
              { casa: 'Bet365', evento: 'Man City vs Arsenal', roi: '+4.2%' },
              { casa: 'Pinnacle', evento: 'PSG vs Bayern', roi: '+5.1%' },
              { casa: 'Betfair', evento: 'Djokovic vs Alcaraz', roi: '+2.8%' },
            ].map((row, i) => (
              <div key={i} style={{
                padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,.04)' : undefined,
              }}>
                <span style={{ fontSize: 10, color: '#8899AA', flex: '0 0 60px' }}>{row.casa}</span>
                <span style={{ fontSize: 10, color: '#6A7E8E', flex: 1 }}>{row.evento}</span>
                <span style={{ fontSize: 10, color: '#3FFF21', fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{row.roi}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Mockup (for showcase section) ─────────────────────────────────

function AnalyticsMockup() {
  return (
    <div style={{
      background: '#0A0F14', borderRadius: 16,
      border: '1px solid rgba(63,255,33,.12)', overflow: 'hidden',
      boxShadow: '0 30px 100px rgba(0,0,0,.75), 0 0 50px rgba(63,255,33,.07)',
    }}>
      <div style={{ background: '#0D1117', borderBottom: '1px solid rgba(255,255,255,.06)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: '#FF4D6D' }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, background: '#FFD600' }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, background: '#3FFF21' }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'rgba(63,255,33,.6)' }}>Analytics — Out 2025</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Lucro Net', val: 'R$ 12.480', col: '#3FFF21', sub: '↑ +23.4% vs mês ant.' },
            { label: 'Total Investido', val: 'R$ 45.200', col: '#4DA6FF', sub: '247 operações' },
            { label: 'ROI Médio', val: '3.84%', col: '#FFD600', sub: 'Top 10% traders' },
            { label: 'Win Rate', val: '94.3%', col: '#A78BFA', sub: 'Últimas 247 ops' },
          ].map(k => (
            <div key={k.label} style={{ background: '#131920', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontSize: 9, color: '#6A7E8E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.col, fontFamily: 'JetBrains Mono' }}>{k.val}</div>
              <div style={{ fontSize: 9, color: 'rgba(63,255,33,.65)', marginTop: 3 }}>{k.sub}</div>
            </div>
          ))}
        </div>
        {/* Performance bars */}
        <div style={{ background: '#131920', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
            <span style={{ fontSize: 9, color: '#3A4A5A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Performance por Bookmaker</span>
          </div>
          {[
            { name: 'Bet365', roi: 4.2, bar: 82 },
            { name: 'Pinnacle', roi: 5.1, bar: 100 },
            { name: 'Betfair', roi: 2.8, bar: 55 },
            { name: 'Betano', roi: 3.6, bar: 70 },
          ].map((bm, i) => (
            <div key={i} style={{ padding: '9px 14px', borderBottom: i < 3 ? '1px solid rgba(255,255,255,.04)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: '#8899AA' }}>{bm.name}</span>
                <span style={{ fontSize: 11, color: '#3FFF21', fontFamily: 'JetBrains Mono', fontWeight: 700 }}>+{bm.roi}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${bm.bar}%`, background: 'linear-gradient(90deg,#3FFF21,#00CC6E)', borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Plans config ─────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'monthly' as PlanId, label: 'Mensal',
    price: PLAN_PRICES.monthly,
    perMonth: PLAN_PRICES.monthly,
    period: 'por mês',
    featured: false, badge: null as string | null, savings: null as string | null,
    features: ['Dashboard completo', 'Operações ilimitadas', 'Importação Google Sheets', 'Calculadora de surebet', 'Análise de performance', 'Suporte via e-mail'],
  },
  {
    id: 'quarterly' as PlanId, label: 'Trimestral',
    price: PLAN_PRICES.quarterly,
    perMonth: +(PLAN_PRICES.quarterly / 3).toFixed(2),
    period: 'por trimestre',
    featured: true, badge: 'MAIS POPULAR', savings: 'Economize 15%',
    features: ['Tudo do Mensal', '3 meses de acesso', 'Prioridade no suporte', 'Relatórios avançados', 'Histórico completo', 'Exportação de dados'],
  },
  {
    id: 'annual' as PlanId, label: 'Anual',
    price: PLAN_PRICES.annual,
    perMonth: +(PLAN_PRICES.annual / 12).toFixed(2),
    period: 'por ano',
    featured: false, badge: null, savings: 'Economize 32%',
    features: ['Tudo do Trimestral', '12 meses de acesso', 'Acesso antecipado', 'Suporte prioritário', 'API de integração', 'Relatório mensal exclusivo'],
  },
];

function checkoutUrl(planId: PlanId, email: string): string {
  const base =
    planId === 'monthly'   ? process.env.NEXT_PUBLIC_CAKTO_URL_MONTHLY :
    planId === 'quarterly' ? process.env.NEXT_PUBLIC_CAKTO_URL_QUARTERLY :
                             process.env.NEXT_PUBLIC_CAKTO_URL_ANNUAL;
  if (!base) return '#';
  try {
    const url = new URL(base);
    if (email) url.searchParams.set('email', email);
    return url.toString();
  } catch { return base; }
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const FAQ = [
  { q: 'O que é surebet?', a: 'Surebet é uma técnica onde você aposta em todos os resultados possíveis de um evento em diferentes casas de apostas, garantindo lucro independente do resultado. O SureEdge ajuda você a registrar, monitorar e analisar essas operações.' },
  { q: 'O SureEdge encontra surebets automaticamente?', a: 'O SureEdge é uma plataforma de gestão e analytics. Você registra suas operações e a plataforma analisa performance, calcula ROI e organiza seu histórico. A calculadora integrada distribui stakes automaticamente.' },
  { q: 'Preciso de conhecimento técnico?', a: 'Não. A interface foi projetada para ser intuitiva. Em menos de 5 minutos você já registra sua primeira operação e visualiza seu dashboard com métricas de performance em tempo real.' },
  { q: 'Posso importar minha planilha existente?', a: 'Sim! O SureEdge suporta importação direta via Google Sheets. Configure o link uma vez e o sistema sincroniza automaticamente a cada minuto sem nenhuma ação da sua parte.' },
  { q: 'Quantas casas de apostas são suportadas?', a: 'Mais de 37 casas estão pré-configuradas com logos e dados, incluindo Bet365, Betfair, Pinnacle, Sportingbet, Betano e muitas outras. Você também pode adicionar casas personalizadas.' },
  { q: 'O pagamento é seguro?', a: 'Sim. Utilizamos a plataforma Cakto para processar pagamentos com total segurança. Aceitamos PIX (com desconto), cartão de crédito e débito. O acesso é liberado imediatamente após confirmação.' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function LandingPage() {
  const [email, setEmail] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useScrollReveal();

  // counter hooks — must be called unconditionally (Rules of Hooks)
  const ops    = useCounter(2847, 2200);
  const lucro  = useCounter(1243890, 2500);
  const casas  = useCounter(37, 1400);
  const acerto = useCounter(94.2, 2000, 1);

  useEffect(() => {
    const sb = getSupabaseClient();
    sb.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  const handleLogout = async () => {
    const sb = getSupabaseClient();
    await sb.auth.signOut();
    window.location.href = '/login';
  };

  const handleSubscribe = (planId: PlanId) => {
    const url = checkoutUrl(planId, email);
    if (url !== '#') window.open(url, '_blank');
  };

  // ── Shared section label ──────────────────────────────────────────────────
  const SectionLabel = ({ text }: { text: string }) => (
    <div style={{
      display: 'inline-block', color: '#3FFF21', fontSize: 11, fontWeight: 700,
      fontFamily: 'JetBrains Mono', letterSpacing: '0.14em',
      background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.2)',
      borderRadius: 999, padding: '5px 16px', marginBottom: 20,
    }}>{text}</div>
  );

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--t)', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ════════════════════════ NAV ════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(3,5,7,.88)', backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        padding: '0 28px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#3FFF21 0%,#00CC6E 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={18} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 18, letterSpacing: '-0.02em' }}>
            SureEdge
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="#recursos" style={{ color: 'var(--t3)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Recursos</a>
          <a href="#como-funciona" style={{ color: 'var(--t3)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Como funciona</a>
          <a href="#precos" style={{ color: 'var(--t3)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Planos</a>
          {email ? (
            <button onClick={handleLogout} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'var(--t3)', fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            }}>
              <LogOut size={13} /> Sair
            </button>
          ) : (
            <a href="/login" style={{
              color: '#3FFF21', fontSize: 13, fontWeight: 700,
              background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.22)',
              borderRadius: 8, padding: '6px 16px', textDecoration: 'none',
            }}>Entrar</a>
          )}
          <a href="#precos" className="btn-cta" style={{
            background: '#3FFF21', color: '#030507',
            borderRadius: 9, padding: '8px 20px',
            fontSize: 13, fontWeight: 800, textDecoration: 'none',
            boxShadow: '0 0 20px rgba(63,255,33,.3)',
          }}>Assinar agora</a>
        </div>
      </nav>

      {/* ════════════════════════ HERO ════════════════════════ */}
      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', alignItems: 'center', paddingTop: 64,
        overflow: 'hidden',
      }}>
        <ParticlesCanvas />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% -5%, rgba(63,255,33,.09) 0%, transparent 55%)', pointerEvents: 'none', animation: 'hero-glow-pulse 6s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 40% 50% at 85% 85%, rgba(63,255,33,.05) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div className="dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.45 }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '60px 28px', width: '100%' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* Left copy */}
            <div className="animate-fade-in">
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.22)',
                borderRadius: 999, padding: '5px 16px', marginBottom: 32,
              }}>
                <div className="live-dot" />
                <span style={{ color: '#3FFF21', fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>
                  PLATAFORMA PROFISSIONAL DE SUREBET
                </span>
              </div>

              <h1 style={{
                fontFamily: 'Manrope', fontWeight: 900,
                fontSize: 'clamp(44px, 5.5vw, 76px)',
                lineHeight: 1.02, letterSpacing: '-0.04em',
                marginBottom: 24,
              }}>
                SUREBET.<br />
                <span style={{ color: '#3FFF21' }}>CALCULADA.</span><br />
                DOMINADA.
              </h1>

              <p style={{ color: 'var(--t2)', fontSize: 18, lineHeight: 1.65, marginBottom: 40, maxWidth: 480 }}>
                O dashboard profissional que transformou como traders de esportes monitoram lucro,
                calculam stakes e dominam o mercado de surebets.
              </p>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 44 }}>
                <a href="#precos" className="btn-cta" style={{
                  background: '#3FFF21', color: '#030507',
                  borderRadius: 11, padding: '15px 32px',
                  fontSize: 15, fontWeight: 800, textDecoration: 'none',
                  boxShadow: '0 0 32px rgba(63,255,33,.4), 0 4px 24px rgba(0,0,0,.4)',
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                }}>
                  Começar agora <ArrowRight size={18} />
                </a>
                <a href="#como-funciona" style={{
                  background: 'rgba(255,255,255,.06)', color: 'var(--t)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 11, padding: '15px 28px',
                  fontSize: 15, fontWeight: 600, textDecoration: 'none',
                }}>
                  Como funciona
                </a>
              </div>

              {/* Social proof */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ display: 'flex' }}>
                  {['#2563EB','#7C3AED','#DB2777','#D97706'].map((c, i) => (
                    <div key={i} style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: c, border: '2px solid var(--bg)',
                      marginLeft: i > 0 ? -11 : 0,
                    }} />
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                    {[1,2,3,4,5].map(i => <Star key={i} size={13} color="#FFD600" fill="#FFD600" />)}
                  </div>
                  <div style={{ color: 'var(--t3)', fontSize: 12 }}>+500 traders ativos hoje</div>
                </div>
              </div>
            </div>

            {/* Right — Dashboard float */}
            <div className="animate-float hidden lg:block" style={{ animationDuration: '4s', animationDelay: '0.3s' }}>
              <DashboardMockup />
            </div>
          </div>

          {/* Scroll indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 64, opacity: 0.35 }}>
            <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'JetBrains Mono', letterSpacing: '0.12em' }}>SCROLL</span>
            <ChevronDown size={16} color="var(--t3)" className="animate-float" />
          </div>
        </div>
      </section>

      {/* ════════════════════════ STATS BAR ════════════════════════ */}
      <section style={{ background: '#0A0F14', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {([
              { ref: ops.ref,    value: ops.value,    label: 'Operações Rastreadas', prefix: '',    suffix: '+',  color: '#4DA6FF' },
              { ref: lucro.ref,  value: lucro.value,  label: 'Em Lucro Rastreado',   prefix: 'R$', suffix: '',   color: '#3FFF21' },
              { ref: casas.ref,  value: casas.value,  label: 'Casas Conectadas',     prefix: '',    suffix: '+',  color: '#FFD600' },
              { ref: acerto.ref, value: acerto.value, label: 'Taxa de Acerto Médio', prefix: '',    suffix: '%',  color: '#A78BFA' },
            ] as Array<{ ref: React.RefObject<HTMLDivElement>; value: number; label: string; prefix: string; suffix: string; color: string }>)
              .map((s, i) => (
                <div key={i} ref={s.ref} style={{
                  padding: '36px 28px', textAlign: 'center',
                  borderRight: i < 3 ? '1px solid rgba(255,255,255,.06)' : undefined,
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,.04)' : undefined,
                }}>
                  <div style={{
                    fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: s.color,
                    fontFamily: 'JetBrains Mono', letterSpacing: '-0.03em', lineHeight: 1,
                  }}>
                    {s.prefix}{s.value.toLocaleString('pt-BR')}{s.suffix}
                  </div>
                  <div style={{ color: 'var(--t3)', fontSize: 13, marginTop: 8 }}>{s.label}</div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ FEATURES ════════════════════════ */}
      <section id="recursos" style={{ padding: '100px 28px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <SectionLabel text="FUNCIONALIDADES" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(32px, 4vw, 54px)', letterSpacing: '-0.03em', marginBottom: 16 }}>
              Tudo que você precisa.<br />Em um só lugar.
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: 17, maxWidth: 520, margin: '0 auto' }}>
              Ferramentas profissionais para quem leva surebet a sério e quer lucrar com dados, não com sorte.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Upload, color: '#4DA6FF',
                title: 'Importação Automática',
                desc: 'Conecte seu Google Sheets uma vez. O SureEdge sincroniza automaticamente a cada minuto — sem copiar, sem colar.',
                items: ['Google Sheets nativo', 'Sync automático em 60s', 'Histórico completo'],
              },
              {
                icon: BarChart2, color: '#3FFF21',
                title: 'Analytics Avançado',
                desc: 'Dashboard Bloomberg-style com gráficos de saldo, ROI por bookmaker, win rate por esporte e filtros por período.',
                items: ['ROI por casa de apostas', 'Gráficos interativos', 'Filtros e comparativos'],
              },
              {
                icon: Calculator, color: '#FFD600',
                title: 'Calculadora Surebet',
                desc: 'Calcule stakes e lucros garantidos em segundos. Suporte a 2 e 3 outcomes com alocação automática por saldo.',
                items: ['2 e 3 outcomes', 'Alocação automática', 'Lucro mínimo garantido'],
              },
            ].map((f, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 1}`}
                style={{
                  background: '#0D1117', borderRadius: 18,
                  border: '1px solid rgba(255,255,255,.07)',
                  padding: 30, cursor: 'default',
                  transition: 'border-color .25s, transform .25s, box-shadow .25s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(63,255,33,.22)';
                  el.style.transform = 'translateY(-6px)';
                  el.style.boxShadow = '0 24px 60px rgba(0,0,0,.5), 0 0 40px rgba(63,255,33,.07)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(255,255,255,.07)';
                  el.style.transform = 'none';
                  el.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 14, marginBottom: 22,
                  background: `${f.color}14`, border: `1px solid ${f.color}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <f.icon size={24} color={f.color} />
                </div>
                <h3 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 20, marginBottom: 12 }}>{f.title}</h3>
                <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.7, marginBottom: 22 }}>{f.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {f.items.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.22)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={11} color="#3FFF21" strokeWidth={3} />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--t2)' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Additional features grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {[
              { icon: Shield, label: 'Dados criptografados', color: '#A78BFA' },
              { icon: Activity, label: 'Updates em tempo real', color: '#3FFF21' },
              { icon: Database, label: '+37 casas de apostas', color: '#4DA6FF' },
              { icon: Trophy, label: 'ROI médio de 3.8%', color: '#FFD600' },
            ].map((item, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 1}`} style={{
                background: '#0D1117', borderRadius: 12,
                border: '1px solid rgba(255,255,255,.06)',
                padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `${item.color}10`, border: `1px solid ${item.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <item.icon size={18} color={item.color} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ HOW IT WORKS ════════════════════════ */}
      <section id="como-funciona" style={{ background: '#0A0F14', padding: '100px 28px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 72 }}>
            <SectionLabel text="COMO FUNCIONA" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(32px, 4vw, 54px)', letterSpacing: '-0.03em' }}>
              3 passos para lucrar<br />com inteligência.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10" style={{ position: 'relative' }}>
            {/* Connector line (desktop) */}
            <div className="hidden md:block" style={{
              position: 'absolute', top: 32, left: '18%', right: '18%', height: 1,
              background: 'linear-gradient(90deg, rgba(63,255,33,.08), rgba(63,255,33,.28), rgba(63,255,33,.08))',
            }} />

            {[
              { step: '01', icon: Upload, title: 'Registre suas operações', desc: 'Importe do Google Sheets ou cadastre manualmente. O sistema categoriza por esporte, casa e resultado automaticamente, sem nenhum trabalho extra da sua parte.' },
              { step: '02', icon: BarChart2, title: 'Analytics em tempo real', desc: 'Visualize ROI, evolução do saldo e performance por bookmaker em dashboards atualizados a cada minuto. Identifique onde você ganha mais.' },
              { step: '03', icon: Trophy, title: 'Lucre com dados', desc: 'Use a calculadora integrada para distribuir stakes com precisão matemática. Tome decisões baseadas em dados, não em intuição ou feeling.' },
            ].map((step, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 1}`} style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{
                  width: 68, height: 68, borderRadius: '50%', margin: '0 auto 28px',
                  background: 'linear-gradient(135deg, rgba(63,255,33,.14) 0%, rgba(63,255,33,.04) 100%)',
                  border: '1px solid rgba(63,255,33,.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 30px rgba(63,255,33,.12)', position: 'relative', zIndex: 1,
                }}>
                  <step.icon size={28} color="#3FFF21" />
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(63,255,33,.45)', letterSpacing: '0.12em', marginBottom: 12 }}>PASSO {step.step}</div>
                <h3 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 19, marginBottom: 14 }}>{step.title}</h3>
                <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.7 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ DASHBOARD SHOWCASE ════════════════════════ */}
      <section style={{ padding: '100px 28px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left copy */}
            <div className="reveal-left">
              <SectionLabel text="DASHBOARD PROFISSIONAL" />
              <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(30px, 3.5vw, 50px)', letterSpacing: '-0.03em', marginBottom: 20 }}>
                Bloomberg terminal.<br />Para surebettors.
              </h2>
              <p style={{ color: 'var(--t2)', fontSize: 16, lineHeight: 1.75, marginBottom: 36 }}>
                Interface dark-mode premium inspirada em terminais de trading profissional.
                Cada dado no lugar certo, cada métrica no momento certo — sem ruído visual.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  { icon: TrendingUp, text: 'Gráficos de evolução de saldo em tempo real', color: '#3FFF21' },
                  { icon: Target, text: 'ROI detalhado por bookmaker, esporte e período', color: '#4DA6FF' },
                  { icon: Shield, text: 'Calculadora de surebet integrada e inteligente', color: '#FFD600' },
                  { icon: Activity, text: 'Dashboard atualizado automaticamente a cada minuto', color: '#A78BFA' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      background: `${item.color}12`, border: `1px solid ${item.color}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <item.icon size={17} color={item.color} />
                    </div>
                    <span style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.6, paddingTop: 9 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Right — Analytics mockup floating */}
            <div className="reveal-right animate-float hidden lg:block" style={{ animationDuration: '4.5s' }}>
              <AnalyticsMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════ PRICING ════════════════════════ */}
      <section id="precos" style={{ background: '#0A0F14', padding: '100px 28px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <SectionLabel text="PLANOS" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(32px, 4vw, 54px)', letterSpacing: '-0.03em', marginBottom: 16 }}>
              Sem taxas escondidas.<br />Sem surpresas.
            </h2>
            <p style={{ color: 'var(--t2)', fontSize: 17, maxWidth: 480, margin: '0 auto' }}>
              Escolha o plano ideal para sua operação. Cancele a qualquer momento sem burocracia.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => {
              if (plan.featured) {
                return (
                  <div key={plan.id} className={`reveal reveal-delay-${i + 1}`}
                    style={{ position: 'relative', padding: 2, borderRadius: 20, overflow: 'hidden' }}>
                    {/* Rotating gradient border */}
                    <div style={{
                      position: 'absolute', inset: '-100%',
                      background: 'conic-gradient(from 0deg, #3FFF21 0deg, #00CC6E 60deg, rgba(63,255,33,.1) 120deg, rgba(63,255,33,.1) 240deg, #3FFF21 360deg)',
                      animation: 'border-rotate 4s linear infinite',
                    }} />
                    <div style={{
                      position: 'relative', background: '#0D1117',
                      borderRadius: 18, padding: 30, height: '100%',
                    }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center',
                        background: 'rgba(63,255,33,.14)', color: '#3FFF21',
                        borderRadius: 999, padding: '4px 14px',
                        fontSize: 10, fontWeight: 800, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
                        marginBottom: 24,
                      }}>★ {plan.badge}</div>
                      <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{plan.label}</div>
                      <div style={{ fontSize: 12, color: '#3FFF21', marginBottom: 20 }}>{plan.savings}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, color: 'var(--t3)' }}>R$</span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 900, fontSize: 48, color: '#3FFF21', letterSpacing: '-0.04em', lineHeight: 1 }}>
                          {plan.perMonth.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div style={{ color: 'var(--t3)', fontSize: 12, marginBottom: 28 }}>por mês · cobrado {plan.period}</div>
                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        className="btn-cta"
                        style={{
                          width: '100%', padding: '15px', borderRadius: 11,
                          background: '#3FFF21', color: '#030507',
                          fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer',
                          boxShadow: '0 0 24px rgba(63,255,33,.38)', marginBottom: 28,
                        }}
                      >
                        Assinar {plan.label}
                      </button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        {plan.features.map(f => (
                          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Check size={14} color="#3FFF21" />
                            <span style={{ fontSize: 13, color: 'var(--t2)' }}>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={plan.id} className={`reveal reveal-delay-${i + 1}`} style={{
                  background: '#0D1117', borderRadius: 20, padding: 30,
                  border: '1px solid rgba(255,255,255,.08)',
                }}>
                  <div style={{ height: 36, marginBottom: 24 }}>
                    {plan.badge && (
                      <div style={{
                        display: 'inline-flex', background: 'rgba(255,255,255,.08)',
                        borderRadius: 999, padding: '4px 14px', fontSize: 10,
                        fontWeight: 800, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em', color: 'var(--t3)',
                      }}>{plan.badge}</div>
                    )}
                  </div>
                  <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{plan.label}</div>
                  <div style={{ fontSize: 12, color: plan.savings ? '#FFD600' : 'transparent', marginBottom: 20, minHeight: 18 }}>{plan.savings ?? '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: 'var(--t3)' }}>R$</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 900, fontSize: 48, color: 'var(--t)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                      {plan.perMonth.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div style={{ color: 'var(--t3)', fontSize: 12, marginBottom: 28 }}>por mês · cobrado {plan.period}</div>
                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    style={{
                      width: '100%', padding: '14px', borderRadius: 11,
                      background: 'rgba(255,255,255,.08)', color: 'var(--t)',
                      border: '1px solid rgba(255,255,255,.12)',
                      fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 28,
                      transition: 'background .2s, border-color .2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(255,255,255,.12)'; }}
                    onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(255,255,255,.08)'; }}
                  >
                    Assinar {plan.label}
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Check size={14} color="rgba(63,255,33,.65)" />
                        <span style={{ fontSize: 13, color: 'var(--t2)' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="reveal" style={{ textAlign: 'center', marginTop: 36, color: 'var(--t3)', fontSize: 13 }}>
            ✓ PIX com desconto &nbsp;·&nbsp; ✓ Cartão de crédito em até 12x &nbsp;·&nbsp; ✓ Acesso imediato após confirmação &nbsp;·&nbsp; ✓ Cancele quando quiser
          </div>
        </div>
      </section>

      {/* ════════════════════════ FAQ ════════════════════════ */}
      <section id="faq" style={{ padding: '100px 28px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 60 }}>
            <SectionLabel text="FAQ" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 46px)', letterSpacing: '-0.03em' }}>
              Perguntas frequentes
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FAQ.map((item, i) => (
              <div key={i} className="reveal" style={{
                background: '#0D1117', borderRadius: 14,
                border: `1px solid ${openFaq === i ? 'rgba(63,255,33,.22)' : 'rgba(255,255,255,.07)'}`,
                overflow: 'hidden', transition: 'border-color .2s',
              }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', padding: '20px 24px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'none', border: 'none', color: 'var(--t)',
                    cursor: 'pointer', textAlign: 'left', gap: 20,
                  }}
                >
                  <span style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 15 }}>{item.q}</span>
                  <ChevronDown size={18} color="var(--t3)" style={{
                    flexShrink: 0,
                    transform: openFaq === i ? 'rotate(180deg)' : 'none',
                    transition: 'transform .2s',
                  }} />
                </button>
                {openFaq === i && (
                  <div style={{
                    padding: '0 24px 22px',
                    color: 'var(--t2)', fontSize: 14, lineHeight: 1.75,
                    borderTop: '1px solid rgba(255,255,255,.05)',
                    paddingTop: 0,
                  }}>
                    <div style={{ paddingTop: 18 }}>{item.a}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ CTA FINAL ════════════════════════ */}
      <section style={{
        padding: '110px 28px', textAlign: 'center',
        background: 'linear-gradient(135deg, #051005 0%, #0A1A0A 50%, #051005 100%)',
        borderTop: '1px solid rgba(63,255,33,.12)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(63,255,33,.07) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div className="reveal" style={{ maxWidth: 660, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.25)',
            borderRadius: 999, padding: '6px 18px', marginBottom: 36,
          }}>
            <div className="live-dot" />
            <span style={{ color: '#3FFF21', fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>COMECE HOJE MESMO</span>
          </div>
          <h2 style={{
            fontFamily: 'Manrope', fontWeight: 900,
            fontSize: 'clamp(36px, 5.5vw, 68px)',
            letterSpacing: '-0.04em', lineHeight: 1.04, marginBottom: 24,
          }}>
            Pare de perder dinheiro<br />sem dados.
          </h2>
          <p style={{ color: 'var(--t2)', fontSize: 18, lineHeight: 1.65, marginBottom: 44 }}>
            Junte-se a +500 traders que já transformaram sua operação com o SureEdge.
            Acesso imediato após assinatura — sem fidelidade, sem surpresas.
          </p>
          <a href="#precos" className="btn-cta" style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            background: '#3FFF21', color: '#030507',
            borderRadius: 14, padding: '20px 48px',
            fontSize: 18, fontWeight: 900, textDecoration: 'none',
            boxShadow: '0 0 48px rgba(63,255,33,.45), 0 8px 36px rgba(0,0,0,.5)',
          }}>
            Escolher meu plano <ArrowRight size={22} />
          </a>
          <div style={{ marginTop: 28, color: 'var(--t3)', fontSize: 13 }}>
            Sem fidelidade &nbsp;·&nbsp; Cancele quando quiser &nbsp;·&nbsp; PIX disponível
          </div>
        </div>
      </section>

      {/* ════════════════════════ FOOTER ════════════════════════ */}
      <footer style={{ background: '#030507', borderTop: '1px solid rgba(255,255,255,.05)', padding: '40px 28px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'linear-gradient(135deg,#3FFF21 0%,#00CC6E 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={15} color="#000" strokeWidth={2.5} />
            </div>
            <span style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 16 }}>SureEdge</span>
          </div>
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>© 2025 SureEdge. Plataforma de gestão de surebets profissional.</div>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Termos', 'Privacidade', 'Suporte'].map(l => (
              <a key={l} href="#" style={{ color: 'var(--t3)', fontSize: 13, textDecoration: 'none' }}>{l}</a>
            ))}
            <a href="/login" style={{ color: 'var(--t3)', fontSize: 13, textDecoration: 'none' }}>Login</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
