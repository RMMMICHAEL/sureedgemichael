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
 * Auth is enforced by middleware — only authenticated users reach this route.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const BOT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Rate limiting por IP em memória (edge — por instância; protege contra abuso básico)
const _rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000; // 1 minuto
const RATE_MAX       = 30;     // 30 requisições por minuto por IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_MAX;
}

export async function GET(req: NextRequest) {
  // Rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get('sheetId');
  const fmt     = searchParams.get('format') ?? 'csv';
  const gid     = searchParams.get('gid') ?? '0';

  if (!sheetId || !/^[a-zA-Z0-9_-]+$/.test(sheetId)) {
    return NextResponse.json({ error: 'sheetId inválido' }, { status: 400 });
  }

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

  if (contentType.includes('text/html')) {
    return NextResponse.json(
      { error: 'A planilha está privada. Configure para "Qualquer pessoa com o link pode ver".' },
      { status: 403 }
    );
  }

  if (fmt === 'xlsx') {
    const buf = await response.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type':  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  }

  const csv = await response.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':  'text/csv; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
