/**
 * POST /api/admin/sync-dg-bookmakers
 *
 * Varre todas as legs em dg_opportunities, extrai bookmakers únicos
 * e upserta os novos na tabela `bookmakers`.
 *
 * Chamado automaticamente após cada importação de opportunities.
 * Também pode ser chamado manualmente pelo admin.
 *
 * Resposta: { ok, added: number, total: number, new_bookmakers: string[] }
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['michael.martins.trader@gmail.com', 'rmmichael20@gmail.com'];

/** Tenta inferir domínio a partir do slug do bookmaker. */
function inferDomain(slug: string): string | null {
  // Alguns slugs conhecidos com domínio diferente do slug
  const KNOWN: Record<string, string> = {
    'bet365':        'bet365.com',
    'betfair':       'betfair.com',
    'betfairex':     'betfair.com',
    'pinnacle':      'pinnacle.com',
    'betano':        'betano.com',
    'superbet':      'superbet.com.br',
    'sportingbet':   'sportingbet.com.br',
    'kto':           'kto.bet.br',
    'pixbet':        'pix.bet.br',
    'mmabet':        'mma.bet.br',
    'betdasorte':    'betdasorte.bet.br',
    'ricobet':       'rico.bet.br',
    'brxbet':        'brx.bet.br',
    'betgorillas':   'betgorillas.bet.br',
    'betbufalos':    'betbuffalos.bet.br',
    'vaidebet':      'vaidebet.com',
    'esportedasorte':'esportedasorte.com.br',
    'meridianbet':   'meridianbet.com',
    'betway':        'betway.com',
    'betsul':        'betsul.com',
    'versusbet':     'versus.bet.br',
    'betgo':         'betgo.bet.br',
    'estrelabet':    'estrelabet.bet.br',
    'br4bet':        'br4.bet.br',
    'esportivabet':  'esportiva.bet.br',
    'jogodeouro':    'jogodeouro.bet.br',
    'lotogreen':     'lotogreen.bet.br',
    'betpix365':     'betpix365.bet.br',
    'f12bet':        'f12.bet.br',
    'vupibet':       'vupi.bet.br',
    'sortenabet':    'sortenabet.bet.br',
    'betnacional':   'betnacional.com',
    'vivasorte':     'vivasorte.bet.br',
    'novibet':       'novibet.com.br',
  };

  const s = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (KNOWN[s]) return KNOWN[s];

  // Heurística: se termina com "bet" ou começa com "bet", tenta slug.bet.br
  return `${s}.bet.br`;
}

/** Capitaliza o nome display a partir do slug. */
function slugToName(slug: string): string {
  // Ex: "betgo" → "Betgo", "bet365" → "Bet365", "esportedasorte" → "Esportedasorte"
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(req: NextRequest) {
  // Verifica se é chamada interna (sem auth) ou do admin
  const isInternal = req.headers.get('x-internal-sync') === '1';

  if (!isInternal) {
    const cookieStore = await cookies();
    const supabase    = createSupabaseServerClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
      return NextResponse.json({ ok: false, error: 'Acesso restrito' }, { status: 403 });
    }
  }

  const admin = await getSupabaseAdmin();

  // ── 1. Lê todos os legs das opportunities ──────────────────────────────────
  const { data: opps, error: oppsErr } = await admin
    .from('dg_opportunities')
    .select('legs');

  if (oppsErr) {
    return NextResponse.json({ ok: false, error: oppsErr.message }, { status: 500 });
  }

  // ── 2. Extrai slugs e nomes únicos ─────────────────────────────────────────
  interface Leg { bookmaker: string; bookmakerSlug: string; matchUrl?: string }

  const found = new Map<string, string>(); // slug → display name do DG
  for (const opp of (opps ?? [])) {
    for (const leg of (opp.legs as Leg[] ?? [])) {
      const slug = (leg.bookmakerSlug ?? '').toLowerCase().trim();
      if (slug && !found.has(slug)) {
        found.set(slug, leg.bookmaker ?? slugToName(slug));
      }
    }
  }

  if (found.size === 0) {
    return NextResponse.json({ ok: true, added: 0, total: 0, new_bookmakers: [] });
  }

  // ── 3. Busca os que já existem na tabela ───────────────────────────────────
  const { data: existing } = await admin
    .from('bookmakers')
    .select('slug');

  const existingSlugs = new Set((existing ?? []).map((r: { slug: string }) => r.slug));

  // ── 4. Filtra os realmente novos e insere ──────────────────────────────────
  const toInsert = [];
  for (const [slug, name] of found.entries()) {
    if (!existingSlugs.has(slug)) {
      toInsert.push({
        slug,
        name:   slugToName(name) || slugToName(slug),
        domain: inferDomain(slug),
        source: 'dg_auto',
      });
    }
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, added: 0, total: found.size, new_bookmakers: [] });
  }

  const { error: insertErr } = await admin
    .from('bookmakers')
    .insert(toInsert);

  if (insertErr) {
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  console.log(`[sync-dg-bookmakers] ${toInsert.length} novos bookmakers adicionados:`, toInsert.map(b => b.slug));

  return NextResponse.json({
    ok:              true,
    added:           toInsert.length,
    total:           found.size,
    new_bookmakers:  toInsert.map(b => `${b.name} (${b.domain})`),
  });
}
