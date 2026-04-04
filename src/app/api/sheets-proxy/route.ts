/**
 * /api/sheets-proxy
 *
 * Server-side proxy for Google Sheets exports. Avoids CORS restrictions
 * that block direct browser → Google requests in production (Vercel, etc.).
 *
 * Two modes:
 *   GET ?sheetId=X&gid=Y           → CSV export (one tab) — fast, used for incremental syncs
 *   GET ?sheetId=X&format=xlsx     → XLSX export (ALL tabs) — used for full-history import
 *
 * The XLSX mode is essential when the user has one tab per month
 * (e.g. "JANEIRO", "FEVEREIRO", "MARÇO"...) because CSV can only export
 * one tab at a time.
 */

import { NextRequest, NextResponse } from 'next/server';

// Edge runtime: fast, globally distributed on Vercel
export const runtime = 'edge';

const BOT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get('sheetId');
  const fmt     = searchParams.get('format') ?? 'csv';   // 'csv' | 'xlsx'
  const gid     = searchParams.get('gid') ?? '0';

  if (!sheetId || !/^[a-zA-Z0-9_-]+$/.test(sheetId)) {
    return NextResponse.json({ error: 'sheetId inválido' }, { status: 400 });
  }

  // Build the Google export URL based on the requested format
  const exportUrl = fmt === 'xlsx'
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`
    : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  let response: Response;
  try {
    response = await fetch(exportUrl, {
      headers: { 'User-Agent': BOT_UA },
      redirect: 'follow',
      cache:    'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível acessar a planilha. Verifique sua conexão.' },
      { status: 502 }
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { error: 'Acesso negado. Configure a planilha como "Qualquer pessoa com o link pode ver".' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: `Erro ao buscar planilha: HTTP ${response.status}` },
      { status: response.status }
    );
  }

  const contentType = response.headers.get('content-type') ?? '';

  // Google returns HTML (login page) when the sheet is private
  if (contentType.includes('text/html')) {
    return NextResponse.json(
      { error: 'A planilha está privada. Configure para "Qualquer pessoa com o link pode ver".' },
      { status: 403 }
    );
  }

  if (fmt === 'xlsx') {
    // Return binary XLSX — browser will receive it as an ArrayBuffer
    const buf = await response.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type':  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Default: CSV text
  const csv = await response.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':  'text/csv; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
