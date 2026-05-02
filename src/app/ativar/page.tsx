'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Mail, CheckCircle2, XCircle, ArrowRight, AlertCircle } from 'lucide-react';

export default function AtivarPage() {
  const router = useRouter();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<{
    found: boolean; active?: boolean; status?: string; plan?: string; message: string;
  } | null>(null);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch('/api/ativar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ found: false, message: 'Erro de conexão. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#030507', padding: '32px 20px',
    }}>
      <div style={{ maxWidth: 440, width: '100%' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
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
            <div style={{ fontSize: 10, color: 'rgba(63,255,33,.55)', fontFamily: 'JetBrains Mono', letterSpacing: '0.06em' }}>ATIVAR ACESSO</div>
          </div>
        </div>

        <div style={{
          background: 'rgba(6,10,7,.9)', border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 20, padding: 32,
        }}>
          <h1 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 24, letterSpacing: '-0.03em', marginBottom: 8 }}>
            Verificar minha compra
          </h1>
          <p style={{ color: 'var(--t3)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
            Digite o email usado no pagamento para verificar se seu acesso foi liberado.
          </p>

          <form onSubmit={handleCheck} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--t3)', pointerEvents: 'none',
              }} />
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@usado.no.pagamento.com"
                style={{
                  width: '100%', paddingLeft: 40, paddingRight: 14, paddingTop: 12, paddingBottom: 12,
                  borderRadius: 12, fontSize: 14, outline: 'none',
                  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)',
                  color: 'var(--t)', transition: 'border-color .2s',
                }}
              />
            </div>

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px',
                borderRadius: 12, fontSize: 14, fontWeight: 800,
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? 'rgba(63,255,33,.45)' : '#3FFF21',
                color: '#030507', transition: 'all .2s',
              }}
            >
              {loading ? 'Verificando...' : 'Verificar acesso'}
            </button>
          </form>

          {/* Result */}
          {result && (
            <div style={{
              marginTop: 24, padding: '16px 18px', borderRadius: 14,
              background: result.active
                ? 'rgba(63,255,33,.07)'
                : result.found
                  ? 'rgba(255,214,0,.07)'
                  : 'rgba(255,77,77,.07)',
              border: `1px solid ${result.active ? 'rgba(63,255,33,.2)' : result.found ? 'rgba(255,214,0,.2)' : 'rgba(255,77,77,.2)'}`,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {result.active
                  ? <CheckCircle2 size={16} color="#3FFF21" style={{ flexShrink: 0, marginTop: 1 }} />
                  : result.found
                    ? <AlertCircle size={16} color="#FFD600" style={{ flexShrink: 0, marginTop: 1 }} />
                    : <XCircle size={16} color="#FF4D4D" style={{ flexShrink: 0, marginTop: 1 }} />}
                <p style={{
                  fontSize: 13, lineHeight: 1.55,
                  color: result.active ? '#3FFF21' : result.found ? '#FFD600' : '#FF4D4D',
                }}>
                  {result.message}
                </p>
              </div>

              {result.active && (
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                    border: 'none', cursor: 'pointer',
                    background: '#3FFF21', color: '#030507',
                  }}
                >
                  Acessar o dashboard <ArrowRight size={14} />
                </button>
              )}

              {!result.found && (
                <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                  Aguarde alguns minutos após o pagamento e tente novamente.
                  Se o problema persistir, entre em contato:{' '}
                  <a href="mailto:suporte@sureedge.com.br" style={{ color: 'var(--t2)' }}>
                    suporte@sureedge.com.br
                  </a>
                </p>
              )}
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--t3)' }}>
          <button
            type="button"
            onClick={() => router.push('/login')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 12 }}
          >
            ← Voltar ao login
          </button>
        </p>
      </div>
    </div>
  );
}
