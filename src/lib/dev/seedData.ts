/**
 * seedData.ts — dados fictícios para gravação de tutoriais.
 * Chame loadSeedData() para popular o store com dados demo.
 * Chame clearSeedData() para remover tudo.
 */

import { useStore } from '@/store/useStore';
import type { Leg, Bookmaker, Bank, Expense, PartnerAccount, Client } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function iso(y: number, m: number, d: number, h = 15, min = 0) {
  return new Date(y, m - 1, d, h, min).toISOString().slice(0, 16);
}

function pr(re: string, st: number, od: number): number {
  if (re === 'Green' || re === 'Green Antecipado') return +(st * (od - 1)).toFixed(2);
  if (re === 'Meio Green') return +(st * (od - 1) * 0.5).toFixed(2);
  if (re === 'Red') return -st;
  if (re === 'Meio Red') return +(-st * 0.5).toFixed(2);
  return 0;
}

function pc2(od1: number, od2: number) {
  const m = 1 / od1 + 1 / od2;
  return +((1 - m) / m * 100).toFixed(2);
}

function pc3(od1: number, od2: number, od3: number) {
  const m = 1 / od1 + 1 / od2 + 1 / od3;
  return +((1 - m) / m * 100).toFixed(2);
}

// ── IDs compartilhados para limpeza ───────────────────────────────────────────
// These module-level arrays reset on every page load, so we also persist them
// to localStorage so clearSeedData() works after a reload.

export const SEED_LEG_IDS: string[] = [];
export const SEED_BM_IDS:  string[] = [];
export const SEED_BANK_IDS: string[] = [];
export const SEED_EXP_IDS: string[] = [];
export const SEED_PA_IDS:  string[] = [];
export const SEED_CLI_IDS: string[] = [];

const SEED_STORAGE_KEY = 'se_v5_seed_ids';

function saveSeedIds() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify({
      legs: SEED_LEG_IDS,
      bms:  SEED_BM_IDS,
      banks: SEED_BANK_IDS,
      exps: SEED_EXP_IDS,
      pas:  SEED_PA_IDS,
      clis: SEED_CLI_IDS,
    }));
  } catch { /* ignore */ }
}

function loadSeedIds() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SEED_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, string[]>;
    if (SEED_LEG_IDS.length  === 0 && saved.legs?.length)  SEED_LEG_IDS.push(...saved.legs);
    if (SEED_BM_IDS.length   === 0 && saved.bms?.length)   SEED_BM_IDS.push(...saved.bms);
    if (SEED_BANK_IDS.length === 0 && saved.banks?.length)  SEED_BANK_IDS.push(...saved.banks);
    if (SEED_EXP_IDS.length  === 0 && saved.exps?.length)  SEED_EXP_IDS.push(...saved.exps);
    if (SEED_PA_IDS.length   === 0 && saved.pas?.length)   SEED_PA_IDS.push(...saved.pas);
    if (SEED_CLI_IDS.length  === 0 && saved.clis?.length)  SEED_CLI_IDS.push(...saved.clis);
  } catch { /* ignore */ }
}

function clearSeedIds() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(SEED_STORAGE_KEY); } catch { /* ignore */ }
}

// ── Legs ─────────────────────────────────────────────────────────────────────

function makeLegs(): Leg[] {
  const legs: Leg[] = [];

  const HOUSES = ['Bet365','Betano','Pinnacle','Betfair','KTO','Betsson','Sportingbet','1xBet','Betway','Novibet'];
  const SPORTS  = ['Futebol','Futebol','Futebol','Tênis','Basquete','Basquete','Voleibol','Futebol Americano','Tênis','Futebol'];

  // Seeded RNG for deterministic output
  let _seed = 12345;
  function rnd() { _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff; return _seed / 0x7fffffff; }
  function rndRange(min: number, max: number) { return min + rnd() * (max - min); }

  let globalIdx = 0;

  function addDay(y: number, m: number, d: number, count: number) {
    const dayKey = `${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`;
    for (let i = 0; i < count; i++) {
      const h   = Math.floor(rndRange(9, 22));
      const min = Math.floor(rndRange(0, 59));
      const bd  = iso(y, m, d, h, min);
      const ed  = iso(y, m, d, h + 1, 30);
      const sp  = SPORTS[globalIdx % SPORTS.length];
      const oid = `seed_bulk_${dayKey}_${i}`;
      const odA = +rndRange(2.05, 2.25).toFixed(3);
      const odB = +rndRange(2.05, 2.25).toFixed(3);
      const pct = pc2(odA, odB);
      legs.push({
        id: `seed_bulk_${dayKey}_${i}_a`,
        oid, bd, ed, sp, ev: '',
        ho: HOUSES[globalIdx % HOUSES.length],
        mk: 'Casa',
        od: odA, st: 100, pc: pct,
        re: 'Green',
        pr: +(100 * (odA - 1)).toFixed(2),
        fl: [], source: 'manual', signal: 'pre', opType: 'surebet',
      });
      legs.push({
        id: `seed_bulk_${dayKey}_${i}_b`,
        oid, bd, ed, sp, ev: '',
        ho: HOUSES[(globalIdx + 1) % HOUSES.length],
        mk: 'Fora',
        od: odB, st: 95, pc: pct,
        re: 'Red',
        pr: -95,
        fl: [], source: 'manual', signal: 'pre', opType: 'surebet',
      });
      globalIdx++;
    }
  }

  // ── Feb 2026: 5 ops/day ──────────────────────────────────────────────────
  for (let d = 1; d <= 28; d++) addDay(2026, 2, d, 5);

  // ── Mar 2026: 8 ops/day ──────────────────────────────────────────────────
  for (let d = 1; d <= 31; d++) addDay(2026, 3, d, 8);

  // ── Apr 2026: 12 ops/day for 1-27, 20/day for 28-30 ─────────────────────
  for (let d = 1; d <= 27; d++) addDay(2026, 4, d, 12);
  for (let d = 28; d <= 30; d++) addDay(2026, 4, d, 20);

  // ── May 2026: 25 ops/day ─────────────────────────────────────────────────
  addDay(2026, 5, 1, 25);
  addDay(2026, 5, 2, 25);
  addDay(2026, 5, 3, 25);
  addDay(2026, 5, 4, 25);

  // ── Bonus legs ────────────────────────────────────────────────────────────
  legs.push({
    id: 'seed_delay01', oid: 'seed_delay01', bd: iso(2026,3,10,14,0), ed: iso(2026,3,10,14,0),
    sp: 'Futebol', ev: 'Bônus Boas-Vindas Bet365', ho: 'Bet365', mk: 'Bônus',
    od: 0, st: 0, pc: 0, re: 'Green', pr: 350, fl: [], source: 'manual',
    signal: 'pre', opType: 'outros', manualProfit: 350,
  });
  legs.push({
    id: 'seed_delay02', oid: 'seed_delay02', bd: iso(2026,3,25,10,0), ed: iso(2026,3,25,10,0),
    sp: 'Futebol', ev: 'Freebet KTO', ho: 'KTO', mk: 'Freebet',
    od: 0, st: 0, pc: 0, re: 'Green', pr: 180, fl: [], source: 'manual',
    signal: 'pre', opType: 'outros', manualProfit: 180,
  });

  SEED_LEG_IDS.length = 0;
  legs.forEach(l => SEED_LEG_IDS.push(l.id));
  return legs;
}

// ── Bookmakers ────────────────────────────────────────────────────────────────

function makeBMs(): Omit<Bookmaker, 'id' | 'balance' | 'ops'>[] {
  return [
    { name: 'Bet365',     abbr: 'B365',  color: '#1a7a1a', initial_balance: 2500, status: 'ativa',    notes: 'Principal. Odds altas em futebol europeu.' },
    { name: 'Betano',     abbr: 'BTN',   color: '#e63946', initial_balance: 1800, status: 'ativa',    notes: 'Boa liquidez. Veloz no saque.' },
    { name: 'KTO',        abbr: 'KTO',   color: '#f4a261', initial_balance: 1200, status: 'ativa',    notes: 'Bom para basquete e tênis.' },
    { name: 'Betsson',    abbr: 'BSN',   color: '#457b9d', initial_balance: 900,  status: 'limitada', notes: 'Atenção: conta limitada após 3 greens seguidos.' },
    { name: 'Pinnacle',   abbr: 'PIN',   color: '#6a0572', initial_balance: 3200, status: 'ativa',    notes: 'Maior limite de aposta. Odds competitivas.' },
    { name: 'Sportingbet',abbr: 'SPB',   color: '#2b9348', initial_balance: 600,  status: 'ativa',    notes: 'Bônus de recarga semanal.' },
    { name: '1xbet',      abbr: '1XB',   color: '#023e8a', initial_balance: 400,  status: 'inativa',  notes: 'Conta inativa. Aguardando nova conta.' },
  ];
}

// ── Banks ─────────────────────────────────────────────────────────────────────

function makeBanks(): Omit<Bank, 'id'>[] {
  return [
    { name: 'Nubank',   balance: 9200, notes: 'Conta principal de movimentação.' },
    { name: 'Bradesco', balance: 3800, notes: 'Saques das casas internacionais.' },
    { name: 'Inter',    balance: 2100, notes: 'Reserva operacional.' },
  ];
}

// ── Expenses ──────────────────────────────────────────────────────────────────

function makeExpenses(): Omit<Expense, 'id'>[] {
  return [
    { date: iso(2026,2,1),  category: 'Software',     description: 'Multilogin — plano profissional', amount: 120,  recurring: true },
    { date: iso(2026,2,1),  category: 'Software',     description: 'VPN NordVPN — 1 mês',             amount: 45,   recurring: true },
    { date: iso(2026,2,5),  category: 'Saque',        description: 'Saque Bet365 → Nubank',           amount: 1200, recurring: false },
    { date: iso(2026,2,14), category: 'Deposito',     description: 'Depósito inicial Betsson',        amount: 500,  recurring: false },
    { date: iso(2026,3,1),  category: 'Software',     description: 'Multilogin — plano profissional', amount: 120,  recurring: true },
    { date: iso(2026,3,1),  category: 'Software',     description: 'VPN NordVPN — 1 mês',             amount: 45,   recurring: true },
    { date: iso(2026,3,10), category: 'Conta',        description: 'Compra conta verificada Betano',  amount: 80,   recurring: false },
    { date: iso(2026,3,18), category: 'Saque',        description: 'Saque KTO → Bradesco',            amount: 800,  recurring: false },
    { date: iso(2026,4,1),  category: 'Software',     description: 'Multilogin — plano profissional', amount: 120,  recurring: true },
    { date: iso(2026,4,1),  category: 'Software',     description: 'VPN NordVPN — 1 mês',             amount: 45,   recurring: true },
    { date: iso(2026,4,8),  category: 'Deposito',     description: 'Recarga Pinnacle',                amount: 1000, recurring: false },
    { date: iso(2026,4,15), category: 'Assinatura',   description: 'SureEdge Pro — mensal',           amount: 99,   recurring: true },
    { date: iso(2026,5,1),  category: 'Software',     description: 'Multilogin — plano profissional', amount: 120,  recurring: true },
    { date: iso(2026,5,1),  category: 'Software',     description: 'VPN NordVPN — 1 mês',             amount: 45,   recurring: true },
    { date: iso(2026,5,1),  category: 'Assinatura',   description: 'SureEdge Pro — mensal',           amount: 99,   recurring: true },
  ];
}

// ── Partner accounts ──────────────────────────────────────────────────────────

function makePAs(): Omit<PartnerAccount, 'id' | 'totalDeposited' | 'totalWithdrawn'>[] {
  return [
    {
      owner: 'João Silva',
      houses: ['Bet365', 'Betano', 'KTO'],
      status: 'ativa',
      taxThreshold: 60000,
      notes: 'Parceiro principal. Contas em ótimo estado.',
      transactions: [
        { id: 'seed_tx_j1', date: iso(2026,2,10), type: 'deposito', house: 'Bet365', amount: 500, notes: 'Depósito inicial' },
        { id: 'seed_tx_j2', date: iso(2026,2,20), type: 'deposito', house: 'Betano', amount: 400, notes: '' },
        { id: 'seed_tx_j3', date: iso(2026,3,5),  type: 'saque',   house: 'Bet365', amount: 650, notes: 'Saque mensal' },
        { id: 'seed_tx_j4', date: iso(2026,3,15), type: 'deposito', house: 'KTO',   amount: 300, notes: '' },
        { id: 'seed_tx_j5', date: iso(2026,4,2),  type: 'saque',   house: 'Betano', amount: 480, notes: '' },
      ],
    },
    {
      owner: 'Maria Santos',
      houses: ['Pinnacle', 'Betsson'],
      status: 'ativa',
      taxThreshold: 60000,
      notes: 'Foco em futebol europeu. Limite alto na Pinnacle.',
      transactions: [
        { id: 'seed_tx_m1', date: iso(2026,2,12), type: 'deposito', house: 'Pinnacle', amount: 800, notes: 'Depósito inicial' },
        { id: 'seed_tx_m2', date: iso(2026,3,1),  type: 'deposito', house: 'Betsson',  amount: 300, notes: '' },
        { id: 'seed_tx_m3', date: iso(2026,3,20), type: 'saque',    house: 'Pinnacle', amount: 900, notes: 'Lucros do mês' },
        { id: 'seed_tx_m4', date: iso(2026,4,5),  type: 'deposito', house: 'Pinnacle', amount: 600, notes: 'Recarga' },
      ],
    },
    {
      owner: 'Pedro Alves',
      houses: ['Sportingbet'],
      status: 'precisa_sacar',
      taxThreshold: 60000,
      notes: 'Acumulou R$1.800 na conta. Precisa sacar antes do mês fechar.',
      transactions: [
        { id: 'seed_tx_p1', date: iso(2026,2,8),  type: 'deposito', house: 'Sportingbet', amount: 400, notes: '' },
        { id: 'seed_tx_p2', date: iso(2026,3,8),  type: 'deposito', house: 'Sportingbet', amount: 400, notes: '' },
        { id: 'seed_tx_p3', date: iso(2026,4,8),  type: 'deposito', house: 'Sportingbet', amount: 400, notes: '' },
      ],
    },
  ];
}

// ── Clients ───────────────────────────────────────────────────────────────────

function makeClients(): Omit<Client, 'id'>[] {
  return [
    {
      name: 'Carlos Pereira',
      cpf: '123.456.789-00',
      status: 'ativo',
      notes: 'Cliente desde fev/26. Paga em dia.',
      purchasedAccounts: [
        { id: 'seed_ca_c1', house: 'Bet365',  purchaseDate: iso(2026,2,3),  cost: 120, status: 'ativa',   notes: '' },
        { id: 'seed_ca_c2', house: 'Betano',  purchaseDate: iso(2026,2,3),  cost: 80,  status: 'ativa',   notes: '' },
        { id: 'seed_ca_c3', house: 'KTO',     purchaseDate: iso(2026,3,10), cost: 60,  status: 'suspensa', notes: 'Conta suspensa após verificação KYC' },
      ],
    },
    {
      name: 'Ana Costa',
      cpf: '987.654.321-00',
      status: 'ativo',
      notes: 'Boa parceira. Entrega documentos sempre no prazo.',
      purchasedAccounts: [
        { id: 'seed_ca_a1', house: 'Pinnacle', purchaseDate: iso(2026,2,15), cost: 150, status: 'ativa', notes: 'Alta precisão' },
        { id: 'seed_ca_a2', house: 'Betsson',  purchaseDate: iso(2026,3,1),  cost: 90,  status: 'ativa', notes: '' },
      ],
    },
    {
      name: 'Rafael Lima',
      cpf: '456.789.123-00',
      status: 'inativo',
      notes: 'Inativo desde março. Não renovou contrato.',
      purchasedAccounts: [
        { id: 'seed_ca_r1', house: 'Sportingbet', purchaseDate: iso(2026,2,1), cost: 50, status: 'inativa', notes: 'Encerrada' },
      ],
    },
    {
      name: 'Fernanda Oliveira',
      cpf: '321.654.987-00',
      status: 'ativo',
      notes: 'Novo cliente. Aprovado em abr/26.',
      purchasedAccounts: [
        { id: 'seed_ca_f1', house: 'Bet365',  purchaseDate: iso(2026,4,5), cost: 120, status: 'ativa', notes: '' },
        { id: 'seed_ca_f2', house: 'Betano',  purchaseDate: iso(2026,4,5), cost: 80,  status: 'ativa', notes: '' },
      ],
    },
  ];
}

// ── Load / Clear ──────────────────────────────────────────────────────────────

export function loadSeedData() {
  const store = useStore.getState();

  // Legs — single state update to avoid N re-renders
  store.bulkAddLegs(makeLegs());

  // Bookmakers
  makeBMs().forEach(bm => store.addBookmaker(bm));

  // Banks
  makeBanks().forEach(bank => store.addBank(bank));

  // Expenses
  makeExpenses().forEach(exp => store.addExpense(exp));

  // Partner accounts
  makePAs().forEach(pa => store.addPartnerAccount(pa));

  // Clients
  makeClients().forEach(cli => store.addClient(cli));

  // Capture IDs for cleanup (BMs, banks, expenses, PAs, clients are added by the store with auto-ids)
  const state = useStore.getState();

  SEED_BM_IDS.length = 0;
  state.bms.filter(b => makeBMs().map(x => x.name).includes(b.name))
    .forEach(b => SEED_BM_IDS.push(b.id));

  SEED_BANK_IDS.length = 0;
  state.banks.filter(b => ['Nubank','Bradesco','Inter'].includes(b.name))
    .forEach(b => SEED_BANK_IDS.push(b.id));

  SEED_EXP_IDS.length = 0;
  state.expenses.filter(e => e.description.startsWith('Multilogin') || e.description.startsWith('VPN') ||
    e.description.startsWith('Saque') || e.description.startsWith('Depósito') ||
    e.description.startsWith('Compra conta') || e.description.startsWith('Recarga') ||
    e.description.startsWith('SureEdge'))
    .forEach(e => SEED_EXP_IDS.push(e.id));

  SEED_PA_IDS.length = 0;
  state.partnerAccounts.filter(pa => ['João Silva','Maria Santos','Pedro Alves'].includes(pa.owner))
    .forEach(pa => SEED_PA_IDS.push(pa.id));

  SEED_CLI_IDS.length = 0;
  state.clients.filter(c => ['Carlos Pereira','Ana Costa','Rafael Lima','Fernanda Oliveira'].includes(c.name))
    .forEach(c => SEED_CLI_IDS.push(c.id));

  // Persist IDs to localStorage so clearSeedData() works after a page reload
  saveSeedIds();
}

export function clearSeedData() {
  // Restore IDs from localStorage in case the module was re-initialized by a page reload
  loadSeedIds();

  const store = useStore.getState();

  store.bulkDeleteLegs(SEED_LEG_IDS);
  SEED_BM_IDS.forEach(id => store.deleteBookmaker(id));
  SEED_BANK_IDS.forEach(id => store.deleteBank(id));
  SEED_EXP_IDS.forEach(id => store.deleteExpense(id));
  SEED_PA_IDS.forEach(id => store.deletePartnerAccount(id));
  SEED_CLI_IDS.forEach(id => store.deleteClient(id));

  SEED_LEG_IDS.length = 0;
  SEED_BM_IDS.length = 0;
  SEED_BANK_IDS.length = 0;
  SEED_EXP_IDS.length = 0;
  SEED_PA_IDS.length = 0;
  SEED_CLI_IDS.length = 0;

  // Remove persisted IDs from localStorage
  clearSeedIds();
}
