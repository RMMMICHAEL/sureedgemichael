'use client';

/**
 * /obrigado — Página de obrigado pós-compra (Cakto redirect)
 *
 * Configure no painel Cakto como URL de redirecionamento após pagamento aprovado:
 *   https://sureedge.com.br/obrigado
 *
 * O Cakto pode passar parâmetros opcionais via query string:
 *   ?ref={ref_id}&plan={offer_name}&email={email}
 *
 * Esta página:
 *   1. Dispara evento Purchase no Utmify (que repassa ao Facebook Pixel)
 *   2. Redireciona o usuário para /ativar após 5s
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Zap, ArrowRight, Loader2 } from 'lucide-react';

// Valores dos planos em BRL (fallback se Cakto não passar o valor)
const PLAN_VALUES: Record<string, number> = {
  anual:      397,
  annual:     397,
  trimestral: 197,
  quarterly:  197,
  mensal:     97,
  monthly:    97,
};

function getRevenueFromPlan(plan: string | null): number {
  if (!plan) return 97;
  const key = plan.toLowerCase();
  for (const [k, v] of Object.entries(PLAN_VALUES)) {
    if (key.includes(k)) return v;
  }
  return 97;
}

export default function ObrigadoPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(6);
  const [pixelFired, setPixelFired] = useState(false);

  useEffect(() => {
    // Lê parâmetros passados pelo Cakto
    const params  = new URLSearchParams(window.location.search);
    const plan    = params.get('plan');
    const ref     = params.get('ref') ?? params.get('ref_id');
    const revenue = getRevenueFromPlan(plan);

    // ── Dispara evento Purchase no Utmify ─────────────────────────────────────
    // O pixel.js (carregado no layout.tsx) expõe window.pixelFunctions
    // O Utmify lê os UTMs armazenados no localStorage e os atribui à conversão
    function firePixel() {
      try {
        // Método 1: API oficial do Utmify pixel.js
        if (typeof (window as any).utmify === 'function') {
          (window as any).utmify('track', 'Purchase', {
            revenue,
            currency: 'BRL',
            orderId:  ref ?? undefined,
          });
          setPixelFired(true);
          return;
        }

        // Método 2: pixelFunctions queue (pixel ainda carregando)
        if (Array.isArray((window as any).pixelFunctions)) {
          (window as any).pixelFunctions.push({
            event:    'Purchase',
            revenue,
            currency: 'BRL',
            orderId:  ref ?? undefined,
          });
          setPixelFired(true);
          return;
        }

        // Método 3: CustomEvent (compatibilidade)
        window.dispatchEvent(new CustomEvent('utmify:purchase', {
          detail: { revenue, currency: 'BRL', orderId: ref ?? undefined },
        }));
        setPixelFired(true);
      } catch {
        // silencioso — não bloqueia o fluxo do usuário
      }
    }

    // Aguarda o pixel.js carregar (máx 3s) antes de disparar
    if (document.readyState === 'complete') {
      firePixel();
    } else {
      window.addEventListener('load', firePixel, { once: true });
    }

    // Também dispara após 1s como fallback (pixel carrega async)
    const fallback = setTimeout(firePixel, 1_000);

    return () => {
      clearTimeout(fallback);
      window.removeEventListener('load', firePixel);
    };
  }, []);

  // Contagem regressiva → /ativar
  useEffect(() => {
    if (countdown <= 0) {
      router.push('/ativar');
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1_000);
    return () => clearTimeout(t);
  }, [countdown, router]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#030507',
      padding: '32px 20px',
      fontFamily: 'Manrope, sans-serif',
    }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 48 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#3FFF21 0%,#00CC6E 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(63,255,33,.4)',
          }}>
            <Zap size={18} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.02em', color: '#fff' }}>SureEdge</span>
        </div>

        {/* Ícone de sucesso */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(63,255,33,.1)',
          border: '2px solid rgba(63,255,33,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 28px',
          boxShadow: '0 0 40px rgba(63,255,33,.15)',
        }}>
          <CheckCircle2 size={36} color="#3FFF21" strokeWidth={2} />
        </div>

        {/* Título */}
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: '#fff', marginBottom: 12, lineHeight: 1.2,
        }}>
          Pagamento confirmado!
        </h1>

        <p style={{ fontSize: 15, color: 'rgba(255,255,255,.55)', lineHeight: 1.6, marginBottom: 40 }}>
          Sua compra foi aprovada. Agora ative seu acesso para começar a usar o SureEdge.
        </p>

        {/* Card */}
        <div style={{
          background: 'rgba(6,10,7,.9)',
          border: '1px solid rgba(63,255,33,.15)',
          borderRadius: 20, padding: '28px 24px',
          marginBottom: 28,
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginBottom: 20 }}>
            Você será redirecionado automaticamente em
          </p>

          {/* Countdown */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(63,255,33,.08)',
            border: '2px solid rgba(63,255,33,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#3FFF21' }}>
              {countdown}
            </span>
          </div>

          {/* Botão manual */}
          <button
            type="button"
            onClick={() => router.push('/ativar')}
            style={{
              width: '100%', padding: '14px',
              borderRadius: 12, fontSize: 14, fontWeight: 800,
              border: 'none', cursor: 'pointer',
              background: '#3FFF21', color: '#030507',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Ativar meu acesso agora <ArrowRight size={16} />
          </button>
        </div>

        {/* Status do pixel (debug discreto) */}
        {pixelFired && (
          <p style={{ fontSize: 11, color: 'rgba(63,255,33,.35)', fontFamily: 'monospace' }}>
            ✓ conversão registrada
          </p>
        )}

        {!pixelFired && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Loader2 size={12} color="rgba(255,255,255,.2)" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', fontFamily: 'monospace' }}>
              registrando conversão...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
