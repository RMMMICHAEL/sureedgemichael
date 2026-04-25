'use client';

import { useStore }       from '@/store/useStore';
import { Menu, RefreshCw, Link2, X, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { parseSheetUrl, syncFromSheet } from '@/lib/import/sheetsSync';
import { commitRows } from '@/lib/import/importEngine';

const VIEW_META: Record<string, { label: string; icon: string; desc: string }> = {
  dash:    { label: 'Dashboard',       icon: '⬡', desc: 'Visão geral do portfólio' },
  ops:     { label: 'Operações',       icon: '⚡', desc: 'Gestão de apostas' },
  bm:      { label: 'Casas de Aposta', icon: '🏠', desc: 'Saldos e status' },
  caixa:   { label: 'Caixa',          icon: '💳', desc: 'Contas bancárias' },
  gastos:  { label: 'Gastos',         icon: '📊', desc: 'Despesas e custos' },
  contas:  { label: 'Contas',         icon: '👥', desc: 'Contas parceiras' },
  analise: { label: 'Análise',        icon: '📈', desc: 'Estatísticas avançadas' },
  admin:   { label: 'Admin',          icon: '⚙', desc: 'Configurações do sistema' },
  perfil:  { label: 'Perfil',         icon: '👤', desc: 'Sua conta' },
};

interface TopbarProps {
  onMenuClick: () => void;
}

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    function update() {
      setTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    }
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, []);
  if (!time) return null;
  return (
    <span
      className="text-xs font-mono font-bold hidden lg:block"
      style={{ color: 'var(--t3)' }}
    >
      {time}
    </span>
  );
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const view               = useStore(s => s.view);
  const isOpsView          = view === 'ops';
  const sheetSync          = useStore(s => s.sheetSync);
  const setSheetSync       = useStore(s => s.setSheetSync);
  const legs               = useStore(s => s.legs);
  const excludedImportKeys = useStore(s => s.excludedImportKeys);
  const commitImport       = useStore(s => s.commitImport);
  const isSyncing          = useStore(s => s.isSyncing);
  const setSyncing         = useStore(s => s.setSyncing);
  const toastFn            = useStore(s => s.toast);

  const [showInput, setShowInput] = useState(false);
  const [urlInput,  setUrlInput]  = useState(sheetSync?.url ?? '');

  const meta = VIEW_META[view] ?? { label: view, icon: '•', desc: '' };

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
      const needsFullHistory = !sheetSync?.historyImported;
      const result = await syncFromSheet(cfg, { currentMonthOnly: !needsFullHistory });
      const commitResult = commitRows(result.rows, {
        includeAll:         needsFullHistory,
        existingLegs:       legs,
        excludedImportKeys: new Set(excludedImportKeys ?? []),
      });
      commitImport(commitResult);
      setSheetSync({ ...cfg, lastSync: new Date().toISOString(), historyImported: true });
      setShowInput(false);
      const anomalyNote = commitResult.anomalies > 0
        ? ` · ${commitResult.anomalies} com anomalias` : '';
      const importedLabel = needsFullHistory ? 'Histórico importado' : 'Sincronizado';
      toastFn(
        `${importedLabel} · ${commitResult.imported} novas · ${commitResult.dupes} já existiam${anomalyNote}`,
        commitResult.anomalies > 0 ? 'wrn' : 'ok',
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
      className="flex items-center px-4 md:px-5 gap-3 sticky top-0 z-20 flex-shrink-0"
      style={{
        height: 60,
        background: 'rgba(13,17,23,.9)',
        borderBottom: '1px solid var(--b)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          border: '1px solid var(--b)',
          color: 'var(--t2)',
          background: 'rgba(255,255,255,.04)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(63,255,33,.2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)'; }}
      >
        <Menu size={17} />
      </button>

      {/* Page title area */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <span
          className="text-base hidden sm:block"
          style={{ color: 'var(--t3)', opacity: .6 }}
        >
          {meta.icon}
        </span>
        <div className="flex flex-col leading-none min-w-0">
          <h1
            className="text-sm font-bold truncate"
            style={{ color: 'var(--t)', letterSpacing: '-0.01em' }}
          >
            {meta.label}
          </h1>
          {meta.desc && (
            <span
              className="text-[10px] font-medium hidden md:block mt-0.5"
              style={{ color: 'var(--t3)' }}
            >
              {meta.desc}
            </span>
          )}
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Live clock */}
        <LiveClock />

        {/* Sync controls — only in Operações view */}
        {isOpsView && (
          <>
            {/* Last sync label */}
            {fmtLastSync && !showInput && (
              <span
                className="hidden md:flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg"
                style={{
                  color: 'var(--t3)',
                  background: 'rgba(63,255,33,.04)',
                  border: '1px solid rgba(63,255,33,.08)',
                }}
              >
                <span className="live-dot" style={{ width: 5, height: 5, opacity: .7 }} />
                {fmtLastSync}
              </span>
            )}

            {/* URL input */}
            {showInput && (
              <div className="flex items-center gap-2 animate-fade-in">
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
                  placeholder="Cole o link do Google Sheets..."
                  autoFocus
                  aria-label="URL do Google Sheets"
                  className="px-3 py-1.5 rounded-lg text-sm w-56 md:w-72"
                  style={{
                    background: 'var(--sur)',
                    border: '1px solid var(--b2)',
                    color: 'var(--t)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveUrl}
                  disabled={isSyncing}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                  style={{
                    background: 'var(--g)',
                    color: '#060A07',
                    boxShadow: '0 0 14px rgba(63,255,33,.25)',
                    fontWeight: 800,
                  }}
                >
                  <Zap size={12} />
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInput(false)}
                  aria-label="Cancelar"
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: 'var(--t3)', background: 'rgba(255,255,255,.05)' }}
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Link button */}
            {!showInput && (
              <button
                type="button"
                onClick={() => setShowInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: sheetSync?.url ? 'rgba(63,255,33,.07)' : 'rgba(255,255,255,.04)',
                  color:      sheetSync?.url ? 'var(--g)'             : 'var(--t2)',
                  border:     `1px solid ${sheetSync?.url ? 'rgba(63,255,33,.18)' : 'var(--b)'}`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(63,255,33,.3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = sheetSync?.url ? 'rgba(63,255,33,.18)' : 'var(--b)'; }}
              >
                <Link2 size={12} />
                <span className="hidden sm:inline">
                  {sheetSync?.url ? 'Planilha' : 'Conectar'}
                </span>
              </button>
            )}

            {/* Sync now */}
            {sheetSync?.url && !showInput && (
              <button
                type="button"
                onClick={() => handleSync()}
                disabled={isSyncing}
                aria-label="Sincronizar agora"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
                style={{
                  border: '1px solid var(--b)',
                  color: isSyncing ? 'var(--g)' : 'var(--t2)',
                  background: isSyncing ? 'rgba(63,255,33,.08)' : 'rgba(255,255,255,.04)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.08)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(63,255,33,.2)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--g)';
                }}
                onMouseLeave={e => {
                  if (!isSyncing) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--t2)';
                  }
                }}
              >
                <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
