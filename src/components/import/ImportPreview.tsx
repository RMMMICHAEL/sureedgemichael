'use client';

import { useState } from 'react';
import { useStore }  from '@/store/useStore';
import { Button }    from '@/components/ui/Button';
import { FlagBadge } from '@/components/ui/Badge';
import { commitRows } from '@/lib/import/importEngine';
import { maxSeverity } from '@/lib/validation/anomalyDetector';
import { AlertTriangle, CheckCircle2, X, Info } from 'lucide-react';

export function ImportPreview() {
  const importBuffer  = useStore(s => s.importBuffer);
  const setImportBuf  = useStore(s => s.setImportBuffer);
  const legs          = useStore(s => s.legs);
  const commitImport  = useStore(s => s.commitImport);
  const toastFn       = useStore(s => s.toast);

  const [includeAll, setIncludeAll] = useState(true);

  if (!importBuffer) return null;

  const { rows, clean, anomalies, nonBets, skipped, month } = importBuffer;
  const toShow = includeAll ? rows : clean;

  function handleCommit() {
    const result = commitRows(toShow, { includeAll, existingLegs: legs });
    commitImport(result);
    setImportBuf(null);
    toastFn(
      `${result.imported} pernas importadas · ${result.dupes} duplicatas · ${result.anomalies} revisões`,
      result.anomalies > 0 ? 'wrn' : 'ok'
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(5px)' }}
    >
      <div
        className="w-full max-w-5xl animate-slide-up rounded-2xl flex flex-col max-h-[92vh]"
        style={{ background: 'var(--bg3)', border: '1px solid var(--b2)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--b)' }}
        >
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--t)' }}>Prévia da Importação</h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>
              {month === 'all' ? 'Histórico completo' : `Mês: ${month}`}
              {' · '}{rows.length} linhas encontradas
              {skipped > 0 && ` · ${skipped} ignoradas`}
            </p>
          </div>
          <button
            onClick={() => setImportBuf(null)}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--t3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Summary alerts */}
        <div className="px-6 pt-4 flex flex-col gap-2 flex-shrink-0">
          {/* Import scope info */}
          <div
            className="flex items-start gap-2.5 p-3 rounded-xl text-xs"
            style={{ background: 'rgba(77,166,255,.08)', border: '1px solid rgba(77,166,255,.2)', color: 'var(--bl)' }}
          >
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {month === 'all'
                ? <>Importando <strong>histórico completo</strong> da planilha ({rows.length} operações). Os saldos das casas <strong>não serão alterados</strong> — dados históricos servem apenas para análise e dashboard.</>
                : <>Importando operações de <strong>{month}</strong>. {skipped > 0 && `${skipped} linhas de outros meses foram ignoradas. `}Os saldos das casas não são afetados.</>
              }
            </span>
          </div>

          {/* Anomaly summary */}
          {anomalies.length > 0 && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl text-xs"
              style={{ background: 'rgba(255,203,47,.08)', border: '1px solid rgba(255,203,47,.2)', color: 'var(--y)' }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>{anomalies.length}</strong> linhas com anomalias detectadas ·
                <strong> {nonBets.length}</strong> possíveis lançamentos não esportivos.
                Você pode importar tudo e revisar depois, ou importar apenas os registros limpos ({clean.length}).
              </span>
            </div>
          )}

          {/* Include toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setIncludeAll(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: includeAll ? 'var(--g)' : 'var(--sur)',
                color: includeAll ? 'var(--bg)' : 'var(--t2)',
                border: '1px solid ' + (includeAll ? 'var(--g)' : 'var(--b2)'),
              }}
            >
              <CheckCircle2 size={12} />
              Importar tudo ({rows.length})
            </button>
            <button
              onClick={() => setIncludeAll(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background: !includeAll ? 'var(--g)' : 'var(--sur)',
                color: !includeAll ? 'var(--bg)' : 'var(--t2)',
                border: '1px solid ' + (!includeAll ? 'var(--g)' : 'var(--b2)'),
              }}
            >
              <CheckCircle2 size={12} />
              Apenas limpos ({clean.length})
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 pb-2 mt-3">
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--b)' }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Esporte</th>
                  <th>Evento</th>
                  <th>Casa</th>
                  <th>Odd</th>
                  <th>Stake</th>
                  <th>%</th>
                  <th>Resultado</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {(includeAll ? rows : clean).slice(0, 120).map((row, i) => {
                  const sev = maxSeverity(row.flags);
                  return (
                    <tr
                      key={i}
                      style={{
                        background:
                          sev === 'critical' ? 'rgba(255,69,69,.04)' :
                          sev === 'medium'   ? 'rgba(255,203,47,.03)' :
                          'transparent',
                      }}
                    >
                      <td className="font-mono text-xs whitespace-nowrap">
                        {(row.bd || '').slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="text-xs">{row.sp || '—'}</td>
                      <td className="text-xs max-w-xs truncate">{row.ev || '—'}</td>
                      <td className="text-xs">{row.ho || '—'}</td>
                      <td className="font-mono text-xs">{row.od || '—'}</td>
                      <td className="font-mono text-xs">
                        R$ {(row.st || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="font-mono text-xs">
                        {row.pc > 0 ? `${row.pc.toFixed(2)}%` : '—'}
                      </td>
                      <td className="text-xs">{row.re}</td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {row.flags.slice(0, 2).map((f, fi) => (
                            <FlagBadge key={fi} level={f.level} label={f.code.split('_').slice(-1)[0]} />
                          ))}
                          {row.flags.length > 2 && (
                            <FlagBadge level="light" label={`+${row.flags.length - 2}`} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length > 120 && (
                  <tr>
                    <td colSpan={9} className="text-center text-xs py-3" style={{ color: 'var(--t3)' }}>
                      ...e mais {rows.length - 120} linhas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0 gap-3"
          style={{ borderTop: '1px solid var(--b)' }}
        >
          <span className="text-xs" style={{ color: 'var(--t3)' }}>
            {toShow.length} linhas serão importadas · {rows.length - toShow.length} ignoradas
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setImportBuf(null)}>Cancelar</Button>
            <Button variant="primary" onClick={handleCommit}>
              Importar {toShow.length} {toShow.length === 1 ? 'linha' : 'linhas'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
