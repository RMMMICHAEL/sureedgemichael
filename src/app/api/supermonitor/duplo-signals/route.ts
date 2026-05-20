/**
 * POST /api/supermonitor/duplo-signals
 *
 * Busca sinais de Duplo Futebol diretamente do Super Monitor (signals_proxy.php).
 * Isso garante dados em tempo real de todos os jogos, sem depender do sm_odds.
 *
 * Body: { pa_mode?: 'ambos' | 'um' | 'nenhum', disabled_houses?: string[] }
 */
export const dynamic = 'force-dynamic';
export const preferredRegion = ['gru1'];

import { NextRequest, NextResponse } from 'next/server';
import { getActiveCookie } from '@/lib/supermonitor-auth';

const BASE = 'https://painel.supermonitor.pro';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Tipos do Super Monitor ─────────────────────────────────────────────────────

interface SMSignal {
  id:             string;
  tipo:           string;           // 'ML' = 3-way arb
  jogo:           string;           // "Freiburg x Aston Villa"
  campeonato?:    string;
  liga?:          string;
  league?:        string;
  data?:          string;           // ISO datetime
  profit_margin?: number;           // positivo = lucro, negativo = perda
  age_seconds?:   number;
  // Pernas do sinal
  casa1?:         string;           // "Betano (PA)" ou "Betbra"
  casa2?:         string;           // leg do empate
  casa3?:         string;           // leg do fora
  odd1?:          number;
  odd2?:          number;
  odd3?:          number;
  link1?:         string;
  link2?:         string;
  link3?:         string;
  selection1?:    string;
  selection2?:    string;
  selection3?:    string;
}

// ── Nosso formato de saída ─────────────────────────────────────────────────────

export interface MLSignal {
  event_id:     string;
  event_name:   string;
  league:       string;
  start_utc:    string;
  leg1:         { house: string; pa: boolean; odd: number; url?: string };
  legX:         { house: string; pa: boolean; odd: number; url?: string };
  leg2:         { house: string; pa: boolean; odd: number; url?: string };
  margin:       number;
  loss_pct:     number;
  data_age_min: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extrai nome e flag PA de uma casa como "Betano (PA)" */
function parseCasa(raw: string): { name: string; pa: boolean } {
  const pa = /\(pa\)/i.test(raw);
  return { name: raw.replace(/\s*\(pa\)/gi, '').trim(), pa };
}

function normHouse(h: string): string {
  return h.toLowerCase().replace(/[\s\-_.]/g, '');
}

/** Obtém nonce de segurança do proxy do SM */
async function getNonce(cookie: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/proxy_nonce.php`, {
      headers: {
        Cookie:   cookie,
        'User-Agent': UA,
        Accept:   'application/json',
        Referer:  `${BASE}/index.php?page=alertas-scanner`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { nonce?: string };
    return data.nonce ?? null;
  } catch {
    return null;
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let paMode: 'ambos' | 'um' | 'nenhum' = 'ambos';
  let disabledHouses: string[] = [];

  try {
    const body = await req.json() as { pa_mode?: string; disabled_houses?: string[] };
    if (body.pa_mode === 'um' || body.pa_mode === 'nenhum') paMode = body.pa_mode;
    disabledHouses = (body.disabled_houses ?? []).map(h => normHouse(h));
  } catch { /* vazio */ }

  const disabledSet = new Set(disabledHouses);

  // ── 1. Autenticação ──────────────────────────────────────────────────────────
  let cookie: string;
  try {
    cookie = await getActiveCookie();
  } catch {
    return NextResponse.json({ ok: false, error: 'auth/no-cookie' });
  }

  // ── 2. Nonce ─────────────────────────────────────────────────────────────────
  const nonce = await getNonce(cookie);

  // ── 3. Buscar sinais ──────────────────────────────────────────────────────────
  let smSignals: SMSignal[] = [];
  let encrypted = false;

  try {
    const headers: Record<string, string> = {
      Cookie:       cookie,
      'User-Agent': UA,
      Accept:       'application/json',
      Referer:      `${BASE}/index.php?page=alertas-scanner`,
    };
    if (nonce) headers['X-Proxy-Nonce'] = nonce;

    const res = await fetch(`${BASE}/api/signals_proxy.php?limit=3000`, { headers });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `sm_http_${res.status}` });
    }

    const raw = await res.json() as SMSignal[] | { encrypted: boolean; data: string } | { error?: string };

    if (Array.isArray(raw)) {
      smSignals = raw;
    } else if ('encrypted' in raw && raw.encrypted) {
      encrypted = true;
    } else if ('error' in raw) {
      return NextResponse.json({ ok: false, error: `sm_error: ${raw.error}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `fetch_error: ${msg}` });
  }

  if (encrypted) {
    return NextResponse.json({ ok: false, error: 'auth/encrypted', hint: 'Reabra a aba do Super Monitor no browser para renovar a sessão de criptografia.' });
  }

  // ── 4. Filtrar e transformar ──────────────────────────────────────────────────

  const now = Date.now();
  const signals: MLSignal[] = [];

  for (const s of smSignals) {
    // Apenas tipo ML (3-way: Casa / Empate / Fora)
    if (s.tipo !== 'ML') continue;

    // Precisa ter as 3 pernas
    if (!s.casa1 || !s.casa2 || !s.casa3) continue;
    if (!s.odd1 || !s.odd2 || !s.odd3) continue;

    const leg1 = parseCasa(s.casa1);
    const legX = parseCasa(s.casa2);
    const leg2 = parseCasa(s.casa3);

    // Filtro de casas desabilitadas
    if (disabledSet.has(normHouse(leg1.name))) continue;
    if (disabledSet.has(normHouse(legX.name))) continue;
    if (disabledSet.has(normHouse(leg2.name))) continue;

    // Filtro PA (leg1 = Casa, leg2 = Fora — legX/Empate pode ser qualquer casa)
    if (paMode === 'ambos' && (!leg1.pa || !leg2.pa)) continue;
    if (paMode === 'um'    && !leg1.pa && !leg2.pa)   continue;

    // Cálculo de margin a partir das odds (SM já tem profit_margin, usamos para verificar)
    const margin  = 1 / s.odd1 + 1 / s.odd2 + 1 / s.odd3;
    // SM: profit_margin positivo = lucro; nosso loss_pct: negativo = lucro
    const lossPct = s.profit_margin != null
      ? Math.round(-s.profit_margin * 100) / 100
      : Math.round((margin - 1) * 10000) / 100;

    // Idade dos dados em minutos (usa age_seconds do SM se disponível)
    const dataAgeMin = s.age_seconds != null ? Math.round(s.age_seconds / 60) : 0;

    // Data do jogo
    const startUtc = s.data ?? '';

    // Excluir jogos encerrados (> 90 min atrás)
    if (startUtc) {
      const startMs = new Date(startUtc).getTime();
      if (!isNaN(startMs) && startMs < now - 90 * 60_000) continue;
    }

    signals.push({
      event_id:     s.id,
      event_name:   s.jogo ?? '',
      league:       s.campeonato ?? s.liga ?? s.league ?? '',
      start_utc:    startUtc,
      leg1:         { house: leg1.name, pa: leg1.pa, odd: s.odd1, url: s.link1 },
      legX:         { house: legX.name, pa: legX.pa, odd: s.odd2, url: s.link2 },
      leg2:         { house: leg2.name, pa: leg2.pa, odd: s.odd3, url: s.link3 },
      margin,
      loss_pct:     lossPct,
      data_age_min: dataAgeMin,
    });
  }

  // Ordena por loss_pct (menor perda / maior lucro primeiro)
  signals.sort((a, b) => a.loss_pct - b.loss_pct);

  return NextResponse.json({
    ok:           true,
    ml:           signals.slice(0, 300),
    total_events: new Set(smSignals.filter(s => s.tipo === 'ML').map(s => s.id)).size,
    computed_at:  new Date().toISOString(),
    source:       'supermonitor_live',
  });
}
