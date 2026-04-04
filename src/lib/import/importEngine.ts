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

/**
 * Parse an Excel ArrayBuffer through the full pipeline.
 * Returns structured ImportResult with graded flags.
 *
 * Async: dynamically imports 'xlsx' to avoid SSR issues in Next.js.
 */
export async function parseWorkbook(
  buffer: ArrayBuffer,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { currentMonthOnly = false, targetMonth = currentMonth() } = options;

  const XLSX = await import('xlsx');

  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const allRows: ImportRow[] = [];
  let skipped = 0;

  wb.SheetNames.forEach((sName: string) => {
    const ws = wb.Sheets[sName];

    // raw:false → XLSX returns formatted strings ("4,79%", "R$ 835,00") which
    // our parsers handle correctly for Brazilian locale.
    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      dateNF: 'dd/mm/yyyy hh:mm:ss',
    }) as unknown[][];

    // ── ETAPA A: find header row ────────────────────────────────────────────
    //
    // Scan the first 20 rows for any row that contains a "date" column header.
    // We match on a broad set of keywords to tolerate label variations.
    const DATE_HEADER_KEYWORDS = ['data', 'date', 'registro', 'dt.', 'aposta'];

    let hRow = -1;
    let colMap: Record<number, string> = {};

    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const isHeader = row.some(c => {
        const s = String(c || '').toLowerCase().trim();
        return DATE_HEADER_KEYWORDS.some(kw => s.includes(kw));
      });

      if (isHeader) {
        hRow = i;
        row.forEach((cell, idx) => {
          const key = resolveColName(String(cell || ''));
          if (key) colMap[idx] = key;
        });
        break;
      }
    }

    // If no recognisable header was found, skip this sheet entirely.
    // Importing without a known column map would produce corrupt data.
    if (hRow < 0) {
      console.warn(`[importEngine] Sheet "${sName}": no header row found — skipped`);
      return;
    }

    // Ensure at minimum that 'bd' (bet date) is mapped somewhere.
    const hasBd = Object.values(colMap).includes('bd');
    if (!hasBd) {
      console.warn(`[importEngine] Sheet "${sName}": no 'bd' (date) column found — skipped`);
      return;
    }

    // ── ETAPA B–C: normalise each data row ──────────────────────────────────
    //
    // get(key) extracts a value using ONLY the header-derived colMap.
    // There are NO positional fallbacks — a missing column returns undefined.
    const get = (row: unknown[], key: string): unknown => {
      const entry = Object.entries(colMap).find(([, v]) => v === key);
      if (!entry) return undefined;
      return row[+entry[0]];
    };

    for (let i = hRow + 1; i < raw.length; i++) {
      const r = raw[i];
      if (!r || r.length === 0) continue;

      // Skip rows that are completely blank (all cells empty/undefined)
      const hasAnyContent = r.some(c => c !== undefined && c !== null && String(c).trim() !== '');
      if (!hasAnyContent) continue;

      // ── Parse bd first — skip row if date is unparseable ─────────────────
      const bdRaw = String(get(r, 'bd') ?? '').trim();
      const bd    = parseDT(bdRaw);
      if (!bd) continue;   // row has no valid registration date → skip

      // ── ETAPA E: month filter ──────────────────────────────────────────────
      if (currentMonthOnly && toYearMonth(bd) !== targetMonth) {
        skipped++;
        continue;
      }

      // ── Parse remaining fields (no positional fallbacks) ──────────────────
      const edRaw = String(get(r, 'ed') ?? '').trim();
      const ed    = parseDT(edRaw) ?? bd;   // fall back to bd only if truly absent

      const sp  = String(get(r, 'sp') ?? '').trim();
      const ev  = String(get(r, 'ev') ?? '').trim();
      const ho  = normHouse(String(get(r, 'ho') ?? '').trim());
      const mk  = String(get(r, 'mk') ?? '').trim();
      const od  = parseOdd(get(r, 'od'));  // parseOdd: period = decimal always
      const st  = parseNum(get(r, 'st'));
      const pc  = parsePct(get(r, 'pc'));
      const re  = mapResult(get(r, 're'));
      const lucro_raw = get(r, 'lucro_raw');

      // Skip rows that have no betting data at all:
      //   • no house AND no market  → likely a memo/note/separator row
      //   • odd = 0 AND stake = 0   → template or blank data row
      if ((!ho && !mk) || (od === 0 && st === 0)) continue;

      const row: ImportRow = { bd, ed, sp, ev, ho, mk, od, st, pc, re, lucro_raw, sheet: sName, flags: [] };

      // ── ETAPA D: contextual validation ───────────────────────────────────
      const { flags } = detectAnomalies(row);
      row.flags = flags;

      allRows.push(row);
    }
  });

  const clean     = allRows.filter(r => r.flags.length === 0);
  const anomalies = allRows.filter(r => r.flags.length > 0);
  const nonBets   = allRows.filter(r => r.flags.some(f => f.code === 'sport_suspect'));

  return {
    rows: allRows,
    clean,
    anomalies,
    nonBets,
    skipped,
    month: currentMonthOnly ? targetMonth : 'all',
  };
}

// ── Commit: convert ImportRows → Legs ────────────────────────────────────────

export interface CommitOptions {
  includeAll: boolean;      // if false, skip non-bet rows
  existingLegs: Leg[];      // for duplicate detection
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
      // Dupe check: same registration_date + house + market
      const isDupe = opts.existingLegs.some(
        l => l.bd === row.bd && l.ho === row.ho && l.mk === row.mk
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
