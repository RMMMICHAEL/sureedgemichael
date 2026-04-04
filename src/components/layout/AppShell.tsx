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
    if (!initialized || !sheetSync?.url) return;

    async function doSync() {
      if (!sheetSync) return;
      setSyncing(true);
      try {
        const result    = await syncFromSheet(sheetSync, { currentMonthOnly: true });
        const committed = commitRows(result.rows, {
          includeAll:   false,
          existingLegs: legsRef.current,
        });
        if (committed.imported > 0) {
          commitImport(committed);
          toastFn(`Sincronizado — ${committed.imported} nova(s) operação(ões)`, 'ok');
        }
      } catch {
        // Silent fail on background sync — only toast on manual sync
      } finally {
        setSyncing(false);
      }
    }

    doSync();
    const id = setInterval(doSync, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, sheetSync?.url]);

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
