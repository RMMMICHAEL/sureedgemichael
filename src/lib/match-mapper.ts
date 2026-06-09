/**
 * match-mapper.ts
 * Normalização e agrupamento de partidas de múltiplas fontes.
 *
 * Resolve o problema:
 *   "Peru vs Spain" + "Peru x Espanha" + "Peru National Team vs Spain National Team"
 *   → mesmo match, bookmakers agrupados
 */

// ── Tradução PT→EN de nomes de países/seleções ───────────────────────────────

const PT_TO_EN: Record<string, string> = {
  // América do Sul
  'brasil': 'brazil',
  'argentina': 'argentina',
  'chile': 'chile',
  'peru': 'peru',
  'bolivia': 'bolivia',
  'paraguai': 'paraguay',
  'uruguai': 'uruguay',
  'venezuela': 'venezuela',
  'colombia': 'colombia',
  'equador': 'ecuador',
  'guiana': 'guyana',
  'suriname': 'suriname',

  // Europa
  'espanha': 'spain',
  'alemanha': 'germany',
  'franca': 'france',
  'italia': 'italy',
  'hollanda': 'netherlands',
  'paises baixos': 'netherlands',
  'belgica': 'belgium',
  'belgique': 'belgium',
  'austria': 'austria',
  'suica': 'switzerland',
  'suissa': 'switzerland',
  'portugal': 'portugal',
  'grecia': 'greece',
  'turquia': 'turkey',
  'suecia': 'sweden',
  'noruega': 'norway',
  'dinamarca': 'denmark',
  'finlandia': 'finland',
  'polonia': 'poland',
  'republica tcheca': 'czech republic',
  'eslovaquia': 'slovakia',
  'hungria': 'hungary',
  'romenia': 'romania',
  'bulgaria': 'bulgaria',
  'croacia': 'croatia',
  'servia': 'serbia',
  'eslovenia': 'slovenia',
  'albania': 'albania',
  'ucrania': 'ukraine',
  'russia': 'russia',
  'bielorrussia': 'belarus',
  'escocia': 'scotland',
  'irlanda': 'ireland',
  'gales': 'wales',

  // África
  'mocambique': 'mozambique',
  'marrocos': 'morocco',
  'egito': 'egypt',
  'nigeria': 'nigeria',
  'africa do sul': 'south africa',
  'camaroes': 'cameroon',
  'senegal': 'senegal',
  'ghana': 'ghana',
  'tunisia': 'tunisia',
  'algeria': 'algeria',
  'costa do marfim': 'ivory coast',
  'mali': 'mali',
  'angola': 'angola',
  'tanzania': 'tanzania',
  'kenya': 'kenya',
  'uganda': 'uganda',
  'zambia': 'zambia',
  'zimbabue': 'zimbabwe',
  'zimbabwe': 'zimbabwe',
  'etiopia': 'ethiopia',
  'libia': 'libya',

  // Ásia
  'indonesia': 'indonesia',
  'china': 'china',
  'japao': 'japan',
  'coreia do sul': 'south korea',
  'india': 'india',
  'ira': 'iran',
  'irao': 'iran',
  'arabia saudita': 'saudi arabia',
  'emirados arabes': 'uae',
  'catar': 'qatar',
  'kuwait': 'kuwait',
  'jordania': 'jordan',
  'tailandia': 'thailand',
  'vietna': 'vietnam',
  'malaisia': 'malaysia',
  'filipinas': 'philippines',
  'paquistao': 'pakistan',

  // América Central/Caribe
  'mexico': 'mexico',
  'estados unidos': 'usa',
  'canada': 'canada',
  'costa rica': 'costa rica',
  'panama': 'panama',
  'honduras': 'honduras',
  'guatemala': 'guatemala',
  'el salvador': 'el salvador',
  'nicaragua': 'nicaragua',
  'cuba': 'cuba',
  'jamaica': 'jamaica',
  'haiti': 'haiti',

  // Oceania
  'australia': 'australia',
  'nova zelandia': 'new zealand',
};

// Sufixos a remover de nomes de clubes/seleções
const REMOVE_SUFFIXES = [
  'national team', 'national', 'seleção', 'selecao', 'equipe nacional',
  ' fc', ' cf', ' sc', ' ac', ' rc', ' ss', ' cd', ' ud', ' rcd',
  ' afc', ' bsc', ' fk', ' sk', ' nk', ' pk', ' ik', ' gk',
  ' esporte clube', ' sport club', ' atlético', ' atletico',
  ' olimpico', ' olímpico', ' real', ' sporting',
];

// ── Normalizador de nome de time ──────────────────────────────────────────────

export function normalizeTeamName(raw: string): string {
  let s = raw
    .toLowerCase()
    // Remove acentos via NFD
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Remove pontuação exceto espaços e hífens
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Traduz nome do país PT→EN
  for (const [pt, en] of Object.entries(PT_TO_EN)) {
    // Substituição de palavra completa
    const re = new RegExp(`\\b${pt}\\b`, 'g');
    s = s.replace(re, en);
  }

  // Remove sufixos de clubes (ao final do nome)
  for (const suf of REMOVE_SUFFIXES) {
    if (s.endsWith(suf)) {
      s = s.slice(0, -suf.length).trim();
    }
  }

  return s.trim();
}

// ── Similaridade entre dois strings ──────────────────────────────────────────

/** Distância de Levenshtein normalizada com early exit por threshold */
function levenshtein(a: string, b: string, maxDist = 0.25): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 1;

  // Early exit: se diferença de comprimento já excede threshold, skip
  if (Math.abs(m - n) / Math.max(m, n) > maxDist) return 1;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i;
    let rowMin = prev;
    for (let j = 1; j <= n; j++) {
      const curr = a[i - 1] === b[j - 1]
        ? dp[j - 1]
        : 1 + Math.min(dp[j - 1], dp[j], prev);
      dp[j - 1] = prev;
      prev = curr;
      if (curr < rowMin) rowMin = curr;
    }
    dp[n] = prev;
    // Early exit: se mínimo da linha já excede threshold, impossível melhorar
    if (rowMin / Math.max(m, n) > maxDist) return 1;
  }
  return dp[n] / Math.max(m, n);
}

// Cache de normalização para evitar recalcular o mesmo nome várias vezes
const normCache = new Map<string, string>();

function cachedNorm(raw: string): string {
  const cached = normCache.get(raw);
  if (cached !== undefined) return cached;
  const result = normalizeTeamName(raw);
  normCache.set(raw, result);
  return result;
}

/** Retorna true se os dois nomes provavelmente representam o mesmo time */
export function teamsMatch(rawA: string, rawB: string): boolean {
  // Fast path: idênticos sem normalizar
  if (rawA === rawB) return true;

  const a = cachedNorm(rawA);
  const b = cachedNorm(rawB);

  if (a === b) return true;
  if (!a || !b) return false;

  // Fast path: primeiros 3 chars completamente diferentes → provavelmente não casam
  // (evita Levenshtein desnecessário)
  if (a.length > 3 && b.length > 3) {
    const a3 = a.slice(0, 3);
    const b3 = b.slice(0, 3);
    if (a3 !== b3 && !a.startsWith(b3) && !b.startsWith(a3)) {
      // Ainda tenta token overlap (pode ser ordem diferente de palavras)
      const tokA = new Set(a.split(' ').filter(t => t.length > 3));
      const tokB = new Set(b.split(' ').filter(t => t.length > 3));
      if (tokA.size > 0 && tokB.size > 0) {
        const intersection = [...tokA].filter(t => tokB.has(t)).length;
        const union = new Set([...tokA, ...tokB]).size;
        if (intersection / union >= 0.6) return true;
      }
      return false;
    }
  }

  // Um contém o outro (ex: "Liverpool" vs "Liverpool FC")
  if (a.includes(b) || b.includes(a)) return true;

  // Levenshtein normalizado ≤ 20%
  const dist = levenshtein(a, b, 0.2);
  if (dist <= 0.2) return true;

  return false;
}

// ── Tipo unificado de odd ─────────────────────────────────────────────────────

export interface UnifiedBookmaker {
  bookmaker_slug: string;
  bookmaker_name: string;
  market_type:    'full_time_result';
  odd_home:       number;
  odd_draw:       number;
  odd_away:       number;
  match_url:      string;
  is_pa:          boolean;
  updated_at:     string;
}

export interface UnifiedMatch {
  match_id:     string;
  home_team:    string;
  away_team:    string;
  home_norm:    string;  // nome normalizado (para debug)
  away_norm:    string;
  start_time:   string;
  league_name:  string;
  bookmakers:   UnifiedBookmaker[];
}

// ── Match mapper ──────────────────────────────────────────────────────────────

/**
 * Recebe arrays de OddsSummary de múltiplas fontes e retorna
 * UnifiedMatch[] com todos os bookmakers agrupados por partida.
 *
 * Usa normalização de nomes + Levenshtein para casar partidas
 * entre fontes com nomes diferentes.
 */
export interface SourceEvent {
  match_id:    string;
  home_team:   string;
  away_team:   string;
  start_time:  string;
  league_name: string;
  bookmakers:  Array<{
    slug:   string;
    name:   string;
    home:   number;
    draw:   number;
    away:   number;
    url:    string;
    is_pa?: boolean;
  }>;
}

export function mergeMatches(sources: SourceEvent[][]): UnifiedMatch[] {
  normCache.clear(); // limpa cache entre requests
  const merged: UnifiedMatch[] = [];
  const now = new Date().toISOString();

  // Registra quantas odds vieram de cada fonte (debug)
  let totalIn = 0;
  let matched = 0;
  let added   = 0;

  for (const source of sources) {
    for (const ev of source) {
      totalIn++;
      const homeNorm = normalizeTeamName(ev.home_team);
      const awayNorm = normalizeTeamName(ev.away_team);

      // Procura partida existente que case
      const existing = merged.find(m =>
        teamsMatch(m.home_team, ev.home_team) &&
        teamsMatch(m.away_team, ev.away_team)
      );

      const bks: UnifiedBookmaker[] = ev.bookmakers.map(b => ({
        bookmaker_slug: b.slug,
        bookmaker_name: b.name,
        market_type:    'full_time_result',
        odd_home:       b.home,
        odd_draw:       b.draw,
        odd_away:       b.away,
        match_url:      b.url,
        is_pa:          b.is_pa ?? false,
        updated_at:     now,
      }));

      if (existing) {
        matched++;
        for (const bk of bks) {
          if (!existing.bookmakers.find(b => b.bookmaker_slug === bk.bookmaker_slug)) {
            existing.bookmakers.push(bk);
          }
        }
      } else {
        added++;
        merged.push({
          match_id:    ev.match_id,
          home_team:   ev.home_team,
          away_team:   ev.away_team,
          home_norm:   homeNorm,
          away_norm:   awayNorm,
          start_time:  ev.start_time,
          league_name: ev.league_name,
          bookmakers:  bks,
        });
      }
    }
  }

  console.log(`[match-mapper] in=${totalIn} merged=${matched} new=${added} total=${merged.length}`);
  return merged;
}
