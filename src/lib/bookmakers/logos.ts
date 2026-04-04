/**
 * logos.ts
 * Maps bookmaker names (case-insensitive) → their primary domain.
 * Used to load favicons via Google's favicon API.
 */

const DOMAINS: Record<string, string> = {
  // Independent / international
  'bet365':       'bet365.com',
  'bet365arg':    'bet365.com',
  'bet365pe':     'bet365.com',
  'betano':       'betano.com',
  'pinnacle':     'pinnacle.com',
  'pinnacle.com': 'pinnacle.com',
  'betfair ex':   'betfair.com',
  'betfair sb':   'betfair.com',
  'superbet':     'superbet.com',
  'betsson':      'betsson.com',
  'rivalo':       'rivalo.bet.br',
  'betwarrior':   'betwarrior.bet.br',
  'betsul':       'betsul.com',
  'betway':       'betway.com',
  'kto':          'kto.bet.br',
  'novibet':      'novibet.com',
  'sportybet':    'sporty.bet.br',
  'sportingbet':  'sportingbet.com',
  'stake':        'stake.bet.br',
  'betmgm':       'betmgm.bet.br',
  'betboo':       'betboo.bet.br',
  'bolsadeaposta':'bolsadeaposta.bet.br',
  'betbra':       'betbra.bet.br',
  'fulltbet':     'fulltbet.bet.br',

  // Estrelabet group
  'estrelabet':   'estrelabet.bet.br',
  'nossabet':     'nossa.bet.br',
  'jogodeouro':   'jogodeouro.bet.br',
  'mcgames':      'mcgames.bet.br',
  'mc.games':     'mcgames.bet.br',
  'multibet':     'multi.bet.br',
  'aposta1':      'aposta1.bet.br',
  'bateubet':     'bateu.bet.br',
  'esportivabet': 'esportiva.bet.br',
  'goldebet':     'goldebet.bet.br',
  'lotogreen':    'lotogreen.bet.br',
  'cassinopix':   'cassino.bet.br',
  'vupibet':      'vupi.bet.br',
  'vupi':         'vupi.bet.br',
  'betfusion':    'betfusion.bet.br',
  'sorteonline':  'sorteonline.bet.br',
  'lottoland':    'lottoland.bet.br',
  'brasildasorte':'brasildasorte.bet.br',
  'br4bet':       'br4.bet.br',
  'upbet':        'up.bet.br',
  'pagol':        'pagol.bet.br',
  'pagolbet':     'pagol.bet.br',
  'aviaobet':     'aviao.bet.br',

  // Bet7k group
  'bet7k':        '7k.bet.br',
  '7k':           '7k.bet.br',
  'mmabet':       'mma.bet.br',
  'mma':          'mma.bet.br',
  'pixbet':       'pixbet.com.br',
  'betdasorte':   'betdasorte.bet.br',
  'betaki':       'betaki.bet.br',
  'ricobet':      'rico.bet.br',
  'brxbet':       'brx.bet.br',
  'brx':          'brx.bet.br',
  'apostamax':    'apostamax.bet.br',
  'betgorillas':  'betgorillas.bet.br',
  'betbufalos':   'betbuffalos.bet.br',
  'betfalcons':   'betfalcons.bet.br',
  'apostatudo':   'apostatudo.bet.br',
  'b1bet':        'b1bet.bet.br',
  'betpontobet':  'betpontobet.bet.br',
  'donaldbet':    'donald.bet.br',
  'bullsbet':     'bullsbet.bet.br',
  'jogaobet':     'jogao.bet.br',
  'liderbet':     'lider.bet.br',
  'b2x':          'b2x.bet.br',
  'b2xbet':       'b2x.bet.br',
  'verabet':      'vera.bet.br',
  'sortenabet':   'sortenabet.bet.br',
  'betou':        'betou.bet.br',
  'kingpanda':    'kingpanda.bet.br',
  'icebet':       'ice.bet.br',
  'geralbet':     'geralbet.bet.br',

  // Blaze group
  'blaze':        'blaze.bet.br',
  'betvip':       'betvip.bet.br',
  'jonbet':       'jonbet.bet.br',
  'uxbet':        'ux.bet.br',
  'afunbet':      'afun.bet.br',
  'ganheibet':    'ganhei.bet.br',

  // Onabet group
  'onabet':       'ona.bet.br',
  'esporte365':   'esporte365.bet.br',
  'luckbet':      'luck.bet.br',
  '1praum':       '1pra1.bet.br',
  'startbet':     'start.bet.br',
  'realsbet':     'reals.bet.br',
  'bigbet':       'big.bet.br',
  'apostar':      'apostar.bet.br',
  'luvabet':      'luva.bet.br',

  // Vbet group
  'vbet':         'vbet.bet.br',
  'bravobet':     'bravo.bet.br',
  'h2bet':        'h2.bet.br',
  'supremabet':   'suprema.bet.br',
  'segurobet':    'seguro.bet.br',
  'betpark':      'betpark.bet.br',
  '7games':       '7games.bet.br',
  'betao':        'betao.bet.br',
  'r7bet':        'r7.bet.br',
  'maximabet':    'maxima.bet.br',
  'ultrabet':     'ultra.bet.br',
  'seubet':       'seubet.bet.br',

  // Betfast group
  'betfast':      'betfast.bet.br',
  'faz1bet':      'faz1.bet.br',
  'tivobet':      'tivo.bet.br',
  'ijogo':        'ijogo.bet.br',
  '9fbet':        '9f.bet.br',
  '9dbet':        '9d.bet.br',
  '6zbet':        '6z.bet.br',

  // Others
  'betnacional':  'betnacional.bet.br',
  'betpix365':    'betpix365.com',
  'f12bet':       'f12.bet',
  'f12':          'f12.bet',
  'betboom':      'betboom.com',
  'apostaganha':  'apostaganha.bet.br',
  'vaidebet':     'vaidebet.com',
  'mystake':      'mystake.com',
  'wjcasino':     'wjcasino.com',
  'meridian':     'meridianbet.com',
  'netbet':       'netbet.com.br',
  'outrabet':     'outrabet.com',
  'playbet':      'playbet.com.br',
  'spin':         'spin.bet.br',
  'lottu':        'lottu.com.br',
  'reidopitaco':  'reidopitaco.com.br',
  'casadeapostas':'casadeapostas.com',
  'bet4':         'bet4.com',
  'xpbet':        'xpbet.com.br',
  'marjosports':  'marjosports.com.br',
  'apostou':      'apostou.com.br',
  'oleybet':      'oleybet.com',
  'cgc':          'cgcbet.com',
  'donosdabola':  'donosdabola.com.br',
  'fortunejack':  'fortunejack.com',
  'esportenetbet':'esportenacional.com.br',
  'esportenetsp': 'esportenacional.com.br',
  'esportedasorte':'esportedasorte.com.br',
  'lancedesorte': 'lancedesorte.com.br',
  'betonline':    'betonline.ag',
  'betesporte':   'betesporte.com',
  'brbet':        'brbet.com',
};

/**
 * Returns a 32px Google Favicon URL for the given bookmaker name,
 * or null if no domain mapping exists.
 */
export function houseFavicon(name: string): string | null {
  if (!name) return null;
  const key = name.toLowerCase().trim().replace(/\s+/g, '');
  // Try exact key
  const domain = DOMAINS[key] ?? DOMAINS[name.toLowerCase().trim()];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
}
