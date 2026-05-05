'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { PLAN_PRICES, PLAN_LABELS, type PlanId } from '@/lib/supabase/subscription';
import {
  Zap, TrendingUp, Shield, BarChart2, Calculator,
  Upload, ChevronDown, Check, ArrowRight,
  Target, Trophy, LogOut, Database, Activity,
  QrCode, CreditCard,
} from 'lucide-react';

// ─── Pricing data (mirrors /pricing) ─────────────────────────────────────────

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
    features: ['Dashboard completo', 'Operações ilimitadas', 'Importação de planilha', 'Análise de performance', 'Calculadora de surebet', 'Suporte via e-mail'],
  },
  {
    id: 'quarterly', label: 'Trimestral',
    price: PLAN_PRICES.quarterly, perMonth: +(PLAN_PRICES.quarterly / 3).toFixed(2),
    period: 'por trimestre', savings: 'Economize 15%', badge: 'POPULAR',
    features: ['Tudo do Mensal', '3 meses de acesso', 'Prioridade no suporte', 'Relatórios avançados'],
  },
  {
    id: 'annual', label: 'Anual',
    price: PLAN_PRICES.annual, perMonth: +(PLAN_PRICES.annual / 12).toFixed(2),
    period: 'por ano', savings: 'Economize 32%',
    features: [
      'Tudo do Trimestral',
      '12 meses de acesso',
      'Acesso antecipado a novidades',
      'Suporte prioritário',
      'Planilha personalizada (não Green Surebet)',
      'Curso de operações ao vivo',
      'Acesso a métodos exclusivos',
    ],
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

// ─── Scroll Reveal ─────────────────────────────────────────────────────────────

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.06, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right')
      .forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Hero Screenshot ───────────────────────────────────────────────────────────

function HeroScreenshot() {
  return (
    <div style={{ position: 'relative' }}>

      {/* Ambient glow behind the image */}
      <div style={{
        position: 'absolute', inset: -40,
        borderRadius: 40,
        background: 'radial-gradient(ellipse 80% 70% at 50% 55%, rgba(63,255,33,.2) 0%, transparent 70%)',
        pointerEvents: 'none',
        animation: 'hero-glow-pulse 3.5s ease-in-out infinite',
      }} />

      {/* Image — no border, just shadow + float */}
      <div style={{
        position: 'relative',
        animation: 'lp-float 5.5s ease-in-out infinite',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dashboard-preview.png"
          alt="SureEdge — dashboard de gestão de surebets com laptop e smartphone mostrando lucro e ROI"
          width={1300}
          height={870}
          fetchPriority="high"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: 12,
            boxShadow: '0 40px 100px rgba(0,0,0,.7), 0 0 80px rgba(63,255,33,.12)',
          }}
        />

        {/* Scan line sweep */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, transparent 0%, rgba(63,255,33,.04) 48%, rgba(63,255,33,.08) 50%, rgba(63,255,33,.04) 52%, transparent 100%)',
            animation: 'hero-scan 6s ease-in-out infinite',
          }} />
        </div>
      </div>

      {/* Floating stat badges */}
      <div style={{
        position: 'absolute', bottom: -16, left: -18,
        background: '#0D1520',
        border: '1px solid rgba(63,255,33,.28)',
        borderRadius: 10, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 9,
        boxShadow: '0 8px 32px rgba(0,0,0,.5)',
        animation: 'hero-badge-in .8s cubic-bezier(.16,1,.3,1) both',
        animationDelay: '900ms',
        opacity: 0,
      }}>
        <TrendingUp size={13} color="#3FFF21" />
        <div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#3FFF21', lineHeight: 1 }}>+R$ 9.247</div>
          <div style={{ fontFamily: 'Figtree', fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>lucro este mês</div>
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 40, right: -20,
        background: '#0D1520',
        border: '1px solid rgba(77,166,255,.28)',
        borderRadius: 10, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 9,
        boxShadow: '0 8px 32px rgba(0,0,0,.5)',
        animation: 'hero-badge-in .8s cubic-bezier(.16,1,.3,1) both',
        animationDelay: '1100ms',
        opacity: 0,
      }}>
        <Activity size={13} color="#4DA6FF" />
        <div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#4DA6FF', lineHeight: 1 }}>3.84%</div>
          <div style={{ fontFamily: 'Figtree', fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>ROI médio</div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Mockup ──────────────────────────────────────────────────────────

function DashboardMockup() {
  return (
    <div style={{ background: '#0A0F14', borderRadius: 12, border: '1px solid rgba(63,255,33,.28)', overflow: 'hidden' }}>
      <div style={{ background: '#0D1117', borderBottom: '1px solid rgba(255,255,255,.06)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 9, height: 9, borderRadius: 5, background: '#FF4D6D' }} />
        <div style={{ width: 9, height: 9, borderRadius: 5, background: '#FFD600' }} />
        <div style={{ width: 9, height: 9, borderRadius: 5, background: '#3FFF21' }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'rgba(63,255,33,.5)' }}>dashboard.sureedge.app</span>
      </div>
      <div style={{ padding: 16, display: 'flex', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[BarChart2, TrendingUp, Calculator, Target, Database].map((Icon, i) => (
            <div key={i} style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: i === 0 ? 'rgba(63,255,33,.12)' : 'rgba(255,255,255,.04)',
              border: i === 0 ? '1px solid rgba(63,255,33,.24)' : '1px solid rgba(255,255,255,.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={14} color={i === 0 ? '#3FFF21' : '#3A4A5A'} />
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
            {[
              { label: 'Lucro Total', value: 'R$ 4.820', color: '#3FFF21' },
              { label: 'Operações',   value: '247',      color: '#4DA6FF' },
              { label: 'ROI Médio',   value: '3.8%',     color: '#FFD600' },
            ].map(k => (
              <div key={k.label} style={{ background: '#131920', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,.05)' }}>
                <div style={{ fontSize: 8, color: '#4A5E6E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: 'JetBrains Mono' }}>{k.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#131920', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,.05)', marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: '#3A4A5A', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evolução do Saldo</div>
            <svg width="100%" height={44} viewBox="0 0 240 44" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3FFF21" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#3FFF21" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 40 L30 34 L60 26 L90 20 L120 14 L150 9 L180 6 L210 3 L240 1"
                stroke="#3FFF21" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M0 40 L30 34 L60 26 L90 20 L120 14 L150 9 L180 6 L210 3 L240 1 L240 44 L0 44Z"
                fill="url(#dg1)" />
              <circle cx="240" cy="1" r="2.5" fill="#3FFF21" />
            </svg>
          </div>
          <div style={{ background: '#131920', borderRadius: 8, border: '1px solid rgba(255,255,255,.05)', overflow: 'hidden' }}>
            {[{ casa: 'Bet365', roi: '+4.2%' }, { casa: 'Pinnacle', roi: '+5.1%' }, { casa: 'Betfair', roi: '+2.8%' }].map((r, i) => (
              <div key={i} style={{ padding: '7px 10px', display: 'flex', justifyContent: 'space-between', borderBottom: i < 2 ? '1px solid rgba(255,255,255,.04)' : undefined }}>
                <span style={{ fontSize: 9, color: '#6A7E8E' }}>{r.casa}</span>
                <span style={{ fontSize: 9, color: '#3FFF21', fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{r.roi}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Full Dashboard Mockup ────────────────────────────────────────────────────

const S = {
  bg:    '#0A0F14',
  panel: '#0F1620',
  card:  '#131B24',
  line:  'rgba(255,255,255,.05)',
  t1:    '#D0DBE8',
  t2:    '#7A8FA0',
  t3:    '#3A4E60',
  g:     '#3FFF21',
  y:     '#FFD600',
  b:     '#4DA6FF',
  p:     '#A78BFA',
  r:     '#FF4D6D',
  mono:  'JetBrains Mono, monospace',
};

function MCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: S.card, border: `1px solid ${S.line}`, borderRadius: 8, padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.7 }} />
      <div style={{ fontSize: 8, color: S.t3, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: S.mono, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: S.t3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div style={{ padding: '6px 10px', borderBottom: `1px solid ${S.line}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: S.t2 }}>{label}</span>
        <span style={{ fontSize: 9, color, fontFamily: S.mono, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 2, background: 'rgba(255,255,255,.06)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 1, opacity: 0.85 }} />
      </div>
    </div>
  );
}

function FullDashboardMockup() {
  // Evolução saldo SVG path points — realistic upward trend with dips
  const pts = [[0,68],[18,62],[36,55],[52,50],[68,44],[82,39],[96,33],[110,37],[124,30],[138,24],[152,19],[166,22],[180,15],[194,10],[208,6],[220,9],[232,4],[244,1]];
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
  const areaD = pathD + ` L${pts[pts.length-1][0]} 72 L0 72Z`;

  const SPORTS = [
    { name: 'Futebol',    ops: 142, roi: 4.1, pct: 100, col: S.g },
    { name: 'Tênis',      ops: 67,  roi: 3.8, pct: 78,  col: S.b },
    { name: 'Basquete',   ops: 31,  roi: 3.2, pct: 55,  col: S.y },
    { name: 'E-Sports',   ops: 18,  roi: 2.9, pct: 40,  col: S.p },
  ];

  const CROSS = [
    { pair: 'Bet365 / Pinnacle',    ops: 88, roi: 5.2, pct: 100 },
    { pair: 'Betfair / Betano',     ops: 54, roi: 4.7, pct: 90  },
    { pair: 'Pinnacle / 1xBet',     ops: 43, roi: 4.1, pct: 79  },
    { pair: 'Sportsbet / Betway',   ops: 29, roi: 3.6, pct: 62  },
    { pair: 'Bet365 / Sportingbet', ops: 22, roi: 3.1, pct: 50  },
  ];

  const OPS = [
    { evento: 'Man City × Arsenal',   casa: 'Bet365/Pinnacle', lucro: '+R$ 210', roi: '4.7%', status: 'LUCRO' },
    { evento: 'Djokovic × Alcaraz',   casa: 'Betano/Betfair',  lucro: '+R$ 96',  roi: '2.8%', status: 'LUCRO' },
    { evento: 'Lakers × Warriors',    casa: 'Pinnacle/1xBet',  lucro: '+R$ 158', roi: '5.1%', status: 'LUCRO' },
    { evento: 'PSG × Bayern Munich',  casa: 'Bet365/Betway',   lucro: '+R$ 127', roi: '3.9%', status: 'LUCRO' },
  ];

  const NAV_ICONS = ['▣', '↗', '◎', '⊞', '✦'];

  return (
    <div style={{ background: S.bg, borderRadius: 12, border: '1px solid rgba(63,255,33,.22)', overflow: 'hidden', fontSize: 10, userSelect: 'none' }}>

      {/* ── Titlebar ── */}
      <div style={{ background: '#080D12', borderBottom: `1px solid ${S.line}`, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: '#FF4D6D' }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, background: '#FFD600' }} />
        <div style={{ width: 8, height: 8, borderRadius: 4, background: '#3FFF21' }} />
        <div style={{ flex: 1, margin: '0 10px', background: '#0D1520', border: `1px solid ${S.line}`, borderRadius: 5, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: S.g, opacity: 0.6 }} />
          <span style={{ fontFamily: S.mono, fontSize: 8, color: S.t3 }}>app.sureedge.com.br/dashboard</span>
        </div>
        <span style={{ fontFamily: S.mono, fontSize: 8, color: 'rgba(63,255,33,.4)' }}>Mai 2025</span>
      </div>

      {/* ── App body ── */}
      <div style={{ display: 'flex', height: 'auto' }}>

        {/* Sidebar */}
        <div style={{ width: 34, background: '#080D12', borderRight: `1px solid ${S.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: S.g, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#050A06' }}>⚡</span>
          </div>
          {NAV_ICONS.map((ic, i) => (
            <div key={i} style={{
              width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i === 0 ? 'rgba(63,255,33,.14)' : 'rgba(255,255,255,.03)',
              border: i === 0 ? '1px solid rgba(63,255,33,.22)' : '1px solid transparent',
              fontSize: 9, color: i === 0 ? S.g : S.t3,
            }}>{ic}</div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.t1, letterSpacing: '-0.01em' }}>Dashboard</div>
              <div style={{ fontSize: 8, color: S.t3, marginTop: 1 }}>Período: 01 Mai — 31 Mai 2025</div>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {['7d','30d','90d'].map((l, i) => (
                <div key={l} style={{ padding: '2px 7px', borderRadius: 4, fontFamily: S.mono, fontSize: 8, fontWeight: 700,
                  background: i === 1 ? 'rgba(63,255,33,.14)' : 'rgba(255,255,255,.04)',
                  color: i === 1 ? S.g : S.t3,
                  border: i === 1 ? '1px solid rgba(63,255,33,.22)' : '1px solid transparent',
                }}>{l}</div>
              ))}
            </div>
          </div>

          {/* KPI row — 4 cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            <MCard label="Lucro Total"  value="R$ 9.247"  sub="+R$ 1.280 este mês" color={S.g} />
            <MCard label="ROI Médio"    value="3.84%"     sub="↑ 0.2pp vs anterior" color={S.y} />
            <MCard label="Win Rate"     value="94.6%"     sub="258 de 273 ops" color={S.b} />
            <MCard label="Investido"    value="R$ 62.400" sub="Banca alocada" color={S.p} />
          </div>

          {/* Saldo chart + Top Esportes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 6 }}>

            {/* Chart */}
            <div style={{ background: S.card, border: `1px solid ${S.line}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 8, color: S.t3, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Evolução do Saldo</span>
                <span style={{ fontFamily: S.mono, fontSize: 9, color: S.g, fontWeight: 700 }}>+R$ 9.247</span>
              </div>
              <svg width="100%" height={72} viewBox="0 0 244 72" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mg2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3FFF21" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#3FFF21" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                {[18, 36, 54].map(y => (
                  <line key={y} x1="0" y1={y} x2="244" y2={y} stroke="rgba(255,255,255,.04)" strokeWidth="1" />
                ))}
                <path d={areaD} fill="url(#mg2)" />
                <path d={pathD} stroke="#3FFF21" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill="#3FFF21" />
                <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="5" fill="#3FFF21" fillOpacity="0.2" />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {['01/Mai','08/Mai','15/Mai','22/Mai','31/Mai'].map(d => (
                  <span key={d} style={{ fontFamily: S.mono, fontSize: 7, color: S.t3 }}>{d}</span>
                ))}
              </div>
            </div>

            {/* Top Esportes */}
            <div style={{ background: S.card, border: `1px solid ${S.line}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${S.line}` }}>
                <span style={{ fontSize: 8, color: S.t3, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Top Esportes</span>
              </div>
              {SPORTS.map(s => (
                <div key={s.name} style={{ padding: '5px 10px', borderBottom: `1px solid ${S.line}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: S.t2 }}>{s.name}</span>
                    <span style={{ fontSize: 9, fontFamily: S.mono, fontWeight: 700, color: s.col }}>+{s.roi}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 7, color: S.t3 }}>{s.ops} ops</span>
                  </div>
                  <div style={{ height: 2, background: 'rgba(255,255,255,.06)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.pct}%`, background: s.col, opacity: 0.75, borderRadius: 1 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Cruzamentos + Últimas Operações */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>

            {/* Top Cruzamentos */}
            <div style={{ background: S.card, border: `1px solid ${S.line}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${S.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 8, color: S.t3, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Top Cruzamentos</span>
                <span style={{ fontSize: 7, color: S.t3 }}>por ROI</span>
              </div>
              {CROSS.map((c, i) => (
                <MiniBar key={i} label={c.pair} value={`+${c.roi}%`} pct={c.pct} color={S.g} />
              ))}
            </div>

            {/* Últimas Operações */}
            <div style={{ background: S.card, border: `1px solid ${S.line}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${S.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 8, color: S.t3, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Últimas Operações</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: S.g, opacity: 0.8 }} />
                  <span style={{ fontSize: 7, color: S.g }}>AO VIVO</span>
                </div>
              </div>
              {OPS.map((op, i) => (
                <div key={i} style={{ padding: '6px 10px', borderBottom: i < OPS.length - 1 ? `1px solid ${S.line}` : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: S.t1, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{op.evento}</span>
                    <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.g }}>{op.lucro}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 7, color: S.t3 }}>{op.casa}</span>
                    <span style={{ fontFamily: S.mono, fontSize: 7, color: S.y }}>ROI {op.roi}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Static data ──────────────────────────────────────────────────────────────

const TICKER = [
  'Bet365 / Betfair · Man City vs Arsenal · +R$ 127,50 · ROI 3.8%',
  'Pinnacle / 1xBet · NBA Finals · +R$ 96,00 · ROI 5.2%',
  'Sportingbet · Djokovic vs Alcaraz · +R$ 84,20 · ROI 2.1%',
  'Betano / Bet365 · PSG vs Bayern Munich · +R$ 210,00 · ROI 4.7%',
  'Pinnacle · Liga dos Campeões · +R$ 145,00 · ROI 3.9%',
  'Betfair Exchange · Medvedev vs Alcaraz · +R$ 96,80 · ROI 2.8%',
  'Bet365 · Real Madrid vs Atlético · +R$ 158,00 · ROI 3.2%',
];

const FEATURES = [
  {
    n: '01', Icon: Upload, color: '#4DA6FF',
    title: 'Importação Automática',
    mono: 'Conecte. Esqueça. Funciona.',
    desc: 'Conecte sua planilha da Green Surebet via Google Sheets uma única vez. O SureEdge sincroniza automaticamente a cada 60 segundos — sem copiar, sem colar, sem trabalho manual.',
    tags: ['Google Sheets nativo', 'Sync a cada 60s', 'Histórico completo'],
  },
  {
    n: '02', Icon: BarChart2, color: '#3FFF21',
    title: 'Analytics Avançado',
    mono: 'Cada número no lugar certo.',
    desc: 'ROI por bookmaker, evolução do saldo, win rate por esporte e filtros por período. Dados atualizados em tempo real para identificar onde você ganha mais e onde está deixando dinheiro na mesa.',
    tags: ['ROI por casa', 'Gráficos interativos', 'Filtros por período'],
  },
  {
    n: '03', Icon: Calculator, color: '#FFD600',
    title: 'Calculadora de Surebet',
    mono: 'Stakes com precisão matemática.',
    desc: 'Calcule stakes para operações de 2 e 3 outcomes com alocação automática baseada no seu saldo disponível. Lucro garantido, sem margem para erro humano de cálculo.',
    tags: ['2 e 3 outcomes', 'Alocação automática', 'Lucro garantido'],
  },
];

const FAQ = [
  { q: 'O que é surebet?', a: 'Surebet é uma técnica onde você aposta em todos os resultados possíveis de um evento em diferentes casas de apostas, garantindo lucro independente do resultado. O SureEdge ajuda você a registrar, monitorar e analisar essas operações com precisão.' },
  { q: 'O SureEdge encontra surebets automaticamente?', a: 'O SureEdge é uma plataforma de gestão e analytics. Você registra suas operações e a plataforma analisa performance, calcula ROI e organiza seu histórico. A calculadora integrada distribui stakes automaticamente entre os outcomes.' },
  { q: 'Preciso de conhecimento técnico para usar?', a: 'Não. A interface foi projetada para ser intuitiva. Em menos de 5 minutos você já registra sua primeira operação e visualiza seu dashboard com métricas de performance em tempo real.' },
  { q: 'Posso importar minha planilha da Green Surebet?', a: 'Sim! O SureEdge importa diretamente da planilha da Green Surebet via Google Sheets. Configure o link uma vez e o sistema sincroniza automaticamente a cada minuto — sem copiar, sem colar, sem esforço da sua parte.' },
  { q: 'Quantas casas de apostas são suportadas?', a: 'Mais de 37 casas estão pré-configuradas com logos e dados, incluindo Bet365, Betfair, Pinnacle, Sportingbet e Betano. Você também pode adicionar casas personalizadas.' },
  { q: 'O pagamento é seguro?', a: 'Sim. Utilizamos a plataforma Cakto para processar pagamentos com total segurança. Aceitamos PIX e cartão de crédito. O acesso é liberado imediatamente após a confirmação do pagamento.' },
];

// ─── FAQ JSON-LD (FAQPage schema) ─────────────────────────────────────────────

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

// ─── Main Component ────────────────────────────────────────────────────────────

export function LandingPage() {
  const [email,    setEmail]    = useState('');
  const [openFaq,  setOpenFaq]  = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useScrollReveal();

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

  const Label = ({ text }: { text: string }) => (
    <div style={{
      fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.16em', color: '#3FFF21', textTransform: 'uppercase',
      marginBottom: 18,
    }}>{text}</div>
  );

  return (
    <div style={{ background: '#050A06', color: 'var(--t)', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ══════════ NAV ══════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '0 32px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(5,10,6,.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : '1px solid transparent',
        transition: 'background .25s, border-color .25s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={17} color="#050A06" strokeWidth={2.5} />
          </div>
          <span style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 17, letterSpacing: '-0.02em' }}>SureEdge</span>
        </div>

        <div className="hidden lg:flex items-center gap-8">
          {[['#recursos','Recursos'],['#como-funciona','Como funciona'],['#precos','Planos']].map(([href, label]) => (
            <a key={href} href={href} style={{ color: 'var(--t3)', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--t)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}>
              {label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {email ? (
            <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--t3)', fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>
              <LogOut size={12} /> Sair
            </button>
          ) : (
            <a href="/login" style={{ color: 'var(--t3)', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--t)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}>
              Entrar
            </a>
          )}
          <a href="#precos" className="btn-cta" style={{
            background: '#3FFF21', color: '#050A06', borderRadius: 8,
            padding: '8px 18px', fontSize: 13, fontWeight: 800, textDecoration: 'none',
          }}>Assinar agora</a>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: 60, overflow: 'hidden' }}>
        <div className="line-grid" style={{ position: 'absolute', inset: 0, opacity: 0.6 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 55% at 42% -5%, rgba(63,255,33,.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 38% 40% at 95% 100%, rgba(63,255,33,.03) 0%, transparent 55%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '80px 32px 100px', width: '100%' }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-12 items-center">

            {/* Copy */}
            <div>
              <div className="lp-hero-in lp-hero-d1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28, fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: '#3FFF21', textTransform: 'uppercase' }}>
                <span className="live-dot" style={{ width: 6, height: 6 }} />
                Plataforma profissional de surebet
              </div>

              <h1 className="lp-hero-in lp-hero-d2" style={{
                fontFamily: 'Manrope', fontWeight: 900,
                fontSize: 'clamp(36px, 4.8vw, 64px)',
                lineHeight: 1.0, letterSpacing: '-0.04em',
                marginBottom: 24, color: '#F0F4F8',
              }}>
                Gestão profissional<br />
                de surebets com<br />
                <span style={{ color: '#3FFF21' }}>precisão de terminal.</span>
              </h1>

              <p className="lp-hero-in lp-hero-d3" style={{ fontFamily: 'Figtree', fontSize: 17, lineHeight: 1.65, color: 'var(--t2)', marginBottom: 36, maxWidth: '46ch' }}>
                O dashboard que traders sérios usam para registrar surebets, calcular stakes e monitorar ROI por casa de aposta em tempo real.
              </p>

              <div className="lp-hero-in lp-hero-d4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 44 }}>
                <a href="#precos" className="btn-cta" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#3FFF21', color: '#050A06', borderRadius: 8,
                  padding: '14px 28px', fontSize: 15, fontWeight: 800, textDecoration: 'none',
                }}>
                  Começar agora <ArrowRight size={16} />
                </a>
                <a href="#como-funciona" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'transparent', color: 'var(--t2)',
                  border: '1px solid rgba(255,255,255,.14)', borderRadius: 8,
                  padding: '14px 24px', fontSize: 15, fontWeight: 600, textDecoration: 'none',
                  transition: 'border-color .2s, color .2s',
                }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,.32)'; el.style.color = 'var(--t)'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,.14)'; el.style.color = 'var(--t2)'; }}
                >
                  Como funciona
                </a>
              </div>

              <div className="lp-hero-in lp-hero-d5" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex' }}>
                  {['#2563EB','#7C3AED','#DB2777','#D97706','#059669'].map((c, i) => (
                    <div key={i} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: '2px solid #050A06', marginLeft: i > 0 ? -9 : 0 }} />
                  ))}
                </div>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#3FFF21', fontWeight: 700 }}>+500 traders ativos</div>
                  <div style={{ fontFamily: 'Figtree', fontSize: 12, color: 'var(--t3)' }}>ROI médio de 3.8% por operação</div>
                </div>
              </div>
            </div>

            {/* Screenshot */}
            <div className="hidden lg:block lp-hero-in lp-hero-d3" style={{ paddingTop: 24, paddingBottom: 32 }}>
              <HeroScreenshot />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ TICKER TAPE ══════════ */}
      <div style={{ background: '#0A0F14', height: 40, overflow: 'hidden', position: 'relative', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(90deg,#0A0F14,transparent)', zIndex: 1 }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(270deg,#0A0F14,transparent)', zIndex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', animation: 'lp-marquee 44s linear infinite', width: 'max-content' }}>
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--t3)', paddingRight: 56, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#3FFF21', fontSize: 8 }}>●</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════ FEATURES — numbered rows ══════════ */}
      <section id="recursos" style={{ padding: '100px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="reveal" style={{ marginBottom: 64 }}>
            <Label text="Funcionalidades" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(36px, 4.5vw, 58px)', letterSpacing: '-0.04em', lineHeight: 1.05 }}>
              Tudo que o surebettor<br />
              <span style={{ color: 'var(--t2)', fontWeight: 700 }}>profissional precisa.</span>
            </h2>
          </div>

          {FEATURES.map((f, i) => (
            <div key={f.n} className={`reveal reveal-delay-${i + 1}`} style={{ borderTop: '1px solid rgba(255,255,255,.07)', padding: '52px 0', position: 'relative' }}>
              <div aria-hidden style={{
                position: 'absolute', left: -8, top: '50%', transform: 'translateY(-55%)',
                fontFamily: 'JetBrains Mono', fontWeight: 700,
                fontSize: 'clamp(80px, 10vw, 130px)',
                color: 'rgba(63,255,33,.04)', lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
              }}>{f.n}</div>

              <div className="grid grid-cols-1 lg:grid-cols-[80px_1fr_1fr] gap-8 lg:gap-x-16" style={{ position: 'relative', zIndex: 1 }}>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#3FFF21', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 14 }}>{f.n}</div>
                  <div style={{ width: 46, height: 46, borderRadius: 11, background: `${f.color}12`, border: `1px solid ${f.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <f.Icon size={20} color={f.color} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h3 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(20px, 2.2vw, 26px)', letterSpacing: '-0.03em', marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#3FFF21', letterSpacing: '0.04em' }}>{f.mono}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <p style={{ fontFamily: 'Figtree', fontSize: 15, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 18, maxWidth: '52ch' }}>{f.desc}</p>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {f.tags.map(tag => (
                      <span key={tag} style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--t3)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 4, padding: '4px 10px', letterSpacing: '0.03em' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div style={{ borderTop: '1px solid rgba(255,255,255,.07)' }} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
            {[
              { Icon: Shield,   label: 'Dados criptografados',  color: '#A78BFA' },
              { Icon: Activity, label: 'Updates em tempo real', color: '#3FFF21' },
              { Icon: Database, label: '+37 casas de apostas',  color: '#4DA6FF' },
              { Icon: Trophy,   label: 'ROI médio de 3.8%',     color: '#FFD600' },
            ].map((item, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 1}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10 }}>
                <item.Icon size={16} color={item.color} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: 'Figtree', fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ DASHBOARD SHOWCASE ══════════ */}
      <section style={{ background: '#0A0F14', padding: '100px 32px', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_640px] gap-10 items-center">
            <div className="reveal-left">
              <Label text="Dashboard" />
              <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(32px, 3.5vw, 50px)', letterSpacing: '-0.04em', lineHeight: 1.06, marginBottom: 24 }}>
                Terminal profissional.<br />
                <span style={{ color: '#3FFF21' }}>Para surebettors.</span>
              </h2>
              <p style={{ fontFamily: 'Figtree', fontSize: 16, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 36, maxWidth: '50ch' }}>
                Esqueça planilhas espalhadas e anotações perdidas. Saldo, ROI, win rate e performance por bookmaker em um painel consolidado, atualizado em tempo real e feito para quem leva o jogo a sério.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { col: '#3FFF21', text: 'Gráfico de evolução de saldo atualizado ao vivo' },
                  { col: '#4DA6FF', text: 'ROI detalhado por bookmaker, esporte e período' },
                  { col: '#FFD600', text: 'Calculadora integrada com distribuição automática de stakes' },
                  { col: '#A78BFA', text: 'Sincronização automática a cada 60 segundos' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.col, flexShrink: 0, marginTop: 8 }} />
                    <span style={{ fontFamily: 'Figtree', fontSize: 14, color: 'var(--t2)', lineHeight: 1.65 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="reveal-right hidden lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dashboard-imag.png"
                alt="Interface completa do SureEdge — dashboard de surebets com análise de ROI, gráfico de saldo e operações por casa de aposta"
                width={1300}
                height={870}
                loading="lazy"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  borderRadius: 12,
                  boxShadow: '0 40px 100px rgba(0,0,0,.7), 0 0 80px rgba(63,255,33,.1)',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ HOW IT WORKS ══════════ */}
      <section id="como-funciona" style={{ padding: '100px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 72 }}>
            <Label text="Como funciona" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(32px, 4vw, 54px)', letterSpacing: '-0.04em' }}>
              3 passos para lucrar<br />com inteligência.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3">
            {[
              { n: '01', Icon: Upload,    title: 'Registre', desc: 'Importe da planilha da Green Surebet via Google Sheets ou cadastre manualmente. Tudo categorizado em segundos.' },
              { n: '02', Icon: BarChart2, title: 'Analise',  desc: 'Visualize ROI, saldo e performance por bookmaker em dashboards atualizados a cada minuto.' },
              { n: '03', Icon: Trophy,    title: 'Lucre',    desc: 'Use a calculadora para distribuir stakes com precisão matemática. Decisões baseadas em dados, não em feeling.' },
            ].map((step, i) => (
              <div key={step.n} className={`reveal reveal-delay-${i + 1}`} style={{
                padding: '44px 36px',
                borderTop: `2px solid ${i === 0 ? '#3FFF21' : i === 1 ? 'rgba(63,255,33,.38)' : 'rgba(63,255,33,.16)'}`,
                borderRight: i < 2 ? '1px solid rgba(255,255,255,.06)' : undefined,
              }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#3FFF21', letterSpacing: '0.14em', marginBottom: 20 }}>PASSO {step.n}</div>
                <step.Icon size={26} color="#3FFF21" style={{ marginBottom: 20, display: 'block' }} />
                <h3 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 26, letterSpacing: '-0.03em', marginBottom: 12 }}>{step.title}</h3>
                <p style={{ fontFamily: 'Figtree', fontSize: 14, color: 'var(--t2)', lineHeight: 1.7 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PRICING ══════════ */}
      <section id="precos" style={{ background: '#0A0F14', padding: '100px 32px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>

          {/* Header */}
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
            <Label text="Planos" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 14 }}>
              Sem taxas escondidas.<br />Sem surpresas.
            </h2>
            <p style={{ fontFamily: 'Figtree', fontSize: 16, color: 'var(--t2)', lineHeight: 1.65, maxWidth: '44ch', margin: '0 auto' }}>
              Acesso completo ao SureEdge. Cancele quando quiser, sem burocracia.
            </p>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {LANDING_PLANS.map(plan => {
              const isFeatured = plan.id === 'quarterly';
              const url = landingCheckoutUrl(plan.id, email);
              return (
                <div key={plan.id} className="rounded-2xl flex flex-col overflow-hidden lp-card-hover" style={{
                  background:  isFeatured ? 'rgba(63,255,33,.07)' : 'rgba(255,255,255,.03)',
                  border:      isFeatured ? '1.5px solid rgba(63,255,33,.35)' : '1px solid rgba(255,255,255,.08)',
                  boxShadow:   isFeatured ? '0 0 40px rgba(63,255,33,.1)' : 'none',
                  position:    'relative',
                }}>
                  {/* Top accent bar */}
                  <div style={{
                    height: 3,
                    background: isFeatured
                      ? 'linear-gradient(90deg, #3FFF21 0%, rgba(63,255,33,.5) 60%, transparent 100%)'
                      : 'transparent',
                  }} />

                  {/* Badge */}
                  {plan.badge && (
                    <div style={{ position: 'absolute', top: 16, right: 16 }}>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', background: '#3FFF21', color: '#060A07', borderRadius: 999, padding: '3px 10px' }}>
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
                    {/* Plan name + price */}
                    <div>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: isFeatured ? '#3FFF21' : 'var(--t3)', marginBottom: 6 }}>
                        {plan.label}
                      </div>
                      <div style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 36, letterSpacing: '-0.03em', color: 'var(--t)', lineHeight: 1 }}>
                        R$ {plan.price.toLocaleString('pt-BR')}
                      </div>
                      <div style={{ fontFamily: 'Figtree', fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                        {plan.period}
                        {plan.id !== 'monthly' && (
                          <span style={{ color: 'var(--t2)', marginLeft: 6 }}>
                            · R$ {plan.perMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                          </span>
                        )}
                      </div>
                      {plan.savings && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '3px 10px', borderRadius: 6, background: 'rgba(63,255,33,.1)', border: '1px solid rgba(63,255,33,.2)', fontFamily: 'Figtree', fontSize: 11, fontWeight: 700, color: '#3FFF21' }}>
                          <TrendingUp size={9} /> {plan.savings}
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                      {plan.features.map(f => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'Figtree', fontSize: 13, color: 'var(--t2)' }}>
                          <Check size={11} color="#3FFF21" style={{ flexShrink: 0 }} /> {f}
                        </li>
                      ))}
                    </ul>

                    {/* Payment badges */}
                    <div style={{ display: 'flex', gap: 7 }}>
                      {[{ Icon: QrCode, label: 'PIX' }, { Icon: CreditCard, label: 'Cartão' }].map(({ Icon, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,.05)', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>
                          <Icon size={10} /> {label}
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <a
                      href={url}
                      target={url.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="btn-cta"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        padding: '13px 20px', borderRadius: 11, fontFamily: 'Manrope', fontSize: 14, fontWeight: 800,
                        textDecoration: 'none', transition: 'all .2s',
                        ...(isFeatured
                          ? { background: '#3FFF21', color: '#060A07', boxShadow: '0 0 20px rgba(63,255,33,.3)' }
                          : { background: 'rgba(255,255,255,.07)', color: 'var(--t)', border: '1px solid rgba(255,255,255,.1)' }),
                      }}
                      onMouseEnter={e => { if (!isFeatured) { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(63,255,33,.1)'; el.style.borderColor = 'rgba(63,255,33,.3)'; } }}
                      onMouseLeave={e => { if (!isFeatured) { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,.07)'; el.style.borderColor = 'rgba(255,255,255,.1)'; } }}
                    >
                      <Zap size={13} /> Assinar {PLAN_LABELS[plan.id]}
                    </a>
                  </div>
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
              <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Figtree', fontSize: 12, color: 'var(--t3)' }}>
                {item.icon} {item.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section id="faq" style={{ padding: '100px 32px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div className="reveal" style={{ marginBottom: 56 }}>
            <Label text="FAQ" />
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-0.04em' }}>
              Perguntas frequentes
            </h2>
          </div>
          {FAQ.map((item, i) => (
            <div key={i} className="reveal" style={{
              borderTop: '1px solid rgba(255,255,255,.07)',
              ...(i === FAQ.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,.07)' } : {}),
            }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', padding: '22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: 'var(--t)', cursor: 'pointer', textAlign: 'left', gap: 24 }}>
                <span style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 15 }}>{item.q}</span>
                <ChevronDown size={16} color="var(--t3)" style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              {openFaq === i && (
                <div style={{ paddingBottom: 24, fontFamily: 'Figtree', color: 'var(--t2)', fontSize: 14, lineHeight: 1.75 }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ FINAL CTA ══════════ */}
      <section style={{ padding: '100px 32px', textAlign: 'center', background: '#0A0F14', borderTop: '1px solid rgba(255,255,255,.05)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 70% at 50% 50%, rgba(63,255,33,.04) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div className="reveal" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto' }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#3FFF21', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 24 }}>Comece hoje mesmo</div>
          <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(40px, 6vw, 68px)', letterSpacing: '-0.05em', lineHeight: 0.97, marginBottom: 28 }}>
            Pare de operar<br />no escuro.
          </h2>
          <p style={{ fontFamily: 'Figtree', fontSize: 17, color: 'var(--t2)', lineHeight: 1.65, maxWidth: '42ch', margin: '0 auto 44px' }}>
            Junte-se a +500 traders que monitoram suas operações com dados reais.
          </p>
          <a href="/pricing" className="btn-cta" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#3FFF21', color: '#050A06', borderRadius: 8,
            padding: '16px 40px', fontSize: 16, fontWeight: 900, textDecoration: 'none',
          }}>
            Escolher meu plano <ArrowRight size={18} />
          </a>
          <div style={{ fontFamily: 'Figtree', marginTop: 20, color: 'var(--t3)', fontSize: 12 }}>
            Sem fidelidade · Cancele quando quiser · PIX disponível
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{ background: '#050A06', borderTop: '1px solid rgba(255,255,255,.05)', padding: '36px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#3FFF21', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={14} color="#050A06" strokeWidth={2.5} />
            </div>
            <span style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 15 }}>SureEdge</span>
          </div>
          <div style={{ fontFamily: 'Figtree', color: 'var(--t3)', fontSize: 12 }}>© 2025 SureEdge. Plataforma de gestão de surebets profissional.</div>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Termos', 'Privacidade', 'Suporte'].map(l => (
              <a key={l} href="#" style={{ fontFamily: 'Figtree', color: 'var(--t3)', fontSize: 12, textDecoration: 'none' }}>{l}</a>
            ))}
            <a href="/login" style={{ fontFamily: 'Figtree', color: 'var(--t3)', fontSize: 12, textDecoration: 'none' }}>Login</a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes lp-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes lp-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes hero-glow-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(1.04); }
        }
        @keyframes hero-scan {
          0%   { transform: translateY(-110%); }
          100% { transform: translateY(210%); }
        }
        @keyframes live-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes hero-badge-in {
          from { opacity: 0; transform: translateY(10px) scale(0.92); filter: blur(4px); }
          to   { opacity: 1; transform: none; filter: blur(0); }
        }
      `}</style>

      {/* FAQ structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
    </div>
  );
}
