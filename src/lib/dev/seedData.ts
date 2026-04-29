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

export const SEED_LEG_IDS: string[] = [];
export const SEED_BM_IDS:  string[] = [];
export const SEED_BANK_IDS: string[] = [];
export const SEED_EXP_IDS: string[] = [];
export const SEED_PA_IDS:  string[] = [];
export const SEED_CLI_IDS: string[] = [];

// ── Legs ─────────────────────────────────────────────────────────────────────

function makeLegs(): Leg[] {
  const legs: Leg[] = [];

  // helper: surebet 2-pernas
  function sb2(
    oid: string, bd: string, ed: string, sp: string, ev: string,
    ho1: string, mk1: string, od1: number, st1: number, re1: string,
    ho2: string, mk2: string, od2: number, st2: number, re2: string,
  ) {
    const pct = pc2(od1, od2);
    legs.push({
      id: `seed_l_${oid}_a`, oid, bd, ed, sp, ev, ho: ho1, mk: mk1,
      od: od1, st: st1, pc: pct, re: re1 as never, pr: pr(re1, st1, od1),
      fl: [], source: 'manual', signal: 'pre', opType: 'surebet',
    });
    legs.push({
      id: `seed_l_${oid}_b`, oid, bd, ed, sp, ev, ho: ho2, mk: mk2,
      od: od2, st: st2, pc: pct, re: re2 as never, pr: pr(re2, st2, od2),
      fl: [], source: 'manual', signal: 'pre', opType: 'surebet',
    });
  }

  // helper: duplo green 3-pernas
  function dg3(
    oid: string, bd: string, ed: string, ev: string,
    ho1: string, od1: number, st1: number, re1: string,
    ho2: string, od2: number, st2: number, re2: string,
    ho3: string, od3: number, st3: number, re3: string,
  ) {
    const pct = pc3(od1, od2, od3);
    const LEG_MK = ['1', 'X', '2'];
    [[ho1, od1, st1, re1], [ho2, od2, st2, re2], [ho3, od3, st3, re3]].forEach(([ho, od, st, re], i) => {
      legs.push({
        id: `seed_l_${oid}_${i}`, oid, bd, ed, sp: 'Futebol', ev,
        ho: ho as string, mk: LEG_MK[i], od: od as number, st: st as number,
        pc: pct, re: re as never, pr: pr(re as string, st as number, od as number),
        fl: [], source: 'manual', signal: 'pre', opType: 'duplo_green',
      });
    });
  }

  // ── FEVEREIRO 2026 ───────────────────────────────────────────────────────

  sb2('seed_sb01',
    iso(2026,2,3,10,15), iso(2026,2,3,16,0), 'Futebol', 'Flamengo x Palmeiras',
    'Bet365',  'Casa', 2.05, 245, 'Green',
    'Betano',  'Fora', 2.10, 240, 'Red');

  sb2('seed_sb02',
    iso(2026,2,5,14,30), iso(2026,2,5,20,0), 'Futebol', 'Real Madrid x Barcelona',
    'KTO',     'Casa', 1.95, 260, 'Red',
    'Pinnacle','Fora', 2.20, 230, 'Green');

  sb2('seed_sb03',
    iso(2026,2,8,9,0), iso(2026,2,8,15,30), 'Futebol', 'Corinthians x Santos',
    'Betsson', 'Casa', 2.15, 235, 'Green',
    'Bet365',  'Fora', 2.00, 250, 'Red');

  sb2('seed_sb04',
    iso(2026,2,12,11,0), iso(2026,2,12,19,0), 'Basquete', 'Lakers x Celtics',
    'Betano',  'Casa', 1.88, 270, 'Green',
    'KTO',     'Fora', 2.30, 220, 'Red');

  sb2('seed_sb05',
    iso(2026,2,15,16,0), iso(2026,2,15,21,0), 'Futebol', 'PSG x Manchester City',
    'Pinnacle','Casa', 2.12, 238, 'Red',
    'Bet365',  'Fora', 2.06, 244, 'Red');

  sb2('seed_sb06',
    iso(2026,2,18,10,30), iso(2026,2,18,18,0), 'Futebol', 'Grêmio x Internacional',
    'Betsson', 'Casa', 1.92, 265, 'Green',
    'Betano',  'Fora', 2.25, 225, 'Red');

  sb2('seed_sb07',
    iso(2026,2,22,13,0), iso(2026,2,22,20,30), 'Tênis', 'Sinner x Alcaraz - ATP500',
    'KTO',     'Casa', 2.08, 243, 'Green',
    'Pinnacle','Fora', 2.00, 252, 'Red');

  dg3('seed_dg01',
    iso(2026,2,10,11,0), iso(2026,2,10,17,0), 'Atlético MG x Cruzeiro',
    'Bet365',  4.20, 120, 'Red',
    'Betano',  3.50, 143, 'Green Antecipado',
    'Betsson', 2.10, 238, 'Red');

  dg3('seed_dg02',
    iso(2026,2,20,9,30), iso(2026,2,20,16,0), 'Vasco x Botafogo',
    'Pinnacle',3.80, 132, 'Red',
    'Bet365',  3.30, 152, 'Red',
    'KTO',     2.05, 244, 'Green');

  // ── MARÇO 2026 ────────────────────────────────────────────────────────────

  sb2('seed_sb08',
    iso(2026,3,2,10,0), iso(2026,3,2,16,0), 'Futebol', 'Liverpool x Arsenal',
    'Bet365',  'Casa', 2.10, 240, 'Green',
    'Betano',  'Fora', 2.05, 245, 'Red');

  sb2('seed_sb09',
    iso(2026,3,5,11,15), iso(2026,3,5,20,45), 'Futebol', 'Fluminense x Flamengo',
    'KTO',     'Casa', 2.20, 230, 'Green',
    'Betsson', 'Fora', 1.95, 260, 'Red');

  sb2('seed_sb10',
    iso(2026,3,8,14,0), iso(2026,3,8,19,0), 'Basquete', 'Warriors x Bucks',
    'Pinnacle','Casa', 1.90, 268, 'Green',
    'Bet365',  'Fora', 2.28, 222, 'Red');

  sb2('seed_sb11',
    iso(2026,3,12,9,30), iso(2026,3,12,16,0), 'Futebol', 'Bayern x Dortmund',
    'Betano',  'Casa', 2.02, 250, 'Red',
    'KTO',     'Fora', 2.15, 235, 'Green');

  sb2('seed_sb12',
    iso(2026,3,15,13,0), iso(2026,3,15,21,30), 'Futebol', 'São Paulo x Corinthians',
    'Bet365',  'Casa', 2.07, 243, 'Green',
    'Pinnacle','Fora', 2.08, 242, 'Red');

  sb2('seed_sb13',
    iso(2026,3,18,11,0), iso(2026,3,18,18,0), 'Tênis', 'Djokovic x Medvedev - Masters',
    'Betsson', 'Casa', 1.85, 275, 'Meio Green',
    'Betano',  'Fora', 2.40, 210, 'Meio Red');

  sb2('seed_sb14',
    iso(2026,3,22,10,0), iso(2026,3,22,16,30), 'Futebol', 'Inter de Milão x Juventus',
    'KTO',     'Casa', 2.18, 232, 'Green',
    'Bet365',  'Fora', 2.00, 252, 'Red');

  sb2('seed_sb15',
    iso(2026,3,26,16,0), iso(2026,3,26,20,0), 'Futebol', 'Palmeiras x Santos',
    'Pinnacle','Casa', 1.97, 257, 'Green',
    'Betano',  'Fora', 2.22, 228, 'Red');

  sb2('seed_sb16',
    iso(2026,3,29,10,30), iso(2026,3,29,17,0), 'Basquete', 'Heat x Knicks',
    'Bet365',  'Casa', 2.12, 238, 'Green',
    'KTO',     'Fora', 2.04, 247, 'Red');

  dg3('seed_dg03',
    iso(2026,3,7,12,0), iso(2026,3,7,19,0), 'Boca Juniors x River Plate',
    'Bet365',  4.50, 110, 'Red',
    'Betano',  3.40, 147, 'Red',
    'Betsson', 2.00, 250, 'Green');

  dg3('seed_dg04',
    iso(2026,3,14,9,0), iso(2026,3,14,15,0), 'Botafogo x Fluminense',
    'KTO',     4.00, 125, 'Green Antecipado',
    'Pinnacle',3.60, 139, 'Red',
    'Bet365',  2.08, 242, 'Red');

  dg3('seed_dg05',
    iso(2026,3,21,13,30), iso(2026,3,21,20,0), 'Manchester United x Chelsea',
    'Betano',  3.90, 128, 'Red',
    'Betsson', 3.70, 135, 'Pendente',
    'Bet365',  2.12, 236, 'Pendente');

  dg3('seed_dg06',
    iso(2026,3,28,10,0), iso(2026,3,28,16,30), 'Cruzeiro x Atlético MG',
    'Pinnacle',4.10, 122, 'Pendente',
    'KTO',     3.80, 132, 'Pendente',
    'Betano',  2.05, 244, 'Pendente');

  // ── ABRIL 2026 ────────────────────────────────────────────────────────────

  sb2('seed_sb17',
    iso(2026,4,2,10,0), iso(2026,4,2,16,0), 'Futebol', 'Flamengo x São Paulo',
    'Bet365',  'Casa', 2.05, 246, 'Green',
    'Betano',  'Fora', 2.12, 238, 'Red');

  sb2('seed_sb18',
    iso(2026,4,5,12,0), iso(2026,4,5,19,0), 'Futebol', 'Real Madrid x Atlético',
    'KTO',     'Casa', 2.00, 252, 'Green',
    'Pinnacle','Fora', 2.18, 232, 'Red');

  sb2('seed_sb19',
    iso(2026,4,9,11,0), iso(2026,4,9,18,30), 'Basquete', 'Nuggets x Suns',
    'Betsson', 'Casa', 1.93, 263, 'Green',
    'Bet365',  'Fora', 2.26, 223, 'Red');

  sb2('seed_sb20',
    iso(2026,4,12,9,0), iso(2026,4,12,15,0), 'Futebol', 'Corinthians x Palmeiras',
    'Betano',  'Casa', 2.08, 243, 'Green',
    'KTO',     'Fora', 2.05, 246, 'Red');

  sb2('seed_sb21',
    iso(2026,4,16,14,0), iso(2026,4,16,21,0), 'Tênis', 'Zverev x Ruud - Roland Garros',
    'Bet365',  'Casa', 2.15, 235, 'Pendente',
    'Pinnacle','Fora', 2.01, 250, 'Pendente');

  sb2('seed_sb22',
    iso(2026,4,19,10,30), iso(2026,4,19,17,0), 'Futebol', 'Barcelona x Atlético',
    'Betsson', 'Casa', 2.10, 240, 'Pendente',
    'Betano',  'Fora', 2.06, 244, 'Pendente');

  dg3('seed_dg07',
    iso(2026,4,6,11,0), iso(2026,4,6,18,0), 'Grêmio x Athletico PR',
    'Bet365',  4.20, 119, 'Red',
    'Betano',  3.50, 143, 'Red',
    'Betsson', 2.05, 244, 'Green');

  dg3('seed_dg08',
    iso(2026,4,13,12,0), iso(2026,4,13,19,0), 'Vasco x Fluminense',
    'KTO',     4.00, 125, 'Pendente',
    'Pinnacle',3.60, 139, 'Pendente',
    'Bet365',  2.10, 238, 'Pendente');

  // Delay op
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

  // Legs
  makeLegs().forEach(leg => store.addLeg(leg));

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
}

export function clearSeedData() {
  const store = useStore.getState();

  SEED_LEG_IDS.forEach(id => store.deleteLeg(id));
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
}
