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
import { parseCSVText, parseWorkbook } from './importEngine';
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
 * Builds the proxy URL for a CSV export (single tab — fast, used for
 * incremental month-only syncs).
 */
export function buildExportUrl(sheetId: string, gid = '0'): string {
  const params = new URLSearchParams({ sheetId, gid });
  return `/api/sheets-proxy?${params.toString()}`;
}

/**
 * Builds the proxy URL for an XLSX export (ALL tabs — used for full-history
 * imports so every monthly tab is included in one download).
 */
export function buildXlsxUrl(sheetId: string): string {
  return `/api/sheets-proxy?sheetId=${encodeURIComponent(sheetId)}&format=xlsx`;
}

// ── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a Google Sheet and runs it through the full import pipeline.
 *
 * Strategy:
 *   • Full-history import (currentMonthOnly = false OR absent):
 *       Downloads XLSX — includes ALL tabs (one tab per month is common).
 *       Passes every sheet through parseWorkbook so no month is missed.
 *
 *   • Incremental sync (currentMonthOnly = true):
 *       Downloads CSV of the specific tab (gid) — 10-50× smaller, much faster.
 *       Passes through the RFC 4180 CSV parser (parseCSVText).
 *
 * Requires the sheet to be publicly accessible ("anyone with the link can view").
 */
export async function syncFromSheet(cfg: SheetSync, options?: ImportOptions): Promise<ImportResult> {
  const fullHistory = !options?.currentMonthOnly;

  const url = fullHistory
    ? buildXlsxUrl(cfg.sheetId)
    : buildExportUrl(cfg.sheetId, cfg.gid ?? '0');

  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    try {
      const json = await response.json() as { error?: string };
      throw new Error(json.error ?? `Erro ao buscar planilha: HTTP ${response.status}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Erro ao buscar')) throw e;
      throw new Error(`Erro ao buscar planilha: HTTP ${response.status}`);
    }
  }

  if (fullHistory) {
    // XLSX → parseWorkbook iterates over ALL sheets in the workbook
    const buffer = await response.arrayBuffer();
    return parseWorkbook(buffer, options);
  } else {
    // CSV → fast RFC 4180 parser with auto-separator detection
    const csvText = await response.text();
    return parseCSVText(csvText, options);
  }
}
