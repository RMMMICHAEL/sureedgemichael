/**
 * percentParser.ts
 *
 * THE CRITICAL FIX — this is the source of the "479%" bug in the original code.
 *
 * ROOT CAUSE OF THE ORIGINAL BUG:
 *   The original code did: parseNum(r[8]) * 100
 *   When XLSX reads with raw:false, a cell formatted as "4,79%" returns the
 *   formatted string "4,79%". parseNum strips the "%" and comma, yielding 4.79.
 *   Multiplying by 100 then gives 479 — a completely wrong value.
 *
 * CORRECT BEHAVIOUR by format:
 *   "4,79%"   → already a display percentage → return 4.79   (strip %, parse)
 *   "4.79%"   → already a display percentage → return 4.79
 *   0.0479    → XLSX raw decimal (raw:true)  → return 4.79   (* 100)
 *   4.79      → plain number, already pct    → return 4.79
 *   "4,79"    → plain number (no %)          → return 4.79
 *
 * RULE: If the string contains %, it is ALREADY in display scale.
 *       Never multiply by 100 after stripping the % symbol.
 *       Only multiply by 100 when the raw value is a decimal < 1.
 */

const DEBUG = process.env.NODE_ENV === 'development';

function log(label: string, input: unknown, output: number) {
  if (DEBUG) {
    console.debug(`[parsePct] ${label} | input: ${JSON.stringify(input)} → output: ${output}`);
  }
}

/**
 * Returns the percentage in "display scale" — i.e., 4.79 represents 4.79%.
 * Never returns values like 479 for a normal surebetting percentage.
 */
export function parsePct(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;

  const raw = String(value).trim();

  // ── Case 1: String contains % symbol ─────────────────────────────────────
  // The value is already in display scale. Just extract the number.
  // "4,79%"  → 4.79    "4.79%"  → 4.79    "-2,5%" → -2.5
  if (raw.includes('%')) {
    const clean = raw
      .replace('%', '')
      .replace(/\s/g, '')
      .replace(',', '.');
    const num = parseFloat(clean.replace(/[^\d.\-]/g, ''));
    if (isNaN(num)) return 0;
    const result = +num.toFixed(4);
    log('% string', raw, result);
    return result;
  }

  // ── Case 2: Pure number (from XLSX raw:true or plain text) ───────────────
  const clean = raw.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean.replace(/[^\d.\-]/g, ''));
  if (isNaN(num)) return 0;

  // If strictly between -1 and 1 (exclusive of 0), it's a decimal fraction
  // e.g. 0.0479 → 4.79%   or   -0.025 → -2.5%
  if (num !== 0 && Math.abs(num) < 1) {
    const result = +(num * 100).toFixed(4);
    log('decimal fraction', raw, result);
    return result;
  }

  // Already in display scale
  const result = +num.toFixed(4);
  log('direct value', raw, result);
  return result;
}

/**
 * Validate that a parsed percentage value is within a sane range for
 * sports betting / surebetting operations.
 *
 * Normal surebetting arbitrage: typically 0.5% – 10%
 * High-value opportunities: up to ~25%
 * Anything above 30% is extremely unusual and warrants review.
 */
export function isPctSane(pct: number): boolean {
  return pct >= 0 && pct <= 30;
}

export function pctSanityLabel(pct: number): 'normal' | 'elevated' | 'suspicious' {
  if (pct <= 15) return 'normal';
  if (pct <= 30) return 'elevated';
  return 'suspicious';
}
