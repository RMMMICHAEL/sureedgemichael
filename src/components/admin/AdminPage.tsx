'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { wipeDB } from '@/lib/storage/db';
import { loadSeedData, clearSeedData } from '@/lib/dev/seedData';

export function AdminPage() {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);

  function handleReset() {
    if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
    wipeDB();
    window.location.reload();
  }

  async function handleLoadDemo() {
    if (!confirm('Carregar dados de demonstração? Isso adicionará operações, casas e contas fictícias.')) return;
    setLoadingDemo(true);
    try {
      await loadSeedData();
      setDemoLoaded(true);
      window.location.reload();
    } finally {
      setLoadingDemo(false);
    }
  }

  function handleClearDemo() {
    if (!confirm('Remover todos os dados de demonstração?')) return;
    clearSeedData();
    setDemoLoaded(false);
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Admin</h2>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>Controle do sistema</p>
      </div>

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

      <div className="rounded-2xl p-5" style={{ background: 'var(--rd)', border: '1px solid rgba(255,69,69,.25)' }}>
        <div className="font-bold mb-1" style={{ color: 'var(--r)' }}>Zona de Perigo</div>
        <p className="text-xs mb-4" style={{ color: 'var(--t2)' }}>
          Apaga todos os dados locais, incluindo pernas, casas e saldos. Irreversível.
        </p>
        <Button variant="danger" onClick={handleReset}>Resetar todos os dados</Button>
      </div>
    </div>
  );
}
