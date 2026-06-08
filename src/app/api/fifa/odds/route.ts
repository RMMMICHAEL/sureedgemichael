/**
 * GET /api/fifa/odds
 * Busca eventos de FIFA E-Sports (Bet365 + Superbet + Sportingbet)
 * e detecta surebets entre os bookmakers.
 *
 * Tipos de surebet detectados:
 *  - DC 1X vs 2       (Chance Dupla Home/Draw vs Away)
 *  - DC X2 vs 1       (Chance Dupla Draw/Away vs Home)
 *  - DC 12 vs X       (Chance Dupla Home/Away vs Draw)
 *  - Over N vs Under N (mesma linha — sempre um ganha)
 *  - Over N vs Under N+0.5 (cross-line — sempre um ganha)
 *
 * Parâmetros:
 *   ?filter=surebet    → apenas jogos com surebet identificada
 *   ?filter=all        → todos os jogos (padrão)
 *   ?duration=6|8|all  → filtra por duração
 */

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';

const PS_BASE   = 'https://api.pulsescore.net/api/v3/bet365';
const PS_SECRET = process.env.PULSESCORE_SECRET ?? '';
const LIMIT     = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PulseSelection {
  canonicalOutcome: string;
  rawName?:         string;
  name?:            string;
  odds:             number;
  isActive:         boolean;
  line?:            number;  // para over/under
  moreInfo?:        Record<string, string>;
}

interface PulseMarket {
  canonicalMarket: string;
  rawName?:        string;
  name?:           string;
  isActive:        boolean;
  selections:      PulseSelection[];
  line?:           number;
  period?:         string;
}

interface PulseEvent {
  eventId:   string;
  sport:     string;
  league:    string;
  home:      string;
  away:      string;
  live:      boolean;
  startTime: string;
  markets:   PulseMarket[];
}

interface PulseResponse {
  total:       number;
  page:        number;
  limit:       number;
  totalPages:  number;
  hasNextPage: boolean;
  events:      PulseEvent[];
}

export interface BookmakerOdds {
  slug: string;
  name: string;
  url:  string;
}

export interface MarketOdds {
  bookmaker: BookmakerOdds;
  type:      'match_result' | 'double_chance' | 'over_under';
  outcome:   string;  // '1'|'X'|'2'|'1X'|'X2'|'12'|'over'|'under'
  line?:     number;  // para over/under
  odds:      number;
}

export interface Surebet {
  id:        string;
  type:      'dc_1x_2' | 'dc_x2_1' | 'dc_12_x' | 'ou_cross' | 'ou_same';
  label:     string;
  leg1:      MarketOdds;
  leg2:      MarketOdds;
  profit:    number;  // % de lucro garantido
  stakes?:   { s1: number; s2: number; total: number; profit: number };
}

export interface FifaEvent {
  eventId:    string;
  home:       string;
  away:       string;
  league:     string;
  category:   string;
  duration:   '6min' | '8min' | 'other';
  startTime:  string;
  markets:    MarketOdds[];
  surebets:   Surebet[];
  hasSurebet: boolean;
}

// ── PulseScore fetch ──────────────────────────────────────────────────────────

async function fetchEsportsPage(page: number): Promise<PulseResponse | null> {
  if (!PS_SECRET) return null;
  try {
    const res = await fetch(
      `${PS_BASE}/e-sports/events?page=${page}&limit=${LIMIT}`,
      { headers: { Accept: 'application/json', 'x-secret': PS_SECRET }, cache: 'no-store' }
    );
    if (!res.ok) {
      // tenta path alternativo
      const res2 = await fetch(
        `${PS_BASE}/esports/events?page=${page}&limit=${LIMIT}`,
        { headers: { Accept: 'application/json', 'x-secret': PS_SECRET }, cache: 'no-store' }
      );
      if (!res2.ok) return null;
      return res2.json() as Promise<PulseResponse>;
    }
    return res.json() as Promise<PulseResponse>;
  } catch {
    return null;
  }
}

// ── Market extraction ─────────────────────────────────────────────────────────

function detectDuration(league: string): '6min' | '8min' | 'other' {
  const l = league.toLowerCase();
  if (l.includes('6 min') || l.includes('6min') || l.includes('6-min') || l.includes('4x5') || l.includes('4 x 5')) return '6min';
  if (l.includes('8 min') || l.includes('8min') || l.includes('8-min')) return '8min';
  return 'other';
}

// Detecta categoria de e-sport
function detectCategory(sport: string, league: string): string {
  const l = (sport + ' ' + league).toLowerCase();
  if (l.includes('fifa') || l.includes('e-soccer') || l.includes('esoccer')) return 'FIFA';
  if (l.includes('basketball') || l.includes('ebasket')) return 'Basquete';
  if (l.includes('cs2') || l.includes('counter')) return 'CS2';
  if (l.includes('valorant')) return 'Valorant';
  if (l.includes('dota')) return 'Dota2';
  if (l.includes('lol') || l.includes('league of legends')) return 'LoL';
  if (l.includes('virtual')) return 'Virtual';
  return 'E-Sports';
}

// Classifica o tipo de mercado pelo canonicalMarket ou rawName
function classifyMarket(cm: string, rawName: string): 'match_result' | 'double_chance' | 'over_under' | null {
  const raw = (rawName ?? '').toLowerCase();
  const canon = cm.toUpperCase();

  if (canon === 'MATCH_RESULT' || raw === 'match result' || raw === '1x2' || raw === 'match betting')
    return 'match_result';
  if (canon === 'DOUBLE_CHANCE' || raw === 'double chance' || raw.includes('double chance'))
    return 'double_chance';
  if (canon === 'OVER_UNDER' || canon === 'TOTAL_GOALS' ||
      raw === 'goals over/under' || raw.includes('total goals') ||
      raw.includes('over/under') || raw === 'asian handicap goals' ||
      raw.includes('match total'))
    return 'over_under';

  return null;
}

// Extrai a linha (handicap) de over/under da seleção ou do moreInfo
function extractLine(s: PulseSelection, mkt: PulseMarket): number {
  if (s.line) return s.line;
  if (mkt.line) return mkt.line;
  // tenta extrair do HD no moreInfo (ex: "+2.5" ou "2.5")
  const hd = s.moreInfo?.HD ?? '';
  if (hd) {
    const n = parseFloat(hd.replace('+', ''));
    if (!isNaN(n) && n > 0) return n;
  }
  // tenta extrair do rawName da seleção (ex: "Over 2.5")
  const raw = (s.rawName ?? s.name ?? '').toLowerCase();
  const m = raw.match(/(\d+\.?\d*)/);
  if (m) return parseFloat(m[1]);
  return 0;
}

function extractMarkets(ev: PulseEvent, bk: BookmakerOdds): MarketOdds[] {
  const result: MarketOdds[] = [];

  // Só processa mercados de tempo completo
  for (const mkt of ev.markets) {
    if (!mkt.isActive) continue;
    if (mkt.period && mkt.period !== 'FULL_TIME' && mkt.period !== '') continue;

    const marketType = classifyMarket(mkt.canonicalMarket, mkt.rawName ?? '');
    if (!marketType) continue;

    const sels = mkt.selections.filter(s => s.isActive && s.odds > 1);

    // ── 1X2 ──
    if (marketType === 'match_result') {
      for (const s of sels) {
        const co = s.canonicalOutcome?.toUpperCase();
        const raw = (s.rawName ?? s.name ?? '').toLowerCase();
        const outcome = (co === 'HOME' || raw.includes('home') || raw === '1') ? '1'
          : (co === 'DRAW' || raw.includes('draw') || raw === 'x')             ? 'X'
          : (co === 'AWAY' || raw.includes('away') || raw === '2')             ? '2'
          : null;
        if (!outcome) continue;
        // Evita duplicata (mesmo outcome, mesmo bookmaker)
        if (result.find(r => r.type === 'match_result' && r.outcome === outcome && r.bookmaker.slug === bk.slug)) continue;
        result.push({ bookmaker: bk, type: 'match_result', outcome, odds: s.odds });
      }
    }

    // ── Double Chance ──
    if (marketType === 'double_chance') {
      for (const s of sels) {
        const co = (s.canonicalOutcome ?? s.rawName ?? s.name ?? '').toUpperCase();
        const outcome = (co.includes('1X') || co.includes('HOME_DRAW') || co.includes('HOMEDRAW')) ? '1X'
          : (co.includes('X2') || co.includes('DRAW_AWAY') || co.includes('DRAWAWAY'))             ? 'X2'
          : (co.includes('12') || co.includes('HOME_AWAY') || co.includes('HOMEAWAY'))             ? '12'
          : null;
        if (!outcome) continue;
        if (result.find(r => r.type === 'double_chance' && r.outcome === outcome && r.bookmaker.slug === bk.slug)) continue;
        result.push({ bookmaker: bk, type: 'double_chance', outcome, odds: s.odds });
      }
    }

    // ── Over/Under ──
    if (marketType === 'over_under') {
      for (const s of sels) {
        const co  = (s.canonicalOutcome ?? s.rawName ?? s.name ?? '').toLowerCase();
        const isOver  = co.includes('over')  || co === 'o';
        const isUnder = co.includes('under') || co === 'u';
        if (!isOver && !isUnder) continue;
        const line = extractLine(s, mkt);
        if (line <= 0) continue;
        result.push({
          bookmaker: bk,
          type:      'over_under',
          outcome:   isOver ? 'over' : 'under',
          line,
          odds:      s.odds,
        });
      }
    }
  }

  return result;
}

// ── Surebet detection ─────────────────────────────────────────────────────────

function calcProfit(o1: number, o2: number): number {
  const sum = 1 / o1 + 1 / o2;
  if (sum >= 1) return 0;
  return Math.round((1 / sum - 1) * 10000) / 100;  // profit %
}

function calcStakes(o1: number, o2: number, bankroll = 100): { s1: number; s2: number; total: number; profit: number } {
  const sum = 1 / o1 + 1 / o2;
  const s1  = Math.round(bankroll / (o1 * sum) * 100) / 100;
  const s2  = Math.round(bankroll / (o2 * sum) * 100) / 100;
  const ret = Math.round(bankroll / sum * 100) / 100;
  return { s1, s2, total: bankroll, profit: Math.round((ret - bankroll) * 100) / 100 };
}

function detectSurebets(markets: MarketOdds[]): Surebet[] {
  const surebets: Surebet[] = [];

  // Agrupa por tipo/outcome
  const mr  = markets.filter(m => m.type === 'match_result');
  const dc  = markets.filter(m => m.type === 'double_chance');
  const ou  = markets.filter(m => m.type === 'over_under');

  // ── DC vs Match Result ───────────────────────────────────────────────────────
  const dcTypes = [
    { dc: '1X', mrOutcome: '2',  surebetType: 'dc_1x_2'  as const, label: 'DC 1X + Away (2)' },
    { dc: 'X2', mrOutcome: '1',  surebetType: 'dc_x2_1'  as const, label: 'DC X2 + Home (1)' },
    { dc: '12', mrOutcome: 'X',  surebetType: 'dc_12_x'  as const, label: 'DC 12 + Empate (X)'},
  ];

  for (const { dc: dcOut, mrOutcome, surebetType, label } of dcTypes) {
    const dcLegs  = dc.filter(m => m.outcome === dcOut);
    const mrLegs  = mr.filter(m => m.outcome === mrOutcome);
    for (const leg1 of dcLegs) {
      for (const leg2 of mrLegs) {
        if (leg1.bookmaker.slug === leg2.bookmaker.slug) continue;
        const profit = calcProfit(leg1.odds, leg2.odds);
        if (profit > 0) {
          surebets.push({
            id: `${surebetType}-${leg1.bookmaker.slug}-${leg2.bookmaker.slug}`,
            type: surebetType,
            label,
            leg1,
            leg2,
            profit,
            stakes: calcStakes(leg1.odds, leg2.odds),
          });
        }
      }
    }
  }

  // ── Over/Under cross-line ────────────────────────────────────────────────────
  const overs  = ou.filter(m => m.outcome === 'over');
  const unders = ou.filter(m => m.outcome === 'under');

  for (const over of overs) {
    for (const under of unders) {
      if (over.bookmaker.slug === under.bookmaker.slug) continue;
      const L1 = over.line  ?? 0;
      const L2 = under.line ?? 0;

      // Surebet válida quando Under line > Over line (sem sobreposição inteira)
      // ex: Over 4.5 + Under 5   → gap 0.5, um sempre ganha
      //     Over 5   + Under 5.5 → gap 0.5, um sempre ganha
      //     Over 4   + Under 5   → gap 1.0, dead zone: total=4 empate (push) em alguns
      //     Over 4.5 + Under 4.5 → mesma linha, um sempre ganha
      if (L2 > L1 && (L2 - L1) <= 1.0) {
        const profit = calcProfit(over.odds, under.odds);
        if (profit > 0) {
          const isSameLine = L1 === L2;
          surebets.push({
            id: `ou-${over.bookmaker.slug}-${under.bookmaker.slug}-${L1}-${L2}`,
            type: isSameLine ? 'ou_same' : 'ou_cross',
            label: isSameLine
              ? `Over ${L1} + Under ${L2} (mesma linha)`
              : `Over ${L1} + Under ${L2} (cross-line)`,
            leg1: over,
            leg2: under,
            profit,
            stakes: calcStakes(over.odds, under.odds),
          });
        }
      }
    }
  }

  // Ordena pelo maior lucro
  return surebets.sort((a, b) => b.profit - a.profit);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filterMode = searchParams.get('filter') ?? 'all';
  const duration   = searchParams.get('duration') ?? 'all';

  if (!PS_SECRET) {
    return NextResponse.json({ error: 'API key not configured', events: [] }, { status: 200 });
  }

  // Busca página 1 para obter total de páginas
  const first = await fetchEsportsPage(1);
  if (!first) {
    return NextResponse.json({ events: [], total: 0 }, { status: 200 });
  }

  // Busca páginas restantes (até 5 páginas = 250 eventos)
  const maxPages = Math.min(first.totalPages, 5);
  const extraPages = await Promise.all(
    Array.from({ length: maxPages - 1 }, (_, i) => fetchEsportsPage(i + 2))
  );
  const allPages = [first, ...extraPages];
  const rawEvents: PulseEvent[] = [];
  for (const p of allPages) {
    if (p) rawEvents.push(...p.events);
  }

  // Filtra pré-jogo e duração solicitada (aceita todos os e-sports)
  const filtered = rawEvents.filter(ev => {
    if (ev.live) return false;
    const dur = detectDuration(ev.league);
    if (duration === '6' && dur !== '6min') return false;
    if (duration === '8' && dur !== '8min') return false;
    return true;
  });

  // Debug: loga estrutura do primeiro evento bruto
  if (rawEvents.length > 0) {
    const sample = rawEvents[0];
    console.log('[fifa/odds] sample event keys:', Object.keys(sample));
    console.log('[fifa/odds] sample markets count:', sample.markets?.length ?? 'N/A');
    if (sample.markets?.length > 0) {
      console.log('[fifa/odds] first market:', JSON.stringify(sample.markets[0]));
    } else {
      console.log('[fifa/odds] raw event sample:', JSON.stringify(sample).slice(0, 500));
    }
  }

  const bet365: BookmakerOdds = {
    slug: 'bet365',
    name: 'Bet365',
    url:  '',  // preenchido por evento
  };

  const events: FifaEvent[] = filtered.map(ev => {
    const bk = { ...bet365, url: `https://www.bet365.com.br/#/AC#B1#C1#D8#E${ev.eventId}#F3#I1#` };
    const markets = extractMarkets(ev, bk);
    const surebets = detectSurebets(markets);

    return {
      eventId:   ev.eventId,
      home:      ev.home,
      away:      ev.away,
      league:    ev.league.split('||').pop()?.trim() ?? ev.league,
      category:  detectCategory(ev.sport ?? '', ev.league),
      duration:  detectDuration(ev.league),
      startTime: ev.startTime,
      markets,
      surebets,
      hasSurebet: surebets.length > 0,
    };
  });

  // Aplica filtro de surebet
  const result = filterMode === 'surebet'
    ? events.filter(e => e.hasSurebet)
    : events;

  // Ordena: primeiro com surebet, depois por horário
  result.sort((a, b) => {
    if (a.hasSurebet && !b.hasSurebet) return -1;
    if (!a.hasSurebet && b.hasSurebet) return 1;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return NextResponse.json({
    events:     result,
    total:      result.length,
    totalRaw:   rawEvents.length,
    fifaRaw:    filtered.length,
    withSurebet: result.filter(e => e.hasSurebet).length,
  });
}
