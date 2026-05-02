'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, CheckCircle2, ArrowRight, Shield, BarChart2, TrendingUp, Loader2 } from 'lucide-react';

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
    const pts: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.18 + 0.04,
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

type Status = 'waiting' | 'active' | 'timeout';

export default function BemVindoPage() {
  const router  = useRouter();
  const [status, setStatus] = useState<Status>('waiting');
  const [dots,   setDots]   = useState('');
  const attempts = useRef(0);
  const maxAttempts = 12; // 12 × 5s = 60s total

  const checkSubscription = useCallback(async () => {
    try {
      const res  = await fetch('/api/subscription', { cache: 'no-store' });
      const data = await res.json() as { status?: string } | null;
      if (data?.status === 'active') {
        setStatus('active');
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, []);

  // Animated dots
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(id);
  }, []);

  // Poll for subscription activation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const found = await checkSubscription();
      if (found) return;
      attempts.current += 1;
      if (attempts.current >= maxAttempts) {
        setStatus('timeout');
        return;
      }
      timer = setTimeout(poll, 5000);
    }

    poll();
    return () => clearTimeout(timer);
  }, [checkSubscription]);

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

          {/* ── WAITING ── */}
          {status === 'waiting' && (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', marginBottom: 24,
                background: 'rgba(63,255,33,.08)', border: '1.5px solid rgba(63,255,33,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Loader2 size={28} color="#3FFF21" strokeWidth={1.8} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <h1 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(22px,4vw,30px)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12 }}>
                Confirmando seu pagamento{dots}
              </h1>
              <p style={{ color: 'var(--t3)', fontSize: 14, lineHeight: 1.65, marginBottom: 28 }}>
                Aguarde alguns instantes enquanto ativamos seu acesso. Isso leva menos de 30 segundos.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Pagamento recebido', 'Ativando assinatura', 'Preparando dashboard'].map((step, i) => (
                  <div key={step} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: i === 0 ? 'rgba(63,255,33,.15)' : 'rgba(255,255,255,.05)',
                      border: `1.5px solid ${i === 0 ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.1)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {i === 0 && <CheckCircle2 size={11} color="#3FFF21" />}
                    </div>
                    <span style={{ fontSize: 13, color: i === 0 ? 'var(--t2)' : 'var(--t3)' }}>{step}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── ACTIVE ── */}
          {status === 'active' && (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', marginBottom: 24,
                background: 'rgba(63,255,33,.1)', border: '1.5px solid rgba(63,255,33,.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 32px rgba(63,255,33,.2)',
              }}>
                <CheckCircle2 size={30} color="#3FFF21" strokeWidth={1.8} />
              </div>
              <h1 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(24px,4vw,34px)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12 }}>
                Acesso liberado!<br />
                <span style={{ color: '#3FFF21' }}>Bem-vindo ao SureEdge.</span>
              </h1>
              <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.65, marginBottom: 28 }}>
                Sua assinatura está ativa. Entre com o e-mail usado no pagamento para acessar o dashboard.
              </p>
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
              <button type="button" onClick={() => router.push('/login')} className="btn-cta" style={{
                width: '100%', padding: '15px', borderRadius: 14, fontSize: 15, fontWeight: 800,
                border: 'none', cursor: 'pointer', background: '#3FFF21', color: '#030507',
                boxShadow: '0 0 28px rgba(63,255,33,.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'Manrope',
              }}>
                Acessar meu dashboard <ArrowRight size={16} />
              </button>
            </>
          )}

          {/* ── TIMEOUT ── */}
          {status === 'timeout' && (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', marginBottom: 24,
                background: 'rgba(255,214,0,.08)', border: '1.5px solid rgba(255,214,0,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={28} color="#FFD600" strokeWidth={1.8} />
              </div>
              <h1 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 'clamp(22px,4vw,28px)', letterSpacing: '-0.03em', marginBottom: 12 }}>
                Pagamento recebido!
              </h1>
              <p style={{ color: 'var(--t3)', fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
                A confirmação está demorando mais que o esperado. Tente acessar o dashboard — seu acesso pode já estar ativo.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" onClick={() => router.push('/login')} style={{
                  width: '100%', padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 800,
                  border: 'none', cursor: 'pointer', background: '#3FFF21', color: '#030507',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  Tentar acessar o dashboard <ArrowRight size={15} />
                </button>
                <button type="button" onClick={() => router.push('/ativar')} style={{
                  width: '100%', padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                  border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer',
                  background: 'none', color: 'var(--t2)',
                }}>
                  Verificar minha compra pelo email
                </button>
              </div>
            </>
          )}

          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--t3)', marginTop: 24 }}>
            Problemas? <a href="mailto:suporte@sureedge.com.br" style={{ color: 'var(--t2)' }}>suporte@sureedge.com.br</a>
          </p>
        </div>
      </div>
    </div>
  );
}
