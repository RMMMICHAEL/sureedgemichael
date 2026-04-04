/**
 * anomalyDetector.ts
 *
 * Contextual anomaly detection — replaces the simplistic "if % > 50 → flag" rule.
 *
 * Flags are graded by severity:
 *   critical → likely data error or non-bet entry
 *   medium   → unusual but possible, review recommended
 *   light    → informational, low priority
 *
 * Each flag has a code (machine-readable) and a human message (Portuguese).
 */

import type { AnomalyFlag, ImportRow } from '@/types';
import { pctSanityLabel } from '@/lib/parsers/percentParser';

// Sports/events that indicate a non-betting row
const SUSPECT_SPORTS = new Set([
  'AQUECIMENTO', 'ARRISCOU', 'CAIU ODD', 'CREDITO', 'CRÉDITO',
  'APOSTA', 'ASSINATURA', 'DESPESA', 'SAQUE', 'DEPOSITO', 'DEPÓSITO',
  'TRANSFERENCIA', 'TRANSFERÊNCIA', 'MENSALIDADE', 'TAXA', 'GASTO',
  '-', 'E', 'ESPORTE', '',
]);

function normSport(sp: string): string {
  return (sp || '').trim().toUpperCase();
}

export interface DetectionResult {
  flags: AnomalyFlag[];
  isNonBet: boolean;   // true when row is likely not a betting entry
  pctDivergence: number | null;
}

export function detectAnomalies(row: ImportRow): DetectionResult {
  const flags: AnomalyFlag[] = [];

  // ── 1. Non-bet entry detection ────────────────────────────────────────────
  const isNonBet = SUSPECT_SPORTS.has(normSport(row.sp));
  if (isNonBet) {
    flags.push({
      code: 'sport_suspect',
      level: 'medium',
      message: `Esporte "${row.sp || '(vazio)'}" incomum — possível lançamento não esportivo`,
    });
  }

  // ── 2. Odd validation ────────────────────────────────────────────────────
  if (row.od > 0 && row.od < 1.01) {
    flags.push({ code: 'odd_invalid', level: 'critical', message: `Odd ${row.od} inválida (mínimo 1.01)` });
  }
  if (row.od >= 1.01 && row.od < 1.05) {
    flags.push({ code: 'odd_very_low', level: 'light', message: `Odd ${row.od} muito baixa — verificar se é surebetting` });
  }
  if (row.od > 100) {
    // Odds above 100 are virtually impossible in legitimate surebetting.
    // An unpaired Green leg at this range inflates profits by hundreds of
    // thousands — treat as critical to surface it in the import preview.
    flags.push({ code: 'odd_very_high', level: 'critical', message: `Odd ${row.od.toFixed(2)} extremamente alta — provável erro de registro` });
  } else if (row.od > 20) {
    flags.push({ code: 'odd_very_high', level: 'medium', message: `Odd ${row.od.toFixed(2)} muito alta — verificar registro` });
  }

  // ── 3. Stake validation ──────────────────────────────────────────────────
  if ((row.st ?? 0) === 0 && row.re !== 'Pendente') {
    flags.push({ code: 'stake_zero', level: 'critical', message: 'Stake zero em aposta finalizada' });
  }

  // ── 4. Percentage — sanity check only ────────────────────────────────────
  // pc is in "display scale": 4.79 means 4.79%.
  //
  // NOTE: The % column in a surebet sheet is the SUREBETTING percentage,
  // which is calculated as: ((stake × (odd-1)) - otherStake) / totalStake × 100
  // This requires data from BOTH legs, which is not available when validating
  // a single row. Therefore, we only perform a range sanity check here.
  // Comparing against single-leg profit % would always diverge and cause false positives.
  const pctSanity = pctSanityLabel(row.pc);
  const pctDivergence: number | null = null;

  if (pctSanity === 'suspicious') {
    flags.push({
      code: 'pct_suspicious',
      level: 'medium',
      message: `Percentual ${row.pc.toFixed(2)}% muito alto para surebetting típico (esperado ≤ 15%)`,
    });
  }

  // ── 5. Result coherence ──────────────────────────────────────────────────
  if (row.re === 'Green' && row.od < 1.01) {
    flags.push({ code: 'green_invalid_odd', level: 'critical', message: 'Green com odd inválida' });
  }

  return { flags, isNonBet, pctDivergence };
}

/** Returns only the AnomalyFlag array (convenient wrapper) */
export function getFlags(row: ImportRow): AnomalyFlag[] {
  return detectAnomalies(row).flags;
}

/** Max severity across all flags in a set */
export function maxSeverity(flags: AnomalyFlag[]): 'none' | 'light' | 'medium' | 'critical' {
  if (flags.length === 0) return 'none';
  if (flags.some(f => f.level === 'critical')) return 'critical';
  if (flags.some(f => f.level === 'medium'))   return 'medium';
  return 'light';
}
