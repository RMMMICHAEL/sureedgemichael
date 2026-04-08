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
  Client, PurchasedAccount, UserProfile,
} from '@/types';
import { loadDB, persistDB } from '@/lib/storage/db';
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

  // Derived (computed on mutation)
  totalCash: number;

  // Actions — DB
  init:            () => void;
  addLeg:          (leg: Leg) => void;
  updateLeg:       (id: string, patch: Partial<Leg>) => void;
  deleteLeg:       (id: string) => void;
  commitImport:    (result: CommitResult) => void;
  addBookmaker:    (bm: Omit<Bookmaker, 'id' | 'balance' | 'ops'>) => void;
  updateBookmaker: (id: string, patch: Partial<Bookmaker>) => void;
  deleteBookmaker: (id: string) => void;
  addBank:         (bank: Omit<Bank, 'id'>) => void;
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
  addExcludedImportKeys: (keys: string[]) => void;

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
  excludedImportKeys:  [],
  totalCash:           0,
  initialized:         false,
  view:             'dash',
  dateFrom:         null,
  dateTo:           null,
  toasts:           [],
  importBuffer:     null,
  isSyncing:        false,

  // ── init ──────────────────────────────────────────────────────────────────
  init() {
    const db = loadDB();

    // Migration: legs saved before `source` field existed
    const legs = db.legs.map(l => ({
      ...l,
      source: l.source ?? (l.oid?.startsWith('imp_') ? 'import' : 'manual'),
    }));

    // Migration: ensure new fields exist in persisted data
    const expenses        = (db as AppDB).expenses        ?? [];
    const partnerAccounts = (db as AppDB).partnerAccounts ?? [];
    const clients         = (db as AppDB).clients         ?? [];
    const targetHouses    = (db as AppDB).targetHouses    ?? [];
    const sheetSync       = (db as AppDB).sheetSync;

    const excludedImportKeys = (db as AppDB).excludedImportKeys ?? [];
    const migrated = { ...db, legs, expenses, partnerAccounts, clients, targetHouses, sheetSync, excludedImportKeys };
    const { bms, totalCash } = recalc(migrated);
    set({ ...migrated, bms, totalCash, initialized: true });
  },

  // ── legs ──────────────────────────────────────────────────────────────────
  addLeg(leg) {
    set(s => {
      const legs = [...s.legs, { ...leg, pr: calcLegProfit(leg) }];
      const { bms, totalCash } = recalc({ ...s, legs });
      persistDB({ ...s, legs, bms });
      return { legs, bms, totalCash };
    });
  },

  updateLeg(id, patch) {
    set(s => {
      const legs = s.legs.map(l => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        updated.pr = calcLegProfit(updated);
        return updated;
      });
      const { bms, totalCash } = recalc({ ...s, legs });
      persistDB({ ...s, legs, bms });
      return { legs, bms, totalCash };
    });
  },

  deleteLeg(id) {
    set(s => {
      const legs = s.legs.filter(l => l.id !== id);
      const { bms, totalCash } = recalc({ ...s, legs });
      persistDB({ ...s, legs, bms });
      return { legs, bms, totalCash };
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

      persistDB({ ...s, legs, bms, import_log, sheetSync });
      return { legs, bms, totalCash: recalced.totalCash, import_log, sheetSync };
    });
  },

  // ── bookmakers ───────────────────────────────────────────────────────────
  addBookmaker(bm) {
    set(s => {
      const newBM: Bookmaker = {
        ...bm,
        id:      `bm_${Date.now()}`,
        balance: bm.initial_balance,
        ops:     0,
      };
      const bms = recalcBookmakers([...s.bms, newBM], s.legs);
      const totalCash = [...bms.map(b => b.balance), ...s.banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      persistDB({ ...s, bms });
      return { bms, totalCash };
    });
  },

  updateBookmaker(id, patch) {
    set(s => {
      const bms = recalcBookmakers(
        s.bms.map(b => b.id === id ? { ...b, ...patch } : b),
        s.legs
      );
      const totalCash = [...bms.map(b => b.balance), ...s.banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      persistDB({ ...s, bms });
      return { bms, totalCash };
    });
  },

  deleteBookmaker(id) {
    set(s => {
      const bms = s.bms.filter(b => b.id !== id);
      persistDB({ ...s, bms });
      return { bms };
    });
  },

  // ── banks ────────────────────────────────────────────────────────────────
  addBank(bank) {
    set(s => {
      const banks = [...s.banks, { ...bank, id: `bank_${Date.now()}` }];
      persistDB({ ...s, banks });
      const totalCash = [...s.bms.map(b => b.balance), ...banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      return { banks, totalCash };
    });
  },

  deleteBank(id) {
    set(s => {
      const banks = s.banks.filter(b => b.id !== id);
      persistDB({ ...s, banks });
      const totalCash = [...s.bms.map(b => b.balance), ...banks.map(b => b.balance)].reduce((a, v) => a + v, 0);
      return { banks, totalCash };
    });
  },

  // ── expenses ─────────────────────────────────────────────────────────────
  addExpense(expense) {
    set(s => {
      const expenses = [...s.expenses, { ...expense, id: `exp_${Date.now()}` }];
      persistDB({ ...s, expenses });
      return { expenses };
    });
  },

  updateExpense(id, patch) {
    set(s => {
      const expenses = s.expenses.map(e => e.id === id ? { ...e, ...patch } : e);
      persistDB({ ...s, expenses });
      return { expenses };
    });
  },

  deleteExpense(id) {
    set(s => {
      const expenses = s.expenses.filter(e => e.id !== id);
      persistDB({ ...s, expenses });
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
      persistDB({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  updatePartnerAccount(id, patch) {
    set(s => {
      const partnerAccounts = s.partnerAccounts.map(a => a.id === id ? { ...a, ...patch } : a);
      persistDB({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  deletePartnerAccount(id) {
    set(s => {
      const partnerAccounts = s.partnerAccounts.filter(a => a.id !== id);
      persistDB({ ...s, partnerAccounts });
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
      persistDB({ ...s, partnerAccounts });
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
      persistDB({ ...s, partnerAccounts });
      return { partnerAccounts };
    });
  },

  // ── client / account purchase management ─────────────────────────────────
  addClient(client) {
    set(s => {
      const newClient: Client = { ...client, id: `cli_${Date.now()}`, purchasedAccounts: [] };
      const clients = [...s.clients, newClient];
      persistDB({ ...s, clients });
      return { clients };
    });
  },

  updateClient(id, patch) {
    set(s => {
      const clients = s.clients.map(c => c.id === id ? { ...c, ...patch } : c);
      persistDB({ ...s, clients });
      return { clients };
    });
  },

  deleteClient(id) {
    set(s => {
      const clients = s.clients.filter(c => c.id !== id);
      persistDB({ ...s, clients });
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

      persistDB({ ...s, clients, expenses });
      return { clients, expenses };
    });
  },

  updatePurchasedAccount(clientId, accId, patch) {
    set(s => {
      const clients = s.clients.map(c => {
        if (c.id !== clientId) return c;
        return { ...c, purchasedAccounts: c.purchasedAccounts.map(a => a.id === accId ? { ...a, ...patch } : a) };
      });
      persistDB({ ...s, clients });
      return { clients };
    });
  },

  deletePurchasedAccount(clientId, accId) {
    set(s => {
      const clients = s.clients.map(c => {
        if (c.id !== clientId) return c;
        return { ...c, purchasedAccounts: c.purchasedAccounts.filter(a => a.id !== accId) };
      });
      persistDB({ ...s, clients });
      return { clients };
    });
  },

  setTargetHouses(houses) {
    set(s => {
      persistDB({ ...s, targetHouses: houses });
      return { targetHouses: houses };
    });
  },

  // ── sheet sync ────────────────────────────────────────────────────────────
  setSheetSync(cfg) {
    set(s => {
      persistDB({ ...s, sheetSync: cfg });
      return { sheetSync: cfg };
    });
  },

  setSyncing(v) {
    set({ isSyncing: v });
  },

  addExcludedImportKeys(keys) {
    set(s => {
      const existing = new Set(s.excludedImportKeys ?? []);
      keys.forEach(k => existing.add(k));
      const excludedImportKeys = Array.from(existing);
      persistDB({ ...s, excludedImportKeys });
      return { excludedImportKeys };
    });
  },

  // ── profile ──────────────────────────────────────────────────────────────
  updateProfile(patch) {
    set(s => {
      const profile = { ...(s.profile ?? { name: '', email: '', phone: '' }), ...patch };
      persistDB({ ...s, profile });
      return { profile };
    });
  },

  // ── onboarding ───────────────────────────────────────────────────────────
  completeOnboardingStep(step) {
    set(s => {
      persistDB({ ...s, onboarding_step: step });
      return { onboarding_step: step };
    });
  },

  finishOnboarding() {
    set(s => {
      persistDB({ ...s, onboarding_done: true, onboarding_step: 'done' });
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
