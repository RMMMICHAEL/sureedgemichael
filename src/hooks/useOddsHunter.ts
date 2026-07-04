'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface OHLeg {
  batch_id:    string;
  surebet_id:  string;
  leg_index:   number;
  match:       string;
  house:       string;
  market:      string;
  outcome:     string;
  odd_value:   number;
  chance:      number;
  profit:      number;
  sport:       string;
  tournament:  string;
  date:        string | null;
  hour:        string | null;
  timestamp:   string | null;
  legs_count:  number;
  updated_at:  string;
  redirect_id: string | null;
  anchor:      string | null;
  period_info: string | null;
  is_active:   boolean;
  disappeared: boolean;
  is_live?:    boolean;
  minutes?:    number | null;
  live_color?: string | null;
}

export type Selection = 'home' | 'away' | 'draw' | '1x' | 'x2' | '12';

export interface OHBookmaker {
  house:     string;
  outcome:   string;
  odd:       number;
  selection: Selection;
  anchor:    string | null;
  redirect_id: string | null;
  is_live:   boolean;
  updated_at: string;
}

export interface OHSurebet {
  id:         string;
  match:      string;
  sport:      string;
  tournament: string;
  date:       string | null;
  hour:       string | null;
  is_live:    boolean;
  profit:     number;       // melhor margem calculada
  bookmakers: OHBookmaker[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const HUB_PRE  = 'https://hub.oddshunter.com.br/arb-pre';
const HUB_LIVE = 'https://hub.oddshunter.com.br/arb-live';

const POLL_PRE_MS  = 2_500;
const POLL_LIVE_MS = 5_000;
const LIVE_CUTOFF_MS = 30_000;
const PRE_GRACE_MS   = 15_000;

// Whitelist de mercados aceitos (exact)
const MARKET_WHITELIST = new Set([
  '1','2','x','team1 win','team2 win','1x','x2','12','ml','1x2',
  'moneyline','3-way result','resultado','match result','w1w2',
  '1x2 (match)','match winner','resultado final','resultado do jogo',
]);
// Substrings aceitas como fallback
const MARKET_KEYWORDS = ['1x2','moneyline','resultado','match result','match winner','3-way','ml'];

function isMarketAllowed(market: string): boolean {
  const m = market.toLowerCase().trim();
  if (MARKET_WHITELIST.has(m)) return true;
  return MARKET_KEYWORDS.some(k => m.includes(k));
}

// Sinônimos de seleção
const HOME_SYNS  = new Set(['1','team1 win','home','w1']);
const DRAW_SYNS  = new Set(['x','draw','empate','tie']);
const AWAY_SYNS  = new Set(['2','team2 win','away','w2']);
const DC_1X      = new Set(['1x']);
const DC_X2      = new Set(['x2']);
const DC_12      = new Set(['12']);

function normalizeOutcome(outcome: string, market: string): Selection | null {
  const o = outcome.toLowerCase().trim();
  const m = market.toLowerCase().trim();

  if (HOME_SYNS.has(o) || HOME_SYNS.has(m)) return 'home';
  if (DRAW_SYNS.has(o) || DRAW_SYNS.has(m)) return 'draw';
  if (AWAY_SYNS.has(o) || AWAY_SYNS.has(m)) return 'away';
  if (DC_1X.has(o) || DC_1X.has(m)) return '1x';
  if (DC_X2.has(o) || DC_X2.has(m)) return 'x2';
  if (DC_12.has(o) || DC_12.has(m)) return '12';

  return null;
}

function calcProfit(bookmakers: OHBookmaker[]): number {
  // Mapa seleção → melhor odd
  const best = new Map<string, number>();
  for (const b of bookmakers) {
    if (b.odd <= 1) continue;
    // Para dupla chance, mapear para seleções canônicas
    let key: string = b.selection;
    if (b.selection === '1x' || b.selection === '12') key = 'home';
    if (b.selection === 'x2') key = 'away';
    const cur = best.get(key) ?? 0;
    if (b.odd > cur) best.set(key, b.odd);
  }

  const vals = Array.from(best.values());
  if (vals.length < 2) return 0;

  const sum = vals.reduce((acc, v) => acc + 1 / v, 0);
  if (sum >= 1) return 0;
  return parseFloat(((1 / sum - 1) * 100).toFixed(2));
}

function parseTs(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  if (!isNaN(n)) return n < 1e12 ? n * 1000 : n; // epoch s → ms
  const d = new Date(v).getTime();
  return isNaN(d) ? 0 : d;
}

function processLegs(legs: OHLeg[], isLive: boolean): OHSurebet[] {
  const now = Date.now();

  // Filtrar mercado + odds válidas (pré: também is_active + !disappeared)
  const valid = legs.filter(l => {
    if (l.odd_value <= 1) return false;
    if (!isMarketAllowed(l.market)) return false;
    if (!isLive && (l.is_active === false || l.disappeared === true)) return false;
    return true;
  });

  // Agrupar por batch_id (fallback: surebet_id)
  const groups = new Map<string, OHLeg[]>();
  for (const l of valid) {
    const key = l.batch_id || l.surebet_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  const surebets: OHSurebet[] = [];

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Dentro do grupo, dedup por leg_index → mais recente
    const byLeg = new Map<number, OHLeg>();
    for (const l of group) {
      const cur = byLeg.get(l.leg_index);
      if (!cur || l.updated_at > cur.updated_at) byLeg.set(l.leg_index, l);
    }
    let activelegs = Array.from(byLeg.values());

    // Live: descartar linhas com updated_at > 30s atrás
    if (isLive) {
      activelegs = activelegs.filter(l => {
        const ts = parseTs(l.updated_at);
        return ts === 0 || now - ts < LIVE_CUTOFF_MS; // ts=0 → campo ausente, não descarta
      });
      if (activelegs.length < 2) continue;
    }

    const bookmakers: OHBookmaker[] = [];
    for (const l of activelegs) {
      const sel = normalizeOutcome(l.outcome, l.market);
      if (!sel) continue;
      bookmakers.push({
        house:       l.house,
        outcome:     l.outcome,
        odd:         l.odd_value,
        selection:   sel,
        anchor:      l.anchor,
        redirect_id: l.redirect_id,
        is_live:     l.is_live ?? false,
        updated_at:  l.updated_at ?? '',
      });
    }

    if (bookmakers.length < 2) continue;

    const profit = calcProfit(bookmakers);
    if (profit <= 0) continue;

    const first = activelegs[0];

    // Dedup por surebet_id base (sem #suffix)
    const sbId = (first.surebet_id ?? '').split('#')[0] || first.batch_id;

    surebets.push({
      id:         sbId,
      match:      first.match,
      sport:      first.sport,
      tournament: first.tournament,
      date:       first.date,
      hour:       first.hour,
      is_live:    first.is_live ?? false,
      profit,
      bookmakers,
    });
  }

  // Dedup final por id: manter maior lucro
  const dedupMap = new Map<string, OHSurebet>();
  for (const s of surebets) {
    const cur = dedupMap.get(s.id);
    if (!cur || s.profit > cur.profit) dedupMap.set(s.id, s);
  }

  return Array.from(dedupMap.values()).sort((a, b) => b.profit - a.profit);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseOddsHunterResult {
  preSurebets:  OHSurebet[];
  liveSurebets: OHSurebet[];
  loading:      boolean;
  error:        string | null;
  lastUpdate:   number;
  refresh:      () => void;
}

interface HubResponse {
  data?: OHLeg[];
}

async function fetchHub(url: string, signal: AbortSignal): Promise<OHLeg[]> {
  let attempt = 0;
  while (attempt < 3) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal });
      if (res.ok) {
        const json = await res.json() as HubResponse | OHLeg[];
        const data: OHLeg[] = Array.isArray(json) ? json : (json.data ?? []);
        return data;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
    attempt++;
    if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
  }
  return [];
}

export function useOddsHunter(): UseOddsHunterResult {
  const [preSurebets,  setPreSurebets]  = useState<OHSurebet[]>([]);
  const [liveSurebets, setLiveSurebets] = useState<OHSurebet[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [lastUpdate,   setLastUpdate]   = useState(0);

  const preAbort  = useRef<AbortController | null>(null);
  const liveAbort = useRef<AbortController | null>(null);
  const refreshTick = useRef(0);

  // Cache de pré com grace period (15s)
  const preCache = useRef<Map<string, { legs: OHLeg[]; seenAt: number }>>(new Map());

  const fetchPre = useCallback(async () => {
    preAbort.current?.abort();
    const ctrl = new AbortController();
    preAbort.current = ctrl;

    try {
      const legs = await fetchHub(HUB_PRE, ctrl.signal);
      const now  = Date.now();

      // Atualiza cache com grace period
      const activeIds = new Set(legs.map(l => l.batch_id || l.surebet_id));
      for (const [id, entry] of preCache.current) {
        if (!activeIds.has(id) && now - entry.seenAt > PRE_GRACE_MS) {
          preCache.current.delete(id);
        }
      }
      for (const l of legs) {
        const id = l.batch_id || l.surebet_id;
        preCache.current.set(id, { legs: [], seenAt: now });
      }

      setPreSurebets(processLegs(legs, false));
      setError(null);
      setLastUpdate(Date.now());
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLive = useCallback(async () => {
    liveAbort.current?.abort();
    const ctrl = new AbortController();
    liveAbort.current = ctrl;

    try {
      const legs = await fetchHub(HUB_LIVE, ctrl.signal);
      setLiveSurebets(processLegs(legs, true));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }, []);

  const refresh = useCallback(() => {
    refreshTick.current += 1;
    setLoading(true);
    fetchPre();
    fetchLive();
  }, [fetchPre, fetchLive]);

  useEffect(() => {
    fetchPre();
    fetchLive();

    const preId  = setInterval(fetchPre,  POLL_PRE_MS);
    const liveId = setInterval(fetchLive, POLL_LIVE_MS);

    // Poda de obsoletos do live a cada 2s
    const pruneId = setInterval(() => {
      const now = Date.now();
      setLiveSurebets(prev => prev.filter(s => {
        const latest = Math.max(...s.bookmakers.map(b => parseTs(b.updated_at)));
        return latest === 0 || now - latest < LIVE_CUTOFF_MS;
      }));
    }, 2_000);

    return () => {
      clearInterval(preId);
      clearInterval(liveId);
      clearInterval(pruneId);
      preAbort.current?.abort();
      liveAbort.current?.abort();
    };
  }, [fetchPre, fetchLive]);

  return { preSurebets, liveSurebets, loading, error, lastUpdate, refresh };
}
