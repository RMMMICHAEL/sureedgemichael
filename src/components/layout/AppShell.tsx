'use client';

import { useState, useEffect, useRef } from 'react';
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
import { AnalisePage }     from '@/components/analise/AnalisePage';
import { AdminPage }       from '@/components/admin/AdminPage';
import { syncFromSheet }   from '@/lib/import/sheetsSync';
import { commitRows }      from '@/lib/import/importEngine';

export function AppShell() {
  const view           = useStore(s => s.view);
  const initialized    = useStore(s => s.initialized);
  const onboardingDone = useStore(s => s.onboarding_done);
  const importBuffer   = useStore(s => s.importBuffer);
  const sheetSync      = useStore(s => s.sheetSync);
  const legs           = useStore(s => s.legs);
  const commitImport   = useStore(s => s.commitImport);
  const setSyncing     = useStore(s => s.setSyncing);
  const toastFn        = useStore(s => s.toast);

  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Auto-refresh: sync on mount + every 60 s ────────────────────────────────
  const legsRef = useRef(legs);
  useEffect(() => { legsRef.current = legs; }, [legs]);

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
        const result    = await syncFromSheet(sheetSync, { currentMonthOnly: !needsFullHistory });
        const committed = commitRows(result.rows, {
          includeAll:   needsFullHistory, // include anomalies on full history import
          existingLegs: legsRef.current,
        });
        if (committed.imported > 0) {
          commitImport(committed);
          toastFn(
            needsFullHistory
              ? `Histórico importado — ${committed.imported} operação(ões)`
              : `Sincronizado — ${committed.imported} nova(s) operação(ões)`,
            'ok',
          );
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

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(v => !v)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {view === 'dash'    && <DashboardPage />}
          {view === 'ops'     && <OperationsPage />}
          {view === 'bm'      && <BookmakersPage />}
          {view === 'caixa'   && <CaixaPage />}
          {view === 'gastos'  && <GastosPage />}
          {view === 'contas'  && <ContasPage />}
          {view === 'analise' && <AnalisePage />}
          {view === 'admin'   && <AdminPage />}
        </main>
      </div>

      {/* Overlays — only after store is hydrated from localStorage */}
      {initialized && !onboardingDone && <OnboardingModal />}
      {importBuffer    && <ImportPreview />}
      <ToastStack />
    </div>
  );
}
