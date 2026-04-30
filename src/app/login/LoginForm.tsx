'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, Lock, Mail, AlertCircle, TrendingUp, BarChart2, Shield, Check, ArrowRight } from 'lucide-react';

// ─── Canvas Particles (left panel) ───────────────────────────────────────────

function MiniParticles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let id: number;
    let W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const pts: P[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.3, a: Math.random() * 0.22 + 0.05,
    }));
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(63,255,33,${p.a})`; ctx.fill();
      }
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

// ─── Live Ticker items ────────────────────────────────────────────────────────

const TICKER = [
  { type: 'profit', casa: 'Bet365 / Betfair', evento: 'Man City vs Arsenal', val: '+R$ 127,50', roi: '3.8%' },
  { type: 'found',  casa: 'Pinnacle / 1xBet', evento: 'Nova surebet detectada', val: '+5.2% ROI', roi: 'NBA Finals' },
  { type: 'profit', casa: 'Sportingbet',       evento: 'Djokovic vs Alcaraz', val: '+R$ 84,20', roi: '2.1%' },
  { type: 'profit', casa: 'Betano / Bet365',   evento: 'PSG vs Bayern Munich', val: '+R$ 210,00', roi: '4.7%' },
  { type: 'found',  casa: 'Pinnacle',          evento: 'Surebet: Liga dos Campeões', val: '+3.9% ROI', roi: 'Garantido' },
  { type: 'profit', casa: 'Betfair Exchange',  evento: 'Rafael vs Medvedev', val: '+R$ 96,80', roi: '2.8%' },
  { type: 'profit', casa: 'Bet365',            evento: 'Real Madrid vs Atlético', val: '+R$ 158,00', roi: '3.2%' },
  { type: 'found',  casa: 'Unibet / Pinnacle', evento: 'Surebet detectada — tênis', val: '+4.1% ROI', roi: 'Roland Garros' },
];

function LiveTicker() {
  const doubled = [...TICKER, ...TICKER];
  return (
    <div style={{ overflow: 'hidden', maskImage: 'linear-gradient(180deg, transparent 0%, black 15%, black 85%, transparent 100%)' }}>
      <div style={{ animation: 'ticker-scroll 28s linear infinite', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {doubled.map((item, i) => (
          <div key={i} style={{
            background: item.type === 'found' ? 'rgba(63,255,33,.07)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${item.type === 'found' ? 'rgba(63,255,33,.18)' : 'rgba(255,255,255,.07)'}`,
            borderRadius: 10, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: item.type === 'found' ? 'rgba(63,255,33,.14)' : 'rgba(255,255,255,.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {item.type === 'found'
                ? <Zap size={14} color="#3FFF21" />
                : <TrendingUp size={14} color="#8899AA" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: item.type === 'found' ? '#3FFF21' : 'var(--t2)', fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.evento}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{item.casa}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#3FFF21', fontFamily: 'JetBrains Mono' }}>{item.val}</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>ROI {item.roi}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────

function InputField({ icon: Icon, type, value, onChange, placeholder, autoComplete, minLength, required = true }: {
  icon: React.ElementType; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  autoComplete?: string; minLength?: number; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <Icon size={14} style={{
        position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
        color: focused ? '#3FFF21' : 'var(--t3)', transition: 'color .2s', pointerEvents: 'none',
      }} />
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        autoComplete={autoComplete} minLength={minLength}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', paddingLeft: 40, paddingRight: 14, paddingTop: 12, paddingBottom: 12,
          borderRadius: 12, fontSize: 14,
          background: 'rgba(255,255,255,.05)',
          border: `1px solid ${focused ? 'rgba(63,255,33,.4)' : 'rgba(255,255,255,.08)'}`,
          color: 'var(--t)',
          boxShadow: focused ? '0 0 0 3px rgba(63,255,33,.07)' : 'none',
          transition: 'border-color .2s, box-shadow .2s',
          outline: 'none',
        }}
      />
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function LoginForm() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [mode,     setMode]     = useState<'login' | 'signup' | 'reset'>('login');
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = getSupabaseClient();
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
        });
        if (error) throw error;
        setDone(true);
        return;
      }
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setDone(true);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Erro ao autenticar';
      if (msg.includes('Invalid login')) setError('E-mail ou senha incorretos.');
      else if (msg.includes('Email not confirmed')) setError('Confirme seu e-mail antes de entrar.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ═══════════════ LEFT PANEL — sports betting aesthetic ═══════════════ */}
      <div className="hidden lg:flex" style={{
        flex: 1, flexDirection: 'column', padding: 40,
        background: '#060A07', position: 'relative', overflow: 'hidden',
        borderRight: '1px solid rgba(255,255,255,.05)',
      }}>
        <MiniParticles />
        {/* Ambient glow */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 60% at 50% -10%, rgba(63,255,33,.08) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 40% 40% at 90% 90%, rgba(63,255,33,.05) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div className="dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.35 }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: 'linear-gradient(135deg,#3FFF21 0%,#00CC6E 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(63,255,33,.4)',
            }}>
              <Zap size={20} color="#000" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 18, letterSpacing: '-0.02em' }}>SureEdge</div>
              <div style={{ fontSize: 11, color: 'rgba(63,255,33,.6)', fontFamily: 'JetBrains Mono', letterSpacing: '0.06em' }}>TRADING HUB</div>
            </div>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 40 }}>
            <h1 style={{
              fontFamily: 'Manrope', fontWeight: 900,
              fontSize: 'clamp(32px, 3vw, 48px)',
              letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 16,
            }}>
              Domine o mercado<br />
              <span style={{ color: '#3FFF21' }}>com dados.</span>
            </h1>
            <p style={{ color: 'var(--t2)', fontSize: 15, lineHeight: 1.65, maxWidth: 360 }}>
              O dashboard profissional que traders de surebet usam para monitorar lucro e dominar as casas de apostas.
            </p>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 40 }}>
            {[
              { val: '2.847+', label: 'Operações' },
              { val: '3.8%', label: 'ROI médio' },
              { val: '37+', label: 'Bookmakers' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 12, padding: '14px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#3FFF21', fontFamily: 'JetBrains Mono', letterSpacing: '-0.03em' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Live ticker */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div className="live-dot" />
              <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>OPERAÇÕES AO VIVO</span>
            </div>
            <div style={{ height: 320, overflow: 'hidden' }}>
              <LiveTicker />
            </div>
          </div>

          {/* Feature chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 28 }}>
            {[
              { icon: BarChart2, text: 'Analytics avançado' },
              { icon: Shield, text: 'Dados criptografados' },
              { icon: TrendingUp, text: 'ROI em tempo real' },
            ].map(item => (
              <div key={item.text} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 999, padding: '5px 12px',
              }}>
                <item.icon size={12} color="rgba(63,255,33,.7)" />
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════ RIGHT PANEL — form ═══════════════ */}
      <div style={{
        width: '100%', maxWidth: 480,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px', position: 'relative',
      }}>
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 mb-10">
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg,#3FFF21 0%,#00CC6E 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={19} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 20 }}>SureEdge</span>
        </div>

        <div className="w-full animate-scale-in">
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 26, letterSpacing: '-0.03em', marginBottom: 8 }}>
              {mode === 'reset' ? 'Redefinir senha' : mode === 'signup' ? 'Criar sua conta' : 'Bem-vindo de volta'}
            </h2>
            <p style={{ color: 'var(--t3)', fontSize: 14 }}>
              {mode === 'reset'
                ? 'Informe seu e-mail para receber o link.'
                : mode === 'signup'
                ? 'Crie sua conta e comece a rastrear surebets.'
                : 'Entre no seu dashboard profissional.'}
            </p>
          </div>

          {/* Mode tabs */}
          {!done && mode !== 'reset' && (
            <div style={{ display: 'flex', background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: 4, marginBottom: 28 }}>
              {(['login', 'signup'] as const).map(m => (
                <button
                  key={m} type="button"
                  onClick={() => { setMode(m); setError(''); }}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', transition: 'all .18s',
                    border: mode === m ? '1px solid rgba(63,255,33,.2)' : 'none',
                    background: mode === m ? 'rgba(63,255,33,.12)' : 'none',
                    color: mode === m ? '#3FFF21' : 'var(--t3)',
                    boxShadow: mode === m ? '0 2px 10px rgba(63,255,33,.1)' : 'none',
                  }}
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              ))}
            </div>
          )}

          {/* Success state */}
          {done ? (
            <div style={{
              background: 'rgba(63,255,33,.06)', border: '1px solid rgba(63,255,33,.2)',
              borderRadius: 16, padding: 32, textAlign: 'center',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
                background: 'rgba(63,255,33,.14)', border: '1px solid rgba(63,255,33,.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={24} color="#3FFF21" />
              </div>
              <h3 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 18, marginBottom: 10 }}>
                {mode === 'reset' ? 'E-mail enviado!' : 'Conta criada com sucesso!'}
              </h3>
              <p style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
                {mode === 'reset'
                  ? 'Verifique sua caixa de entrada e clique no link para redefinir sua senha.'
                  : 'Confirme seu e-mail clicando no link que enviamos. Depois é só entrar!'}
              </p>
              <button onClick={() => { setMode('login'); setDone(false); setError(''); }} style={{
                background: 'none', border: 'none', color: '#3FFF21',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto',
              }}>
                <ArrowRight size={14} /> Ir para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Email */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>E-mail</label>
                <InputField
                  icon={Mail} type="email" value={email}
                  onChange={setEmail} placeholder="seu@email.com"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              {mode !== 'reset' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Senha</label>
                  <div style={{ position: 'relative' }}>
                    <InputField
                      icon={Lock}
                      type={showPw ? 'text' : 'password'}
                      value={password} onChange={setPassword}
                      placeholder="••••••••" minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0,
                    }}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)',
                  color: 'var(--r)', fontSize: 13,
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit" disabled={loading}
                style={{
                  width: '100%', padding: '14px',
                  borderRadius: 12, fontSize: 15, fontWeight: 800,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  background: loading ? 'rgba(63,255,33,.45)' : '#3FFF21',
                  color: '#030507',
                  boxShadow: loading ? 'none' : '0 0 24px rgba(63,255,33,.35)',
                  transition: 'all .2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget).style.boxShadow = '0 0 36px rgba(63,255,33,.5)'; }}
                onMouseLeave={e => { if (!loading) (e.currentTarget).style.boxShadow = '0 0 24px rgba(63,255,33,.35)'; }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%',
                      border: '2px solid rgba(0,0,0,.3)', borderTopColor: '#030507',
                      animation: 'spin 0.7s linear infinite', display: 'inline-block',
                    }} />
                    Aguarde...
                  </>
                ) : mode === 'login' ? (
                  <><ArrowRight size={16} /> Entrar no SureEdge</>
                ) : mode === 'signup' ? (
                  <><Zap size={15} /> Criar minha conta</>
                ) : (
                  'Enviar link de recuperação'
                )}
              </button>

              {/* Auxiliary links */}
              <div style={{ textAlign: 'center' }}>
                {mode === 'login' && (
                  <button type="button" onClick={() => { setMode('reset'); setError(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 13 }}>
                    Esqueci minha senha
                  </button>
                )}
                {mode === 'reset' && (
                  <button type="button" onClick={() => { setMode('login'); setError(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 13 }}>
                    ← Voltar ao login
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Divider + plans link */}
          {!done && (
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.06)', textAlign: 'center' }}>
              <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 12 }}>
                Ainda não tem uma assinatura?
              </p>
              <a href="/" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: '#3FFF21', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                background: 'rgba(63,255,33,.08)', border: '1px solid rgba(63,255,33,.2)',
                borderRadius: 8, padding: '8px 16px',
              }}>
                <Zap size={13} /> Ver planos e preços
              </a>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p style={{ position: 'absolute', bottom: 24, fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
          Sistema de uso exclusivo · SureEdge © 2025
        </p>
      </div>
    </div>
  );
}
