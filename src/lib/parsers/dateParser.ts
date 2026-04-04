/**
 * dateParser.ts
 * Converts various date formats from Excel/Sheets into ISO 8601.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Converts an Excel serial date number to ISO 8601 string.
 *
 * Excel serial dates count days since Dec 30, 1899 (epoch = day 0).
 * The fractional part represents the time of day.
 *
 * Handles the Excel 1900 leap year bug: Excel incorrectly treats 1900 as
 * a leap year, so serials >= 60 are off by 1 and must be decremented.
 *
 * Formula: unixMs = (serial - 25569) * 86400000
 * (25569 = days between Excel epoch Dec 30, 1899 and Unix epoch Jan 1, 1970)
 */
function excelSerialToISO(serial: number): string | null {
  // Sanity check: reasonable Excel date range (year ~2000–2099)
  if (serial < 36526 || serial > 73050) return null;

  // Correct Excel 1900 leap year bug
  const adjusted = serial >= 60 ? serial - 1 : serial;
  const unixMs = Math.round((adjusted - 25569) * 86400 * 1000);
  const d = new Date(unixMs);
  if (isNaN(d.getTime())) return null;

  // Use UTC methods — Excel serials encode local calendar dates without timezone
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/**
 * Returns an ISO 8601 string (YYYY-MM-DDTHH:MM:SS) or null.
 *
 * Supported input formats:
 *   Date object            (from XLSX with cellDates: true)
 *   number / numeric str   Excel serial date (e.g. 46002 or "46002,39568")
 *   "dd/mm/yyyy hh:mm:ss"  (Google Sheets default export)
 *   "dd/mm/yyyy hh:mm"
 *   "dd/mm/yyyy"
 *   "yyyy-mm-ddThh:mm:ss"  (already ISO)
 *   "yyyy-mm-dd hh:mm:ss"
 *
 * IMPORTANT: Date objects are formatted using LOCAL time to avoid timezone
 * shift bugs (e.g. a bet at 01:00 BRT appearing as the previous day in UTC).
 */
export function parseDT(s: unknown): string | null {
  if (!s) return null;

  // ── Handle JavaScript Date objects (XLSX cellDates: true) ────────────────
  if (s && typeof (s as Date).getTime === 'function') {
    const d = s as Date;
    if (isNaN(d.getTime())) return null;
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  // ── Handle raw Excel serial number (typeof number) ───────────────────────
  if (typeof s === 'number') {
    return excelSerialToISO(s);
  }

  const raw = String(s).trim();
  if (!raw) return null;

  // ── Handle numeric string that looks like an Excel serial date ───────────
  // Matches: "46002", "46002.39568", "46002,39568" (Brazilian decimal comma)
  // Does NOT match date strings like "01/03/2026" (has slashes).
  if (/^-?\d+([.,]\d+)?$/.test(raw)) {
    const serial = parseFloat(raw.replace(',', '.'));
    const result = excelSerialToISO(serial);
    if (result) return result;
  }

  // dd/mm/yyyy [hh:mm[:ss]]
  const m1 = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (m1) {
    const [, d, mo, y, h = '00', mi = '00', sec = '00'] = m1;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${sec.padStart(2, '0')}`;
  }

  // ISO or yyyy-mm-dd[ hh:mm[:ss]]
  const m2 = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m2) {
    const [, y, mo, d, h = '00', mi = '00', sec = '00'] = m2;
    return `${y}-${mo}-${d}T${h}:${mi}:${sec}`;
  }

  return null;
}

/** Returns "YYYY-MM" from any valid date string */
export function toYearMonth(iso: string): string {
  return iso.slice(0, 7);
}

/** Returns "YYYY-MM-DD" */
export function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** Returns today as "YYYY-MM-DD" */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns current month as "YYYY-MM" */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
