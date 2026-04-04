'use client';

import { useStore }         from '@/store/useStore';
import { Menu, RefreshCw, Link2, X } from 'lucide-react';
import { useState }         from 'react';
import { parseSheetUrl, syncFromSheet } from '@/lib/import/sheetsSync';
import { commitRows } from '@/lib/import/importEngine';

const VIEW_TITLES: Record<string, string> = {
  dash:    'Dashboard',
  ops:     'Operações',
  bm:      'Casas de Aposta',
  caixa:   'Caixa',
  gastos:  'Gastos',
  contas:  'Contas',
  analise: 'Análise',
  admin:   'Admin',
};

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const view          = useStore(s => s.view);
  const isOpsView     = view === 'ops';
  const sheetSync     = useStore(s => s.sheetSync);
  const setSheetSync  = useStore(s => s.setSheetSync);
  const legs          = useStore(s => s.legs);
  const commitImport  = useStore(s => s.commitImport);
  const isSyncing     = useStore(s => s.isSyncing);
  const setSyncing    = useStore(s => s.setSyncing);
  const toastFn       = useStore(s => s.toast);

  const [showInput, setShowInput] = useState(false);
  const [urlInput,  setUrlInput]  = useState(sheetSync?.url ?? '');

  async function handleSync(url?: string) {
    const targetUrl = url ?? sheetSync?.url;
    if (!targetUrl) { setShowInput(true); return; }

    const parsed = parseSheetUrl(targetUrl);
    if (!parsed) {
      toastFn('URL inválida. Cole o link do Google Sheets.', 'err');
      return;
    }

    const cfg = {
      url: targetUrl,
      sheetId: parsed.sheetId,
      gid: parsed.gid,
      lastSync: '',
      autoSync: sheetSync?.autoSync ?? false,
      intervalMin: sheetSync?.intervalMin ?? 0,
    };

    setSyncing(true);
    try {
      // If there are no legs yet (fresh / wiped), import the full history.
      // Otherwise only fetch the current month for speed (< 3s).
      const currentMonthOnly = legs.length > 0;
      const result = await syncFromSheet(cfg, { currentMonthOnly });
      const commitResult = commitRows(result.rows, { includeAll: true, existingLegs: legs });
      commitImport(commitResult);
      setSheetSync({ ...cfg, lastSync: new Date().toISOString() });
      setShowInput(false);
      const anomalyNote = commitResult.anomalies > 0
        ? ` · ${commitResult.anomalies} com anomalias (revise em Análise)` : '';
      toastFn(
        `${commitResult.imported} novas operações · ${commitResult.dupes} já existiam${anomalyNote}`,
        commitResult.anomalies > 0 ? 'wrn' : 'ok'
      );
    } catch (err: unknown) {
      toastFn((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  }

  function handleSaveUrl() {
    if (!urlInput.trim()) return;
    handleSync(urlInput.trim());
  }

  const fmtLastSync = sheetSync?.lastSync
    ? new Date(sheetSync.lastSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <header
      className="h-14 flex items-center px-4 md:px-6 gap-3 sticky top-0 z-20 flex-shrink-0"
      style={{
        background: 'rgba(6,10,7,.85)',
        borderBottom: '1px solid var(--b)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ border: '1px solid var(--b)', color: 'var(--t2)' }}
      >
        <Menu size={18} />
      </button>

      {/* Title */}
      <h1 className="text-sm md:text-base font-bold tracking-tight flex-1 truncate" style={{ color: 'var(--t)' }}>
        {VIEW_TITLES[view] ?? view}
      </h1>

      {/* Sync controls — only shown in Operações view */}
      <div className="flex items-center gap-2">
      {!isOpsView ? null : (<>
        {/* Last sync label — desktop only */}
        {fmtLastSync && !showInput && (
          <span
            className="text-[11px] font-mono hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md"
            style={{ color: 'var(--t3)', background: 'var(--gd)', border: '1px solid var(--b)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--g)', opacity: 0.6 }} />
            {fmtLastSync}
          </span>
        )}

        {/* URL input (expanded when showInput) */}
        {showInput && (
          <div className="flex items-center gap-2 animate-fade-in">
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
              placeholder="Cole o link do Google Sheets..."
              autoFocus
              className="px-3 py-1.5 rounded-lg text-sm w-64 md:w-80 transition-colors"
              style={{
                background: 'var(--sur)',
                border: '1px solid var(--b2)',
                color: 'var(--t)',
              }}
            />
            <button
              onClick={handleSaveUrl}
              disabled={isSyncing}
              className="px-3.5 py-1.5 rounded-lg text-sm font-bold transition-all"
              style={{
                background: 'var(--g)',
                color: 'var(--bg)',
                boxShadow: '0 0 12px rgba(0,255,136,.2)',
              }}
            >
              {isSyncing ? '...' : 'Sincronizar'}
            </button>
            <button
              onClick={() => setShowInput(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--t3)' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Link button — shows/hides URL input */}
        {!showInput && (
          <button
            onClick={() => setShowInput(true)}
            title="Configurar link da planilha"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{
              background: sheetSync?.url ? 'var(--gd)' : 'var(--sur)',
              color:      sheetSync?.url ? 'var(--g)'  : 'var(--t2)',
              border:     `1px solid ${sheetSync?.url ? 'var(--gb)' : 'var(--b)'}`,
            }}
          >
            <Link2 size={13} />
            <span className="hidden sm:inline">
              {sheetSync?.url ? 'Planilha' : 'Conectar'}
            </span>
          </button>
        )}

        {/* Sync now button */}
        {sheetSync?.url && !showInput && (
          <button
            onClick={() => handleSync()}
            disabled={isSyncing}
            title="Sincronizar agora"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ border: '1px solid var(--b)', color: 'var(--g)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--gd)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--gb)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)'; }}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          </button>
        )}
      </>)}
      </div>
    </header>
  );
}
