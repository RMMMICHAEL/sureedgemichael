/**
 * /api/sheets-proxy
 *
 * Server-side proxy that fetches a Google Sheets CSV export and returns it
 * to the browser. Avoids CORS restrictions that block direct browser → Google
 * requests in production (Vercel, etc.).
 *
 * Usage: GET /api/sheets-proxy?sheetId=<ID>&gid=<GID>
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge'; // Fast, globally distributed on Vercel

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get('sheetId');
  const gid     = searchParams.get('gid') ?? '0';

  if (!sheetId || !/^[a-zA-Z0-9_-]+$/.test(sheetId)) {
    return NextResponse.json({ error: 'sheetId inválido' }, { status: 400 });
  }

  const exportUrl =
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  let response: Response;
  try {
    response = await fetch(exportUrl, {
      headers: {
        // Identify ourselves as a normal browser to avoid Google bot blocks
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      cache:    'no-store',
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Não foi possível acessar a planilha. Verifique sua conexão.' },
      { status: 502 }
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          error:
            'Acesso negado. Configure a planilha como ' +
            '"Qualquer pessoa com o link pode ver" no Google Sheets.',
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: `Erro ao buscar planilha: HTTP ${response.status}` },
      { status: response.status }
    );
  }

  const contentType = response.headers.get('content-type') ?? '';

  // Google redirects to a login page (text/html) when the sheet is private
  if (contentType.includes('text/html')) {
    return NextResponse.json(
      {
        error:
          'A planilha está privada. Configure para ' +
          '"Qualquer pessoa com o link pode ver" e tente novamente.',
      },
      { status: 403 }
    );
  }

  const csv = await response.text();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':  'text/csv; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      // Allow the browser (same origin) to read this response
      'Access-Control-Allow-Origin': '*',
    },
  });
}
