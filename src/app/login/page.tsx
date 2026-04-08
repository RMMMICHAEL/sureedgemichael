'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, Lock, Mail, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [mode,     setMode]     = useState<'login' | 'signup' | 'reset'>('login');
  const [done,     setDone]     = useState(false);

  const supabase = getSupabaseClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

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

      // Login
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
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden dot-grid"
      style={{ background: 'var(--bg)' }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(63,255,33,.07) 0%, transparent 60%)',
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 40% 40% at 80% 80%, rgba(63,255,33,.04) 0%, transparent 60%)',
      }} />

      <div className="w-full max-w-sm animate-scale-in" style={{ position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: 'linear-gradient(135deg, var(--g) 0%, #00CC6E 100%)',
              boxShadow: '0 0 32px rgba(63,255,33,.45), 0 0 64px rgba(63,255,33,.15)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L12.196 4V10L7 13L1.804 10V4L7 1Z"
                fill="#060A07" fillOpacity=".9" />
            </svg>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            <span className="text-glow" style={{ color: 'var(--g)' }}>Sure</span>
            <span style={{ color: 'var(--t)' }}>Edge</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
            Trading Hub — Área Restrita
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'var(--bg2)',
            border: '1px solid rgba(255,255,255,.07)',
            boxShadow: '0 24px 64px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.04)',
          }}
        >
          {/* Mode tabs */}
          {!done && mode !== 'reset' && (
            <div
              className="flex rounded-xl p-1 mb-6"
              style={{ background: 'rgba(255,255,255,.04)' }}
            >
              {(['login', 'signup'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(''); }}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={
                    mode === m
                      ? {
                          background: 'rgba(63,255,33,.12)',
                          color: 'var(--g)',
                          border: '1px solid rgba(63,255,33,.18)',
                          boxShadow: '0 2px 8px rgba(63,255,33,.08)',
                        }
                      : { color: 'var(--t3)' }
                  }
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              ))}
            </div>
          )}

          {/* Success state */}
          {done ? (
            <div className="text-center py-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(63,255,33,.12)', border: '1px solid rgba(63,255,33,.2)' }}
              >
                <Zap size={20} style={{ color: 'var(--g)' }} />
              </div>
              <p className="font-bold" style={{ color: 'var(--t)' }}>
                {mode === 'reset' ? 'E-mail enviado!' : 'Conta criada!'}
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--t3)' }}>
                {mode === 'reset'
                  ? 'Verifique sua caixa de entrada para redefinir a senha.'
                  : 'Confirme seu e-mail para ativar a conta.'}
              </p>
              <button
                type="button"
                onClick={() => { setMode('login'); setDone(false); setError(''); }}
                className="mt-4 text-xs font-bold"
                style={{ color: 'var(--g)' }}
              >
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === 'reset' && (
                <p className="text-sm" style={{ color: 'var(--t3)' }}>
                  Informe seu e-mail para receber o link de redefinição de senha.
                </p>
              )}

              {/* Email */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t3)' }}>
                  E-mail
                </span>
                <div className="relative">
                  <Mail
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--t3)' }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                    style={{
                      background: 'var(--sur)',
                      border: '1px solid rgba(255,255,255,.08)',
                      color: 'var(--t)',
                    }}
                    onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(63,255,33,.35)'; }}
                    onBlur={e  => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.08)'; }}
                  />
                </div>
              </label>

              {/* Password */}
              {mode !== 'reset' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--t3)' }}>
                    Senha
                  </span>
                  <div className="relative">
                    <Lock
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--t3)' }}
                    />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm"
                      style={{
                        background: 'var(--sur)',
                        border: '1px solid rgba(255,255,255,.08)',
                        color: 'var(--t)',
                      }}
                      onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(63,255,33,.35)'; }}
                      onBlur={e  => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.08)'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--t3)' }}
                    >
                      {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </label>
              )}

              {/* Error */}
              {error && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
                  style={{
                    background: 'rgba(255,77,109,.08)',
                    border: '1px solid rgba(255,77,109,.2)',
                    color: 'var(--r)',
                  }}
                >
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-black tracking-wide transition-all mt-1"
                style={{
                  background: loading ? 'rgba(63,255,33,.4)' : 'var(--g)',
                  color: '#060A07',
                  boxShadow: loading ? 'none' : '0 0 20px rgba(63,255,33,.3)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
                    Aguarde...
                  </span>
                ) : mode === 'login' ? 'Entrar no SureEdge'
                  : mode === 'signup' ? 'Criar conta'
                  : 'Enviar link'}
              </button>

              {/* Forgot password */}
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(''); }}
                  className="text-xs text-center mt-1 transition-colors"
                  style={{ color: 'var(--t3)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
                >
                  Esqueci minha senha
                </button>
              )}
              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); }}
                  className="text-xs text-center mt-1"
                  style={{ color: 'var(--t3)' }}
                >
                  Voltar ao login
                </button>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-[10px] mt-4" style={{ color: 'var(--t3)' }}>
          Sistema de uso exclusivo · Acesso autorizado apenas
        </p>
      </div>
    </div>
  );
}
