/**
 * Resolução de logos de times usando o CDN do DuploGreen.
 * Clubes:   https://logos.duplogreenengine.com/logos/{slug}.png
 * Seleções: https://logos.duplogreenengine.com/flags/{iso}.svg
 *
 * Cache persistente na tabela `team_logos` do Supabase.
 */

const DG_CDN = 'https://logos.duplogreenengine.com';

// ── Mapa de seleções: nome normalizado → ISO2 ────────────────────────────────
const FLAG_MAP: Record<string, string> = {
  'brasil': 'br', 'brazil': 'br',
  'argentina': 'ar',
  'franca': 'fr', 'france': 'fr',
  'espanha': 'es', 'spain': 'es',
  'alemanha': 'de', 'germany': 'de',
  'italia': 'it', 'italy': 'it',
  'portugal': 'pt',
  'inglaterra': 'gb-eng', 'england': 'gb-eng',
  'belgica': 'be', 'belgium': 'be',
  'holanda': 'nl', 'paises baixos': 'nl', 'netherlands': 'nl',
  'croacia': 'hr', 'croatia': 'hr',
  'suica': 'ch', 'switzerland': 'ch',
  'austria': 'at',
  'mexico': 'mx',
  'estados unidos': 'us', 'usa': 'us',
  'canada': 'ca',
  'australia': 'au',
  'coreia do sul': 'kr', 'south korea': 'kr',
  'marrocos': 'ma', 'morocco': 'ma',
  'senegal': 'sn',
  'gana': 'gh', 'ghana': 'gh',
  'nigeria': 'ng',
  'camaroes': 'cm', 'cameroon': 'cm',
  'egito': 'eg', 'egypt': 'eg',
  'costa do marfim': 'ci', 'ivory coast': 'ci',
  'africa do sul': 'za', 'south africa': 'za',
  'rd congo': 'cd', 'republica democratica do congo': 'cd',
  'cabo verde': 'cv',
  'argelia': 'dz', 'algeria': 'dz',
  'colombia': 'co',
  'chile': 'cl',
  'peru': 'pe',
  'uruguay': 'uy',
  'venezuela': 've',
  'equador': 'ec', 'ecuador': 'ec',
  'bolivia': 'bo',
  'paraguai': 'py', 'paraguay': 'py',
  'noruega': 'no', 'norway': 'no',
  'suecia': 'se', 'sweden': 'se',
  'dinamarca': 'dk', 'denmark': 'dk',
  'polonia': 'pl', 'poland': 'pl',
  'ucrania': 'ua', 'ukraine': 'ua',
  'turquia': 'tr', 'turkey': 'tr',
  'russia': 'ru',
  'escócia': 'gb-sct', 'escocia': 'gb-sct', 'scotland': 'gb-sct',
  'gales': 'gb-wls', 'wales': 'gb-wls',
  'irlanda': 'ie', 'ireland': 'ie',
  'hungria': 'hu', 'hungary': 'hu',
  'romenia': 'ro', 'romania': 'ro',
  'eslovaquia': 'sk', 'slovakia': 'sk',
  'eslovenia': 'si', 'slovenia': 'si',
  'servia': 'rs', 'serbia': 'rs',
  'albania': 'al',
  'georgia': 'ge',
  'indonesia': 'id',
  'arabia saudita': 'sa', 'saudi arabia': 'sa',
  'iran': 'ir',
  'japao': 'jp',
  'coreia do norte': 'kp',
  'china': 'cn',
  'india': 'in',
  'nova zelandia': 'nz', 'new zealand': 'nz',
  'bosnia e herzegovina': 'ba', 'bosnia': 'ba',
  'costa rica': 'cr',
  'panama': 'pa',
  'jamaica': 'jm',
  'haiti': 'ht',
  'honduras': 'hn',
  'el salvador': 'sv',
  'guatemala': 'gt',
  'cuba': 'cu',
  'trinidad e tobago': 'tt',
  'catar': 'qa', 'qatar': 'qa',
  'emirados arabes unidos': 'ae', 'uae': 'ae',
  'nigeria': 'ng',
  'tunisia': 'tn',
  'mali': 'ml',
  'burkina faso': 'bf',
  'angola': 'ao',
  'tanzania': 'tz',
  'mocambique': 'mz',
  'zambia': 'zm',
  'zimbabue': 'zw',
  'ruanda': 'rw',
  'etiopia': 'et',
  'kenya': 'ke',
  'internacional': 'world', // genérico para torneios internacionais
};

// ── Mapa de clubes: slug DG já conhecido (do HAR) ───────────────────────────
const CLUB_SLUG_MAP: Record<string, string> = {
  'america mg': 'america-mg', 'america-mg': 'america-mg',
  'arsenal': 'arsenal',
  'aston villa': 'aston-villa',
  'atalanta': 'atalanta',
  'athletico': 'athletico', 'athletico paranaense': 'athletico',
  'atlanta united': 'atlanta-united',
  'atletico goianiense': 'atletico-goianiense',
  'atletico mineiro': 'atletico-mineiro', 'atlético mineiro': 'atletico-mineiro',
  'avai': 'avai', 'avaí': 'avai',
  'bahia': 'bahia',
  'boca juniors': 'boca-juniors',
  'bolivar': 'bolivar', 'bolívar': 'bolivar',
  'bologna': 'bologna',
  'botafogo sp': 'botafogo-sp',
  'botafogo': 'botafogo',
  'bournemouth': 'bournemouth',
  'brentford': 'brentford',
  'brighton': 'brighton',
  'cagliari': 'cagliari',
  'caracas fc': 'caracas-fc',
  'ceara': 'ceara', 'ceará': 'ceara',
  'cerro porteno': 'cerro-porteno', 'cerro porteño': 'cerro-porteno',
  'cf montreal': 'cf-montreal',
  'chapecoense': 'chapecoense',
  'chelsea': 'chelsea',
  'chicago fire': 'chicago-fire',
  'cienciano': 'cienciano',
  'como': 'como',
  'coquimbo unido': 'coquimbo-unido',
  'corinthians': 'corinthians',
  'coritiba': 'coritiba',
  'crb': 'crb',
  'criciuma': 'criciuma', 'criciúma': 'criciuma',
  'cruzeiro': 'cruzeiro',
  'crystal palace': 'crystal-palace',
  'cuiaba': 'cuiaba', 'cuiabá': 'cuiaba',
  'deportes tolima': 'deportes-tolima',
  'estudiantes de la plata': 'estudiantes-de-la-plata',
  'everton': 'everton',
  'fiorentina': 'fiorentina',
  'flamengo': 'flamengo',
  'fluminense': 'fluminense',
  'fortaleza': 'fortaleza',
  'fulham': 'fulham',
  'genoa': 'genoa',
  'goias': 'goias', 'goiás': 'goias',
  'gremio': 'gremio', 'grêmio': 'gremio',
  'independiente del valle': 'independiente-del-valle',
  'independiente medellin': 'independiente-medellin',
  'independiente rivadavia': 'independiente-rivadavia',
  'independiente santa fe': 'independiente-santa-fe',
  'inter milan': 'inter-milan', 'internazionale': 'inter-milan',
  'internacional': 'internacional',
  'juventude': 'juventude',
  'juventus': 'juventus',
  'la galaxy': 'la-galaxy',
  'lanus': 'lanus', 'lanús': 'lanus',
  'lazio': 'lazio',
  'ldu quito': 'ldu-quito',
  'lecce': 'lecce',
  'leeds united': 'leeds-united',
  'liverpool': 'liverpool',
  'londrina': 'londrina',
  'los angeles fc': 'los-angeles-fc', 'lafc': 'los-angeles-fc',
  'manchester city': 'manchester-city',
  'manchester united': 'manchester-united',
  'milan': 'milan', 'ac milan': 'milan',
  'mirassol': 'mirassol',
  'nacional montevideo': 'nacional-montevideo',
  'napoli': 'napoli',
  'nashville sc': 'nashville-sc',
  'nautico': 'nautico', 'náutico': 'nautico',
  'newcastle united': 'newcastle-united', 'newcastle': 'newcastle-united',
  'nottingham forest': 'nottingham-forest',
  'novorizontino': 'novorizontino',
  'ohiggins': 'ohiggins', "o'higgins": 'ohiggins',
  'operario pr': 'operario-pr', 'operário': 'operario-pr',
  'palmeiras': 'palmeiras',
  'parma': 'parma',
  'platense': 'platense',
  'ponte preta': 'ponte-preta',
  'portland timbers': 'portland-timbers',
  'red bull bragantino': 'red-bull-bragantino', 'bragantino': 'red-bull-bragantino',
  'remo': 'remo',
  'roma': 'roma', 'as roma': 'roma',
  'rosario central': 'rosario-central', 'rosário central': 'rosario-central',
  'saint louis city sc': 'saint-louis-city-sc',
  'santos': 'santos',
  'sao bernardo': 'sao-bernardo', 'são bernardo': 'sao-bernardo',
  'sao paulo': 'sao-paulo', 'são paulo': 'sao-paulo',
  'sassuolo': 'sassuolo',
  'seattle sounders': 'seattle-sounders',
  'sport recife': 'sport-recife',
  'sporting cristal': 'sporting-cristal',
  'sporting kansas city': 'sporting-kansas-city',
  'sunderland': 'sunderland',
  'tigre': 'tigre',
  'torino': 'torino',
  'toronto fc': 'toronto-fc',
  'tottenham': 'tottenham', 'tottenham hotspur': 'tottenham',
  'udinese': 'udinese',
  'universidad catolica': 'universidad-catolica', 'universidad católica': 'universidad-catolica',
  'universidad central': 'universidad-central',
  'vancouver whitecaps fc': 'vancouver-whitecaps-fc',
  'vasco da gama': 'vasco-da-gama', 'vasco': 'vasco-da-gama',
  'vila nova': 'vila-nova',
  'vitoria': 'vitoria', 'vitória': 'vitoria',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9\s\-']/g, '')
    .trim();
}

function toSlug(name: string): string {
  return normalize(name).replace(/[\s']+/g, '-').replace(/-+/g, '-');
}

export interface TeamLogoResult {
  url: string;
  type: 'flag' | 'logo';
}

/**
 * Resolve a URL de logo/bandeira para um time.
 * Tenta: mapa de seleções → mapa de clubes → slug automático.
 * Retorna null se não conseguir resolver.
 */
export function resolveTeamLogoUrl(teamName: string): TeamLogoResult | null {
  const norm = normalize(teamName);

  // 1. Seleção nacional?
  const iso = FLAG_MAP[norm];
  if (iso) {
    const file = iso === 'world' ? 'world' : iso;
    return { url: `${DG_CDN}/flags/${file}.svg`, type: 'flag' };
  }

  // 2. Clube com slug conhecido?
  const knownSlug = CLUB_SLUG_MAP[norm];
  if (knownSlug) {
    return { url: `${DG_CDN}/logos/${knownSlug}.png`, type: 'logo' };
  }

  // 3. Gera slug automaticamente e tenta
  const autoSlug = toSlug(norm);
  if (autoSlug.length >= 2) {
    return { url: `${DG_CDN}/logos/${autoSlug}.png`, type: 'logo' };
  }

  return null;
}
