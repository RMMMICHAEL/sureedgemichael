/**
 * db.ts
 * Typed localStorage persistence layer.
 * All reads/writes go through this module — never access localStorage directly.
 */

import type { AppDB, OnboardingStep } from '@/types';

const VER = 'se_v5_';

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(VER + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VER + key, JSON.stringify(value));
  } catch (e) {
    console.warn('[db] localStorage write failed:', e);
  }
}

// ── Initial empty DB ─────────────────────────────────────────────────────────

export const EMPTY_DB: AppDB = {
  legs:             [],
  bms:              [],
  banks:            [],
  expenses:         [],
  partnerAccounts:  [],
  clients:          [],
  targetHouses:     [],
  import_log:       [],
  onboarding_done:  false,
  onboarding_step:  'bookmakers',
  notes:            [],
  operators:        [],
  transfers:        [],
  balanceModelV3:   true,
};

// ── Load entire DB from localStorage ────────────────────────────────────────

export function loadDB(): AppDB {
  return {
    legs:            load('legs',            []),
    bms:             load('bms',             []),
    banks:           load('banks',           []),
    expenses:        load('expenses',        []),
    partnerAccounts: load('partnerAccounts', []),
    clients:         load('clients',         []),
    targetHouses:    load('targetHouses',    []),
    import_log:      load('import_log',      []),
    onboarding_done: load('onboarding_done', false),
    onboarding_step: load('onboarding_step', 'bookmakers' as OnboardingStep),
    sheetSync:           load('sheetSync',           undefined),
    excludedImportKeys:  load('excludedImportKeys',  [] as string[]),
    profile:             load('profile',             undefined),
    notes:               load('notes',               []),
    operators:           load('operators',           []),
    transfers:           load('transfers',           []),
    seedIds:             load('seedIds',             undefined),
    balanceModelV3:      load('balanceModelV3',      undefined),
  };
}

// ── Persist entire DB ────────────────────────────────────────────────────────

export function persistDB(db: AppDB): void {
  save('legs',            db.legs);
  save('bms',             db.bms);
  save('banks',           db.banks);
  save('expenses',        db.expenses);
  save('partnerAccounts', db.partnerAccounts);
  save('clients',         db.clients);
  save('targetHouses',    db.targetHouses);
  save('import_log',      db.import_log);
  save('onboarding_done', db.onboarding_done);
  save('onboarding_step', db.onboarding_step);
  // Sempre persiste notes e operators — nunca devem ficar só no Supabase
  save('notes',     db.notes     ?? []);
  save('operators', db.operators ?? []);
  if (db.sheetSync) save('sheetSync', db.sheetSync);
  if (db.excludedImportKeys) save('excludedImportKeys', db.excludedImportKeys);
  if (db.profile    !== undefined) save('profile',    db.profile);
  if (db.transfers  !== undefined) save('transfers',  db.transfers);
  if (db.seedIds         !== undefined) save('seedIds',         db.seedIds);
  if (db.balanceModelV3  !== undefined) save('balanceModelV3',  db.balanceModelV3);
}

// ── User ID (guards against cross-account localStorage leaks) ───────────────

const USER_ID_KEY = VER + 'userId';

export function loadUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ID_KEY);
}

export function saveUserId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_ID_KEY, id);
}

// ── Wipe all data (for testing / reset) ────────────────────────────────────

export function wipeDB(): void {
  if (typeof window === 'undefined') return;
  ['legs','bms','banks','expenses','partnerAccounts','clients','targetHouses',
   'import_log','onboarding_done','onboarding_step','sheetSync',
   'excludedImportKeys','profile','notes','operators','transfers','userId','seedIds',
  ].forEach(k => localStorage.removeItem(VER + k));
}
