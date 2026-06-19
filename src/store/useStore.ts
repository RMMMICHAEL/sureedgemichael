'use client';

/**
 * useStore.ts — Zustand global state
 *
 * Single source of truth for the app.
 * All mutations go through store actions; components never write to storage directly.
 */

import { create } from 'zustand';
import type {
  AppDB, Bookmaker, Bank, Leg, ImportLog, OnboardingStep, ViewId,
  Expense, PartnerAccount, AccountTransaction, SheetSync,
  Client, PurchasedAccount, UserProfile, Note, Transfer,
  Operator, GoalConfig, BookmakerTransaction, RecurringExpense,
} from '@/types';
import { loadDB, persistDB, loadUserId, saveUserId, wipeDB, EMPTY_DB } from '@/lib/storage/db';
import { loadFromSupabase, saveToSupabase, scheduleSaveToSupabase, updateLastDb } from '@/lib/supabase/sync';
import { getSupabaseClient } from '@/lib/supabase/client';
import { recalcBookmakers, normHouse, bmColor, bmAbbr } from '@/lib/finance/reconciler';
import { calcLegProfit } from '@/lib/finance/calculator';
import type { CommitResult } from '@/lib/import/importEngine';

// ── Toast ────────────────────────────────────────────────────────────────────

export interface ToastMsg {
  id:      number;
  message: string;
  type:    'ok' | 'err' | 'wrn' | 'info';
}

// ── State shape ──────────────────────────────────────────────────────────────

interface StoreState extends AppDB {
  // UI
  initialized: boolean;
  view:        ViewId;
  dateFrom:    string | null;
  dateTo:      string | null;
  toasts:      ToastMsg[];
  importBuffer: import('@/lib/import/importEngine').ImportResult | null;
  isSyncing:   boolean;

  // Auth — set from Supabase session during init()
  authEmail: string | null;

  // Derived (computed on mutation)
  totalCash: number;

  // Actions — DB
  init:            () => void;
  addLeg:          (leg: Leg) => void;
  bulkAddLegs:     (legs: Leg[]) => void;
  bulkDeleteLegs:  (ids: string[]) => void;
  updateLeg:       (id: string, patch: Partial<Leg>) => void;
  deleteLeg:       (id: string) => void;
  commitImport:    (result: CommitResult) => void;
  addBookmaker:    (bm: Omit<Bookmaker, 'id' | 'balance' | 'ops'>) => void;
  updateBookmaker: (id: string, patch: Partial<Bookmaker>) => void;
  deleteBookmaker: (id: string) => void;
  addBank:         (bank: Omit<Bank, 'id'>) => void;
  updateBank:      (id: string, patch: Partial<Omit<Bank, 'id'>>) => void;
  deleteBank:      (id: string) => void;

  // Actions — Expenses
  addExpense:          (expense: Omit<Expense, 'id'>) => void;
  updateExpense:       (id: string, patch: Partial<Expense>) => void;
  deleteExpense:       (id: string) => void;
  bulkPatchExpenses:   (patches: Array<{ id: string; patch: Partial<Omit<Expense, 'id'>> }>) => void;

  // Actions — Recurring expenses
  addRecurringExpense:    (r: Omit<RecurringExpense, 'id'>) => void;
  updateRecurringExpense: (id: string, patch: Partial<RecurringExpense>) => void;
  deleteRecurringExpense: (id: string) => void;

  // Actions — Partner accounts
  addPartnerAccount:        (account: Omit<PartnerAccount, 'id' | 'totalDeposited' | 'totalWithdrawn' | 'transactions'>) => void;
  updatePartnerAccount:     (id: string, patch: Partial<PartnerAccount>) => void;
  deletePartnerAccount:     (id: string) => void;
  addAccountTransaction:    (accountId: string, tx: Omit<AccountTransaction, 'id'>) => void;
  deleteAccountTransaction: (accountId: string, txId: string) => void;

  // Actions — Client / account purchase management
  addClient:           (client: Omit<Client, 'id' | 'purchasedAccounts'>) => void;
  updateClient:        (id: string, patch: Partial<Client>) => void;
  deleteClient:        (id: string) => void;
  addPurchasedAccount: (clientId: string, acc: Omit<PurchasedAccount, 'id'>) => void;
  updatePurchasedAccount: (clientId: string, accId: string, patch: Partial<PurchasedAccount>) => void;
  deletePurchasedAccount: (clientId: string, accId: string) => void;
  setTargetHouses:     (houses: string[]) => void;

  // Actions — Sheet sync
  setSheetSync:  (cfg: SheetSync) => void;
  setSyncing:    (v: boolean) => void;

  // Actions — Seed data
  setSeedIds: (ids: AppDB['seedIds']) => void;
  addExcludedImportKeys: (keys: string[]) => void;

  // Actions — Notes
  addNote:    (note: Omit<Note, 'id' | 'created_at' | 'updated_at'>) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;

  // Actions — Transfers
  addTransfer:    (t: Omit<Transfer, 'id'>) => void;
  updateTransfer: (id: string, patch: Partial<Transfer>) => void;
  deleteTransfer: (id: string) => void;

  // Actions — Operators
  addOperator:    (op: Omit<Operator, 'id' | 'createdAt'>) => void;
  updateOperator: (id: string, patch: Partial<Operator>) => void;
  deleteOperator: (id: string) => void;

  // Actions — Goals
  setGoalConfig: (cfg: GoalConfig | undefined) => void;

  // Actions — Bookmaker transactions
  addBookmakerTransaction: (bmId: string, tx: Omit<BookmakerTransaction, 'id'>) => void;

  // Actions — User profile
  updateProfile: (patch: Partial<UserProfile>) => void;

  // Actions — Onboarding
  completeOnboardingStep: (step: OnboardingStep) => void;
  finishOnboarding:       () => void;

  // Actions — UI
  setView:          (v: ViewId) => void;
  setDateRange:     (from: string | null, to: string | null) => void;
  setImportBuffer:  (r: import('@/lib/import/importEngine').ImportResult | null) => void;
  toast:            (msg: string, type?: ToastMsg['type']) => void;
  dismissToast:     (id: number) => void;
  // Cross-page navigation: scanner → buscar odds
  oddsInitQuery:     string | null;
  setOddsInitQuery:  (q: string | null) => void;
  // Calculadora flutuante global (PiP)
  pipCalcOpen:       boolean;
  setPipCalcOpen:    (v: boolean) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function recalc(state: Pick<AppDB, 'bms' | 'legs' | 'banks'>): { bms: Bookmaker[]; totalCash: number } {
  const bms = recalcBookmakers(state.bms, state.legs);
  const totalCash = [
    ...bms.map(b => b.balance),
    ...state.banks.map(b => b.balance),
  ].reduce((s, v) => s + v, 0);
  return { bms, totalCash };
}

let toastSeq = 0;

// ── Persist helper: localStorage + background Supabase sync ──────────────────
function persist(db: AppDB): void {
  persistDB(db);
  updateLastDb(db);           // guarda referência para o beforeunload
  scheduleSaveToSupabase(db);
}

// ── Garante save no Supabase ao fechar/recarregar a página ───────────────────
// Usa dois eventos para máxima cobertura entre browsers:
//   visibilitychange(hidden): funciona em Chrome/Edge ao mudar de aba ou minimizar
//   pagehide: funciona em Safari e em fechar aba no Firefox
if (typeof window !== 'undefined') {
  async function emergencySave() {
    const { getLastDb, saveToSupabase: sbSave } = require('@/lib/supabase/sync') as typeof import('@/lib/supabase/sync');
    const db = getLastDb();
    if (db) sbSave(db).catch(() => {});
  }

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') emergencySave();
  });

  // pagehide garante coverage no Safari (que ignora visibilitychange no unload)
  window.addEventListener('pagehide', emergencySave);
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useStore = create<StoreState>()((set, get) => ({
  // Initial state — will be overwritten by init()
  legs:                [],
  bms:                 [],
  banks:               [],
  expenses:            [],
  recurringExpenses:   [],
  partnerAccounts:     [],
  clients:             [],
  targetHouses:        [],
  import_log:          [],
  onboarding_done:     false,
  onboarding_step:     'bookmakers',
  sheetSync:           undefined,
  notes:               [],
  transfers:           [],
  operators:           [],
  goalConfig:          undefined,
  excludedImportKeys:  [],
  totalCash:           0,
  initialized:         false,
  view:             'dash',
  dateFrom:         null,
  dateTo:           null,
  toasts:           [],
  importBuffer:     null,
  isSyncing:        false,
  authEmail:        null,
  pipCalcOpen:      false,
  oddsInitQuery:    null,

  // ── init ──────────────────────────────────────────────────────────────────
  init() {
    function applyDB(db: AppDB) {
      const legs = db.legs.map(l => ({
        ...l,
        source: l.source ?? (l.oid?.startsWith('imp_') ? 'import' : 'manual'),
      }));
      // ── Migração de nomes: normaliza nomes no formato domínio → nome canônico
      //    ex: "aposta.bet.br" → "Apostabet", "betbra.bet.br" → "Betbra"
      let bmsMigrated = false;
      const bmsNorm = (db.bms ?? []).map(bm => {
        const canonical = normHouse(bm.name);
        if (canonical === bm.name) return bm;
        bmsMigrated = true;
        return { ...bm, name: canonical };
      });
      // ── Migração Betbra: aplica cm=2.8 em legs Betbra sem comissão definida
      let betbraMigrated = false;
      const legsWithComm = legs.map(l => {
        if (normHouse(l.ho) === 'Betbra' && (l.cm === undefined || l.cm === 0)) {
          betbraMigrated = true;
          const updated = { ...l, cm: 2.8, updated_at: new Date().toISOString() };
          return { ...updated, pr: calcLegProfit(updated) };
        }
        return l;
      });
      // ── Migração balance_processed: marca legs manuais já liquidadas como processadas
      //    Legs liquidadas antes desta versão já tiveram seus saldos ajustados pelo modelo
      //    anterior (deduct stake on Pending → add back on settle). Marcamos como true
      //    para evitar reprocessamento e habilitar correções futuras de resultado.
      let balanceMigrated = false;
      const legsWithBalance = legsWithComm.map(l => {
        if (l.source !== 'import' && l.re !== 'Pendente' && l.balance_processed === undefined) {
          balanceMigrated = true;
          return { ...l, balance_processed: true as const };
        }
        return l;
      });
      const expenses           = db.expenses           ?? [];
      const partnerAccounts    = db.partnerAccounts    ?? [];
      const clients            = db.clients            ?? [];
      const targetHouses       = db.targetHouses       ?? [];
      const sheetSync          = db.sheetSync;
      const excludedImportKeys = db.excludedImportKeys ?? [];
      const notes              = db.notes              ?? [];
      const transfers          = db.transfers          ?? [];
      const operators          = db.operators          ?? [];
      const goalConfig         = db.goalConfig;
      // ── Migração v3: capital só muda na liquidação, não na abertura de apostas ──
      //    O modelo antigo debitava a stake no bm.balance ao registrar apostas pendentes.
      //    Restora essas stakes para que o saldo reflita o patrimônio real.
      let pendingMigrated = false;
      let bmsV3 = bmsNorm;
      if (!db.balanceModelV3) {
        const pendingToRestore = legsWithBalance.filter(
          l => l.source !== 'import' && l.re === 'Pendente' && l.balance_processed === false
        );
        if (pendingToRestore.length > 0) {
          const restoreMap = new Map<string, number>();
          for (const l of pendingToRestore) {
            const key = normHouse(l.ho).toLowerCase();
            restoreMap.set(key, +((restoreMap.get(key) ?? 0) + l.st).toFixed(2));
          }
          bmsV3 = bmsNorm.map(bm => {
            const restore = restoreMap.get(normHouse(bm.name).toLowerCase()) ?? 0;
            return restore > 0 ? { ...bm, balance: +(bm.balance + restore).toFixed(2) } : bm;
          });
        }
        pendingMigrated = true;
      }
      const recurringExpenses = db.recurringExpenses ?? [];
      const migrated = { ...db, bms: bmsV3, legs: legsWithBalance, expenses, partnerAccounts, clients, targetHouses, sheetSync, excludedImportKeys, notes, transfers, operators, goalConfig, balanceModelV3: true as const, recurringExpenses };
      const { bms, totalCash } = recalc(migrated);
      // pipCalcOpen não é parte do AppDB — sempre reseta para false na inicialização
      // para evitar que o BFCache (back/forward do browser) restaure a calculadora aberta
      set({ ...migrated, bms, totalCash, initialized: true, toasts: [], pipCalcOpen: false });
      // Persiste se alguma migração foi aplicada
      if (bmsMigrated || betbraMigrated || balanceMigrated || pendingMigrated) {
        if (betbraMigrated)  console.log('[migration] Betbra: cm=2.8 aplicado em legs existentes');
        if (balanceMigrated) console.log('[migration] balance_processed: legs liquidadas marcadas como processadas');
        if (pendingMigrated) console.log('[migration] v3: stakes de apostas pendentes restauradas no saldo das casas');
        persist(migrated);
      }
    }

    // ── Step 1: check session BEFORE touching localStorage ───────────────
    // getSession() reads only from local cookies/storage — no network call.
    // This prevents user B from briefly seeing user A's data.
    getSupabaseClient().auth.getSession().then(({ data: { session } }) => {
      const currentUserId = session?.user?.id ?? null;
      const storedUserId  = loadUserId();

      if (currentUserId && storedUserId && currentUserId !== storedUserId) {
        // Different user — wipe localStorage immediately, start clean
        wipeDB();
      }
      if (currentUserId) saveUserId(currentUserId);

      // Store auth email for permission checks (e.g. admin features)
      const authEmail = session?.user?.email ?? null;
      set({ authEmail });

      // ── Step 2: apply localStorage (now guaranteed to belong to current user)
      const localDb = loadDB();
      applyDB(localDb);

      // ── Step 3: sync fresher data from Supabase in the background ────────
      loadFromSupabase().then(({ db: remoteDb, userId }) => {
        if (!remoteDb) {
          const hasLocalData = localDb.legs.length > 0 || localDb.bms.length > 0 || localDb.banks.length > 0;
          if (hasLocalData && userId) saveToSupabase(localDb);
          return;
        }

        // Merge seguro: combina legs locais e remotas usando "mais recente vence".
        //
        // Para cada leg que existe em AMBOS: compara updated_at e fica com a mais nova.
        // Legs só-locais (salvas antes do sync chegar) são sempre preservadas.
        // Legs só-remotas (criadas em outro dispositivo) também são preservadas.
        const remoteById = new Map(remoteDb.legs.map(l => [l.id, l]));
        const localById  = new Map(localDb.legs.map(l => [l.id, l]));

        // Constrói o conjunto mesclado
        const mergedById = new Map<string, typeof remoteDb.legs[0]>();

        // 1. Começa com todas as remotas
        for (const [id, remote] of remoteById) mergedById.set(id, remote);

        // 2. Para cada local, decide se substitui a remota
        for (const [id, local] of localById) {
          const remote = remoteById.get(id);
          if (!remote) {
            // Só existe localmente → preserva (criada antes do sync)
            mergedById.set(id, local);
          } else {
            // Existe em ambos → "mais recente vence" via updated_at
            const localTs  = local.updated_at  ? new Date(local.updated_at).getTime()  : 0;
            const remoteTs = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
            if (localTs > remoteTs) {
              // Local é mais nova (ex.: resultado registrado antes do Supabase salvar)
              mergedById.set(id, local);
            }
            // remoteTs >= localTs: remota vence (já estava no map)
          }
        }

        const mergedLegs = Array.from(mergedById.values());
        const localOnly  = localDb.legs.filter(l => !remoteById.has(l.id));
        // Legs onde local ganhou a disputa (resultado mais recente no localStorage)
        const localWins  = localDb.legs.filter(l => {
          const remote = remoteById.get(l.id);
          if (!remote) return false;
          const localTs  = l.updated_at  ? new Date(l.updated_at).getTime()  : 0;
          const remoteTs = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
          return localTs > remoteTs;
        });

        // ── Monta o merged base ───────────────────────────────────────────────
        // Regra: remote vence para configurações (profile, sheetSync, etc.)
        // Para arrays de dados (bms, banks, expenses, etc.):
        //   se o remoto tem dados → usa o remoto (editado em outro dispositivo)
        //   se o remoto está vazio → usa o local (nunca foi sincronizado ainda)
        // Isso evita que um remoteDb recém-criado (vazio) apague dados locais.
        const safeMerge = <T extends unknown[]>(remote: T | undefined, local: T | undefined): T =>
          (remote?.length ?? 0) > 0 ? remote! : (local ?? [] as unknown as T);

        let merged = {
          ...remoteDb,
          legs:            mergedLegs,
          bms:             safeMerge(remoteDb.bms,            localDb.bms),
          banks:           safeMerge(remoteDb.banks,          localDb.banks),
          expenses:        safeMerge(remoteDb.expenses,       localDb.expenses),
          transfers:       safeMerge(remoteDb.transfers,      localDb.transfers),
          partnerAccounts: safeMerge(remoteDb.partnerAccounts, localDb.partnerAccounts),
          clients:         safeMerge(remoteDb.clients,        localDb.clients),
          targetHouses:    safeMerge(remoteDb.targetHouses,   localDb.targetHouses),
          notes:           safeMerge(remoteDb.notes,          localDb.notes),
          operators:       safeMerge(remoteDb.operators,      localDb.operators),
        };

        // ── Anti-race condition: inclui mutações feitas APÓS o init começar ──
        // Entre o applyDB(localDb) e agora, o usuário pode ter criado/editado
        // dados que não estão em `merged` (construído de snapshots anteriores).
        // Preserva essas mutações para não perdê-las silenciosamente.
        const currentState = get();

        // Legs adicionadas/editadas após o init
        const mergedLegIds = new Set(merged.legs.map(l => l.id));
        const addedAfterInit = currentState.legs.filter(l => !mergedLegIds.has(l.id));
        if (addedAfterInit.length > 0) {
          console.log(`[sync] preservando ${addedAfterInit.length} leg(s) adicionadas durante o carregamento`);
          merged = { ...merged, legs: [...merged.legs, ...addedAfterInit] };
        }

        // Notes adicionadas após o init (preserva notas criadas enquanto Supabase carregava)
        const mergedNoteIds = new Set((merged.notes ?? []).map(n => n.id));
        const notesAfterInit = (currentState.notes ?? []).filter(n => !mergedNoteIds.has(n.id));
        if (notesAfterInit.length > 0) {
          console.log(`[sync] preservando ${notesAfterInit.length} nota(s) adicionadas durante o carregamento`);
          merged = { ...merged, notes: [...(merged.notes ?? []), ...notesAfterInit] };
        }

        // Operators adicionados após o init
        const mergedOpIds = new Set((merged.operators ?? []).map(o => o.id));
        const opsAfterInit = (currentState.operators ?? []).filter(o => !mergedOpIds.has(o.id));
        if (opsAfterInit.length > 0) {
          console.log(`[sync] preservando ${opsAfterInit.length} operador(es) adicionados durante o carregamento`);
          merged = { ...merged, operators: [...(merged.operators ?? []), ...opsAfterInit] };
        }

        // Salva de volta no Supabase se houver qualquer divergência
        const remoteMissingBms   = (remoteDb.bms?.length   ?? 0) === 0 && (localDb.bms?.length   ?? 0) > 0;
        const remoteMissingBanks = (remoteDb.banks?.length ?? 0) === 0 && (localDb.banks?.length ?? 0) > 0;
        const hasDivergence = localOnly.length > 0 || localWins.length > 0
          || addedAfterInit.length > 0 || notesAfterInit.length > 0 || opsAfterInit.length > 0
          || remoteMissingBms || remoteMissingBanks;
        if (hasDivergence) {
          console.log(`[sync] merge: +${localOnly.length} legs, ${localWins.length} atualizadas, ${addedAfterInit.length} pós-init, ${notesAfterInit.length} notas, ${opsAfterInit.length} operadores, bms-recovery:${remoteMissingBms}, banks-recovery:${remoteMissingBanks} → re-sincronizando`);
          saveToSupabase(merged);
        }

        persist(merged);
        applyDB(merged);
      });
    });
  },

  // ── legs ──────────────────────────────────────────────────────────────────

  /** Auto-deduct helper: deduct/refund a stake from the matching bookmaker's balance. */
  // (internal inline helper used by mutations below)

  addLeg(leg) {
    set(s => {
      // Deduplicação por id — evita pernas duplicadas por duplo clique ou chamada repetida
      if (s.legs.some(l => l.id === leg.id)) return s;
      const now = new Date().toISOString();
      // Auto-apply BetBra 2.8% commission if not already set on the leg
      const legWithComm = (leg.ho === 'Betbra' && (leg.cm === undefined || leg.cm === 0))
        ? { ...leg, cm: 2.8 }
        : leg;
      const computed = calcLegProfit(legWithComm);

      let bms = [...s.bms];
      let processedFlag: boolean | undefined = undefined;

      if (leg.source !== 'import') {
        const bmKey = normHouse(leg.ho).toLowerCase();
        if (leg.re === 'Pendente') {
          // Pendente: não altera saldo — capital muda só na liquidação (modelo v3)
          processedFlag = false;
        } else {
          // Leg já encerrada no ato do registro: aplica o lucro líquido diretamente
          // (profit já inclui -stake para Red, +(od-1)*stake para Green)
          bms = bms.map(b =>
            normHouse(b.name).toLowerCase() === bmKey
              ? { ...b, balance: +(b.balance + computed).toFixed(2) }
              : b
          );
          processedFlag = true;
        }
      }

      const newLeg = {
        ...legWithComm,
        pr: computed,
        updated_at: legWithComm.updated_at ?? now,
        ...(processedFlag !== undefined ? { balance_processed: processedFlag } : {}),
      };
      const legs = [...s.legs, newLeg];

      const { bms: recalcedBms, totalCash } = recalc({ ...s, legs, bms });
      persist({ ...s, legs, bms: recalcedBms });
      return { legs, bms: recalcedBms, totalCash };
    });
  },

  // Single state update for bulk inserts (avoids N re-renders)
  bulkAddLegs(newLegs) {
    set(s => {
      const now    = new Date().toISOString();
      const cooked = newLegs.map(l => ({ ...l, pr: calcLegProfit(l), updated_at: l.updated_at ?? now }));
      const legs = [...s.legs, ...cooked];
      const { bms, totalCash } = recalc({ ...s, legs });
      persist({ ...s, legs, bms });
      return { legs, bms, totalCash };
    });
  },

  // Single state update for bulk removes (avoids N re-renders)
  bulkDeleteLegs(ids) {
    const idSet = new Set(ids);
    set(s => {
      const deletedLegs = s.legs.filter(l => idSet.has(l.id));

      // Estornar efeito no saldo para todas as legs manuais deletadas
      // Modelo v3: apenas legs liquidadas (balance_processed=true) têm efeito no saldo
      let bms = [...s.bms];
      deletedLegs
        .filter(l => l.source !== 'import')
        .forEach(leg => {
          if (leg.balance_processed === true) {
            const bmKey = normHouse(leg.ho).toLowerCase();
            const profit = calcLegProfit(leg);
            bms = bms.map(b =>
              normHouse(b.name).toLowerCase() === bmKey
                ? { ...b, balance: +(b.balance - profit).toFixed(2) }
                : b
            );
          }
        });

      // Permanently exclude rowKeys of deleted import legs so auto-sync
      // doesn't reimport them on the next tick.
      const existing = new Set(s.excludedImportKeys ?? []);
      deletedLegs
        .filter(l => l.source === 'import' && l.ho && l.mk && l.bd)
        .forEach(l => existing.add(`${l.ho}|${l.mk}|${l.bd.slice(0, 16)}`));
      const excludedImportKeys = Array.from(existing);

      const legs = s.legs.filter(l => !idSet.has(l.id));
      const { bms: recalcedBms, totalCash } = recalc({ ...s, legs, bms });
      persist({ ...s, legs, bms: recalcedBms, excludedImportKeys });
      return { legs, bms: recalcedBms, totalCash, excludedImportKeys };
    });
  },

  updateLeg(id, patch) {
    set(s => {
      const now    = new Date().toISOString();
      const oldLeg = s.legs.find(l => l.id === id);

      // ── Calcular delta de saldo ANTES de atualizar o array de legs ──────────
      let bms = [...s.bms];
      let balancePatch: Partial<import('@/types').Leg> = {};

      // source é imutável: nunca deixa patch sobrescrever o valor original
      const safePatch = { ...patch, source: oldLeg?.source };

      // Dupla proteção: se a leg veio de import, força source de volta mesmo que
      // alguém tente forçar via patch direto
      if (oldLeg?.source === 'import') safePatch.source = 'import';

      if (oldLeg && oldLeg.source !== 'import' && safePatch.re !== undefined && safePatch.re !== oldLeg.re) {
        const bmKey        = normHouse(oldLeg.ho).toLowerCase();
        const tentativeNew = { ...oldLeg, ...safePatch };

        if (oldLeg.re === 'Pendente' && safePatch.re !== 'Pendente' && oldLeg.balance_processed !== true) {
          // Pendente → Liquidada: aplica apenas o lucro (stake não foi debitada no modelo v3)
          const delta = +calcLegProfit(tentativeNew).toFixed(2);
          bms = bms.map(b =>
            normHouse(b.name).toLowerCase() === bmKey
              ? { ...b, balance: +(b.balance + delta).toFixed(2) }
              : b
          );
          balancePatch = { balance_processed: true };

        } else if (oldLeg.balance_processed === true) {
          // Leg já processada — correção de resultado
          const oldProfit = calcLegProfit(oldLeg);

          if (safePatch.re === 'Pendente') {
            // Liquidada → Pendente: estorna apenas o lucro (sem redebitir stake no modelo v3)
            bms = bms.map(b =>
              normHouse(b.name).toLowerCase() === bmKey
                ? { ...b, balance: +(b.balance - oldProfit).toFixed(2) }
                : b
            );
            balancePatch = { balance_processed: false };
          } else {
            // Mudança entre resultados liquidados (ex: Green → Red): aplica a diferença
            const newProfit = calcLegProfit(tentativeNew);
            const delta     = +(newProfit - oldProfit).toFixed(2);
            bms = bms.map(b =>
              normHouse(b.name).toLowerCase() === bmKey
                ? { ...b, balance: +(b.balance + delta).toFixed(2) }
                : b
            );
          }
        }
      }

      const legs = s.legs.map(l => {
        if (l.id !== id) return l;
        const updated = { ...l, ...safePatch, ...balancePatch, updated_at: now };
        updated.pr = calcLegProfit(updated);
        return updated;
      });

      const { bms: recalcedBms, totalCash } = recalc({ ...s, legs, bms });
      persist({ ...s, legs, bms: recalcedBms });
      return { legs, bms: recalcedBms, totalCash };
    });
  },

  deleteLeg(id) {
    set(s => {
      const leg = s.legs.find(l => l.id === id);

      // Estornar efeito no saldo ao deletar leg manual
      let bms = [...s.bms];
      if (leg && leg.source !== 'import') {
        const bmKey = normHouse(leg.ho).toLowerCase();
        if (leg.balance_processed === true) {
          // Lucro foi aplicado na liquidação → estornar (modelo v3: pendentes não têm efeito no saldo)
          const profit = calcLegProfit(leg);
          bms = bms.map(b =>
            normHouse(b.name).toLowerCase() === bmKey
              ? { ...b, balance: +(b.balance - profit).toFixed(2) }
              : b
          );
        }
      }

      // If the leg came from an import, permanently exclude its rowKey so the
      // next auto-sync doesn't reimport it.  rowKey format must match commitRows.
      let excludedImportKeys = s.excludedImportKeys ?? [];
      if (leg?.source === 'import' && leg.ho && leg.mk && leg.bd) {
        const rowKey = `${leg.ho}|${leg.mk}|${leg.bd.slice(0, 16)}`;
        if (!excludedImportKeys.includes(rowKey)) {
          excludedImportKeys = [...excludedImportKeys, rowKey];
        }
      }

      const legs = s.legs.filter(l => l.id !== id);
      const { bms: recalcedBms, totalCash } = recalc({ ...s, legs, bms });
      persist({ ...s, legs, bms: recalcedBms, excludedImportKeys });
      return { legs, bms: recalcedBms, totalCash, excludedImportKeys };
    });
  },

  // ── commitImport ──────────────────────────────────────────────────────────
  commitImport(result) {
    set(s => {
      // Deduplicação por ID: evita legs duplicadas se o import for disparado duas vezes
      const existingIds = new Set(s.legs.map(l => l.id));
      const uniqueNewLegs = result.newLegs.filter(l => !existingIds.has(l.id));
      if (uniqueNewLegs.length < result.newLegs.length) {
        console.warn(`[commitImport] ${result.newLegs.length - uniqueNewLegs.length} leg(s) duplicada(s) ignoradas`);
      }
      const legs = [...s.legs, ...uniqueNewLegs];

      let bms = [...s.bms];
      result.newHouses.forEach(name => {
        if (!bms.find(b => b.name === name)) {
          bms.push({
            id:              `bm_${Date.now()}_${name}`,
            name,
            abbr:            bmAbbr(name),
            color:           bmColor(name),
            initial_balance: 0,
            balance:         0,
            status:          'ativa',
            notes:           'Criada via importação — defina o saldo inicial em Casas de Aposta.',
            ops:             0,
          });
        }
      });

      const recalced = recalc({ ...s, legs, bms });
      bms = recalced.bms;

      const logEntry: ImportLog = {
        ts:         new Date().toISOString(),
        filename:   '',
        imported:   result.imported,
        dupes:      result.dupes,
        anomalies:  result.anomalies,
        total:      result.imported + result.dupes,
        month:      new Date().toISOString().slice(0, 7),
      };

      const import_log = [...s.import_log, logEntry];

      // Update last sync timestamp if sheetSync exists
      const sheetSync = s.sheetSync
        ? { ...s.sheetSync, lastSync: new Date().toISOString() }
        : s.sheetSync;

      persist({ ...s, legs, bms, import_log, sheetSync });
      return { legs, bms, totalCash: recalced.totalCash, import_log, sheetSync };
    });
  },

  // ── bookmakers ───────────────────────────────────────────────────────────
  addBookmaker(bm) {
    set(s => {
      const newBM: Bookmaker = {
        ...bm,
        id:             `bm_${Date.now()}`,
        balance:        bm.initial_balance,
        ops:            0,
        balance_set_at: new Date().toISOString(),
      };
      const bms = recalcBookmakers([...s.bms, newBM], s.legs);
      const totalCash = [...bms.map(b => b.balance), ...s.banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      persist({ ...s, bms });
      return { bms, totalCash };
    });
  },

  updateBookmaker(id, patch) {
    set(s => {
      // When the user explicitly sets a balance, stamp the time so
      // calcEffectiveBalance knows which legs are already reflected.
      const balanceChanged = patch.balance !== undefined || patch.initial_balance !== undefined;
      const finalPatch = balanceChanged
        ? { ...patch, balance_set_at: new Date().toISOString() }
        : patch;
      const bms = recalcBookmakers(
        s.bms.map(b => b.id === id ? { ...b, ...finalPatch } : b),
        s.legs
      );
      const totalCash = [...bms.map(b => b.balance), ...s.banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      persist({ ...s, bms });
      return { bms, totalCash };
    });
  },

  deleteBookmaker(id) {
    set(s => {
      const bms = s.bms.filter(b => b.id !== id);
      persist({ ...s, bms });
      return { bms };
    });
  },

  // ── banks ────────────────────────────────────────────────────────────────
  addBank(bank) {
    set(s => {
      const banks = [...s.banks, { ...bank, id: `bank_${Date.now()}` }];
      persist({ ...s, banks });
      const totalCash = [...s.bms.map(b => b.balance), ...banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      return { banks, totalCash };
    });
  },

  updateBank(id, patch) {
    set(s => {
      const banks = s.banks.map(b => b.id === id ? { ...b, ...patch } : b);
      persist({ ...s, banks });
      const totalCash = [...s.bms.map(b => b.balance), ...banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      return { banks, totalCash };
    });
  },

  deleteBank(id) {
    set(s => {
      const banks = s.banks.filter(b => b.id !== id);
      persist({ ...s, banks });
      const totalCash = [...s.bms.map(b => b.balance), ...banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      return { banks, totalCash };
    });
  },

  // ── expenses ─────────────────────────────────────────────────────────────
  addExpense(expense) {
    set(s => {
      const expenses = [...s.expenses, { ...expense, id: `exp_${Date.now()}` }];
      persist({ ...s, expenses });
      return { expenses };
    });
  },

  updateExpense(id, patch) {
    set(s => {
      const expenses = s.expenses.map(e => e.id === id ? { ...e, ...patch } : e);
      persist({ ...s, expenses });
      return { expenses };
    });
  },

  deleteExpense(id) {
    set(s => {
      const expenses = s.expenses.filter(e => e.id !== id);
      persist({ ...s, expenses });
      return { expenses };
    });
  },

  bulkPatchExpenses(patches) {
    set(s => {
      const map = new Map(s.expenses.map(e => [e.id, e]));
      patches.forEach(({ id, patch }) => {
        const e = map.get(id);
        if (e) map.set(id, { ...e, ...patch });
      });
      const expenses = Array.from(map.values());
      persist({ ...s, expenses });
      return { expenses };
    });
  },

  // ── recurring expenses ────────────────────────────────────────────────────
  addRecurringExpense(r) {
    set(s => {
      const recurringExpenses = [...(s.recurringExpenses ?? []), { ...r, id: `rec_${Date.now()}` }];
      persist({ ...s, recurringExpenses });
      return { recurringExpenses };
    });
  },

  updateRecurringExpense(id, patch) {
    set(s => {
      const recurringExpenses = (s.recurringExpenses ?? []).map(r => r.id === id ? { ...r, ...patch } : r);
      persist({ ...s, recurringExpenses });
      return { recurringExpenses };
    });
  },

  deleteRecurringExpense(id) {
    set(s => {
      const recurringExpenses = (s.recurringExpenses ?? []).filter(r => r.id !== id);
      persist({ ...s, recurringExpenses });
      return { recurringExpenses };
    });
  },

  // ── partner accounts ─────────────────────────────────────────────────────
  addPartnerAccount(account) {
    set(s => {
      const newAcc: PartnerAccount = {
        ...account,
        id:             `acc_${Date.now()}`,
        totalDeposited: 0,
        totalWithdrawn: 0,
        transactions:   [],
      };
      const partnerAccounts = [...s.partnerAccounts, newAcc];
      persist({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  updatePartnerAccount(id, patch) {
    set(s => {
      const partnerAccounts = s.partnerAccounts.map(a => a.id === id ? { ...a, ...patch } : a);
      persist({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  deletePartnerAccount(id) {
    set(s => {
      const partnerAccounts = s.partnerAccounts.filter(a => a.id !== id);
      persist({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  addAccountTransaction(accountId, tx) {
    set(s => {
      const newTx: AccountTransaction = { ...tx, id: `tx_${Date.now()}` };
      const partnerAccounts = s.partnerAccounts.map(a => {
        if (a.id !== accountId) return a;
        const transactions = [...a.transactions, newTx];
        const totalDeposited = transactions.filter(t => t.type === 'deposito').reduce((sum, t) => sum + t.amount, 0);
        const totalWithdrawn = transactions.filter(t => t.type === 'saque').reduce((sum, t) => sum + t.amount, 0);
        return { ...a, transactions, totalDeposited, totalWithdrawn };
      });
      persist({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  deleteAccountTransaction(accountId, txId) {
    set(s => {
      const partnerAccounts = s.partnerAccounts.map(a => {
        if (a.id !== accountId) return a;
        const transactions = a.transactions.filter(t => t.id !== txId);
        const totalDeposited = transactions.filter(t => t.type === 'deposito').reduce((sum, t) => sum + t.amount, 0);
        const totalWithdrawn = transactions.filter(t => t.type === 'saque').reduce((sum, t) => sum + t.amount, 0);
        return { ...a, transactions, totalDeposited, totalWithdrawn };
      });
      persist({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  // ── client / account purchase management ─────────────────────────────────
  addClient(client) {
    set(s => {
      const newClient: Client = { ...client, id: `cli_${Date.now()}`, purchasedAccounts: [] };
      const clients = [...s.clients, newClient];
      persist({ ...s, clients });
      return { clients };
    });
  },

  updateClient(id, patch) {
    set(s => {
      const clients = s.clients.map(c => c.id === id ? { ...c, ...patch } : c);
      persist({ ...s, clients });
      return { clients };
    });
  },

  deleteClient(id) {
    set(s => {
      const clients = s.clients.filter(c => c.id !== id);
      persist({ ...s, clients });
      return { clients };
    });
  },

  addPurchasedAccount(clientId, acc) {
    set(s => {
      const newAcc: PurchasedAccount = { ...acc, id: `pa_${Date.now()}` };
      const clients = s.clients.map(c => {
        if (c.id !== clientId) return c;
        return { ...c, purchasedAccounts: [...c.purchasedAccounts, newAcc] };
      });

      // Auto-register expense when account has a cost
      let expenses = s.expenses;
      if (acc.cost > 0) {
        const clientName = s.clients.find(c => c.id === clientId)?.name ?? 'Cliente';
        expenses = [
          ...s.expenses,
          {
            id:          `exp_pa_${Date.now()}`,
            date:        acc.purchaseDate,
            category:    'Conta',
            description: `Conta ${acc.house} — ${clientName}`,
            amount:      acc.cost,
            notes:       'Gerado automaticamente pela compra de conta em Contas',
          },
        ];
      }

      persist({ ...s, clients, expenses });
      return { clients, expenses };
    });
  },

  updatePurchasedAccount(clientId, accId, patch) {
    set(s => {
      const clients = s.clients.map(c => {
        if (c.id !== clientId) return c;
        return { ...c, purchasedAccounts: c.purchasedAccounts.map(a => a.id === accId ? { ...a, ...patch } : a) };
      });
      persist({ ...s, clients });
      return { clients };
    });
  },

  deletePurchasedAccount(clientId, accId) {
    set(s => {
      const clients = s.clients.map(c => {
        if (c.id !== clientId) return c;
        return { ...c, purchasedAccounts: c.purchasedAccounts.filter(a => a.id !== accId) };
      });
      persist({ ...s, clients });
      return { clients };
    });
  },

  setTargetHouses(houses) {
    set(s => {
      persist({ ...s, targetHouses: houses });
      return { targetHouses: houses };
    });
  },

  // ── sheet sync ────────────────────────────────────────────────────────────
  setSheetSync(cfg) {
    set(s => {
      persist({ ...s, sheetSync: cfg });
      return { sheetSync: cfg };
    });
  },

  setSyncing(v) {
    set({ isSyncing: v });
  },

  setSeedIds(ids) {
    set(s => {
      const next = { ...s, seedIds: ids };
      persist(next);
      return { seedIds: ids };
    });
  },

  addExcludedImportKeys(keys) {
    set(s => {
      const existing = new Set(s.excludedImportKeys ?? []);
      keys.forEach(k => existing.add(k));
      const excludedImportKeys = Array.from(existing);
      persist({ ...s, excludedImportKeys });
      return { excludedImportKeys };
    });
  },

  // ── profile ──────────────────────────────────────────────────────────────
  updateProfile(patch) {
    set(s => {
      const profile = { ...(s.profile ?? { name: '', email: '', phone: '' }), ...patch };
      persist({ ...s, profile });
      return { profile };
    });
  },

  // ── notes ────────────────────────────────────────────────────────────────
  addNote(note) {
    set(s => {
      const now = new Date().toISOString();
      const newNote: Note = { ...note, id: `note_${Date.now()}`, created_at: now, updated_at: now };
      const notes = [newNote, ...(s.notes ?? [])];
      persist({ ...s, notes });
      return { notes };
    });
  },

  updateNote(id, patch) {
    set(s => {
      const notes = (s.notes ?? []).map(n =>
        n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n
      );
      persist({ ...s, notes });
      return { notes };
    });
  },

  deleteNote(id) {
    set(s => {
      const notes = (s.notes ?? []).filter(n => n.id !== id);
      persist({ ...s, notes });
      return { notes };
    });
  },

  // ── transfers ────────────────────────────────────────────────────────────
  addTransfer(t) {
    set(s => {
      const transfers = [...(s.transfers ?? []), { ...t, id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }];
      persist({ ...s, transfers });
      return { transfers };
    });
  },

  updateTransfer(id, patch) {
    set(s => {
      const transfers = (s.transfers ?? []).map(t => t.id === id ? { ...t, ...patch } : t);
      persist({ ...s, transfers });
      return { transfers };
    });
  },

  deleteTransfer(id) {
    set(s => {
      const transfers = (s.transfers ?? []).filter(t => t.id !== id);
      persist({ ...s, transfers });
      return { transfers };
    });
  },

  // ── operators ─────────────────────────────────────────────────────────────
  addOperator(op) {
    set(s => {
      const newOp: Operator = { ...op, id: `op_${Date.now()}`, createdAt: new Date().toISOString() };
      const operators = [...(s.operators ?? []), newOp];
      persist({ ...s, operators });
      return { operators };
    });
  },

  updateOperator(id, patch) {
    set(s => {
      const operators = (s.operators ?? []).map(o => o.id === id ? { ...o, ...patch } : o);
      persist({ ...s, operators });
      return { operators };
    });
  },

  deleteOperator(id) {
    set(s => {
      const operators = (s.operators ?? []).filter(o => o.id !== id);
      persist({ ...s, operators });
      return { operators };
    });
  },

  // ── goals ─────────────────────────────────────────────────────────────────
  setGoalConfig(cfg) {
    set(s => {
      persist({ ...s, goalConfig: cfg });
      return { goalConfig: cfg };
    });
  },

  // ── bookmaker transactions ─────────────────────────────────────────────────
  addBookmakerTransaction(bmId, tx) {
    set(s => {
      const newTx: BookmakerTransaction = { ...tx, id: `bmt_${Date.now()}` };
      const now = new Date().toISOString();
      // adjust initial_balance + balance: deposito = +amount, saque = -amount, transferencia = -amount (debita origem)
      const bms = s.bms.map(b => {
        if (b.id !== bmId) return b;
        const delta = tx.type === 'deposito' ? tx.amount : (tx.type === 'saque' || tx.type === 'transferencia') ? -tx.amount : 0;
        return {
          ...b,
          initial_balance: b.initial_balance + delta,
          // Keep balance in sync so the display reflects the deposit/withdrawal
          balance:        b.balance + delta,
          balance_set_at: now,
          transactions:   [...(b.transactions ?? []), newTx],
        };
      });
      const { totalCash } = recalc({ ...s, bms });
      persist({ ...s, bms });
      return { bms, totalCash };
    });
  },

  // ── onboarding ───────────────────────────────────────────────────────────
  completeOnboardingStep(step) {
    set(s => {
      persist({ ...s, onboarding_step: step });
      return { onboarding_step: step };
    });
  },

  finishOnboarding() {
    set(s => {
      persist({ ...s, onboarding_done: true, onboarding_step: 'done' });
      return { onboarding_done: true, onboarding_step: 'done' };
    });
  },

  // ── UI ────────────────────────────────────────────────────────────────────
  setView(v) { set({ view: v }); },
  setDateRange(from, to) { set({ dateFrom: from, dateTo: to }); },
  setImportBuffer(r) { set({ importBuffer: r }); },
  setOddsInitQuery(q) { set({ oddsInitQuery: q }); },
  setPipCalcOpen(v)  { set({ pipCalcOpen: v }); },

  toast(msg, type = 'info') {
    // Dedup: don't stack identical messages already visible
    const already = get().toasts.some(t => t.message === msg && t.type === type);
    if (already) return;
    const id = ++toastSeq;
    set(s => ({ toasts: [...s.toasts, { id, message: msg, type }] }));
    // Auto-dismiss after 4.5 s — the ToastItem component also drives this,
    // but we keep the store-side timeout as a safety net.
    setTimeout(() => get().dismissToast(id), 4500);
  },

  dismissToast(id) {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },
}));
