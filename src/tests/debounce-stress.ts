/**
 * Teste de estresse do debounce — validação de confiabilidade e carga
 *
 * Roda sem dependências externas (sem Supabase, sem Next.js).
 * Testa a lógica do debounce do useOdds em isolamento.
 *
 * Executar:
 *   npx tsx src/tests/debounce-stress.ts
 *
 * No browser console (colar tudo):
 *   window.__sureedge_stress().then(console.table)
 */

interface SyncEvent {
  pluginId:    string;
  rowsWritten: number;
  syncedAt:    number;
  batchId:     string;
}

interface TestResult {
  name:         string;
  passed:       boolean;
  refetches:    number;
  expected:     number;
  eventsEmitted: number;
  durationMs:   number;
  notes:        string;
}

const DEBOUNCE_MS = 2500; // deve coincidir com src/hooks/useOdds.ts

// ─── Motor de debounce idêntico ao useOdds ────────────────────────────────────
function makeDebounceEngine(onRefetch: (batch: SyncEvent[]) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: SyncEvent[] = [];

  function schedule(event: SyncEvent) {
    pending.push(event);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = [...pending];
      pending     = [];
      timer       = null;
      onRefetch(batch);
    }, DEBOUNCE_MS);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending.length > 0) {
      onRefetch([...pending]);
      pending = [];
    }
  }

  return { schedule, flush };
}

async function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

// ─── Teste 1: 4186 eventos rápidos → 1 único refetch ─────────────────────────
async function test1(): Promise<TestResult> {
  const EVENTS   = 4186;
  const BATCHES  = Math.ceil(EVENTS / 100);
  let refetches  = 0;
  let lastBatch: SyncEvent[] = [];

  const { schedule } = makeDebounceEngine(batch => {
    refetches++;
    lastBatch = batch;
  });

  const start = Date.now();

  for (let i = 0; i < BATCHES; i++) {
    const rows = Math.min(100, EVENTS - i * 100);
    schedule({
      pluginId:    i % 2 === 0 ? 'odds-1x2' : 'odds-pa',
      rowsWritten: rows,
      syncedAt:    Date.now(),
      batchId:     `t1-b${i}`,
    });
    // Simula latência realista entre batches (5-15ms)
    await sleep(5 + Math.floor(Math.random() * 10));
  }

  await sleep(DEBOUNCE_MS + 300); // aguarda debounce finalizar

  const totalRows = lastBatch.reduce((s, e) => s + e.rowsWritten, 0);
  return {
    name:          `${EVENTS} eventos / ${BATCHES} batches rápidos`,
    passed:        refetches === 1,
    refetches,
    expected:      1,
    eventsEmitted: BATCHES,
    durationMs:    Date.now() - start,
    notes:         `${lastBatch.length} eventos agrupados → ${totalRows} linhas`,
  };
}

// ─── Teste 2: dois grupos separados por gap > DEBOUNCE → 2 refetches ─────────
async function test2(): Promise<TestResult> {
  let refetches = 0;
  const { schedule } = makeDebounceEngine(() => { refetches++; });

  const start = Date.now();

  // Grupo A: 10 batches
  for (let i = 0; i < 10; i++) {
    schedule({ pluginId: 'odds-1x2', rowsWritten: 100, syncedAt: Date.now(), batchId: `t2-A${i}` });
    await sleep(20);
  }

  // Gap de DEBOUNCE_MS + 100ms — debounce finaliza aqui
  await sleep(DEBOUNCE_MS + 100);

  // Grupo B: 10 batches
  for (let i = 0; i < 10; i++) {
    schedule({ pluginId: 'odds-pa', rowsWritten: 100, syncedAt: Date.now(), batchId: `t2-B${i}` });
    await sleep(20);
  }

  await sleep(DEBOUNCE_MS + 100);

  return {
    name:          '2 grupos com gap > debounce',
    passed:        refetches === 2,
    refetches,
    expected:      2,
    eventsEmitted: 20,
    durationMs:    Date.now() - start,
    notes:         'Grupo A e Grupo B devem gerar refetches independentes',
  };
}

// ─── Teste 3: plugins intercalados em paralelo → 1 refetch ───────────────────
async function test3(): Promise<TestResult> {
  let refetches = 0;
  let coalesced = 0;
  const { schedule } = makeDebounceEngine(batch => {
    refetches++;
    coalesced = batch.length;
  });

  const start  = Date.now();
  const CYCLES = 18; // 18 × 2 plugins = 36 eventos (um sync completo típico)

  for (let i = 0; i < CYCLES; i++) {
    schedule({ pluginId: 'odds-1x2', rowsWritten: 100, syncedAt: Date.now(), batchId: `t3-1x2-${i}` });
    await sleep(3);
    schedule({ pluginId: 'odds-pa',  rowsWritten: 100, syncedAt: Date.now(), batchId: `t3-pa-${i}` });
    await sleep(3);
  }

  await sleep(DEBOUNCE_MS + 200);

  return {
    name:          `${CYCLES * 2} eventos intercalados (1x2 + PA)`,
    passed:        refetches === 1,
    refetches,
    expected:      1,
    eventsEmitted: CYCLES * 2,
    durationMs:    Date.now() - start,
    notes:         `${coalesced} eventos coalesced em 1 refetch`,
  };
}

// ─── Teste 4: 10.000 eventos instantâneos → 1 refetch (pico extremo) ─────────
async function test4(): Promise<TestResult> {
  let refetches = 0;
  const { schedule } = makeDebounceEngine(() => { refetches++; });

  const start = Date.now();

  // Sem await entre eventos — simula rajada instantânea
  for (let i = 0; i < 10_000; i++) {
    schedule({ pluginId: 'odds-1x2', rowsWritten: 1, syncedAt: Date.now(), batchId: `t4-${i}` });
  }

  await sleep(DEBOUNCE_MS + 200);

  return {
    name:          '10.000 eventos instantâneos (pico extremo)',
    passed:        refetches === 1,
    refetches,
    expected:      1,
    eventsEmitted: 10_000,
    durationMs:    Date.now() - start,
    notes:         'Sem intervalo entre eventos — mede overhead do debounce',
  };
}

// ─── Teste 5: broadcast falho → fallback detecta e sinaliza ──────────────────
async function test5(): Promise<TestResult> {
  // Simula: nenhum broadcast chega (Realtime offline)
  // O fallback de 30s seria acionado; aqui verificamos que o debounce
  // não dispara refetch espontaneamente sem eventos
  let spuriousRefetches = 0;
  const { schedule } = makeDebounceEngine(() => { spuriousRefetches++; });
  void schedule; // sem eventos

  const start = Date.now();
  await sleep(DEBOUNCE_MS + 200); // aguarda potencial disparo indevido

  return {
    name:          'Sem eventos por DEBOUNCE_MS — sem refetch espontâneo',
    passed:        spuriousRefetches === 0,
    refetches:     spuriousRefetches,
    expected:      0,
    eventsEmitted: 0,
    durationMs:    Date.now() - start,
    notes:         'Garante que debounce não dispara sem eventos (polling não interfere)',
  };
}

// ─── Runner principal ─────────────────────────────────────────────────────────
async function runStressTests(): Promise<Record<string, TestResult>> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SureEdge Realtime — Stress Test do Debounce            ║');
  console.log(`║  DEBOUNCE_MS=${DEBOUNCE_MS}ms                                   ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const tests = [test1, test2, test3, test4, test5];
  const results: Record<string, TestResult> = {};

  for (const t of tests) {
    process?.stdout?.write?.(`Rodando: ${t.name}...`);
    const r = await t();
    results[r.name] = r;
    const icon = r.passed ? '✓' : '✗';
    console.log(`\r  ${icon} ${r.name}`);
    console.log(`    refetches=${r.refetches} (esperado=${r.expected}) | ${r.durationMs}ms | ${r.notes}`);
  }

  const allPassed = Object.values(results).every(r => r.passed);
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  ${allPassed ? '✓ TODOS OS TESTES PASSARAM' : '✗ FALHAS DETECTADAS'}`);
  console.log('──────────────────────────────────────────────────────────\n');

  return results;
}

// Injeta no window se rodando no browser
if (typeof window !== 'undefined') {
  (window as Window & { __sureedge_stress?: typeof runStressTests }).__sureedge_stress = runStressTests;
  console.log('[SureEdge] Stress test disponível: await window.__sureedge_stress()');
} else {
  // Auto-executa se chamado via Node/tsx
  runStressTests().then(results => {
    const failed = Object.values(results).filter(r => !r.passed);
    process.exit(failed.length > 0 ? 1 : 0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
