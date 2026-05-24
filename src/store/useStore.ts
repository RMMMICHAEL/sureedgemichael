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
  Operator, GoalConfig, BookmakerTransaction,
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
  addExpense:    (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

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
  setView:         (v: ViewId) => void;
  setDateRange:    (from: string | null, to: string | null) => void;
  setImportBuffer: (r: import('@/lib/import/importEngine').ImportResult | null) => void;
  toast:           (msg: string, type?: ToastMsg['type']) => void;
  dismissToast:    (id: number) => void;
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
      const migrated = { ...db, bms: bmsNorm, legs, expenses, partnerAccounts, clients, targetHouses, sheetSync, excludedImportKeys, notes, transfers, operators, goalConfig };
      const { bms, totalCash } = recalc(migrated);
      set({ ...migrated, bms, totalCash, initialized: true });
      // Se algum nome foi corrigido, persiste imediatamente para sincronizar com Supabase
      if (bmsMigrated) persist(migrated);
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

        const merged = { ...remoteDb, legs: mergedLegs };

        // Salva de volta no Supabase se houver divergência (novas locais ou locais mais recentes)
        if (localOnly.length > 0 || localWins.length > 0) {
          console.log(`[sync] merge: +${localOnly.length} legs novas, ${localWins.length} legs atualizadas localmente → re-sincronizando Supabase`);
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
      const now = new Date().toISOString();
      // Auto-apply BetBra 2.8% commission if not already set on the leg
      const legWithComm = (leg.ho === 'Betbra' && (leg.cm === undefined || leg.cm === 0))
        ? { ...leg, cm: 2.8 }
        : leg;
      const newLeg = { ...legWithComm, pr: calcLegProfit(legWithComm), updated_at: legWithComm.updated_at ?? now };
      const legs   = [...s.legs, newLeg];

      // Auto-deduct stake when registering a manual pending bet
      let bms = [...s.bms];
      if (leg.re === 'Pendente' && leg.source !== 'import') {
        const bmKey = normHouse(leg.ho).toLowerCase();
        bms = bms.map(b =>
          normHouse(b.name).toLowerCase() === bmKey
            ? { ...b, balance: +(b.balance - leg.st).toFixed(2) }
            : b
        );
      }

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
      // Refund stakes for any pending manual bets being deleted
      const deletedPending = s.legs.filter(
        l => idSet.has(l.id) && l.re === 'Pendente' && l.source !== 'import'
      );
      let bms = [...s.bms];
      deletedPending.forEach(leg => {
        const bmKey = normHouse(leg.ho).toLowerCase();
        bms = bms.map(b =>
          normHouse(b.name).toLowerCase() === bmKey
            ? { ...b, balance: +(b.balance + leg.st).toFixed(2) }
            : b
        );
      });

      const legs = s.legs.filter(l => !idSet.has(l.id));
      const { bms: recalcedBms, totalCash } = recalc({ ...s, legs, bms });
      persist({ ...s, legs, bms: recalcedBms });
      return { legs, bms: recalcedBms, totalCash };
    });
  },

  updateLeg(id, patch) {
    set(s => {
      const now    = new Date().toISOString();
      const oldLeg = s.legs.find(l => l.id === id);

      const legs = s.legs.map(l => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch, updated_at: now };
        updated.pr = calcLegProfit(updated);
        return updated;
      });

      // If a pending manual bet just got settled, apply stake + profit to balance
      let bms = [...s.bms];
      if (
        oldLeg &&
        oldLeg.re === 'Pendente' &&
        oldLeg.source !== 'import' &&
        patch.re &&
        patch.re !== 'Pendente'
      ) {
        const settledLeg = legs.find(l => l.id === id)!;
        const bmKey      = normHouse(oldLeg.ho).toLowerCase();
        // stake was already deducted on registration; add back stake + net P&L
        const delta = +(oldLeg.st + calcLegProfit(settledLeg)).toFixed(2);
        bms = bms.map(b =>
          normHouse(b.name).toLowerCase() === bmKey
            ? { ...b, balance: +(b.balance + delta).toFixed(2) }
            : b
        );
      }

      const { bms: recalcedBms, totalCash } = recalc({ ...s, legs, bms });
      persist({ ...s, legs, bms: recalcedBms });
      return { legs, bms: recalcedBms, totalCash };
    });
  },

  deleteLeg(id) {
    set(s => {
      const leg = s.legs.find(l => l.id === id);

      // Refund stake if deleting a pending manual bet
      let bms = [...s.bms];
      if (leg && leg.re === 'Pendente' && leg.source !== 'import') {
        const bmKey = normHouse(leg.ho).toLowerCase();
        bms = bms.map(b =>
          normHouse(b.name).toLowerCase() === bmKey
            ? { ...b, balance: +(b.balance + leg.st).toFixed(2) }
            : b
        );
      }

      const legs = s.legs.filter(l => l.id !== id);
      const { bms: recalcedBms, totalCash } = recalc({ ...s, legs, bms });
      persist({ ...s, legs, bms: recalcedBms });
      return { legs, bms: recalcedBms, totalCash };
    });
  },

  // ── commitImport ──────────────────────────────────────────────────────────
  commitImport(result) {
    set(s => {
      const legs = [...s.legs, ...result.newLegs];

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
      // adjust initial_balance + balance: deposito = +amount, saque = -amount
      const bms = s.bms.map(b => {
        if (b.id !== bmId) return b;
        const delta = tx.type === 'deposito' ? tx.amount : tx.type === 'saque' ? -tx.amount : 0;
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

  toast(msg, type = 'info') {
    const id = ++toastSeq;
    set(s => ({ toasts: [...s.toasts, { id, message: msg, type }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast(id) {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },
}));
