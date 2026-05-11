'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { wipeDB, EMPTY_DB } from '@/lib/storage/db';
import { saveToSupabase } from '@/lib/supabase/sync';
import { loadSeedData, clearSeedData } from '@/lib/dev/seedData';
import { AlertTriangle, Trash2, X } from 'lucide-react';

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
