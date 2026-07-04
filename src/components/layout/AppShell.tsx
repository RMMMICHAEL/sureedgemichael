'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { PanelLeftOpen, WrenchIcon, RotateCcw, Move, Minimize2, Maximize2, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Sidebar, MobileDrawer } from './Sidebar';
import { Topbar }          from './Topbar';
import { ToastStack }      from '@/components/ui/Toast';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { ImportPreview }   from '@/components/import/ImportPreview';
import { SurebetCalc }     from '@/components/calcalendario/SurebetCalc';

// ── Document Picture-in-Picture API types ─────────────────────────────────────
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
      window: Window | null;
    };
  }
}
import { DashboardPage }   from '@/components/dashboard/DashboardPage';
import { OperationsPage }  from '@/components/operations/OperationsPage';
import { BookmakersPage }  from '@/components/bookmakers/BookmakersPage';
import { CaixaPage }       from '@/components/caixa/CaixaPage';
import { GastosPage }      from '@/components/gastos/GastosPage';
import { ContasPage }      from '@/components/contas/ContasPage';
import { AnalisePage }       from '@/components/analise/AnalisePage';
import { CalculadoraPage }   from '@/components/calculadora/CalculadoraPage';
import { AdminPage }          from '@/components/admin/AdminPage';
import { PerfilPage }         from '@/components/perfil/PerfilPage';
import { NotasPage }          from '@/components/notas/NotasPage';
import { BuscarOddsPage }         from '@/components/odds/BuscarOddsPage';
import { FreebetConverterPage }   from '@/components/freebet/FreebetConverterPage';
import { SinaisSurebetPage }      from '@/components/sinais/SinaisSurebetPage';

function ComingSoonPage({ title }: { title: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      padding: 40, textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'rgba(63,255,33,.07)',
        border: '1px solid rgba(63,255,33,.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <WrenchIcon size={24} style={{ color: 'var(--g)' }} />
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 320, lineHeight: 1.6 }}>
          Esta funcionalidade está temporariamente indisponível.<br />
          Em breve estará de volta com melhorias.
        </div>
      </div>
    </div>
  );
}

// SCANNER_NOTIF_KEY mantido para evitar erros em outros componentes
const SCANNER_NOTIF_KEY = 'scanner_notif_enabled';

const TRADER_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'michael.martins.trader@gmail.com';

function MaintenanceBanner() {
  const authEmail = useStore(s => s.authEmail);
  const [status, setStatus]     = useState<'ok' | 'maintenance'>('ok');
  const [retrying, setRetrying] = useState(false);
  const [visible, setVisible]   = useState(false);

  const poll = useCallback(async () => {
    try {
      const res  = await fetch('/api/sure/proxy-status');
      const json = await res.json();
      const next = json.status === 'maintenance' ? 'maintenance' : 'ok';
      setStatus(next);
      setVisible(next === 'maintenance');
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    if (authEmail !== TRADER_EMAIL) return;
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [authEmail, poll]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetch('/api/sure/proxy-status', { method: 'POST' });
      // Aguarda 3s e verifica se voltou
      await new Promise(r => setTimeout(r, 3000));
      await poll();
    } finally {
      setRetrying(false);
    }
  }

  if (authEmail !== TRADER_EMAIL || !visible) return null;

  return (
    <div
      role="alert"
      style={{
        background:   'rgba(251,191,36,.07)',
        borderBottom: '1px solid rgba(251,191,36,.18)',
        padding:      '9px 20px',
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        flexShrink:   0,
      }}
    >
      <WrenchIcon size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#fcd34d', fontWeight: 600, flex: 1, lineHeight: 1.4 }}>
        Perdão, essa sessão está em manutenção no momento. As odds serão retomadas em breve.
      </span>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          padding:      '5px 12px',
          borderRadius: 8,
          border:       '1px solid rgba(251,191,36,.35)',
          background:   'rgba(251,191,36,.1)',
          color:        '#fbbf24',
          fontSize:     11,
          fontWeight:   700,
          cursor:       retrying ? 'wait' : 'pointer',
          whiteSpace:   'nowrap',
          opacity:      retrying ? 0.6 : 1,
          transition:   'opacity 150ms, background 150ms',
        }}
        onMouseEnter={e => { if (!retrying) (e.currentTarget as HTMLElement).style.background = 'rgba(251,191,36,.18)'; }}
        onMouseLeave={e => { if (!retrying) (e.currentTarget as HTMLElement).style.background = 'rgba(251,191,36,.1)'; }}
      >
        <RotateCcw size={11} className={retrying ? 'animate-spin' : ''} />
        {retrying ? 'Tentando...' : 'Tentar de novo'}
      </button>
    </div>
  );
}
import { ResumoPage }      from '@/components/resumo/ResumoPage';
import { MetasPage }       from '@/components/metas/MetasPage';
import { OperadoresPage }  from '@/components/operadores/OperadoresPage';
import { LandingPage }     from '@/components/landing/LandingPage';
import { PageErrorBoundary } from '@/components/ui/PageErrorBoundary';
import { syncFromSheet }   from '@/lib/import/sheetsSync';
import { commitRows }      from '@/lib/import/importEngine';
import { getMySubscription, isSubscriptionActive } from '@/lib/supabase/subscription';
import { getSupabaseClient } from '@/lib/supabase/client';


// ── Calculadora flutuante global ──────────────────────────────────────────────

function GlobalPipCalc() {
  const setPipCalcOpen = useStore(s => s.setPipCalcOpen);

  // useOverlay = true when Document PiP is not supported or user dismissed the prompt
  const [useOverlay, setUseOverlay] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const pipRootRef   = useRef<Root | null>(null);

  // Overlay-only state (fallback for non-Chrome browsers)
  const [pos, setPos]       = useState<{ x: number; y: number }>({ x: 60, y: 72 });
  const [minimized, setMin] = useState(false);
  const dragOrigin          = useRef<{ ox: number; oy: number } | null>(null);

  useEffect(() => {
    // ── Try native Document PiP (Chrome 116+) ────────────────────────────────
    if (!window.documentPictureInPicture) {
      setUseOverlay(true);
      setPos({ x: Math.max(16, window.innerWidth - 440), y: 72 });
      return;
    }

    window.documentPictureInPicture
      .requestWindow({ width: 440, height: 620 })
      .then(pip => {
        pipWindowRef.current = pip;

        // Copy all styles from the main document
        document.querySelectorAll('style').forEach(el => {
          const s = pip.document.createElement('style');
          s.textContent = el.textContent ?? '';
          pip.document.head.appendChild(s);
        });
        document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
          pip.document.head.appendChild(el.cloneNode(false));
        });

        // Base body styles (dark bg + CSS var defaults)
        const bodyStyle = pip.document.createElement('style');
        bodyStyle.textContent = `
          *, *::before, *::after { box-sizing: border-box; }
          body { margin: 0; padding: 8px; background: #030507; color: #F0F4F8;
                 font-family: ui-sans-serif, system-ui, sans-serif; font-size: 14px; }
          ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(63,255,33,.25); border-radius: 4px; }
        `;
        pip.document.head.appendChild(bodyStyle);

        // Mount React into PiP window (same JS context = same Zustand store)
        const container = pip.document.createElement('div');
        pip.document.body.appendChild(container);
        const root = createRoot(container);
        pipRootRef.current = root;
        root.render(<SurebetCalc />);

        // When the native PiP window is closed by the user
        pip.addEventListener('pagehide', () => {
          pipRootRef.current?.unmount();
          pipRootRef.current = null;
          pipWindowRef.current = null;
          setPipCalcOpen(false);
        });
      })
      .catch(() => {
        // User dismissed the PiP prompt → fall back to in-page overlay
        setUseOverlay(true);
        setPos({ x: Math.max(16, window.innerWidth - 440), y: 72 });
      });

    return () => {
      pipRootRef.current?.unmount();
      pipRootRef.current = null;
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.close();
        pipWindowRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Overlay drag (fallback only) ─────────────────────────────────────────────
  function onHeaderMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragOrigin.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    function onMove(ev: MouseEvent) {
      if (!dragOrigin.current) return;
      setPos({
        x: Math.max(0, Math.min(ev.clientX - dragOrigin.current.ox, window.innerWidth - 300)),
        y: Math.max(0, Math.min(ev.clientY - dragOrigin.current.oy, window.innerHeight - 48)),
      });
    }
    function onUp() {
      dragOrigin.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Document PiP opened (or still opening) — nothing to render in main DOM
  if (!useOverlay) return null;

  // ── Fallback overlay (Firefox / Safari / old Chrome) ────────────────────────
  return createPortal(
    <div style={{
      position: 'fixed', zIndex: 9999, left: pos.x, top: pos.y,
      width: 420, minWidth: 300, maxWidth: '90vw',
      minHeight: minimized ? 0 : 240, maxHeight: 'calc(100vh - 100px)',
      background: '#0D1117', border: '1px solid rgba(63,255,33,.35)',
      borderRadius: 18, boxShadow: '0 16px 56px rgba(0,0,0,.85), 0 0 28px rgba(63,255,33,.07)',
      display: 'flex', flexDirection: 'column',
      overflow: minimized ? 'visible' : 'hidden',
      resize: minimized ? 'none' : 'both',
    }}>
      <div onMouseDown={onHeaderMouseDown} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: 'rgba(63,255,33,.07)',
        borderRadius: minimized ? 18 : '18px 18px 0 0',
        borderBottom: minimized ? 'none' : '1px solid rgba(255,255,255,.06)',
        cursor: 'grab', userSelect: 'none', flexShrink: 0,
      }}>
        <Move size={13} style={{ color: 'rgba(63,255,33,.45)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(63,255,33,.75)' }}>
          Calculadora
        </span>
        <button type="button" onClick={() => setMin(m => !m)} title={minimized ? 'Expandir' : 'Minimizar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.45)', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
          {minimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
        </button>
        <button type="button" onClick={() => setPipCalcOpen(false)} title="Fechar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,.7)', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
          <X size={13} />
        </button>
      </div>
      {!minimized && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <SurebetCalc />
        </div>
      )}
    </div>,
    document.body,
  );
}

export function AppShell() {
  const view           = useStore(s => s.view);
  const initialized    = useStore(s => s.initialized);
  const onboardingDone = useStore(s => s.onboarding_done);
  const importBuffer   = useStore(s => s.importBuffer);
  const pipCalcOpen    = useStore(s => s.pipCalcOpen);
  const sheetSync      = useStore(s => s.sheetSync);
  const legs                = useStore(s => s.legs);
  const excludedImportKeys  = useStore(s => s.excludedImportKeys);
  const commitImport        = useStore(s => s.commitImport);
  const setSyncing          = useStore(s => s.setSyncing);
  const toastFn             = useStore(s => s.toast);
  const setPipCalcOpen      = useStore(s => s.setPipCalcOpen);

  // Fecha a calculadora quando o browser restaura a página do BFCache
  // (usuário clicou num link externo e voltou com o botão Voltar)
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setPipCalcOpen(false);
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [setPipCalcOpen]);

  const [mobileOpen,       setMobileOpen]       = useState(false);
  const [subChecked,       setSubChecked]       = useState(false);
  const [subActive,        setSubActive]        = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sb-collapsed') === '1'; } catch { return false; }
  });
  // null = checking, false = not logged in, true = logged in
  const [hasSession,    setHasSession]    = useState<boolean | null>(null);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem('sb-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  // ── Subscription gate ─────────────────────────────────────────────────────
  // Flow: no session → LandingPage (public sales)
  //       session + !active → /pricing (renewal page)
  //       session + active  → app
  useEffect(() => {
    const sb = getSupabaseClient();

    // Handle expired / revoked refresh tokens gracefully: if getSession()
    // tries to refresh and the token is not found, clear the stale session
    // from local storage so the user lands on the login page instead of a
    // broken/frozen screen.
    async function checkSession() {
      try {
        const { data: { session }, error } = await sb.auth.getSession();

        // If there's an auth error (e.g. refresh_token_not_found), sign out
        // locally so the stale tokens are cleared.
        if (error) {
          await sb.auth.signOut({ scope: 'local' });
          setHasSession(false);
          setSubChecked(true);
          return;
        }

        const loggedIn = !!session;
        setHasSession(loggedIn);
        if (!loggedIn) {
          setSubChecked(true);
          return;
        }
        const sub = await getMySubscription();
        setSubActive(isSubscriptionActive(sub));
        setSubChecked(true);
      } catch {
        // Unexpected error — treat as not logged in
        await sb.auth.signOut({ scope: 'local' }).catch(() => {});
        setHasSession(false);
        setSubChecked(true);
      }
    }

    checkSession();

    // Listen for auth changes so a token-refresh failure (SIGNED_OUT event
    // fired by Supabase SDK after a failed refresh) is handled live.
    const { data: { subscription: authSub } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        setHasSession(false);
        setSubActive(false);
        setSubChecked(true);
      }
    });

    return () => { authSub.unsubscribe(); };
  }, []);

  // ── Auto-refresh: sync on mount + every 60 s ────────────────────────────────
  const legsRef = useRef(legs);
  const excludedKeysRef = useRef(excludedImportKeys);
  useEffect(() => { legsRef.current = legs; }, [legs]);
  useEffect(() => { excludedKeysRef.current = excludedImportKeys; }, [excludedImportKeys]);

  useEffect(() => {
    // Do NOT auto-sync during onboarding: the first full-history import is
    // handled by OnboardingModal → ImportPreview → user confirms.
    // Auto-refresh only resumes after onboarding is marked complete.
    if (!initialized || !onboardingDone || !sheetSync?.url) return;

    async function doSync() {
      if (!sheetSync) return;
      setSyncing(true);

      // First ever sync (historyImported absent/false): import FULL history so
      // the user gets all their past data. After that, currentMonthOnly keeps
      // syncs fast.
      const needsFullHistory = !sheetSync.historyImported;

      try {
        if (needsFullHistory) {
          toastFn('Baixando histórico completo da planilha…', 'info');
        }

        const result = await syncFromSheet(sheetSync, { currentMonthOnly: !needsFullHistory });

        if (needsFullHistory && result.rows.length > 0) {
          toastFn(`Processando ${result.rows.length} linhas…`, 'info');
        }

        const committed = commitRows(result.rows, {
          includeAll:          needsFullHistory,
          existingLegs:        legsRef.current,
          excludedImportKeys:  new Set(excludedKeysRef.current ?? []),
        });
        if (committed.imported > 0) {
          commitImport(committed);
          toastFn(
            needsFullHistory
              ? `Histórico importado — ${committed.imported} operação(ões)`
              : `Sincronizado — ${committed.imported} nova(s) operação(ões)`,
            'ok',
          );
        } else if (needsFullHistory) {
          toastFn('Histórico sincronizado — sem novas entradas', 'ok');
        }
        // Mark history as imported so future syncs use currentMonthOnly
        if (needsFullHistory) {
          useStore.getState().setSheetSync({ ...sheetSync, historyImported: true });
        }
      } catch {
        // Silent fail on background sync
      } finally {
        setSyncing(false);
      }
    }

    doSync();
    const id = setInterval(doSync, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, onboardingDone, sheetSync?.url]);

  // Blank screen while checking — prevents flash of full app before gate resolves
  if (!subChecked) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;
  }

  // Not logged in → public sales landing page
  if (!hasSession) {
    return (
      <>
        <LandingPage />
        <ToastStack />
      </>
    );
  }

  // Logged in but subscription expired / cancelled → renewal page
  if (!subActive) {
    if (typeof window !== 'undefined') {
      window.location.href = '/pricing';
    }
    return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Desktop sidebar — hidden when collapsed */}
      {!sidebarCollapsed && <Sidebar onCollapse={toggleSidebar} />}

      {/* Reopen tab — shown when sidebar is collapsed, desktop only */}
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Expandir menu"
          title="Expandir menu"
          className="reopen-tab hidden md:flex fixed left-0 top-1/2 -translate-y-1/2 z-30 flex-col items-center justify-center gap-1"
        >
          <PanelLeftOpen size={11} />
        </button>
      )}

      {/* Mobile drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(v => !v)} />
        <MaintenanceBanner />

        <main className="flex-1 overflow-y-auto p-3 md:p-5 dot-grid">
          <PageErrorBoundary>
            {view === 'dash'    && <DashboardPage />}
            {view === 'ops'     && <OperationsPage />}
            {view === 'bm'      && <BookmakersPage />}
            {view === 'caixa'   && <CaixaPage />}
            {view === 'gastos'  && <GastosPage />}
            {view === 'contas'  && <ContasPage />}
            {view === 'analise'   && <AnalisePage />}
            {view === 'calc'      && <CalculadoraPage />}
            {view === 'odds'      && <BuscarOddsPage />}
            {view === 'sinais'    && <SinaisSurebetPage />}

            {view === 'notas'      && <NotasPage />}
            {view === 'freebet'    && <FreebetConverterPage />}
            {view === 'resumo'     && <ResumoPage />}
            {view === 'metas'      && <MetasPage />}
            {view === 'operadores' && <OperadoresPage />}
            {view === 'admin'      && <AdminPage />}
            {view === 'perfil'  && <PerfilPage />}
          </PageErrorBoundary>
        </main>
      </div>

      {/* Overlays — only after store is hydrated from localStorage */}
      {initialized && !onboardingDone && <OnboardingModal />}
      {importBuffer    && <ImportPreview />}
      {pipCalcOpen     && <GlobalPipCalc />}
      <ToastStack />
    </div>
  );
}
