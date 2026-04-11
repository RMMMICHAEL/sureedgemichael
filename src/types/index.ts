// ═══════════════════════════════════════════════════════
// CORE DOMAIN TYPES
// ═══════════════════════════════════════════════════════

export type ResultType =
  | 'Green'
  | 'Red'
  | 'Meio Green'
  | 'Meio Red'
  | 'Devolvido'
  | 'Cashout'
  | 'Green Antecipado'
  | 'Pendente';

export type SignalType = 'live' | 'pre';

export type OpType = 'surebet' | 'delay' | 'duplo_green' | 'outros';

export type AnomalyLevel = 'light' | 'medium' | 'critical';

export interface AnomalyFlag {
  code: string;
  level: AnomalyLevel;
  message: string;
}

// ── Betting leg (a single bet within an operation) ──────
export interface Leg {
  id: string;
  oid: string;           // operation id — legs sharing same oid = one operation
  bd: string;            // bet date (ISO 8601)
  ed: string;            // event date (ISO 8601)
  sp: string;            // sport
  ev: string;            // event name
  ho: string;            // house / bookmaker (normalised)
  mk: string;            // market
  od: number;            // odds
  st: number;            // stake (R$)
  pc: number;            // percentage as imported from sheet (e.g. 4.79 = 4.79%)
  re: ResultType;
  pr: number;            // profit (calculated, not from sheet)
  fl: AnomalyFlag[];
  signal?: SignalType;
  opType?: OpType;          // operation type (default: 'surebet')
  manualProfit?: number;    // for delay/duplo_green/outros — overrides calculated profit
  cashoutValue?: number;    // when result = 'Cashout', the amount received (replaces normal profit calc)
  /**
   * 'import' = dado histórico importado da planilha → NÃO afeta saldo das casas.
   * 'manual' ou undefined = operação registrada manualmente → afeta saldo.
   */
  source?: 'manual' | 'import';
}

// ── Operation (one or more legs grouped together) ───────
export interface Operation {
  id: string;
  legs: Leg[];
  sport: string;
  event: string;
  bet_date: string;
  signal: SignalType;
  profit: number;
  pending: boolean;
  hasFlag: boolean;
}

// ── Bookmaker credentials (optional login storage) ───────
export interface BookmakerCredentials {
  username: string;
  password: string;
  notes?: string;
}

// ── Bookmaker account ────────────────────────────────────
export interface Bookmaker {
  id: string;
  name: string;
  abbr: string;
  color: string;
  initial_balance: number;  // set manually by user during onboarding
  balance: number;          // calculated: initial_balance + sum of settled profits
  status: 'ativa' | 'inativa' | 'limitada';
  notes: string;
  ops: number;
  credentials?: BookmakerCredentials;
}

// ── Bank account ─────────────────────────────────────────
export interface Bank {
  id: string;
  name: string;
  balance: number;
  notes: string;
}

// ── Expense ──────────────────────────────────────────────
export type ExpenseCategory =
  | 'Assinatura'
  | 'Saque'
  | 'Deposito'
  | 'Multilogin'
  | 'Conta'
  | 'Software'
  | 'Outros';

export interface Expense {
  id: string;
  date: string;        // ISO 8601
  category: ExpenseCategory | string;
  description: string;
  amount: number;      // R$ (always positive — represents a cost)
  notes?: string;
  recurring?: boolean; // if true, shown as fixed monthly expense
}

// ── Partner account control ──────────────────────────────
export interface AccountTransaction {
  id: string;
  date: string;        // ISO 8601
  type: 'deposito' | 'saque';
  house: string;       // bookmaker name
  amount: number;      // R$
  notes?: string;
}

export interface PartnerAccount {
  id: string;
  owner: string;                    // e.g. "João", "Maria"
  houses: string[];                 // bookmakers used with this account
  status: 'ativa' | 'inativa' | 'pausada' | 'precisa_sacar';
  totalDeposited: number;           // sum of all deposits
  totalWithdrawn: number;           // sum of all withdrawals
  taxThreshold: number;             // alert threshold (default R$ 60.000)
  notes?: string;
  transactions: AccountTransaction[];
}

// ── Account purchase management ──────────────────────────
export interface PurchasedAccount {
  id: string;
  house: string;           // bookmaker name
  purchaseDate: string;    // ISO date
  cost: number;            // R$ paid
  status: 'ativa' | 'inativa' | 'suspensa';
  notes?: string;
}

export interface Client {
  id: string;
  name: string;
  cpf?: string;
  notes?: string;
  status: 'ativo' | 'inativo';
  purchasedAccounts: PurchasedAccount[];
}

// ── Google Sheets sync config ────────────────────────────
export interface SheetSync {
  url: string;              // original URL pasted by user
  sheetId: string;          // extracted from URL
  gid: string;              // sheet tab gid (default '0')
  lastSync: string;         // ISO timestamp of last successful sync
  autoSync: boolean;        // sync automatically on app open
  intervalMin: number;      // auto-sync interval in minutes (0 = manual only)
  historyImported?: boolean; // true after first full-history import; subsequent syncs use currentMonthOnly
}

// ── Import pipeline ──────────────────────────────────────
export interface ImportRow {
  bd: string;
  ed: string;
  sp: string;
  ev: string;
  ho: string;
  mk: string;
  od: number;
  st: number;
  /** Parsed percentage, always in "display" scale: 4.79 means 4.79% */
  pc: number;
  re: ResultType;
  lucro_raw: unknown;    // raw profit cell, used for divergence check
  sheet: string;
  flags: AnomalyFlag[];
}

export type DivergenceLevel = 'none' | 'light' | 'medium' | 'critical';

export interface PctAnalysis {
  imported: number;        // value from sheet (e.g. 4.79)
  calculated: number;      // derived from odd/stake (e.g. 5.10)
  divergence: number;      // absolute diff
  divergenceLevel: DivergenceLevel;
}

// ── Import log entry ─────────────────────────────────────
export interface ImportLog {
  ts: string;
  filename: string;
  imported: number;
  dupes: number;
  anomalies: number;
  total: number;
  month: string;           // YYYY-MM
}

// ── Onboarding state ─────────────────────────────────────
export type OnboardingStep = 'bookmakers' | 'import_choice' | 'done';

// ── Full app database ────────────────────────────────────
export interface AppDB {
  legs: Leg[];
  bms: Bookmaker[];
  banks: Bank[];
  expenses: Expense[];
  partnerAccounts: PartnerAccount[];
  clients: Client[];
  targetHouses: string[];   // houses the operator wants to have accounts for
  import_log: ImportLog[];
  onboarding_done: boolean;
  onboarding_step: OnboardingStep;
  sheetSync?: SheetSync;
  profile?: UserProfile;
  /**
   * Set of "ho|mk|bd.slice(0,16)" keys for import rows manually
   * edited/overridden. commitRows() skips these on re-import.
   */
  excludedImportKeys?: string[];
}

// ── User profile ─────────────────────────────────────────
export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  avatarDataUrl?: string;   // base64 data URL of profile photo
  role?: string;            // e.g. "Apostador", "Gerente"
}

// ── View / navigation ────────────────────────────────────
export type ViewId =
  | 'dash'
  | 'ops'
  | 'bm'
  | 'caixa'
  | 'gastos'
  | 'contas'
  | 'analise'
  | 'admin'
  | 'perfil';
