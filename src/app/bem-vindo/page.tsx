'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, CheckCircle2, ArrowRight, Shield, BarChart2, TrendingUp } from 'lucide-react';

// Dispara evento Purchase no pixel da Utmify
function fireUtmifyPurchase(value: number) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = (window as any).utmify;
    if (u?.track) {
      u.track('Purchase', { revenue: value, currency: 'BRL' });
    } else {
      // Fallback: dispara via fbq diretamente caso o pixel ainda esteja carregando
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fbq = (window as any).fbq;
      if (fbq) fbq('track', 'Purchase', { value, currency: 'BRL' });
    }
  } catch { /* silencioso */ }
}

function ParticlesBg() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let id: number;
    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const pts: P[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.16 + 0.04,
    }));
    const resize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; };
    window.addEventListener('resize', resize);
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(63,255,33,${p.a})`; ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const dx = p.x - q.x, dy = p.y - q.y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(63,255,33,${0.04 * (1 - dist / 110)})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
}

const PLAN_VALUES: Record<string, number> = {
  monthly: 97, quarterly: 247, annual: 797,
};

export default function BemVindoPage() {
  const router     = useRouter();
  const params     = useSearchParams();

  useEffect(() => {
    // Aguarda o pixel.js da Utmify carregar (~500ms) e dispara Purchase
    const plan  = params.get('plan') ?? 'monthly';
    const value = parseFloat(params.get('value') ?? '') || PLAN_VALUES[plan] || 97;
    const timer = setTimeout(() => fireUtmifyPurchase(value), 800);
    return () => clearTimeout(timer);
  }, [params]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#030507', position: 'relative', overflow: 'hidden',
      padding: '32px 20px',
    }}>
      <ParticlesBg />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(63,255,33,.09) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{
        position: 'relative', zIndex: 1, maxWidth: 480, width: '100%',
        background: 'rgba(6,10,7,.88)', border: '1px solid rgba(63,255,33,.18)',
        borderRadius: 24, backdropFilter: 'blur(20px)',
        boxShadow: '0 0 80px rgba(63,255,33,.1), 0 24px 64px rgba(0,0,0,.6)',
        overflow: 'hidden',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #3FFF21 0%, rgba(63,255,33,.3) 60%, transparent 100%)' }} />

        <div style={{ padding: 'clamp(28px,5vw,48px)' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#3FFF21 0%,#00CC6E 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(63,255,33,.4)',
            }}>
              <Zap size={18} color="#000" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 17, letterSpacing: '-0.02em' }}>SureEdge</div>
              <div style={{ fontSize: 10, color: 'rgba(63,255,33,.55)', fontFamily: 'JetBrains Mono', letterSpacing: '0.06em' }}>TRADING HUB</div>
            </div>
          </div>

          {/* Icon */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%', marginBottom: 24,
            background: 'rgba(63,255,33,.1)', border: '1.5px solid rgba(63,255,33,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(63,255,33,.2)',
          }}>
            <CheckCircle2 size={30} color="#3FFF21" strokeWidth={1.8} />
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: 'Manrope', fontWeight: 900,
            fontSize: 'clamp(24px,4vw,34px)',
            letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12,
          }}>
            Pagamento confirmado!<br />
            <span style={{ color: '#3FFF21' }}>Bem-vindo ao SureEdge.</span>
          </h1>

          <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.65, marginBottom: 28 }}>
            Seu acesso foi liberado. Faça login com o <strong>e-mail usado no pagamento</strong> para entrar no dashboard.
          </p>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {[
              { icon: BarChart2,  text: 'Dashboard profissional de surebets' },
              { icon: TrendingUp, text: 'Rastreamento de ROI em tempo real' },
              { icon: Shield,     text: 'Dados criptografados e seguros' },
            ].map(item => (
              <div key={item.text} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 12, background: 'rgba(63,255,33,.05)', border: '1px solid rgba(63,255,33,.1)',
              }}>
                <item.icon size={15} color="#3FFF21" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--t2)' }}>{item.text}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="btn-cta"
              style={{
                width: '100%', padding: '15px', borderRadius: 14, fontSize: 15, fontWeight: 800,
                border: 'none', cursor: 'pointer', background: '#3FFF21', color: '#030507',
                boxShadow: '0 0 28px rgba(63,255,33,.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'Manrope',
              }}
            >
              Acessar meu dashboard <ArrowRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => router.push('/ativar')}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                border: '1px solid rgba(255,255,255,.08)', cursor: 'pointer',
                background: 'none', color: 'var(--t3)',
              }}
            >
              Acesso não liberado? Verificar compra
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--t3)', marginTop: 20 }}>
            Use o mesmo e-mail do pagamento para fazer login.
          </p>
        </div>
      </div>

      <p style={{ position: 'relative', zIndex: 1, marginTop: 24, fontSize: 11, color: 'var(--t3)' }}>
        Problemas? <a href="mailto:suporte@sureedge.com.br" style={{ color: 'var(--t2)' }}>suporte@sureedge.com.br</a>
      </p>
    </div>
  );
}
