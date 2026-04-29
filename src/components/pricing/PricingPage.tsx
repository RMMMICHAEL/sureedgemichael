'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getMySubscription, PLAN_PRICES, PLAN_LABELS, type PlanId } from '@/lib/supabase/subscription';
import { LogOut, Zap, Shield, TrendingUp, Check, CreditCard, QrCode } from 'lucide-react';

// ── Plan config ───────────────────────────────────────────────────────────────

interface Plan {
  id: PlanId;
  label: string;
  price: number;
  perMonth: number;
  period: string;
  savings?: string;
  badge?: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id:       'monthly',
    label:    'Mensal',
    price:    PLAN_PRICES.monthly,
    perMonth: PLAN_PRICES.monthly,
    period:   'por mês',
    features: [
      'Dashboard completo',
      'Operações ilimitadas',
      'Importação de planilha',
      'Análise de performance',
      'Calculadora de surebet',
      'Suporte via e-mail',
    ],
  },
  {
    id:       'quarterly',
    label:    'Trimestral',
    price:    PLAN_PRICES.quarterly,
    perMonth: +(PLAN_PRICES.quarterly / 3).toFixed(2),
    period:   'por trimestre',
    savings:  'Economize 15%',
    badge:    'POPULAR',
    features: [
      'Tudo do Mensal',
      '3 meses de acesso',
      'Prioridade no suporte',
      'Relatórios avançados',
    ],
  },
  {
    id:       'annual',
    label:    'Anual',
    price:    PLAN_PRICES.annual,
    perMonth: +(PLAN_PRICES.annual / 12).toFixed(2),
    period:   'por ano',
    savings:  'Economize 32%',
    features: [
      'Tudo do Trimestral',
      '12 meses de acesso',
      'Acesso antecipado a novidades',
      'Suporte prioritário',
    ],
  },
];

// ── Checkout URLs (from env vars, set in Vercel) ──────────────────────────────

function checkoutUrl(planId: PlanId, email: string): string {
  const base =
    planId === 'monthly'   ? process.env.NEXT_PUBLIC_CAKTO_URL_MONTHLY   :
    planId === 'quarterly' ? process.env.NEXT_PUBLIC_CAKTO_URL_QUARTERLY :
                             process.env.NEXT_PUBLIC_CAKTO_URL_ANNUAL;

  if (!base) return '#';
  // Pre-fill customer email on Cakto checkout (optional but improves matching)
  try {
    const url = new URL(base);
    if (email) url.searchParams.set('email', email);
    return url.toString();
  } catch {
    return base;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PricingPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasExpired, setHasExpired] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });
    getMySubscription().then(sub => {
      setHasExpired(sub?.status === 'expired' || sub?.status === 'cancelled');
    });
  }, []);

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-10 relative overflow-hidden dot-grid"
      style={{ background: 'var(--bg)' }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(63,255,33,.06) 0%, transparent 60%)',
      }} />

      {/* Header */}
      <div className="flex flex-col items-center mb-10 relative z-10 text-center max-w-lg">
        {/* Logo mark */}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
          style={{
            background: 'linear-gradient(135deg, var(--g) 0%, #00CC6E 100%)',
            boxShadow: '0 0 28px rgba(63,255,33,.4)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L12.196 4V10L7 13L1.804 10V4L7 1Z" fill="#060A07" fillOpacity=".9" />
          </svg>
        </div>

        {hasExpired ? (
          <>
            <h1 className="text-2xl font-black tracking-tight mb-2">
              <span style={{ color: 'var(--g)' }}>Plano</span>
              <span style={{ color: 'var(--t)' }}> expirado</span>
            </h1>
            <p className="text-sm" style={{ color: 'var(--t2)' }}>
              Renove para continuar usando o SureEdge.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black tracking-tight mb-2">
              <span style={{ color: 'var(--g)' }}>Escolha</span>
              <span style={{ color: 'var(--t)' }}> seu plano</span>
            </h1>
            <p className="text-sm" style={{ color: 'var(--t2)' }}>
              Acesso completo ao SureEdge — o melhor dashboard para surebetting profissional.
            </p>
          </>
        )}

        {userEmail && (
          <div
            className="flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full text-xs"
            style={{ background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.18)', color: 'var(--t2)' }}
          >
            <span className="live-dot" style={{ width: 5, height: 5 }} />
            {userEmail}
          </div>
        )}
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl relative z-10">
        {PLANS.map(plan => {
          const isFeatured = plan.id === 'quarterly';
          const url        = checkoutUrl(plan.id, userEmail ?? '');

          return (
            <div
              key={plan.id}
              className="rounded-2xl flex flex-col overflow-hidden"
              style={{
                background:  isFeatured ? 'rgba(63,255,33,.07)' : 'var(--bg2)',
                border:      isFeatured ? '1.5px solid rgba(63,255,33,.35)' : '1px solid var(--b)',
                boxShadow:   isFeatured ? '0 0 40px rgba(63,255,33,.1)' : 'none',
                position:    'relative',
              }}
            >
              {/* Top accent */}
              <div style={{
                height: 3,
                background: isFeatured
                  ? 'linear-gradient(90deg, var(--g) 0%, rgba(63,255,33,.5) 60%, transparent 100%)'
                  : '1px solid var(--b)',
              }} />

              {/* Badge */}
              {plan.badge && (
                <div className="absolute top-4 right-4">
                  <span
                    className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--g)',
                      color: '#060A07',
                    }}
                  >
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="p-6 flex flex-col gap-5 flex-1">
                {/* Plan name */}
                <div>
                  <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: isFeatured ? 'var(--g)' : 'var(--t3)' }}>
                    {plan.label}
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-3xl font-black" style={{ color: 'var(--t)', letterSpacing: '-0.03em' }}>
                      R$ {plan.price.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                    {plan.period}
                    {plan.id !== 'monthly' && (
                      <span className="ml-1.5" style={{ color: 'var(--t2)' }}>
                        · R$ {plan.perMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                      </span>
                    )}
                  </div>
                  {plan.savings && (
                    <div
                      className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold"
                      style={{ background: 'rgba(63,255,33,.1)', color: 'var(--g)', border: '1px solid rgba(63,255,33,.2)' }}
                    >
                      <TrendingUp size={9} />
                      {plan.savings}
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="flex flex-col gap-2 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs" style={{ color: 'var(--t2)' }}>
                      <Check size={11} style={{ color: 'var(--g)', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* Payment methods */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)' }}
                  >
                    <QrCode size={10} /> PIX
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{ background: 'rgba(255,255,255,.05)', color: 'var(--t3)' }}
                  >
                    <CreditCard size={10} /> Cartão
                  </div>
                </div>

                {/* CTA */}
                <a
                  href={url === '#' ? undefined : url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={url === '#' ? e => e.preventDefault() : undefined}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all"
                  style={
                    isFeatured
                      ? {
                          background: 'var(--g)',
                          color: '#060A07',
                          boxShadow: '0 0 20px rgba(63,255,33,.3)',
                        }
                      : {
                          background: 'rgba(255,255,255,.07)',
                          color: 'var(--t)',
                          border: '1px solid var(--b2)',
                        }
                  }
                  onMouseEnter={e => {
                    if (!isFeatured) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.1)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(63,255,33,.3)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isFeatured) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.07)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--b2)';
                    }
                  }}
                >
                  <Zap size={13} />
                  Assinar {PLAN_LABELS[plan.id]}
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust signals */}
      <div className="flex items-center gap-6 mt-10 relative z-10 flex-wrap justify-center">
        {[
          { icon: <Shield size={13} />, text: 'Pagamento seguro via Cakto' },
          { icon: <Zap size={13} />, text: 'Acesso imediato após pagamento' },
          { icon: <TrendingUp size={13} />, text: 'Cancele quando quiser' },
        ].map(item => (
          <div key={item.text} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
            {item.icon}
            {item.text}
          </div>
        ))}
      </div>

      {/* Sign out */}
      <button
        type="button"
        onClick={signOut}
        className="flex items-center gap-1.5 mt-8 text-xs relative z-10 transition-colors"
        style={{ color: 'var(--t3)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--r)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
      >
        <LogOut size={12} />
        Sair da conta
      </button>
    </div>
  );
}
