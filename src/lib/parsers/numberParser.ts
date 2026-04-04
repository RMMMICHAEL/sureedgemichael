/**
 * numberParser.ts
 * Robust numeric parsing for values coming from Excel cells.
 * Handles Brazilian locale (comma as decimal separator) and currency prefixes.
 */

/**
 * Strips currency symbols, spaces, and Brazilian thousand separators,
 * then returns a clean float.
 *
 * Handles cases like:
 *   "R$ 1.234,56"  → 1234.56
 *   "1.234,56"     → 1234.56
 *   "1234.56"      → 1234.56
 *   "-250,00"      → -250.00
 *   ""             → 0
 */
export function parseNum(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;

  const raw = String(value).trim();
  if (raw === '-' || raw === '—') return 0;

  // Remove currency symbol and spaces
  let s = raw.replace(/R\$\s*/g, '').trim();

  // Detect Brazilian format: has period as thousand separator and comma as decimal
  // e.g. "1.234,56" — the period comes before comma
  const brFormat = /^\-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s);
  if (brFormat) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard or mixed: just replace comma with period (last comma = decimal)
    const lastComma = s.lastIndexOf(',');
    const lastDot   = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Comma is decimal separator
      s = s.slice(0, lastComma).replace(/[.,]/g, '') + '.' + s.slice(lastComma + 1);
    } else {
      // Period is decimal separator — remove stray commas (thousand sep)
      s = s.replace(/,/g, '');
    }
  }

  // Remove any remaining non-numeric characters except minus and dot
  s = s.replace(/[^\d.\-]/g, '');

  const result = parseFloat(s);
  return isNaN(result) ? 0 : result;
}

/**
 * Parses a betting odd — always treats the period as a decimal separator.
 *
 * WHY a separate function:
 *   parseNum("1.062") → 1062  (correct for currency: R$ 1.062 = R$ 1,062.00)
 *   parseOdd("1.062") → 1.062 (correct for odds: no bookmaker offers 1062x)
 *
 * No valid betting odd exceeds ~100, so "1.062" can only ever mean 1.062,
 * never the thousands value 1062.
 *
 * Rules:
 *   - Comma present → comma is decimal (BR standard), periods are thousands → remove them
 *     "1,61"      → 1.61
 *     "1.500,00"  → 1500.00  (stake-like value in odd column → unlikely but handled)
 *   - No comma → period is decimal (international/mixed format)
 *     "1.062"     → 1.062
 *     "2.74"      → 2.74
 *     "15"        → 15.0
 */
export function parseOdd(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;

  const raw = String(value).trim().replace(/\s/g, '');
  if (raw === '-' || raw === '—') return 0;

  if (raw.includes(',')) {
    // Comma is the decimal separator; any periods are thousands separators
    const s = raw.replace(/\./g, '').replace(',', '.');
    const result = parseFloat(s);
    return isNaN(result) ? 0 : result;
  }

  // No comma: treat period as decimal separator
  const result = parseFloat(raw);
  return isNaN(result) ? 0 : result;
}
