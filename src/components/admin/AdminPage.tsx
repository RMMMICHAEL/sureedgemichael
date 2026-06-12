'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { wipeDB, EMPTY_DB } from '@/lib/storage/db';
import { saveToSupabase } from '@/lib/supabase/sync';
import { loadSeedData, clearSeedData } from '@/lib/dev/seedData';
import {
  AlertTriangle, Trash2, X, Loader2, Upload, FileJson,
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

// ── Import Panel unificado DG ─────────────────────────────────────────────────

interface DGExportMeta {
  _type?:        string;
  _version?:     number | string;
  _exported_at?: string;
  opportunities?: Record<string, { opportunities?: unknown[] }> | unknown[];
  individual_odds?: Record<string, { odds?: unknown[] }> | unknown[];
  opp_both?:  { opportunities?: unknown[] };
  opp_one?:   { opportunities?: unknown[] };
  odds_1x2?:  { odds?: unknown[] };
  odds_1x2_pa?: { odds?: unknown[] };
}

interface OppRecord {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  _pa_sides?: number;
  [key: string]: unknown;
}

/** Extrai odds do arquivo, retorna payload mínimo para dg-full-import */
function extractOddsPayload(data: DGExportMeta): unknown {
  const ver = Number(data._version ?? 1);
  if (ver >= 3) {
    return { _type: 'dg_full_export', _version: 3, _exported_at: data._exported_at, odds_1x2: data.odds_1x2, odds_1x2_pa: data.odds_1x2_pa };
  }
  // v2: individual_odds é objeto { endpoint: { odds: [] } }
  if (data.individual_odds && !Array.isArray(data.individual_odds)) {
    const map = data.individual_odds as Record<string, { odds?: unknown[] }>;
    const all1x2: unknown[] = [];
    const allPa:  unknown[] = [];
    for (const [ep, val] of Object.entries(map)) {
      if (!Array.isArray(val?.odds)) continue;
      if (ep.includes('1x2_pa')) allPa.push(...val.odds);
      else                        all1x2.push(...val.odds);
    }
    return { _type: 'dg_full_export', _version: 3, _exported_at: data._exported_at, odds_1x2: { odds: all1x2 }, odds_1x2_pa: { odds: allPa } };
  }
  return data;
}

/** Extrai todas as oportunidades do arquivo com pa_sides embutido, deduplicadas */
function extractOpps(data: DGExportMeta): OppRecord[] {
  const seen = new Map<string, OppRecord>();

  function add(arr: unknown[], paSides: number) {
    for (const r of arr as OppRecord[]) {
      if (!r?.id) continue;
      const cur = seen.get(r.id);
      const curSides = cur?._pa_sides ?? 0;
      if (!cur || paSides > curSides) seen.set(r.id, { ...r, _pa_sides: paSides });
    }
  }

  const ver = Number(data._version ?? 1);
  if (ver >= 3) {
    if (Array.isArray(data.opp_both?.opportunities))   add(data.opp_both!.opportunities!, 2);
    if (Array.isArray(data.opp_one?.opportunities))    add(data.opp_one!.opportunities!,  1);
  } else if (data.opportunities && !Array.isArray(data.opportunities)) {
    // v2: chave = endpoint path
    for (const [ep, val] of Object.entries(data.opportunities as Record<string, { opportunities?: unknown[] }>)) {
      const sides = ep.includes('pa_mode=both') ? 2 : ep.includes('pa_mode=one') ? 1 : 0;
      if (Array.isArray(val?.opportunities)) add(val.opportunities, sides);
    }
  } else if (Array.isArray(data.opportunities)) {
    add(data.opportunities as unknown[], 0);
  }

  return Array.from(seen.values());
}

interface OddsResult {
  ok:           boolean;
  detected_type: string;
  inserted:     number;
  total_valid:  number;
  skipped:      number;
  cleaned_old:  number;
  by_market:    Record<string, number>;
  error?:       string;
  tip?:         string;
}

interface OppResult {
  ok:       boolean;
  total:    number;
  inserted: number;
  error?:   string;
}

function countOdds(meta: DGExportMeta): number {
  if (meta._version === 2 && meta.individual_odds && !Array.isArray(meta.individual_odds)) {
    return Object.values(meta.individual_odds as Record<string, { odds?: unknown[] }>)
      .reduce((s, v) => s + (v?.odds?.length ?? 0), 0);
  }
  if (meta.odds_1x2 || meta.odds_1x2_pa) {
    return (meta.odds_1x2?.odds?.length ?? 0) + (meta.odds_1x2_pa?.odds?.length ?? 0);
  }
  if (Array.isArray(meta.individual_odds)) return meta.individual_odds.length;
  return 0;
}

function countOpps(meta: DGExportMeta): number {
  if (meta._version === 2 && meta.opportunities && !Array.isArray(meta.opportunities)) {
    return Object.values(meta.opportunities as Record<string, { opportunities?: unknown[] }>)
      .reduce((s, v) => s + (v?.opportunities?.length ?? 0), 0);
  }
  if (meta.opp_both || meta.opp_one) {
    return (meta.opp_both?.opportunities?.length ?? 0) + (meta.opp_one?.opportunities?.length ?? 0);
  }
  if (Array.isArray(meta.opportunities)) return (meta.opportunities as unknown[]).length;
  return 0;
}

function DGImportPanel() {
  const [fileName, setFileName] = useState('');
  const [rawText,  setRawText]  = useState('');
  const [meta,     setMeta]     = useState<DGExportMeta | null>(null);
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [oddsRes,  setOddsRes]  = useState<OddsResult | null>(null);
  const [oppRes,   setOppRes]   = useState<OppResult | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus('idle');
    setOddsRes(null);
    setOppRes(null);
    setMeta(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? '';
      setRawText(text);
      try { setMeta(JSON.parse(text) as DGExportMeta); } catch { /* invalid JSON */ }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function handleImport() {
    if (!rawText.trim()) return;
    setStatus('loading');
    setOddsRes(null);
    setOppRes(null);

    let parsed: DGExportMeta;
    try { parsed = JSON.parse(rawText) as DGExportMeta; }
    catch {
      setStatus('error');
      setOddsRes({ ok: false, detected_type: '?', inserted: 0, total_valid: 0, skipped: 0, cleaned_old: 0, by_market: {}, error: 'JSON inválido — arquivo corrompido ou incompleto.' });
      return;
    }

    const jsonHeaders = { 'Content-Type': 'application/json' };

    // ── Odds: extrai subset mínimo e envia de uma vez ──────────────────────
    const oddsPayload = extractOddsPayload(parsed);
    const oddsResult  = await fetch('/api/admin/dg-full-import', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(oddsPayload),
    }).then(r => r.json() as Promise<OddsResult>)
      .catch(e => ({ ok: false, detected_type: '?', inserted: 0, total_valid: 0, skipped: 0, cleaned_old: 0, by_market: {}, error: String(e) } as OddsResult));

    // ── Oportunidades: extrai + dedup no cliente, envia em lotes de 500 ───
    const allOpps  = extractOpps(parsed);
    const BATCH    = 500;
    let oppInserted = 0;
    let oppError: string | undefined;

    for (let i = 0; i < allOpps.length; i += BATCH) {
      const batch   = allOpps.slice(i, i + BATCH);
      const append  = i > 0 ? '?append=1' : '';
      // Empacota como { opportunities: [...] } com pa_sides embutido nos registros
      // O backend lê r._pa_sides via paSidesMap se presente como campo extra,
      // porém precisamos que o backend use o campo correto.
      // Enviamos como array puro — o backend já lida com arrays.
      const res = await fetch(`/api/admin/dg-opportunities-import${append}`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify(batch),
      }).then(r => r.json() as Promise<OppResult>)
        .catch(e => ({ ok: false, total: 0, inserted: 0, error: String(e) } as OppResult));

      if (res.ok) {
        oppInserted += res.inserted;
      } else {
        oppError = res.error;
        break;
      }
    }

    const oppRes: OppResult = oppError
      ? { ok: false, total: allOpps.length, inserted: oppInserted, error: oppError }
      : { ok: true,  total: allOpps.length, inserted: oppInserted };

    setOddsRes(oddsResult);
    setOppRes(oppRes);
    setStatus(oddsResult.ok && oppRes.ok ? 'success' : 'error');
    if (oddsResult.ok && oppRes.ok) { setFileName(''); setRawText(''); setMeta(null); }
  }

  const hasFile      = !!rawText;
  const isFullExport = meta?._type === 'dg_full_export';
  const nOdds        = meta ? countOdds(meta) : 0;
  const nOpps        = meta ? countOpps(meta) : 0;

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
            Importar DuploGreen
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
            Arquivo <code style={{ color: 'rgba(255,255,255,.5)' }}>dg-export-*.json</code> gerado pelo script do console.
            Importa odds (1x2 + PA) e oportunidades de uma vez.
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
              {(rawText.length / 1024).toFixed(0)} KB · clique para trocar
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

      {/* Preview */}
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
                ? `Exportação DG v${meta._version ?? 1} detectada`
                : `Formato: ${meta._type ?? 'desconhecido'}`
              }
            </span>
          </div>

          {isFullExport && (nOdds > 0 || nOpps > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {[
                ['Odds', nOdds],
                ['Oportunidades', nOpps],
              ].filter(([, v]) => (v as number) > 0).map(([label, value]) => (
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

          {meta._exported_at && (
            <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
              Exportado em: {new Date(meta._exported_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      )}

      {/* Botão */}
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

        {/* Resultado de sucesso */}
        {status === 'success' && oddsRes && oppRes && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold" style={{ color: '#3FFF21' }}>
              ✓ {oddsRes.inserted.toLocaleString('pt-BR')} odds · {oppRes.inserted.toLocaleString('pt-BR')} oportunidades importadas
            </span>
            <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
              {Object.entries(oddsRes.by_market).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              {oddsRes.skipped > 0 ? ` · ${oddsRes.skipped} ignoradas` : ''}
              {oddsRes.cleaned_old > 0 ? ` · ${oddsRes.cleaned_old} antigas removidas` : ''}
            </span>
          </div>
        )}

        {/* Resultado de erro */}
        {status === 'error' && (
          <div className="flex flex-col gap-0.5">
            {oddsRes && !oddsRes.ok && (
              <span className="text-xs font-bold" style={{ color: 'var(--r)' }}>
                Odds: {oddsRes.error ?? 'erro desconhecido'}
              </span>
            )}
            {oppRes && !oppRes.ok && (
              <span className="text-xs font-bold" style={{ color: 'var(--r)' }}>
                Oportunidades: {oppRes.error ?? 'erro desconhecido'}
              </span>
            )}
            {oddsRes?.tip && (
              <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{oddsRes.tip}</span>
            )}
          </div>
        )}
      </div>
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
            {demoLoaded && (
              <p className="text-[11px] mt-2" style={{ color: 'var(--t3)' }}>Dados demo carregados com sucesso.</p>
            )}
          </div>
        )}

        {/* Importar DG */}
        {isAdmin && (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.35)' }}>
                Importar DuploGreen
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
                Use o script do console no site do DuploGreen para gerar o arquivo JSON, depois importe aqui.
              </p>
            </div>
            <DGImportPanel />
          </div>
        )}

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
