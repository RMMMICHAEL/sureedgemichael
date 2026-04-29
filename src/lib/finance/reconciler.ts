/**
 * reconciler.ts
 * Recalculates bookmaker balances from initial_balance + settled leg profits.
 *
 * RULE: Bookmaker balance is NEVER derived from the spreadsheet directly.
 * It starts from initial_balance (set by the user during onboarding) and
 * is moved by each settled leg that belongs to that bookmaker.
 */

import type { Bookmaker, Leg } from '@/types';
import { calcLegProfit } from './calculator';

// ── House normalisation map ──────────────────────────────────────────────────
// MUST be declared before normHouse so the lowercase lookup can reference it.

export const HOUSE_MAP: Record<string, string> = {
  sportingbet:     'Sportingbet',
  SportingBet:     'Sportingbet',
  SB:              'Sportingbet',
  sb:              'Sportingbet',
  novibet:         'NoviBet',
  NOVIBET:         'NoviBet',
  Novibet:         'NoviBet',
  kto:             'KTO',
  betano:          'Betano',
  BETANO:          'Betano',
  'Bet365 ok':     'Bet365',
  BET:             'Bet365',
  bet365:          'Bet365',
  superbet:        'Superbet',
  SUPERBET:        'Superbet',
  pinnacle:        'Pinnacle',
  PINNACLE:        'Pinnacle',
  bateubet:        'Bateubet',
  BATEUBET:        'Bateubet',
  betnacional:     'Betnacional',
  pixbet:          'Pixbet',
};

// Case-insensitive fallback: e.g. "Betano" → "Betano", "BETANO" → "Betano"
const HOUSE_MAP_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(HOUSE_MAP).map(([k, v]) => [k.toLowerCase(), v])
);

/**
 * Normalises a bookmaker name to its canonical form.
 * Tries exact match first, then case-insensitive fallback.
 */
export function normHouse(name: string | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  return HOUSE_MAP[trimmed] ?? HOUSE_MAP_LOWER[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Recalculates bookmaker metadata from legs.
 *
 * BALANCE MODEL (v2): balance is a MANUAL snapshot set by the user.
 * It is never auto-derived from leg profits to prevent double-counting when
 * the user updates the balance after profits have already settled.
 * Only the ops counter is derived from legs here.
 *
 * To compute "profit from bets" for a bookmaker, use calcBmLegProfit().
 */
export function recalcBookmakers(bms: Bookmaker[], legs: Leg[]): Bookmaker[] {
  return bms.map(bm => ({
    ...bm,
    ops: legs.filter(l => normHouse(l.ho) === bm.name).length,
  }));
}

/**
 * Returns the net profit from settled manual legs for a given bookmaker name.
 * Use this for display purposes only — it does NOT affect the stored balance.
 */
export function calcBmLegProfit(bmName: string, legs: Leg[]): number {
  return +legs
    .filter(
      l =>
        normHouse(l.ho) === bmName &&
        l.re !== 'Pendente' &&
        l.re !== 'Devolvido' &&
        l.source !== 'import',
    )
    .reduce((s, l) => s + calcLegProfit(l), 0)
    .toFixed(2);
}

// ── House colours ────────────────────────────────────────────────────────────

export const HOUSE_COLORS: Record<string, string> = {
  Bet365:       '#003087',
  Betano:       '#CC0B2F',
  Sportingbet:  '#0A5C1F',
  Superbet:     '#6B21A8',
  KTO:          '#1D4ED8',
  Pinnacle:     '#374151',
  NoviBet:      '#14532D',
  Bateubet:     '#7C3AED',
  Betao:        '#C2410C',
  Betnacional:  '#1E40AF',
  Pixbet:       '#B45309',
  Betfair:      '#0E7490',
  Betway:       '#00632B',
};

export function bmColor(name: string): string {
  return HOUSE_COLORS[name] ?? HOUSE_COLORS[normHouse(name)] ?? '#2E4060';
}

export function bmAbbr(name: string): string {
  return (name || '?').slice(0, 3).toUpperCase();
}
