'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { wipeDB, EMPTY_DB } from '@/lib/storage/db';
import { saveToSupabase } from '@/lib/supabase/sync';
import { loadSeedData, clearSeedData } from '@/lib/dev/seedData';
import {
  AlertTriangle, Trash2, X, Loader2, Upload, FileJson, Zap, Gift,
  Database, CheckCircle2, AlertCircle, BarChart3,
} from 'lucide-react';

const ADMIN_EMAILS = ['michael.martins.trader@gmail.com', 'rmmichael20@gmail.com'];

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
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 rounded-lg p-1 transition-colors"
          style={{ color: 'var(--t3)' }}
        >
          <X size={16} />
        </button>

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
              Esta ação é <strong style={{ color: 'var(--t)' }}>irreversível</strong>. Os itens abaixo serão permanentemente apagados:
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-1.5 pl-1">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs" style={{ color: 'var(--t2)' }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(255,69,69,.6)' }} />
              {item}
            </li>
          ))}
        </ul>

        <div
          className="rounded-xl px-4 py-3 text-xs"
          style={{ background: 'rgba(255,69,69,.08)', border: '1px solid rgba(255,69,69,.18)', color: 'var(--t2)' }}
        >
          Sua conta não será excluída. Apenas os dados armazenados serão apagados.
        </div>

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

// ── Import panel genérico ─────────────────────────────────────────────────────

type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

function ImportPanel({
  title,
  description,
  hint,
  endpoint,
  accentRgb,
  icon,
}: {
  title:      string;
  description: string;
  hint:        string;
  endpoint:   string;
  accentRgb:  string;
  icon:       React.ReactNode;
}) {
  const [fileName, setFileName] = useState('');
  const [rawText,  setRawText]  = useState('');
  const [status,   setStatus]   = useState<ImportStatus>('idle');
  const [result,   setResult]   = useState('');

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus('idle');
    setResult('');
    const reader = new FileReader();
    reader.onload = ev => setRawText((ev.target?.result as string) ?? '');
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function handleImport() {
    const text = rawText.trim();
    if (!text) return;
    setStatus('loading');
    setResult('');

    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch {
      setStatus('error');
      setResult('JSON inválido — arquivo corrompido ou incompleto.');
      return;
    }

    try {
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(parsed),
      });
      const data = await res.json() as {
        ok: boolean; total: number; inserted: number;
        cleaned?: number; errors?: string[];
      };

      if (data.ok) {
        setStatus('success');
        const cleanMsg = (data.cleaned ?? 0) > 0 ? ` · ${data.cleaned} antigos removidos` : '';
        setResult(`✓ ${data.inserted} de ${data.total} registros importados de "${fileName}"${cleanMsg}.`);
        setFileName('');
        setRawText('');
      } else {
        setStatus('error');
        setResult(`Erro: ${data.errors?.join('; ') ?? 'falha desconhecida'}`);
      }
    } catch (e) {
      setStatus('error');
      setResult(`Erro de rede: ${String(e)}`);
    }
  }

  const accent  = `rgb(${accentRgb})`;
  const hasFile = !!rawText;

  const statusColor =
    status === 'success' ? 'var(--g)' :
    status === 'error'   ? 'var(--r)' : 'var(--t2)';

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{
      background: `rgba(${accentRgb},.04)`,
      border:     `1px solid rgba(${accentRgb},.2)`,
    }}>
      <div className="flex items-center gap-3">
        <div className="rounded-xl p-2.5 flex-shrink-0" style={{ background: `rgba(${accentRgb},.14)`, color: accent }}>
          {icon}
        </div>
        <div>
          <div className="font-bold text-sm" style={{ color: accent }}>{title}</div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{description}</p>
        </div>
      </div>

      {/* Área de seleção */}
      <label
        className="flex flex-col items-center justify-center gap-2 w-full rounded-xl cursor-pointer transition-all"
        style={{
          border:     `2px dashed ${hasFile ? accent : 'var(--b)'}`,
          background: hasFile ? `rgba(${accentRgb},.06)` : 'rgba(0,0,0,.2)',
          padding:    '20px 16px',
        }}
      >
        <input
          type="file"
          accept=".txt,.json,application/json,text/plain"
          className="hidden"
          onChange={handleFile}
          disabled={status === 'loading'}
        />
        {hasFile ? (
          <>
            <FileJson size={22} style={{ color: accent }} />
            <span className="text-sm font-medium" style={{ color: accent }}>{fileName}</span>
            <span className="text-xs" style={{ color: 'var(--t2)' }}>
              {(rawText.length / 1024).toFixed(0)} KB carregado — clique para trocar
            </span>
          </>
        ) : (
          <>
            <Upload size={22} style={{ color: 'var(--t3)' }} />
            <span className="text-sm" style={{ color: 'var(--t2)' }}>Clique para selecionar o arquivo</span>
            <span className="text-xs" style={{ color: 'var(--t3)' }}>{hint}</span>
          </>
        )}
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleImport}
          disabled={status === 'loading' || !hasFile}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{
            background: status === 'loading' ? `rgba(${accentRgb},.1)` : accent,
            color:      '#060A07',
            opacity:    (status === 'loading' || !hasFile) ? 0.5 : 1,
          }}
        >
          {status === 'loading'
            ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
            : <><Upload size={14} /> Importar</>}
        </button>

        {result && (
          <span className="text-xs font-medium" style={{ color: statusColor }}>{result}</span>
        )}
      </div>
    </div>
  );
}

// ── Smart Import Panel (exportação completa DG) ───────────────────────────────

interface DGExportMeta {
  _type?:    string;
  _version?: number;
  _exported_at?: string;
  _summary?: {
    individual_odds_1x2?:    number;
    individual_odds_1x2_pa?: number;
    total_individual_odds?:  number;
    dashboard_odds?:         number;
    leagues_count?:          number;
  };
  individual_odds?: unknown[];
  odds?:            unknown[];
  data?:            unknown[];
}

interface ImportResult {
  ok:            boolean;
  detected_type: string;
  total_raw:     number;
  total_valid:   number;
  skipped:       number;
  inserted:      number;
  cleaned_old:   number;
  by_market:     Record<string, number>;
  error?:        string;
  errors?:       string[];
  sample_raw?:   unknown;
  tip?:          string;
}

function SmartImportPanel() {
  const [fileName,  setFileName]  = useState('');
  const [rawText,   setRawText]   = useState('');
  const [meta,      setMeta]      = useState<DGExportMeta | null>(null);
  const [status,    setStatus]    = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [result,    setResult]    = useState<ImportResult | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus('idle');
    setResult(null);
    setMeta(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? '';
      setRawText(text);
      // Tenta ler os metadados do arquivo para preview
      try {
        const parsed = JSON.parse(text) as DGExportMeta;
        setMeta(parsed);
      } catch { /* JSON inválido */ }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function handleImport() {
    if (!rawText.trim()) return;
    setStatus('loading');
    setResult(null);

    let parsed: unknown;
    try { parsed = JSON.parse(rawText); }
    catch { setStatus('error'); setResult({ ok: false, detected_type: '?', total_raw: 0, total_valid: 0, skipped: 0, inserted: 0, cleaned_old: 0, by_market: {}, error: 'JSON inválido — arquivo corrompido ou incompleto.' }); return; }

    try {
      const res  = await fetch('/api/admin/dg-full-import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(parsed),
      });
      const data = await res.json() as ImportResult;
      setResult(data);
      setStatus(data.ok ? 'success' : 'error');
      if (data.ok) { setFileName(''); setRawText(''); setMeta(null); }
    } catch (e) {
      setStatus('error');
      setResult({ ok: false, detected_type: '?', total_raw: 0, total_valid: 0, skipped: 0, inserted: 0, cleaned_old: 0, by_market: {}, error: `Erro de rede: ${String(e)}` });
    }
  }

  const hasFile = !!rawText;
  const isFullExport = meta?._type === 'dg_full_export';
  const totalOdds = meta?._summary?.total_individual_odds
    ?? meta?.individual_odds?.length
    ?? meta?.odds?.length
    ?? null;

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{
      background: 'rgba(63,255,33,.04)',
      border: '1px solid rgba(63,255,33,.2)',
    }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl p-2.5 flex-shrink-0"
          style={{ background: 'rgba(63,255,33,.14)', color: '#3FFF21' }}>
          <Database size={18} />
        </div>
        <div>
          <div className="font-bold text-sm" style={{ color: '#3FFF21' }}>
            Exportação Completa DG
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
            Arquivo <code style={{ color: 'rgba(255,255,255,.5)' }}>dg-export-YYYY-MM-DD.json</code> gerado pelo script do console. Importa odds individuais (1x2 + PA) de uma vez.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <label
        className="flex flex-col items-center justify-center gap-2 w-full rounded-xl cursor-pointer transition-all"
        style={{
          border:     `2px dashed ${hasFile ? '#3FFF21' : 'var(--b)'}`,
          background: hasFile ? 'rgba(63,255,33,.06)' : 'rgba(0,0,0,.2)',
          padding:    '20px 16px',
        }}
      >
        <input type="file" accept=".json,application/json" className="hidden"
          onChange={handleFile} disabled={status === 'loading'} />

        {hasFile ? (
          <>
            <FileJson size={22} style={{ color: '#3FFF21' }} />
            <span className="text-sm font-medium" style={{ color: '#3FFF21' }}>{fileName}</span>
            <span className="text-xs" style={{ color: 'var(--t2)' }}>
              {(rawText.length / 1024).toFixed(0)} KB carregado · clique para trocar
            </span>
          </>
        ) : (
          <>
            <Upload size={22} style={{ color: 'var(--t3)' }} />
            <span className="text-sm" style={{ color: 'var(--t2)' }}>Selecionar dg-export-*.json</span>
            <span className="text-xs" style={{ color: 'var(--t3)' }}>
              Gerado pelo script do console no site DuploGreen
            </span>
          </>
        )}
      </label>

      {/* Preview do arquivo detectado */}
      {meta && (
        <div className="rounded-xl px-4 py-3 flex flex-col gap-2" style={{
          background: isFullExport ? 'rgba(63,255,33,.06)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${isFullExport ? 'rgba(63,255,33,.2)' : 'rgba(255,255,255,.08)'}`,
        }}>
          <div className="flex items-center gap-2">
            {isFullExport
              ? <CheckCircle2 size={14} style={{ color: '#3FFF21' }} />
              : <AlertCircle  size={14} style={{ color: '#f59e0b' }} />
            }
            <span className="text-xs font-bold" style={{ color: isFullExport ? '#3FFF21' : '#f59e0b' }}>
              {isFullExport
                ? `Formato detectado: exportação completa DG v${meta._version ?? 1}`
                : `Formato detectado: ${meta._type ?? 'legado'}`
              }
            </span>
          </div>

          {isFullExport && meta._summary && (
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
              {[
                ['Odds 1x2',     meta._summary.individual_odds_1x2],
                ['Odds PA',      meta._summary.individual_odds_1x2_pa],
                ['Total odds',   meta._summary.total_individual_odds],
                ['Campeonatos',  meta._summary.leagues_count],
              ].filter(([,v]) => v != null).map(([label, value]) => (
                <div key={label as string} className="flex items-center gap-1.5 rounded-lg px-2 py-1"
                  style={{ background: 'rgba(255,255,255,.04)' }}>
                  <BarChart3 size={11} style={{ color: 'rgba(63,255,33,.6)' }} />
                  <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,.8)' }}>
                    {(value as number).toLocaleString('pt-BR')}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {!isFullExport && totalOdds !== null && (
            <p className="text-xs" style={{ color: 'var(--t2)' }}>
              {totalOdds.toLocaleString('pt-BR')} odds detectadas — formato compatível, mas use o script de exportação completa para melhor resultado.
            </p>
          )}

          {meta._exported_at && (
            <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
              Exportado em: {new Date(meta._exported_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      )}

      {/* Botão importar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleImport}
          disabled={status === 'loading' || !hasFile}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{
            background: status === 'loading' ? 'rgba(63,255,33,.1)' : '#3FFF21',
            color:      '#060A07',
            opacity:    (status === 'loading' || !hasFile) ? 0.5 : 1,
          }}
        >
          {status === 'loading'
            ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
            : <><Upload size={14} /> Importar</>}
        </button>

        {/* Resultado */}
        {result && status === 'success' && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold" style={{ color: '#3FFF21' }}>
              ✓ {result.inserted.toLocaleString('pt-BR')} odds importadas
            </span>
            <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
              {Object.entries(result.by_market).map(([k,v]) => `${k}: ${v}`).join(' · ')}
              {result.skipped > 0 ? ` · ${result.skipped} ignoradas` : ''}
              {result.cleaned_old > 0 ? ` · ${result.cleaned_old} antigas removidas` : ''}
            </span>
          </div>
        )}

        {result && status === 'error' && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold" style={{ color: 'var(--r)' }}>
              {result.error ?? 'Erro ao importar'}
            </span>
            {result.tip && (
              <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{result.tip}</span>
            )}
            {result.detected_type !== '?' && (
              <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
                Formato detectado: {result.detected_type}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Merge Legs Panel ──────────────────────────────────────────────────────────

function MergeLegsPanel() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleMerge() {
    if (!confirm(
      'Copiar operações (surebet, duplo green, freebet) de 01/06 a 10/06/2026\n' +
      'de michael.martins.trader@gmail.com → rmmichael20@gmail.com?\n\n' +
      'Os dados da origem NÃO serão removidos.'
    )) return;

    setStatus('loading');
    setResult(null);
    try {
      const res  = await fetch('/api/admin/merge-legs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_email: 'michael.martins.trader@gmail.com',
          to_email:   'rmmichael20@gmail.com',
          date_from:  '2026-06-01',
          date_to:    '2026-06-10',
          op_types:   ['surebet', 'duplo_green', 'freebet', 'delay', 'outros'],
        }),
      });
      const json = await res.json();
      setResult(json);
      setStatus(json.ok ? 'ok' : 'error');
    } catch (e) {
      setStatus('error');
      setResult({ error: (e as Error).message });
    }
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.25)' }}>
      <div className="font-bold mb-1" style={{ color: 'rgba(167,139,250,1)' }}>Copiar Operações Jun/2026</div>
      <p className="text-xs mb-4" style={{ color: 'var(--t2)' }}>
        Copia as legs de <strong>surebet, duplo green, freebet</strong> do período <strong>01/06 ~ 10/06/2026</strong> da conta
        {' '}<span style={{ color: 'var(--t)' }}>michael.martins.trader</span> para{' '}
        <span style={{ color: 'var(--t)' }}>rmmichael20</span>. A origem não é alterada.
      </p>

      <button
        type="button"
        onClick={handleMerge}
        disabled={status === 'loading'}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
        style={{
          background: status === 'loading' ? 'rgba(167,139,250,.15)' : 'rgba(167,139,250,1)',
          color: '#fff',
          opacity: status === 'loading' ? 0.7 : 1,
        }}
      >
        {status === 'loading' && <Loader2 size={14} className="animate-spin" />}
        {status === 'loading' ? 'Copiando...' : 'Copiar operações'}
      </button>

      {result && (
        <div className="mt-3 p-3 rounded-xl text-xs font-mono"
          style={{
            background: status === 'ok' ? 'rgba(63,255,33,.08)' : 'rgba(255,69,69,.08)',
            border: `1px solid ${status === 'ok' ? 'rgba(63,255,33,.2)' : 'rgba(255,69,69,.2)'}`,
            color: status === 'ok' ? 'var(--g)' : 'var(--r)',
          }}>
          {status === 'ok' ? (
            <>
              <div>Copiadas: <strong>{String(result.copied)}</strong> legs</div>
              {Number(result.already_existed) > 0 && <div style={{ color: 'var(--t3)' }}>Já existiam: {String(result.already_existed)}</div>}
              <div style={{ color: 'var(--t3)' }}>Periodo: {String(result.date_range)}</div>
            </>
          ) : (
            <div>{String(result.error ?? 'Erro desconhecido')}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminPage() {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoLoaded,  setDemoLoaded]  = useState(false);
  const [showReset,   setShowReset]   = useState(false);
  const [resetting,   setResetting]   = useState(false);

  const setView   = useStore(s => s.setView);
  const toastFn   = useStore(s => s.toast);
  const authEmail = useStore(s => s.authEmail);
  const isAdmin   = ADMIN_EMAILS.includes(authEmail ?? '');

  async function handleConfirmReset() {
    setResetting(true);
    try {
      wipeDB();
      await saveToSupabase({ ...EMPTY_DB, onboarding_done: false, onboarding_step: 'bookmakers' });
    } catch { /* best-effort */ }
    finally { window.location.reload(); }
  }

  function handleLoadDemo() {
    if (!confirm('Carregar dados de demonstração?')) return;
    setLoadingDemo(true);
    try { loadSeedData(); setDemoLoaded(true); setView('dash'); toastFn('Dados demo carregados!', 'ok'); }
    finally { setLoadingDemo(false); }
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
        <ResetModal onConfirm={handleConfirmReset} onCancel={() => setShowReset(false)} />
      )}

      <div className="flex flex-col gap-5 animate-fade-in max-w-2xl">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Admin</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>Controle do sistema</p>
        </div>

        {/* Dados demo */}
        {isAdmin && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(63,255,33,.04)', border: '1px solid rgba(63,255,33,.18)' }}>
            <div className="font-bold mb-1" style={{ color: 'var(--g)' }}>Dados Demo</div>
            <p className="text-xs mb-4" style={{ color: 'var(--t2)' }}>
              Carrega operações, casas de aposta, contas bancárias, clientes e parceiros fictícios para gravação de tutoriais.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={handleLoadDemo} disabled={loadingDemo}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{ background: loadingDemo ? 'rgba(63,255,33,.1)' : 'var(--g)', color: '#060A07', opacity: loadingDemo ? 0.7 : 1 }}>
                {loadingDemo ? 'Carregando...' : 'Carregar dados demo'}
              </button>
              <button type="button" onClick={handleClearDemo}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{ background: 'rgba(255,255,255,.06)', color: 'var(--t2)', border: '1px solid var(--b)' }}>
                Remover dados demo
              </button>
            </div>
          </div>
        )}

        {/* Importar Odds (JSON) */}
        {isAdmin && (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.35)' }}>
                Importar Odds (JSON)
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
                Use o script do console no DuploGreen para gerar o arquivo, depois importe aqui.
              </p>
            </div>

            {/* Exportação completa (novo) */}
            <SmartImportPanel />

            {/* Divisor */}
            <div className="flex items-center gap-2 mt-1">
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.45)' }}>
                Formatos legados
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
            </div>

            {/* Importar Odds do Dia (legado) */}
            <ImportPanel
              title="Odds do Dia"
              description="Formato individual (odds por bookmaker por evento). Atualiza bookmaker_odds."
              hint="odds.txt / odds-pa.txt / get-individual-odds.json"
              endpoint="/api/admin/odds-import"
              accentRgb="63,200,255"
              icon={<Zap size={18} />}
            />

            {/* Importar Oportunidades DG (legado) */}
            <ImportPanel
              title="Oportunidades DuploGreen"
              description="Formato opportunities/legs com dgScore e dgProfitPct. Atualiza dg_opportunities."
              hint="freebet.txt / opportunities.json — formato com legs[]"
              endpoint="/api/admin/dg-opportunities-import"
              accentRgb="167,139,250"
              icon={<Gift size={18} />}
            />
          </div>
        )}

        {/* Copiar operações Jun/2026 */}
        {isAdmin && <MergeLegsPanel />}

        {/* Zona de perigo */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--rd)', border: '1px solid rgba(255,69,69,.25)' }}>
          <div className="font-bold mb-1" style={{ color: 'var(--r)' }}>Zona de Perigo</div>
          <p className="text-xs mb-4" style={{ color: 'var(--t2)' }}>
            Apaga todos os dados — operações, casas, saldos, planilha vinculada, clientes e configurações. Tanto no dispositivo quanto na nuvem. Irreversível.
          </p>
          <Button variant="danger" onClick={() => setShowReset(true)} disabled={resetting}>
            {resetting ? 'Apagando...' : 'Resetar todos os dados'}
          </Button>
        </div>
      </div>
    </>
  );
}
