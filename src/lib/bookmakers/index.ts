/**
 * Single source of truth for all bookmaker lists used across SureEdge.
 *
 * Import from here instead of defining local lists in components.
 */

// ── Display names (used in selects, forms, labels) ────────────────────────────

export const ALL_HOUSES: string[] = [
  // números / símbolos
  '1praum','6zbet','7Games','9dbet','9fbet',
  // A
  'Afunbet','Alfabet','Aposta1','Apostabet','Apostaganha','ApostaMax','Apostar','Apostefacil','ApostaTudo','Aviaobet',
  // B
  'B1Bet','B2x','Bateubet',
  'Bet365','Bet365Arg','Bet365Pe','Bet4','Bet7k','Betagora','Betaki','Betano','Betao',
  'Betbet','Betboo','Betboom','Betbra','BetDaSorte','Betesporte',
  'Betfair','BetfairEx','BetfairSB','Betfast','Betfusion','Betbufalos','Betfalcons','Betgorillas',
  'BetMGM','Betnacional','Betonline','Betou','Betpark','Betpix365','Betpontobet','Betsson','Betsul',
  'BetVip','Betwarrior','Betway','Bigbet','Blaze','Bolsadeaposta',
  'BR4Bet','BrasildaSorte','Bravobet','Brbet','BRXBet','Bullsbet',
  // C
  'Casadeapostas','Cassinopix','Cgc',
  // D
  'Donaldbet','Donosdabola',
  // E
  'Esporte365','Esportedasorte','Esportenetbet','Esportenetsp','Esportivabet','Estrelabet',
  // F
  'F12bet','Faz1bet','Fortunejack','Fullbet',
  // G
  'Ganheibet','Geralbet','Goldebet',
  // H
  'H2Bet',
  // I
  'Icebet','Ijogo',
  // J
  'JogoDeOuro','Jogaobet','Jonbet',
  // K
  'Kingpanda','KTO',
  // L
  'Lancedesorte','Leon.bet','Liderbet','Lotogreen','Lottoland','Lottu','Luckbet','Luvabet',
  // M
  'Marjosports','Maximabet','MCGames','Meridianbet','Milhao','MMABET','Multbet','Mystake',
  // N
  'Netbet','NoviBet','Nossabet',
  // O
  'Oleybet','Onabet','Outrabet',
  // P
  'Pagol','Pinnacle','Pinnacle.com','Pixbet','Playbet','Polymarket',
  // R
  'R7bet','Realsbet','Reidopitaco','Ricobet','Rivalo',
  // S
  'Segurobet','Seubet','Sortenabet','SorteOnline','Spin',
  'Sportingbet','SportyBet','Sporty','Stake','Starbet','Superbet','Supremabet',
  // T
  'Tivobet','Tradeball',
  // U
  'Ultrabet','UPbet','Uxbet',
  // V
  'Vaidebet','Vbet','Verabet','Versusbet','Vivasorte','Vupi',
  // W–X
  'Wjcasino','Xpbet',
];

// ── Normalized slug helpers ───────────────────────────────────────────────────

/** Removes spaces, hyphens, dots for fuzzy matching. */
export function normSlug(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, '');
}

// ── PA (Posto de Apostas) canonical set ──────────────────────────────────────

/**
 * Normalized slugs of all bookmakers that operate as PA (Posto de Apostas).
 * Aliases and variant slugs are included so normSlug() matches all spellings.
 */
export const PA_SLUGS = new Set([
  'betano','bet365','bet365arg','bet365pe','betfair','kto','superbet',
  'vivasorte','betao','7games','betesporte','novibet','estrelabet',
  'esportivabet','esportiva','esportivabr','estrelabeat',
  'jogodeouro','7k','bet7k','versusbet','meridianbet','meridian',
  'betmgm','betsson','betsul','betvip','br4bet','br4',
  'esportesdasorte','vaidebet','pixbet','sportingbet',
  'apostabeat','apostabet','lotogreen','betpix365','betpix','f12',
  'vupibet','vupibr','vupi','sortenabet','sorte',
  'brasilbet','brasil','betnacional','pixbetsports',
  'betnow','sportbr','betbr','apostaganha','mcgames',
  'leon','leonbet',
]);

export function isPaBookmaker(nameOrSlug: string): boolean {
  if (!nameOrSlug) return false;
  const n = normSlug(nameOrSlug);
  if (PA_SLUGS.has(n)) return true;
  for (const pa of PA_SLUGS) {
    if (n.includes(pa) || pa.includes(n)) return true;
    const prefix = Math.min(n.length, pa.length, 6);
    if (prefix >= 4 && n.slice(0, prefix) === pa.slice(0, prefix)) return true;
  }
  return false;
}
