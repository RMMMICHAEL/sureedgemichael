'use client';

import { useState } from 'react';
import { ExternalLink, Key, CheckCircle, AlertCircle, Copy, RefreshCw } from 'lucide-react';

interface SessionSetupProps {
  onSuccess: () => void;
}

type Step = 'intro' | 'login' | 'paste' | 'done';

export function SessionSetup({ onSuccess }: SessionSetupProps) {
  const [step,    setStep]    = useState<Step>('intro');
  const [cookie,  setCookie]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSave() {
    const val = cookie.trim();
    if (!val) { setError('Cole o valor do PHPSESSID acima'); return; }

    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/supermonitor/save-cookie', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cookie: val }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro desconhecido');
      setStep('done');
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="rounded-2xl p-8 flex flex-col items-center gap-4 text-center"
        style={{ background: 'rgba(63,255,33,.06)', border: '1px solid rgba(63,255,33,.25)' }}>
        <CheckCircle size={36} style={{ color: '#3fff21' }} />
        <div>
          <p className="text-sm font-black" style={{ color: '#3fff21' }}>Autorização configurada!</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(63,255,33,.7)' }}>
            A sessão foi salva e será usada automaticamente. Não precisa fazer isso de novo por semanas.
          </p>
        </div>
        <button type="button" onClick={onSuccess}
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-black"
          style={{ background: 'rgba(63,255,33,.15)', color: '#3fff21', border: '1px solid rgba(63,255,33,.3)' }}>
          Começar a usar →
        </button>
      </div>
    );
  }

  // ── Passo 3: colar o cookie ───────────────────────────────────────────────────
  if (step === 'paste') {
    return (
      <div className="rounded-2xl p-6 flex flex-col gap-5"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>

        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{ background: 'rgba(129,140,248,.2)', color: '#818cf8' }}>3</div>
          <div>
            <p className="text-sm font-black" style={{ color: 'var(--t)' }}>Copie e cole o valor do cookie</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
              No DevTools, clique com botão direito em <strong>PHPSESSID</strong> → Copy Value. Cole abaixo:
            </p>
          </div>
        </div>

        {/* Instrução visual */}
        <div className="rounded-xl p-3 text-xs leading-relaxed"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
          <strong style={{ color: 'var(--t2)' }}>Como abrir o DevTools:</strong>
          {' '}F12 (Windows) ou ⌘+Option+I (Mac){' '}
          → aba <strong style={{ color: 'var(--t2)' }}>Application</strong>{' '}
          → <strong style={{ color: 'var(--t2)' }}>Cookies</strong>{' '}
          → <strong style={{ color: 'var(--t2)' }}>https://painel.supermonitor.pro</strong>{' '}
          → copie o valor de <strong style={{ color: '#818cf8' }}>PHPSESSID</strong>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-[.12em]" style={{ color: 'var(--t3)' }}>
            Valor do PHPSESSID
          </label>
          <input
            type="text"
            value={cookie}
            onChange={e => { setCookie(e.target.value); setError(''); }}
            placeholder="Ex: d5584e950dacffb59f3476e967025405"
            className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none"
            style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${error ? 'rgba(255,77,109,.5)' : 'var(--b)'}`, color: 'var(--t)' }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(129,140,248,.5)'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = error ? 'rgba(255,77,109,.5)' : 'var(--b)'; }}
          />
          {error && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--r)' }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setStep('login')}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
            ← Voltar
          </button>
          <button type="button" onClick={handleSave} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2"
            style={{
              background: loading ? 'rgba(129,140,248,.1)' : 'rgba(129,140,248,.2)',
              color: '#818cf8', border: '1px solid rgba(129,140,248,.4)',
              opacity: loading ? 0.7 : 1,
            }}>
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
            {loading ? 'Validando e salvando…' : 'Salvar e ativar automaticamente'}
          </button>
        </div>
      </div>
    );
  }

  // ── Passo 2: fazer login no Supermonitor ──────────────────────────────────────
  if (step === 'login') {
    return (
      <div className="rounded-2xl p-6 flex flex-col gap-5"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>

        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{ background: 'rgba(129,140,248,.2)', color: '#818cf8' }}>2</div>
          <div>
            <p className="text-sm font-black" style={{ color: 'var(--t)' }}>Faça login no site de odds</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
              Clique no botão abaixo. O site abrirá em nova aba. Faça login com suas credenciais.
            </p>
          </div>
        </div>

        <a
          href="https://painel.supermonitor.pro/login.php"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black"
          style={{ background: 'rgba(129,140,248,.15)', color: '#818cf8', border: '1px solid rgba(129,140,248,.3)', textDecoration: 'none' }}>
          <ExternalLink size={14} />
          Abrir página de login (nova aba)
        </a>

        <div className="rounded-xl p-3 text-xs leading-relaxed"
          style={{ background: 'rgba(255,159,10,.06)', border: '1px solid rgba(255,159,10,.2)', color: 'rgba(255,159,10,.8)' }}>
          ⚠️ <strong>Importante:</strong> Após fazer login, volte aqui e clique em "Próximo passo".
          Não feche a aba do site de odds.
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setStep('intro')}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid var(--b)' }}>
            ← Voltar
          </button>
          <button type="button" onClick={() => setStep('paste')}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black"
            style={{ background: 'rgba(129,140,248,.2)', color: '#818cf8', border: '1px solid rgba(129,140,248,.4)' }}>
            Já fiz login → Próximo passo
          </button>
        </div>
      </div>
    );
  }

  // ── Passo 1: intro ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(129,140,248,.25)' }}>
      {/* Header */}
      <div className="px-6 py-5 flex items-center gap-4"
        style={{ background: 'rgba(129,140,248,.08)', borderBottom: '1px solid rgba(129,140,248,.15)' }}>
        <Key size={20} style={{ color: '#818cf8', flexShrink: 0 }} />
        <div>
          <p className="text-sm font-black" style={{ color: 'var(--t)' }}>Autorização necessária</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
            Configure uma vez e o sistema funciona automaticamente por semanas.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="p-6 flex flex-col gap-4">
        {[
          { n: 1, text: 'Faça login no provedor de odds no seu navegador' },
          { n: 2, text: 'Copie o cookie de sessão com um clique (DevTools)' },
          { n: 3, text: 'Cole aqui — fica salvo automaticamente por semanas' },
        ].map(({ n, text }) => (
          <div key={n} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
              style={{ background: 'rgba(129,140,248,.15)', color: '#818cf8' }}>{n}</div>
            <p className="text-sm" style={{ color: 'var(--t2)' }}>{text}</p>
          </div>
        ))}

        <button type="button" onClick={() => setStep('login')}
          className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black"
          style={{ background: 'rgba(129,140,248,.2)', color: '#818cf8', border: '1px solid rgba(129,140,248,.4)' }}>
          <Copy size={14} />
          Iniciar configuração (30 segundos)
        </button>

        <p className="text-center text-[10px]" style={{ color: 'var(--t3)' }}>
          Só precisa fazer isso uma vez. A sessão dura semanas e renova automaticamente.
        </p>
      </div>
    </div>
  );
}
