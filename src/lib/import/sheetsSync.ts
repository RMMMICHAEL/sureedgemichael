/**
 * sheetsSync.ts
 * Google Sheets CSV sync utilities.
 *
 * The user shares their sheet with "anyone with the link can view"
 * and pastes the URL here. We extract the sheet ID and fetch the
 * CSV export endpoint directly from the browser.
 *
 * Export URL format:
 *   https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}
 */

import type { SheetSync } from '@/types';
import { parseWorkbook } from './importEngine';
import type { ImportResult, ImportOptions } from './importEngine';

// ── URL parsing ───────────────────────────────────────────────────────────────

/**
 * Extracts the sheet ID and gid from a Google Sheets URL.
 * Supports /edit, /pub, /view, and /export URLs.
 * Returns null if the URL is not a valid Google Sheets URL.
 */
export function parseSheetUrl(url: string): Pick<SheetSync, 'sheetId' | 'gid'> | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.includes('google.com')) return null;

    // Extract sheet ID: between /d/ and the next /
    const idMatch = u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return null;
    const sheetId = idMatch[1];

    // Extract gid from hash (#gid=0) or query string (?gid=0)
    const hashGid  = u.hash.match(/gid=(\d+)/)?.[1];
    const queryGid = u.searchParams.get('gid');
    const gid = hashGid ?? queryGid ?? '0';

    return { sheetId, gid };
  } catch {
    return null;
  }
}

/**
 * Builds the CSV export URL for a given sheet ID and tab (gid).
 * CSV is 10-50x smaller than XLSX → much faster sync.
 * The gid targets a specific sheet tab (default = first tab, gid=0).
 */
export function buildExportUrl(sheetId: string, gid = '0'): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// ── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the Google Sheet as CSV and runs it through the full import pipeline.
 *
 * Requires the sheet to be publicly accessible ("anyone with the link can view").
 * Google's export endpoint supports CORS for public sheets.
 *
 * Throws if the fetch fails or the URL is invalid.
 */
export async function syncFromSheet(cfg: SheetSync, options?: ImportOptions): Promise<ImportResult> {
  const exportUrl = buildExportUrl(cfg.sheetId, cfg.gid ?? '0');

  const response = await fetch(exportUrl, { cache: 'no-store' });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Acesso negado. Certifique-se de que a planilha está configurada como "Qualquer pessoa com o link pode ver".'
      );
    }
    throw new Error(`Erro ao buscar planilha: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  // Google sometimes returns HTML (login page) when the sheet is private
  if (contentType.includes('text/html')) {
    throw new Error(
      'A planilha está privada. Configure para "Qualquer pessoa com o link pode ver" e tente novamente.'
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return parseWorkbook(arrayBuffer, options);
}
