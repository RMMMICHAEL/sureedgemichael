/**
 * importEngine.ts
 * Full import pipeline: read → normalise → classify → validate → filter.
 *
 * ETAPA A — leitura:    identify sheet, header row, column mapping
 * ETAPA B — normalização: dates, numbers, percentages, results, house names
 * ETAPA C — enriquecimento: live/pre, non-bet flag, infer type
 * ETAPA D — validação:  anomaly detection (contextual, graded)
 * ETAPA E — filtro:     current month only (default behaviour)
 *
 * GROUPING RULE (v2):
 *   Rows with the exact same `bd` (registration timestamp) are legs of the
 *   same surebet operation. SureEdge records all legs at the same moment,
 *   so exact-timestamp grouping is deterministic and correct.
 *   The old sequential-pair approach was discarded because any extra row
 *   (total, separator, formula cell) would permanently misalign all
 *   subsequent pairs.
 *
 * NO POSITIONAL FALLBACKS:
 *   All field extraction uses only the header-derived colMap.
 *   There are NO `?? r[N]` positional fallbacks; if a column is absent from
 *   the header, that field is empty rather than silently wrong.
 */

import type { ImportRow, Leg } from '@/types';
import { parseDT, currentMonth, toYearMonth } from '@/lib/parsers/dateParser';

// ── XLSX module cache (avoid re-importing on every parseWorkbook call) ────────
// The dynamic import is resolved once and the module reference is reused for
// subsequent calls. Reduces repeated overhead on manual/auto syncs.
let _xlsxModule: typeof import('xlsx') | null = null;
async function getXLSX() {
  if (!_xlsxModule) _xlsxModule = await import('xlsx');
  return _xlsxModule;
}
import { parseNum, parseOdd } from '@/lib/parsers/numberParser';
import { parsePct }   from '@/lib/parsers/percentParser';
import { mapResult }  from '@/lib/parsers/resultMapper';
import { normHouse } from '@/lib/finance/reconciler';
import { detectAnomalies } from '@/lib/validation/anomalyDetector';
import { calcLegProfit, classifySignal } from '@/lib/finance/calculator';

// ── Column aliases (handles slight label variations in sheets) ───────────────
//
// Keys: lowercase/trimmed versions of what might appear in the header row.
// Values: internal field key used throughout the pipeline.

const COL_ALIASES: Record<string, string> = {
  // bd — registration date (when the bet was entered)
  'data':                'bd',
  'data da aposta':      'bd',
  'data aposta':         'bd',
  'data de registro':    'bd',
  'data registro':       'bd',
  'registro':            'bd',
  'dt. aposta':          'bd',
  'dt aposta':           'bd',

  // ed — event date
  'data evento':         'ed',
  'data do evento':      'ed',
  'data do jogo':        'ed',
  'dt. evento':          'ed',
  'dt evento':           'ed',
  'evento data':         'ed',

  // sp — sport
  'esporte':             'sp',
  'sport':               'sp',
  'modalidade':          'sp',

  // ev — match/event name
  'evento':              'ev',
  'event':               'ev',
  'partida':             'ev',
  'jogo':                'ev',
  'confronto':           'ev',

  // ho — bookmaker / house
  'casa':                'ho',
  'casa de apostas':     'ho',
  'bookmaker':           'ho',
  'bookie':              'ho',

  // mk — market
  'mercado':             'mk',
  'market':              'mk',
  'tipo':                'mk',

  // od — odd
  'odd':                 'od',
  'odds':                'od',
  'cota':                'od',

  // st — stake
  'stake':               'st',
  'valor':               'st',
  'valor apostado':      'st',
  'investimento':        'st',
  'entrada':             'st',

  // pc — yield / percentage
  '%':                   'pc',
  'percentual':          'pc',
  'pct':                 'pc',
  'yield':               'pc',
  'retorno':             'pc',
  '% retorno':           'pc',

  // re — result / status
  'resultado':           're',
  'result':              're',
  'status':              're',
  'situação':            're',
  'situacao':            're',

  // lucro_raw — raw profit string (for display/reference only)
  'lucro':               'lucro_raw',
  'profit':              'lucro_raw',
  'lucro/prejuízo':      'lucro_raw',
  'lucro/prejuizo':      'lucro_raw',
  'ganho':               'lucro_raw',
};

/**
 * Normalise a raw header cell to an internal field key.
 * Strips accents so "situação" matches "situacao", etc.
 */
function resolveColName(raw: string): string {
  const clean = raw
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');   // strip combining diacritics

  return COL_ALIASES[clean] ?? COL_ALIASES[raw.toLowerCase().trim()] ?? clean;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export interface ImportOptions {
  /**
   * If true, only rows from targetMonth are imported.
   * Default: false — imports all rows (full history).
   */
  currentMonthOnly?: boolean;
  /** Target month for filtering (YYYY-MM). Only used when currentMonthOnly is true. */
  targetMonth?: string;
}

export interface ImportResult {
  rows:      ImportRow[];   // all parsed rows (after month filter, if applied)
  clean:     ImportRow[];   // rows with no flags
  anomalies: ImportRow[];   // rows with any flags
  nonBets:   ImportRow[];   // rows classified as non-betting entries
  skipped:   number;        // rows outside month filter (0 when currentMonthOnly=false)
  month:     string;        // YYYY-MM of filter, or 'all' when importing full history
}

// ── Shared pipeline helpers ──────────────────────────────────────────────────

const DATE_HEADER_KEYWORDS = ['data', 'date', 'registro', 'dt.', 'aposta'];

/**
 * Given a 2-D array of cell values (one sheet worth), scans for the header
 * row and processes all subsequent data rows through the normalisation pipeline.
 *
 * Returns the list of ImportRows produced and the count of month-filtered rows.
 */
function processRawRows(
  raw: unknown[][],
  sheetName: string,
  currentMonthOnly: boolean,
  targetMonth: string,
): { rows: ImportRow[]; skipped: number } {
  const rows: ImportRow[] = [];
  let skipped = 0;

  // ── ETAPA A: find header row ──────────────────────────────────────────────
  let hRow = -1;
  const colMap: Record<number, string> = {};

  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const row = raw[i];
    if (!row || row.length === 0) continue;

    const isHeader = row.some(c => {
      const s = String(c ?? '').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return DATE_HEADER_KEYWORDS.some(kw => s.includes(kw));
    });

    if (isHeader) {
      hRow = i;
      row.forEach((cell, idx) => {
        const key = resolveColName(String(cell ?? ''));
        if (key) colMap[idx] = key;
      });
      break;
    }
  }

  if (hRow < 0) {
    console.warn(`[importEngine] Sheet "${sheetName}": no header row found — skipped`);
    return { rows, skipped };
  }

  if (!Object.values(colMap).includes('bd')) {
    console.warn(`[importEngine] Sheet "${sheetName}": no 'bd' (date) column — skipped`);
    return { rows, skipped };
  }

  // ── ETAPA B–E: normalise each data row ───────────────────────────────────
  const get = (row: unknown[], key: string): unknown => {
    const entry = Object.entries(colMap).find(([, v]) => v === key);
    return entry ? row[+entry[0]] : undefined;
  };

  for (let i = hRow + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.length === 0) continue;

    const hasContent = r.some(c => c !== undefined && c !== null && String(c).trim() !== '');
    if (!hasContent) continue;

    const bdRaw = String(get(r, 'bd') ?? '').trim();
    const bd    = parseDT(bdRaw);
    if (!bd) continue;

    if (currentMonthOnly && toYearMonth(bd) !== targetMonth) { skipped++; continue; }

    const edRaw = String(get(r, 'ed') ?? '').trim();
    const ed    = parseDT(edRaw) ?? bd;

    const sp        = String(get(r, 'sp') ?? '').trim();
    const ev        = String(get(r, 'ev') ?? '').trim();
    const ho        = normHouse(String(get(r, 'ho') ?? '').trim());
    const mk        = String(get(r, 'mk') ?? '').trim();
    const od        = parseOdd(get(r, 'od'));
    const st        = parseNum(get(r, 'st'));
    const pc        = parsePct(get(r, 'pc'));
    const re        = mapResult(get(r, 're'));
    const lucro_raw = get(r, 'lucro_raw');

    if ((!ho && !mk) || (od === 0 && st === 0)) continue;

    const importRow: ImportRow = { bd, ed, sp, ev, ho, mk, od, st, pc, re, lucro_raw, sheet: sheetName, flags: [] };
    const { flags } = detectAnomalies(importRow);
    importRow.flags = flags;
    rows.push(importRow);
  }

  return { rows, skipped };
}

// ── RFC 4180 CSV parser with auto-separator detection ─────────────────────

/**
 * Detects whether the CSV text uses commas or semicolons as field separators.
 *
 * Strategy: scan the first 5 lines, count unquoted occurrences of each.
 * In Brazilian Google Sheets exports, semicolons are often used to avoid
 * ambiguity with the comma decimal separator.
 */
function detectCSVSeparator(text: string): ',' | ';' | '\t' {
  const sample = text.slice(0, 4096); // check first ~4KB
  let commas = 0, semicolons = 0, tabs = 0;
  let inQ = false;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i];
    if (ch === '"')      { inQ = !inQ; }
    else if (!inQ) {
      if (ch === ',')    commas++;
      else if (ch === ';') semicolons++;
      else if (ch === '\t') tabs++;
      else if (ch === '\n') {
        // Only sample the first 5 lines
        if (sample.slice(0, i).split('\n').length > 5) break;
      }
    }
  }
  if (tabs > commas && tabs > semicolons) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

/**
 * Parses CSV text into a 2-D array of strings (RFC 4180 compliant).
 *
 * Handles:
 *   • Quoted fields (may contain the separator character or newlines)
 *   • Escaped double-quotes ("")
 *   • Mixed line endings: \r\n, \n, \r
 *   • Auto-detected separator (comma, semicolon, or tab)
 */
function parseCSVRaw(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row:   string[]   = [];
  let field  = '';
  let inQ    = false;

  for (let i = 0; i < text.length; i++) {
    const ch   = text[i];
    const next = text[i + 1];

    if (inQ) {
      if (ch === '"' && next === '"') {
        // Escaped quote inside quoted field
        field += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === sep) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
        i++; // skip \n
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // Flush last field / row
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some(f => f !== '')) rows.push(row);
  }

  return rows;
}

// ── Public entry points ──────────────────────────────────────────────────────

/**
 * Parse a raw CSV string (from Google Sheets proxy or file upload) through
 * the full import pipeline.
 *
 * Automatically detects the field separator (comma, semicolon, or tab)
 * and uses an RFC 4180 compliant parser so quoted fields with Brazilian
 * comma-decimal values (e.g. "2,2") are never mis-split.
 */
export function parseCSVText(
  csvText: string,
  options: ImportOptions = {},
): ImportResult {
  const { currentMonthOnly = false, targetMonth = currentMonth() } = options;

  const sep  = detectCSVSeparator(csvText);
  const raw  = parseCSVRaw(csvText, sep);

  // Treat the whole CSV as a single "sheet" named 'Sheet1'
  const { rows: allRows, skipped } = processRawRows(
    raw as unknown[][],
    'Sheet1',
    currentMonthOnly,
    targetMonth,
  );

  return {
    rows:      allRows,
    clean:     allRows.filter(r => r.flags.length === 0),
    anomalies: allRows.filter(r => r.flags.length > 0),
    nonBets:   allRows.filter(r => r.flags.some(f => f.code === 'sport_suspect')),
    skipped,
    month: currentMonthOnly ? targetMonth : 'all',
  };
}

/**
 * Parse an Excel/XLSX ArrayBuffer through the full pipeline.
 * Returns structured ImportResult with graded flags.
 *
 * Async: dynamically imports 'xlsx' to avoid SSR issues in Next.js.
 * Used only for manual file-upload flows — Google Sheets sync uses parseCSVText.
 */
export async function parseWorkbook(
  buffer: ArrayBuffer,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { currentMonthOnly = false, targetMonth = currentMonth() } = options;

  const XLSX = await getXLSX();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  let totalSkipped = 0;
  const allRows: ImportRow[] = [];

  wb.SheetNames.forEach((sName: string) => {
    const ws  = wb.Sheets[sName];
    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw:    false,
      dateNF: 'dd/mm/yyyy hh:mm:ss',
    }) as unknown[][];

    const { rows, skipped } = processRawRows(raw, sName, currentMonthOnly, targetMonth);
    allRows.push(...rows);
    totalSkipped += skipped;
  });

  return {
    rows:      allRows,
    clean:     allRows.filter(r => r.flags.length === 0),
    anomalies: allRows.filter(r => r.flags.length > 0),
    nonBets:   allRows.filter(r => r.flags.some(f => f.code === 'sport_suspect')),
    skipped:   totalSkipped,
    month: currentMonthOnly ? targetMonth : 'all',
  };
}

// ── Commit: convert ImportRows → Legs ────────────────────────────────────────

export interface CommitOptions {
  includeAll: boolean;      // if false, skip non-bet rows
  existingLegs: Leg[];      // for duplicate detection
  /**
   * Keys of import rows that were manually overridden (format: "ho|mk|bd.slice(0,16)").
   * These are permanently excluded from re-import to prevent duplication
   * when an edited operation differs from its original sheet values.
   */
  excludedImportKeys?: Set<string>;
}

export interface CommitResult {
  newLegs:     Leg[];
  newHouses:   string[];
  imported:    number;
  dupes:       number;
  anomalies:   number;
}

export function commitRows(rows: ImportRow[], opts: CommitOptions): CommitResult {
  const toProcess = opts.includeAll
    ? rows
    : rows.filter(r => !r.flags.some(f => f.code === 'sport_suspect'));

  // ── Group rows into operations: sequential pairs ─────────────────────────
  //
  // The spreadsheet layout is fixed: every 2 data rows = 1 surebet operation
  // (one row per bookmaker), separated by blank/separator rows that are already
  // stripped by parseWorkbook before reaching here.
  //
  // After filtering, toProcess is a clean flat sequence:
  //   [leg1_op1, leg2_op1, leg1_op2, leg2_op2, ...]
  //
  // So sequential pairing (i=0,1 → op0; i=2,3 → op1) is correct.
  //
  // Why NOT bd-timestamp grouping:
  //   When rows share the same registration timestamp (bulk exports, batch
  //   entries, or date-only bd values), every row maps to the same key and
  //   dozens of unrelated bets collapse into a single giant "operation".
  //   Sequential pairing is immune to this because it depends only on position,
  //   not on timestamp equality.
  //
  // Safety: parseWorkbook already filters out blank rows, rows without a valid
  //   date, and rows without house/market/odd/stake data. Separator rows that
  //   previously caused misalignment cannot reach this function.

  const ops: ImportRow[][] = [];
  for (let i = 0; i < toProcess.length; i += 2) {
    const pair: ImportRow[] = [toProcess[i]];
    if (toProcess[i + 1]) pair.push(toProcess[i + 1]);
    ops.push(pair);
  }

  const newLegs:   Leg[]       = [];
  const newHouses: Set<string> = new Set();
  let imported = 0, dupes = 0, anomalies = 0;

  const baseTs = Date.now();

  ops.forEach((opRows, gi) => {
    const oid = `imp_${baseTs}_${gi}`;
    opRows.forEach((row, j) => {
      // Dupe check: same registration_date (minute precision) + house + market.
      // Compare only first 16 chars of bd ("YYYY-MM-DDTHH:MM") because:
      //   – Imported rows from parseDT return 19-char strings ("…:SS")
      //   – Manually-edited legs store 16-char strings (datetime-local sliced)
      // Using minute-level granularity is safe: two distinct bets at the same
      // minute on the same house/market is virtually impossible.
      const rowKey = `${row.ho}|${row.mk}|${row.bd.slice(0, 16)}`;
      const isDupe =
        (opts.excludedImportKeys?.has(rowKey) ?? false) ||
        opts.existingLegs.some(
          l => l.bd.slice(0, 16) === row.bd.slice(0, 16) && l.ho === row.ho && l.mk === row.mk
        );
      if (isDupe) { dupes++; return; }

      if (row.flags.length) anomalies++;

      const leg: Leg = {
        id:     `l_${baseTs}_${gi}_${j}`,
        oid,
        bd:     row.bd,
        ed:     row.ed,
        sp:     row.sp,
        ev:     row.ev,
        ho:     row.ho,
        mk:     row.mk,
        od:     row.od,
        st:     row.st,
        pc:     row.pc,
        re:     row.re,
        pr:     0,
        fl:     row.flags,
        signal: classifySignal(row.bd, row.ed),
        source: 'import',  // histórico — não afeta saldo das casas
      };
      leg.pr = calcLegProfit(leg);

      newLegs.push(leg);
      if (row.ho) newHouses.add(row.ho);
      imported++;
    });
  });

  return {
    newLegs,
    newHouses: [...newHouses],
    imported,
    dupes,
    anomalies,
  };
}
