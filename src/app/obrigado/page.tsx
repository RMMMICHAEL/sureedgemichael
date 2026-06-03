'use client';

/**
 * /obrigado — Página de obrigado pós-compra (Cakto redirect)
 *
 * Configure no painel Cakto como URL de redirecionamento após pagamento aprovado:
 *   https://sureedge.com.br/obrigado
 *
 * Fluxo:
 *   1. Cakto redireciona o cliente para esta página
 *   2. Pixel Purchase é disparado (Utmify → Facebook)
 *   3. Exibe mensagem para o cliente verificar o e-mail
 *   4. O webhook já enviou o Magic Link — cliente clica e acessa direto
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Zap, Mail, Loader2 } from 'lucide-react';

export default function ObrigadoPage() {
  const [pixelFired, setPixelFired] = useState(false);

  useEffect(() => {
    // ── Dispara evento Purchase no Utmify ─────────────────────────────────────
    function firePixel() {
      try {
        if (typeof (window as any).utmify === 'function') {
          (window as any).utmify('track', 'Purchase', { revenue: 97, currency: 'BRL' });
          setPixelFired(true);
          return;
        }
        if (Array.isArray((window as any).pixelFunctions)) {
          (window as any).pixelFunctions.push({ event: 'Purchase', revenue: 97, currency: 'BRL' });
          setPixelFired(true);
          return;
        }
        window.dispatchEvent(new CustomEvent('utmify:purchase', {
          detail: { revenue: 97, currency: 'BRL' },
        }));
        setPixelFired(true);
      } catch { /* silencioso */ }
    }

    if (document.readyState === 'complete') {
      firePixel();
    } else {
      window.addEventListener('load', firePixel, { once: true });
    }
    const fallback = setTimeout(firePixel, 1_000);
    return () => {
      clearTimeout(fallback);
      window.removeEventListener('load', firePixel);
    };
  }, []);

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

        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
          color: '#fff', marginBottom: 12, lineHeight: 1.2,
        }}>
          Pagamento confirmado!
        </h1>

        <p style={{ fontSize: 15, color: 'rgba(255,255,255,.5)', lineHeight: 1.6, marginBottom: 40 }}>
          Seu acesso ao SureEdge foi liberado.
        </p>

        {/* Card de instrução */}
        <div style={{
          background: 'rgba(6,10,7,.9)',
          border: '1px solid rgba(63,255,33,.15)',
          borderRadius: 20, padding: '32px 28px',
          marginBottom: 24,
        }}>
          {/* Ícone e-mail */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(63,255,33,.08)',
            border: '1px solid rgba(63,255,33,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Mail size={24} color="#3FFF21" strokeWidth={1.8} />
          </div>

          <h2 style={{
            fontSize: 18, fontWeight: 800, color: '#fff',
            marginBottom: 10, letterSpacing: '-0.02em',
          }}>
            Verifique seu e-mail
          </h2>

          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', lineHeight: 1.65, marginBottom: 24 }}>
            Enviamos um link de acesso para o <strong style={{ color: 'rgba(255,255,255,.75)' }}>e-mail usado no pagamento</strong>.
            Clique no link para entrar diretamente no dashboard — sem precisar criar senha.
          </p>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
            {[
              { n: '1', text: 'Abra o e-mail de compra que você acabou de receber' },
              { n: '2', text: 'Clique em "Acessar o SureEdge"' },
              { n: '3', text: 'Pronto — você já estará dentro do dashboard' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(63,255,33,.12)',
                  border: '1px solid rgba(63,255,33,.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#3FFF21',
                }}>
                  {s.n}
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.5, paddingTop: 3 }}>
                  {s.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Aviso caixa de spam */}
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', lineHeight: 1.6 }}>
          Não encontrou o e-mail? Verifique a caixa de spam ou entre em contato pelo{' '}
          <a
            href="https://wa.me/77999489307"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(63,255,33,.5)', textDecoration: 'none' }}
          >
            WhatsApp
          </a>
          .
        </p>

        {/* Status pixel (debug discreto) */}
        <div style={{ marginTop: 20 }}>
          {pixelFired ? (
            <span style={{ fontSize: 11, color: 'rgba(63,255,33,.3)', fontFamily: 'monospace' }}>
              ✓ conversão registrada
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,.15)', fontFamily: 'monospace' }}>
              <Loader2 size={10} />
              registrando conversão...
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
