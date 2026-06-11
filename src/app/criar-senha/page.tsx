'use client';

/**
 * /criar-senha — Criação de senha no primeiro acesso via magic link
 *
 * Aparece automaticamente após o cliente entrar pelo link do e-mail.
 * Chama supabase.auth.updateUser({ password }) para definir a senha.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Zap, Lock, Eye, EyeOff, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';

export default function CriarSenhaPage() {
  const router = useRouter();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [showCf,    setShowCf]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push('/'), 2000);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Erro ao definir senha.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#030507', padding: '32px 20px', fontFamily: 'Manrope, sans-serif',
    }}>
      <div style={{ maxWidth: 420, width: '100%' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
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

        <div style={{
          background: 'rgba(6,10,7,.9)', border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 20, padding: 32,
        }}>
          {done ? (
            /* Sucesso */
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
                background: 'rgba(63,255,33,.1)', border: '2px solid rgba(63,255,33,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 size={28} color="#3FFF21" />
              </div>
              <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 10 }}>
                Senha criada!
              </h2>
              <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 14 }}>
                Redirecionando para o dashboard...
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: 28 }}>
                <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 24, letterSpacing: '-0.03em', marginBottom: 8 }}>
                  Crie sua senha
                </h1>
                <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 14, lineHeight: 1.6 }}>
                  Defina uma senha para acessar o SureEdge nas próximas vezes sem precisar de link.
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Senha */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                    Nova senha
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.45)', pointerEvents: 'none' }} />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                      required
                      style={{
                        width: '100%', paddingLeft: 40, paddingRight: 44, paddingTop: 12, paddingBottom: 12,
                        borderRadius: 12, fontSize: 14, outline: 'none',
                        background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)',
                        color: '#fff',
                      }}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.45)', padding: 0,
                    }}>
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Confirmar */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                    Confirmar senha
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.45)', pointerEvents: 'none' }} />
                    <input
                      type={showCf ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repita a senha"
                      minLength={6}
                      required
                      style={{
                        width: '100%', paddingLeft: 40, paddingRight: 44, paddingTop: 12, paddingBottom: 12,
                        borderRadius: 12, fontSize: 14, outline: 'none',
                        background: 'rgba(255,255,255,.05)',
                        border: `1px solid ${confirm && confirm !== password ? 'rgba(255,69,69,.4)' : 'rgba(255,255,255,.09)'}`,
                        color: '#fff',
                      }}
                    />
                    <button type="button" onClick={() => setShowCf(v => !v)} style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.45)', padding: 0,
                    }}>
                      {showCf ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Erro */}
                {error && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(255,69,69,.08)', border: '1px solid rgba(255,69,69,.2)',
                    color: '#FF4D4D', fontSize: 13,
                  }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                {/* Botão */}
                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 12,
                    fontSize: 14, fontWeight: 800, border: 'none',
                    cursor: loading || !password || !confirm ? 'not-allowed' : 'pointer',
                    background: loading || !password || !confirm ? 'rgba(63,255,33,.3)' : '#3FFF21',
                    color: '#030507',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all .2s',
                  }}
                >
                  {loading ? 'Salvando...' : <><ArrowRight size={15} /> Salvar senha e acessar</>}
                </button>

                {/* Pular */}
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.45)', fontSize: 12, marginTop: 4 }}
                >
                  Pular por agora →
                </button>

              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
