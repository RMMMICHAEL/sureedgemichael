'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { wipeDB, EMPTY_DB } from '@/lib/storage/db';
import { saveToSupabase } from '@/lib/supabase/sync';
import { loadSeedData, clearSeedData } from '@/lib/dev/seedData';
import { AlertTriangle, Trash2, X, KeyRound, CheckCircle2, Loader2, RefreshCw, Upload, FileJson } from 'lucide-react';

const ADMIN_EMAIL = 'michael.martins.trader@gmail.com';

// ── Reset confirmation modal ──────────────────────────────────────────────────

function ResetModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const items = [
    'Todas as operações / pernas apostadas',
    'Planilha vinculada e histórico de importação',
    'Casas de aposta e saldos',
    'Contas bancárias',
    'Gastos e transferências',
    'Contas de parceiros',
    'Clientes e contas compradas',
    'Configurações e notas',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: 'var(--s)', border: '1px solid rgba(255,69,69,.35)' }}
      >
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 rounded-lg p-1 transition-colors"
          style={{ color: 'var(--t3)' }}
        >
          <X size={16} />
        </button>

        {/* Icon + title */}
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 rounded-xl p-2.5 mt-0.5"
            style={{ background: 'rgba(255,69,69,.12)', color: 'var(--r)' }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="font-bold text-base" style={{ color: 'var(--r)' }}>
              Resetar todos os dados
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--t2)' }}>
              Esta ação é <strong style={{ color: 'var(--t)' }}>irreversível</strong>. Os itens abaixo serão permanentemente apagados, tanto localmente quanto na nuvem:
            </p>
          </div>
        </div>

        {/* Item list */}
        <ul className="flex flex-col gap-1.5 pl-1">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs" style={{ color: 'var(--t2)' }}>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(255,69,69,.6)' }}
              />
              {item}
            </li>
          ))}
        </ul>

        {/* Warning callout */}
        <div
          className="rounded-xl px-4 py-3 text-xs"
          style={{ background: 'rgba(255,69,69,.08)', border: '1px solid rgba(255,69,69,.18)', color: 'var(--t2)' }}
        >
          Sua conta não será excluída. Apenas os dados armazenados serão apagados.
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t2)', border: '1px solid var(--b)' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: 'var(--r)', color: '#fff' }}
          >
            <Trash2 size={14} />
            Apagar tudo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cookie injection panel ────────────────────────────────────────────────────

interface RenewalFailure {
  failed: boolean;
  ts?: string;
  reason?: string;
}

function CookiePanel() {
  const toastFn = useStore(s => s.toast);
  const [value,      setValue]      = useState('');
  const [cfValue,    setCfValue]    = useState('');
  const [status,     setStatus]     = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [errMsg,     setErrMsg]     = useState('');
  const [failure,    setFailure]    = useState<RenewalFailure | null>(null);

  useEffect(() => {
    fetch('/api/sure/renewal-failed')
      .then(r => r.json())
      .then((d: RenewalFailure) => { if (d.failed) setFailure(d); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setStatus('loading');
    setErrMsg('');
    try {
      const res = await fetch('/api/sure/save-cookie', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cookie: trimmed, cf_clearance: cfValue.trim() || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setStatus('ok');
        setValue('');
        setCfValue('');
        setFailure(null);   // limpa alerta de falha
        toastFn('Cookie salvo com sucesso! O daemon vai usá-lo em breve.', 'ok');
        setTimeout(() => setStatus('idle'), 4000);
      } else {
        setStatus('error');
        setErrMsg(data.error ?? 'Erro desconhecido');
      }
    } catch {
      setStatus('error');
      setErrMsg('Falha na requisição. Verifique sua conexão.');
    }
  }

  const isLoading = status === 'loading';

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'rgba(255,200,0,.04)', border: '1px solid rgba(255,200,0,.2)' }}
    >
      {/* Alerta de falha de renovação automática */}
      {failure?.failed && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: 'rgba(255,100,0,.1)', border: '1px solid rgba(255,100,0,.35)' }}
        >
          <RefreshCw size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#FF6400' }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold" style={{ color: '#FF6400' }}>
              Renovação automática falhou
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t2)' }}>
              O daemon tentou renovar o cookie 3 vezes e não conseguiu.
              {failure.reason && (
                <span style={{ color: 'var(--t3)' }}> Motivo: {failure.reason}</span>
              )}
            </p>
            {failure.ts && (
              <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--t3)' }}>
                {new Date(failure.ts).toLocaleString('pt-BR')}
              </p>
            )}
            <p className="text-xs mt-1.5 font-semibold" style={{ color: '#FF6400' }}>
              Injete um novo cookie abaixo para restaurar o scanner.
            </p>
          </div>
          <button
            onClick={() => setFailure(null)}
            className="flex-shrink-0 rounded p-0.5 transition-opacity hover:opacity-70"
            style={{ color: 'var(--t3)' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="rounded-xl p-2.5 flex-shrink-0"
          style={{ background: 'rgba(255,200,0,.12)', color: '#FFC800' }}
        >
          <KeyRound size={18} />
        </div>
        <div>
          <div className="font-bold text-sm" style={{ color: '#FFC800' }}>Injetar Cookie SuperMonitor</div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
            Cole o PHPSESSID do seu browser. O daemon vai validar e salvar automaticamente.
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div
        className="rounded-xl px-4 py-3 text-xs flex flex-col gap-1.5"
        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--b)' }}
      >
        <span className="font-semibold" style={{ color: 'var(--t2)' }}>Como obter o PHPSESSID:</span>
        <ol className="flex flex-col gap-1 pl-1" style={{ color: 'var(--t3)' }}>
          <li className="flex gap-2"><span style={{ color: '#FFC800' }}>1.</span> Abra <strong style={{ color: 'var(--t2)' }}>painel.supermonitor.pro</strong> no <strong style={{ color: 'var(--t2)' }}>PC Windows</strong> (não celular) e faça login</li>
          <li className="flex gap-2"><span style={{ color: '#FFC800' }}>2.</span> Abra DevTools (F12) → Application → Cookies</li>
          <li className="flex gap-2"><span style={{ color: '#FFC800' }}>3.</span> Copie o valor de <strong style={{ color: 'var(--t2)' }}>PHPSESSID</strong> e cole abaixo</li>
          <li className="flex gap-2"><span style={{ color: '#FFC800' }}>4.</span> Copie também o valor de <strong style={{ color: 'var(--t2)' }}>cf_clearance</strong> e cole no segundo campo</li>
          <li className="flex gap-2"><span style={{ color: '#FFC800' }}>5.</span> Clique em Validar e Salvar</li>
        </ol>
      </div>

      {/* Input */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold" style={{ color: 'var(--t2)' }}>PHPSESSID</label>
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setStatus('idle'); setErrMsg(''); }}
          onKeyDown={e => e.key === 'Enter' && !isLoading && handleSave()}
          placeholder="ex: f8e661c7a0aea81a..."
          disabled={isLoading}
          className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all"
          style={{
            background:  'var(--s)',
            border:      `1px solid ${status === 'error' ? 'rgba(255,69,69,.5)' : status === 'ok' ? 'rgba(63,255,33,.4)' : 'var(--b)'}`,
            color:       'var(--t)',
            opacity:     isLoading ? 0.6 : 1,
          }}
        />
        <label className="text-xs font-semibold mt-1" style={{ color: 'var(--t2)' }}>
          cf_clearance <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(obrigatório — do PC Windows)</span>
        </label>
        <input
          type="text"
          value={cfValue}
          onChange={e => { setCfValue(e.target.value); setStatus('idle'); setErrMsg(''); }}
          onKeyDown={e => e.key === 'Enter' && !isLoading && handleSave()}
          placeholder="ex: qMPXQWI7O3sSHvn5_oWtyYmKuMPhKM..."
          disabled={isLoading}
          className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all"
          style={{
            background: 'var(--s)',
            border:     `1px solid ${status === 'ok' ? 'rgba(63,255,33,.4)' : 'var(--b)'}`,
            color:      'var(--t)',
            opacity:    isLoading ? 0.6 : 1,
          }}
        />

        {/* Status messages */}
        {status === 'error' && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--r)' }}>
            <AlertTriangle size={12} />
            {errMsg}
          </p>
        )}
        {status === 'ok' && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--g)' }}>
            <CheckCircle2 size={12} />
            Cookie válido salvo com sucesso.
          </p>
        )}
      </div>

      {/* Action button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isLoading || !value.trim()}
        className="self-start px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
        style={{
          background: isLoading || !value.trim() ? 'rgba(255,200,0,.15)' : '#FFC800',
          color:      isLoading || !value.trim() ? 'rgba(255,200,0,.5)' : '#111',
          cursor:     isLoading || !value.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Validando...
          </>
        ) : (
          <>
            <KeyRound size={14} />
            Validar e Salvar
          </>
        )}
      </button>
    </div>
  );
}

// ── Odds Import Panel ────────────────────────────────────────────────────────

type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

function OddsImportPanel() {
  const [json, setJson]       = useState('');
  const [status, setStatus]   = useState<ImportStatus>('idle');
  const [result, setResult]   = useState<string>('');

  async function handleImport() {
    if (!json.trim()) return;
    setStatus('loading');
    setResult('');

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setStatus('error');
      setResult('JSON inválido — verifique o formato e tente novamente.');
      return;
    }

    try {
      const res  = await fetch('/api/admin/odds-import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(parsed),
      });
      const data = await res.json() as { ok: boolean; total: number; upserted: number; errors?: string[] };

      if (data.ok) {
        setStatus('success');
        setResult(`✓ ${data.upserted} de ${data.total} registros importados com sucesso.`);
        setJson('');
      } else {
        setStatus('error');
        setResult(`Erro: ${data.errors?.join('; ') ?? 'falha desconhecida'}`);
      }
    } catch (e) {
      setStatus('error');
      setResult(`Erro de rede: ${String(e)}`);
    }
  }

  const statusColor =
    status === 'success' ? 'var(--g)' :
    status === 'error'   ? 'var(--r)' : 'var(--t2)';

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(63,200,255,.04)', border: '1px solid rgba(63,200,255,.18)' }}>
      <div className="flex items-center gap-2 font-bold mb-1" style={{ color: 'rgb(63,200,255)' }}>
        <FileJson size={16} />
        Importar Odds (JSON)
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--t2)' }}>
        Cole aqui o JSON do <code style={{ background: 'rgba(255,255,255,.08)', padding: '1px 4px', borderRadius: 4 }}>get-individual-odds</code>.
        O sistema irá popular automaticamente o banco de dados com todos os eventos e odds.
        Use upsert — registros existentes serão atualizados.
      </p>

      <textarea
        value={json}
        onChange={e => { setJson(e.target.value); setStatus('idle'); setResult(''); }}
        placeholder={'{\n  "success": true,\n  "count": 1912,\n  "odds": [...]\n}'}
        rows={8}
        className="w-full rounded-xl p-3 text-xs font-mono resize-y mb-3"
        style={{
          background:  'rgba(0,0,0,.3)',
          border:      '1px solid var(--b)',
          color:       'var(--t1)',
          outline:     'none',
        }}
        disabled={status === 'loading'}
        spellCheck={false}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleImport}
          disabled={status === 'loading' || !json.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{
            background: status === 'loading' ? 'rgba(63,200,255,.1)' : 'rgb(63,200,255)',
            color:      '#060A07',
            opacity:    (status === 'loading' || !json.trim()) ? 0.6 : 1,
          }}
        >
          {status === 'loading'
            ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
            : <><Upload size={14} /> Importar</>}
        </button>

        {result && (
          <span className="text-xs font-medium" style={{ color: statusColor }}>
            {result}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminPage() {
  const [loadingDemo,   setLoadingDemo]   = useState(false);
  const [demoLoaded,    setDemoLoaded]    = useState(false);
  const [showReset,     setShowReset]     = useState(false);
  const [resetting,     setResetting]     = useState(false);

  const setView   = useStore(s => s.setView);
  const toastFn   = useStore(s => s.toast);
  const authEmail = useStore(s => s.authEmail);
  const isAdmin   = authEmail === ADMIN_EMAIL;

  async function handleConfirmReset() {
    setResetting(true);
    try {
      // 1. Wipe localStorage
      wipeDB();
      // 2. Overwrite Supabase with empty DB so the sync on reload
      //    doesn't restore old data
      await saveToSupabase({
        ...EMPTY_DB,
        onboarding_done: false,
        onboarding_step: 'bookmakers',
      });
    } catch {
      // Best-effort — even if Supabase fails, local is wiped
    } finally {
      window.location.reload();
    }
  }

  function handleLoadDemo() {
    if (!confirm('Carregar dados de demonstração? Isso adicionará operações, casas e contas fictícias.')) return;
    setLoadingDemo(true);
    try {
      loadSeedData();
      setDemoLoaded(true);
      setView('dash');
      toastFn('Dados demo carregados com sucesso!', 'ok');
    } finally {
      setLoadingDemo(false);
    }
  }

  function handleClearDemo() {
    if (!confirm('Remover todos os dados de demonstração?')) return;
    clearSeedData();
    setDemoLoaded(false);
    toastFn('Dados demo removidos.', 'ok');
  }

  return (
    <>
      {showReset && (
        <ResetModal
          onConfirm={handleConfirmReset}
          onCancel={() => setShowReset(false)}
        />
      )}

      <div className="flex flex-col gap-5 animate-fade-in max-w-2xl">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Admin</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>Controle do sistema</p>
        </div>

        {isAdmin && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(63,255,33,.04)', border: '1px solid rgba(63,255,33,.18)' }}>
            <div className="font-bold mb-1" style={{ color: 'var(--g)' }}>Dados Demo</div>
            <p className="text-xs mb-4" style={{ color: 'var(--t2)' }}>
              Carrega operações, casas de aposta, contas bancárias, clientes e parceiros fictícios para gravação de tutoriais. Pode ser removido a qualquer momento.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleLoadDemo}
                disabled={loadingDemo}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: loadingDemo ? 'rgba(63,255,33,.1)' : 'var(--g)',
                  color: '#060A07',
                  opacity: loadingDemo ? 0.7 : 1,
                }}
              >
                {loadingDemo ? 'Carregando...' : 'Carregar dados demo'}
              </button>
              <button
                type="button"
                onClick={handleClearDemo}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: 'rgba(255,255,255,.06)',
                  color: 'var(--t2)',
                  border: '1px solid var(--b)',
                }}
              >
                Remover dados demo
              </button>
            </div>
          </div>
        )}

        {isAdmin && <CookiePanel />}

        {isAdmin && <OddsImportPanel />}

        <div className="rounded-2xl p-5" style={{ background: 'var(--rd)', border: '1px solid rgba(255,69,69,.25)' }}>
          <div className="font-bold mb-1" style={{ color: 'var(--r)' }}>Zona de Perigo</div>
          <p className="text-xs mb-4" style={{ color: 'var(--t2)' }}>
            Apaga todos os dados — operações, casas, saldos, planilha vinculada, clientes e configurações. Tanto no dispositivo quanto na nuvem. Irreversível.
          </p>
          <Button
            variant="danger"
            onClick={() => setShowReset(true)}
            disabled={resetting}
          >
            {resetting ? 'Apagando...' : 'Resetar todos os dados'}
          </Button>
        </div>
      </div>
    </>
  );
}
