'use client';

import { useStore } from '@/store/useStore';
import { Button }   from '@/components/ui/Button';
import { wipeDB }   from '@/lib/storage/db';

export function AdminPage() {
  const importLog = useStore(s => s.import_log);
  const init      = useStore(s => s.init);
  const toast     = useStore(s => s.toast);
  const legs      = useStore(s => s.legs);
  const bms       = useStore(s => s.bms);

  function handleReset() {
    if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
    wipeDB();
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Admin</h2>
        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>Diagnóstico e controle do sistema</p>
      </div>

      {/* DB stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pernas',     value: legs.length },
          { label: 'Casas',      value: bms.length },
          { label: 'Importações', value: importLog.length },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
            <div className="text-xs" style={{ color: 'var(--t3)' }}>{k.label}</div>
            <div className="text-2xl font-bold font-mono mt-1" style={{ color: 'var(--t)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Import log */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--b)' }}>
        <div className="px-5 py-4 text-sm font-bold" style={{ color: 'var(--t2)', borderBottom: '1px solid var(--b)' }}>
          Log de Importações
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th><th>Mês</th><th>Importadas</th>
                <th>Duplicatas</th><th>Anomalias</th>
              </tr>
            </thead>
            <tbody>
              {!importLog.length ? (
                <tr><td colSpan={5} className="text-center py-6 text-sm" style={{ color: 'var(--t3)' }}>
                  Sem importações registradas
                </td></tr>
              ) : [...importLog].reverse().map((log, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs">{new Date(log.ts).toLocaleString('pt-BR')}</td>
                  <td className="font-mono text-xs">{log.month}</td>
                  <td className="font-mono text-xs" style={{ color: 'var(--g)' }}>{log.imported}</td>
                  <td className="font-mono text-xs" style={{ color: 'var(--y)' }}>{log.dupes}</td>
                  <td className="font-mono text-xs" style={{ color: log.anomalies > 0 ? 'var(--r)' : 'var(--t3)' }}>
                    {log.anomalies}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger zone */}
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
