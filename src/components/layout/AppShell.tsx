'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PanelLeftOpen, Radio, X, TrendingUp } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Sidebar, MobileDrawer } from './Sidebar';
import { Topbar }          from './Topbar';
import { ToastStack }      from '@/components/ui/Toast';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { ImportPreview }   from '@/components/import/ImportPreview';
import { DashboardPage }   from '@/components/dashboard/DashboardPage';
import { OperationsPage }  from '@/components/operations/OperationsPage';
import { BookmakersPage }  from '@/components/bookmakers/BookmakersPage';
import { CaixaPage }       from '@/components/caixa/CaixaPage';
import { GastosPage }      from '@/components/gastos/GastosPage';
import { ContasPage }      from '@/components/contas/ContasPage';
import { AnalisePage }       from '@/components/analise/AnalisePage';
import { CalculadoraPage }   from '@/components/calculadora/CalculadoraPage';
import { BuscarOddsPage }   from '@/components/odds/BuscarOddsPage';
import { AdminPage }         from '@/components/admin/AdminPage';
import { PerfilPage }      from '@/components/perfil/PerfilPage';
import { NotasPage }           from '@/components/notas/NotasPage';
import { FreebetConverterPage } from '@/components/freebet/FreebetConverterPage';
import { ScannerPage, SCANNER_NOTIF_KEY } from '@/components/scanner/ScannerPage';
import { ResumoPage }      from '@/components/resumo/ResumoPage';
import { MetasPage }       from '@/components/metas/MetasPage';
import { OperadoresPage }  from '@/components/operadores/OperadoresPage';
import { LandingPage }     from '@/components/landing/LandingPage';
import { PageErrorBoundary } from '@/components/ui/PageErrorBoundary';
import { syncFromSheet }   from '@/lib/import/sheetsSync';
import { commitRows }      from '@/lib/import/importEngine';
import { getMySubscription, isSubscriptionActive } from '@/lib/supabase/subscription';
import { getSupabaseClient } from '@/lib/supabase/client';

// ── Scanner Global Notification Banner ────────────────────────────────────────
interface ScanSignal { id: string; jogo: string | null; profit_margin: number; }

const BANNER_CSS = `
@keyframes bannerIn {
  from { opacity: 0; transform: translateY(-18px) scale(.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes bannerOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(-14px) scale(.96); }
}
@keyframes bannerPulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(61,255,143,.25); }
  50%      { box-shadow: 0 0 0 8px rgba(61,255,143,0); }
}
`;
let bannerCssInjected = false;

function ScannerNotifBanner() {
  const view    = useStore(s => s.view);
  const setView = useStore(s => s.setView);

  const [visible,  setVisible]  = useState(false);
  const [leaving,  setLeaving]  = useState(false);
  const [signals,  setSignals]  = useState<ScanSignal[]>([]);
  const [enabled,  setEnabled]  = useState(false);

  // Snapshot of signal IDs from the previous poll — used to detect genuinely
  // new signals without relying on the ephemeral is_new flag (which clears
  // after 60 s and is skipped when the user is on the scanner view).
  const prevSnapshot  = useRef<Set<string>>(new Set());
  const isFirstPoll   = useRef(true);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inject CSS once
  useEffect(() => {
    if (!bannerCssInjected && typeof document !== 'undefined') {
      const s = document.createElement('style');
      s.textContent = BANNER_CSS;
      document.head.appendChild(s);
      bannerCssInjected = true;
    }
  }, []);

  // Read preference from localStorage (reactive to storage events from ScannerPage toggle)
  useEffect(() => {
    function readPref() {
      try { setEnabled(localStorage.getItem(SCANNER_NOTIF_KEY) === '1'); } catch {}
    }
    readPref();
    window.addEventListener('storage', readPref);
    // Also poll the key every 2s in case it was set in the same tab (storage event
    // only fires for cross-tab changes)
    const id = setInterval(readPref, 2000);
    return () => { window.removeEventListener('storage', readPref); clearInterval(id); };
  }, []);

  // Dismiss helper
  const dismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setTimeout(() => { setVisible(false); setLeaving(false); setSignals([]); }, 260);
  }, [leaving]);

  // Poll for new signals — snapshot comparison, independent of is_new flag.
  //
  // Why NOT use onlyNew=true:
  //   The is_new flag is cleared after 60 s by the daemon. If the user was on
  //   the scanner view for >60 s before switching tabs, those signals are no
  //   longer is_new=true and would never trigger the banner.
  //
  // Instead we fetch ALL profitable future signals, compare against the
  // previous snapshot, and alert on genuinely new IDs — identical strategy
  // to the daemon's _prevSignalIds / _firstScannerCycle fix.
  useEffect(() => {
    if (!enabled) return;

    async function poll() {
      try {
        const res = await fetch('/api/sure/scanner?profitMin=0&limit=200');
        if (!res.ok) return;
        const json = await res.json() as { ok: boolean; signals: ScanSignal[] };
        if (!json.ok) return;

        const incoming = json.signals;
        const currentIds = new Set(incoming.map(s => s.id));

        if (isFirstPoll.current) {
          // Seed snapshot without alerting — we don't know which signals are
          // truly "new" vs already visible to the user.
          prevSnapshot.current = currentIds;
          isFirstPoll.current  = false;
          return;
        }

        // Genuinely new: present in current snapshot but absent from previous
        const fresh = incoming.filter(s => !prevSnapshot.current.has(s.id));
        prevSnapshot.current = currentIds;

        // Always update snapshot (even on scanner view) so we don't
        // retroactively show signals the user already saw there.
        if (fresh.length === 0) return;

        // Don't show banner while user is already watching scanner
        if (useStore.getState().view === 'scanner') return;

        setSignals(fresh);
        setLeaving(false);
        setVisible(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(dismiss, 8000);
      } catch { /* silent */ }
    }

    poll(); // immediate first check
    const id = setInterval(poll, 12_000);
    return () => { clearInterval(id); if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Hide automatically when user navigates to scanner
  useEffect(() => {
    if (view === 'scanner' && visible) dismiss();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (!visible || signals.length === 0) return null;

  const preview = signals.slice(0, 3).map(s => s.jogo ?? 'Evento').join(' · ');
  const extra   = signals.length > 3 ? ` +${signals.length - 3}` : '';

  return (
    <div
      style={{
        position:    'fixed',
        top:         16,
        left:        '50%',
        transform:   'translateX(-50%)',
        zIndex:      10000,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents:  'auto',
          display:        'flex',
          alignItems:     'center',
          gap:            10,
          padding:        '11px 14px',
          borderRadius:   12,
          background:     'rgba(8, 22, 12, 0.92)',
          border:         '1px solid rgba(61,255,143,.35)',
          backdropFilter: 'blur(18px)',
          boxShadow:      '0 8px 32px rgba(0,0,0,.55)',
          maxWidth:       420,
          cursor:         'pointer',
          animation:      leaving
            ? 'bannerOut .26s ease-out forwards'
            : 'bannerIn .3s cubic-bezier(.2,.8,.4,1) both, bannerPulse 1.8s ease-in-out 0.3s 2',
        }}
        onClick={() => { setView('scanner'); dismiss(); }}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setView('scanner'); dismiss(); } }}
      >
        {/* Icon */}
        <span style={{
          flexShrink: 0,
          width: 30, height: 30,
          borderRadius: 8,
          background: 'rgba(61,255,143,.12)',
          border: '1px solid rgba(61,255,143,.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#3DFF8F',
        }}>
          <TrendingUp size={14} />
        </span>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3DFF8F', letterSpacing: '.02em' }}>
            {signals.length === 1
              ? '1 nova oportunidade detectada'
              : `${signals.length} novas oportunidades detectadas`}
          </div>
          <div style={{
            fontSize: 11, color: 'rgba(148,163,184,.75)',
            marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {preview}{extra}
          </div>
        </div>

        {/* Scanner label */}
        <span style={{
          flexShrink: 0,
          fontSize: 10, fontWeight: 600,
          padding: '3px 8px',
          borderRadius: 6,
          background: 'rgba(61,255,143,.1)',
          border: '1px solid rgba(61,255,143,.2)',
          color: '#3DFF8F',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Radio size={9} />
          Ver
        </span>

        {/* Close */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); dismiss(); }}
          aria-label="Fechar"
          style={{
            flexShrink: 0,
            width: 24, height: 24,
            borderRadius: 6, border: 'none',
            background: 'transparent',
            color: 'rgba(148,163,184,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'color .12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#F1F5F9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,.55)'; }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const view           = useStore(s => s.view);
  const initialized    = useStore(s => s.initialized);
  const onboardingDone = useStore(s => s.onboarding_done);
  const importBuffer   = useStore(s => s.importBuffer);
  const sheetSync      = useStore(s => s.sheetSync);
  const legs                = useStore(s => s.legs);
  const excludedImportKeys  = useStore(s => s.excludedImportKeys);
  const commitImport        = useStore(s => s.commitImport);
  const setSyncing          = useStore(s => s.setSyncing);
  const toastFn             = useStore(s => s.toast);

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
          className="hidden md:flex fixed left-0 top-1/2 -translate-y-1/2 z-30 flex-col items-center justify-center gap-1"
          style={{
            width: 18,
            height: 56,
            background: 'var(--bg2)',
            border: '1px solid var(--b)',
            borderLeft: 'none',
            borderRadius: '0 8px 8px 0',
            color: 'var(--t3)',
            cursor: 'pointer',
            transition: 'color 150ms, background 150ms',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--g)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(63,255,33,.06)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--t3)';
            (e.currentTarget as HTMLElement).style.background = 'var(--bg2)';
          }}
        >
          <PanelLeftOpen size={11} />
        </button>
      )}

      {/* Mobile drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(v => !v)} />

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
            {view === 'notas'      && <NotasPage />}
            {view === 'freebet'    && <FreebetConverterPage />}
            {view === 'resumo'     && <ResumoPage />}
            {view === 'metas'      && <MetasPage />}
            {view === 'operadores' && <OperadoresPage />}
            {view === 'scanner'    && <ScannerPage />}
            {view === 'admin'      && <AdminPage />}
            {view === 'perfil'  && <PerfilPage />}
          </PageErrorBoundary>
        </main>
      </div>

      {/* Overlays — only after store is hydrated from localStorage */}
      {initialized && !onboardingDone && <OnboardingModal />}
      {importBuffer    && <ImportPreview />}
      <ToastStack />
      <ScannerNotifBanner />
    </div>
  );
}
