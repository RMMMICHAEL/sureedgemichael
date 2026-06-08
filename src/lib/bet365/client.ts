/**
 * Cliente Bet365 — via PulseScore API (api.pulsescore.net).
 * Auth: header x-secret = process.env.PULSESCORE_SECRET
 *
 * Estrutura de resposta:
 *   events[].home / .away         → nomes dos times
 *   events[].startTime            → ISO UTC timestamp
 *   events[].league               → "Region||League Name"
 *   events[].markets[]            → lista de mercados
 *     canonicalMarket === "MATCH_RESULT"
 *     selections[].canonicalOutcome = "HOME"|"DRAW"|"AWAY"
 *     selections[].odds           → decimal
 */

import type { OddsSummary } from '@/lib/altenar/client';

const BASE   = 'https://api.pulsescore.net/api/v3/bet365';
const SECRET = process.env.PULSESCORE_SECRET ?? '';
const LIMIT  = 30; // máximo permitido pela API

const HEADERS = {
  Accept:     'application/json',
  'x-secret': SECRET,
};

// ── Raw API types ─────────────────────────────────────────────────────────────

interface PulseSelection {
  canonicalOutcome: 'HOME' | 'DRAW' | 'AWAY' | string;
  odds:             number;
  isActive:         boolean;
}

interface PulseMarket {
  canonicalMarket: string;  // 'MATCH_RESULT' | 'OVER_UNDER' | ...
  isActive:        boolean;
  selections:      PulseSelection[];
}

interface PulseEvent {
  eventId:   string;
  sport:     string;
  league:    string;  // "Region||League Name"
  home:      string;
  away:      string;
  live:      boolean;
  startTime: string;  // ISO UTC
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

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPage(page: number): Promise<PulseResponse | null> {
  try {
    const url = `${BASE}/events?page=${page}&limit=${LIMIT}`;
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<PulseResponse>;
  } catch {
    return null;
  }
}

// ── Odds extraction ───────────────────────────────────────────────────────────

function extract1X2(
  markets: PulseMarket[],
): { home: number; draw: number; away: number } | null {
  const mkt = markets.find(
    m => m.canonicalMarket === 'MATCH_RESULT' && m.isActive,
  );
  if (!mkt) return null;

  const sel = mkt.selections.filter(s => s.isActive);
  const s1  = sel.find(s => s.canonicalOutcome === 'HOME');
  const sX  = sel.find(s => s.canonicalOutcome === 'DRAW');
  const s2  = sel.find(s => s.canonicalOutcome === 'AWAY');

  if (!s1 || !sX || !s2)     return null;
  if (s1.odds <= 1 || s2.odds <= 1) return null;

  return { home: s1.odds, draw: sX.odds, away: s2.odds };
}

function parseLeague(raw: string): string {
  // "The Americas||USA UPSL" → "USA UPSL"
  const parts = raw.split('||');
  return parts[parts.length - 1]?.trim() ?? raw;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getBet365Odds(): Promise<OddsSummary[]> {
  if (!SECRET) return [];

  // Página 1 para obter o total de páginas
  const first = await fetchPage(1);
  if (!first) return [];

  // Busca todas as páginas restantes em paralelo
  const remaining = Array.from({ length: first.totalPages - 1 }, (_, i) =>
    fetchPage(i + 2),
  );
  const pages = [first, ...(await Promise.all(remaining))];

  const results: OddsSummary[] = [];

  for (const page of pages) {
    if (!page) continue;

    for (const ev of page.events) {
      if (ev.live) continue; // apenas pré-jogo

      const odds = extract1X2(ev.markets);
      if (!odds) continue;

      const leagueName = parseLeague(ev.league);

      // URL de deep-link para o evento na Bet365 via tabIT
      const eventUrl = `https://www.bet365.com.br/#/AC#B1#C1#D8#E${ev.eventId}#F3#I1#`;

      results.push({
        match_id:    ev.eventId,
        home_team:   ev.home,
        away_team:   ev.away,
        start_time:  ev.startTime,
        league_name: leagueName,
        league_id:   0,
        bookmakers: [{
          slug:  'bet365',
          name:  'Bet365',
          home:  odds.home,
          draw:  odds.draw,
          away:  odds.away,
          url:   eventUrl,
          is_pa: false, // Bet365 NÃO tem Pagamento Antecipado
        }],
      });
    }
  }

  return results;
}
