'use client';

import { Button } from '@/components/ui/Button';
import { wipeDB } from '@/lib/storage/db';

export function AdminPage() {
  function handleReset() {
    if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
    wipeDB();
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Admin</h2>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>Controle do sistema</p>
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
