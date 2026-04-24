// Maps country names → ISO 3166-1 alpha-2 codes for flagcdn.com
const COUNTRY_MAP: Record<string, string> = {
  'Brazil': 'br', 'Brasil': 'br',
  'England': 'gb-eng', 'United Kingdom': 'gb',
  'Spain': 'es',
  'Germany': 'de',
  'France': 'fr',
  'Italy': 'it',
  'Portugal': 'pt',
  'Netherlands': 'nl',
  'Belgium': 'be',
  'Argentina': 'ar',
  'USA': 'us', 'United States': 'us',
  'Russia': 'ru',
  'China': 'cn',
  'Japan': 'jp',
  'Australia': 'au',
  'Canada': 'ca',
  'Mexico': 'mx',
  'Switzerland': 'ch',
  'Sweden': 'se',
  'Norway': 'no',
  'Denmark': 'dk',
  'Poland': 'pl',
  'Czech Republic': 'cz',
  'Serbia': 'rs',
  'Croatia': 'hr',
  'Greece': 'gr',
  'Turkey': 'tr',
  'Romania': 'ro',
  'Ukraine': 'ua',
  'Hungary': 'hu',
  'Austria': 'at',
  'Scotland': 'gb-sct',
  'Ireland': 'ie',
  'Wales': 'gb-wls',
  'South Korea': 'kr', 'Korea Republic': 'kr',
  'Saudi Arabia': 'sa',
  'Qatar': 'qa',
  'South Africa': 'za',
  'Nigeria': 'ng',
  'Egypt': 'eg',
  'Colombia': 'co',
  'Chile': 'cl',
  'Peru': 'pe',
  'Ecuador': 'ec',
  'Uruguay': 'uy',
  'Venezuela': 've',
  'Paraguay': 'py',
  'Bolivia': 'bo',
  'International': 'un',
};

export function countryToFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = COUNTRY_MAP[country] ?? COUNTRY_MAP[country.trim()];
  if (!code) return null;
  return `https://flagcdn.com/w40/${code}.png`;
}

export function countryAlt(country: string | null | undefined): string {
  return country ? `Bandeira ${country}` : 'Bandeira';
}
