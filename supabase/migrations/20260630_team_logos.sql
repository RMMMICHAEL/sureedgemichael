-- Tabela de cache de logos de times
-- Evita gerar URLs do DG CDN repetidamente e permite overrides manuais

CREATE TABLE IF NOT EXISTS public.team_logos (
  team_name   TEXT PRIMARY KEY,   -- nome normalizado (lowercase, sem acentos)
  logo_url    TEXT NOT NULL,
  logo_type   TEXT NOT NULL CHECK (logo_type IN ('flag', 'logo')),
  verified    BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_logos ENABLE ROW LEVEL SECURITY;

-- Leitura pública (anon pode ler logos)
CREATE POLICY "team_logos_read" ON public.team_logos
  FOR SELECT USING (true);

-- Escrita apenas service_role (upsert via API server-side)
CREATE POLICY "team_logos_write" ON public.team_logos
  FOR ALL USING (auth.role() = 'service_role');

-- Seed: seleções nacionais (flags)
INSERT INTO public.team_logos (team_name, logo_url, logo_type) VALUES
  ('brasil',                    'https://logos.duplogreenengine.com/flags/br.svg',     'flag'),
  ('argentina',                 'https://logos.duplogreenengine.com/flags/ar.svg',     'flag'),
  ('franca',                    'https://logos.duplogreenengine.com/flags/fr.svg',     'flag'),
  ('espanha',                   'https://logos.duplogreenengine.com/flags/es.svg',     'flag'),
  ('portugal',                  'https://logos.duplogreenengine.com/flags/pt.svg',     'flag'),
  ('inglaterra',                'https://logos.duplogreenengine.com/flags/gb-eng.svg', 'flag'),
  ('belgica',                   'https://logos.duplogreenengine.com/flags/be.svg',     'flag'),
  ('croacia',                   'https://logos.duplogreenengine.com/flags/hr.svg',     'flag'),
  ('suica',                     'https://logos.duplogreenengine.com/flags/ch.svg',     'flag'),
  ('austria',                   'https://logos.duplogreenengine.com/flags/at.svg',     'flag'),
  ('mexico',                    'https://logos.duplogreenengine.com/flags/mx.svg',     'flag'),
  ('estados unidos',            'https://logos.duplogreenengine.com/flags/us.svg',     'flag'),
  ('canada',                    'https://logos.duplogreenengine.com/flags/ca.svg',     'flag'),
  ('australia',                 'https://logos.duplogreenengine.com/flags/au.svg',     'flag'),
  ('marrocos',                  'https://logos.duplogreenengine.com/flags/ma.svg',     'flag'),
  ('senegal',                   'https://logos.duplogreenengine.com/flags/sn.svg',     'flag'),
  ('gana',                      'https://logos.duplogreenengine.com/flags/gh.svg',     'flag'),
  ('egito',                     'https://logos.duplogreenengine.com/flags/eg.svg',     'flag'),
  ('cabo verde',                'https://logos.duplogreenengine.com/flags/cv.svg',     'flag'),
  ('argelia',                   'https://logos.duplogreenengine.com/flags/dz.svg',     'flag'),
  ('colombia',                  'https://logos.duplogreenengine.com/flags/co.svg',     'flag'),
  ('equador',                   'https://logos.duplogreenengine.com/flags/ec.svg',     'flag'),
  ('paraguai',                  'https://logos.duplogreenengine.com/flags/py.svg',     'flag'),
  ('noruega',                   'https://logos.duplogreenengine.com/flags/no.svg',     'flag'),
  ('italia',                    'https://logos.duplogreenengine.com/flags/it.svg',     'flag'),
  ('rd congo',                  'https://logos.duplogreenengine.com/flags/cd.svg',     'flag'),
  ('bosnia e herzegovina',      'https://logos.duplogreenengine.com/flags/ba.svg',     'flag'),
  ('escocia',                   'https://logos.duplogreenengine.com/flags/gb-sct.svg', 'flag'),
  ('gales',                     'https://logos.duplogreenengine.com/flags/gb-wls.svg', 'flag')
ON CONFLICT (team_name) DO NOTHING;

-- Seed: clubes (logos)
INSERT INTO public.team_logos (team_name, logo_url, logo_type) VALUES
  ('america mg',                'https://logos.duplogreenengine.com/logos/america-mg.png',               'logo'),
  ('arsenal',                   'https://logos.duplogreenengine.com/logos/arsenal.png',                  'logo'),
  ('aston villa',               'https://logos.duplogreenengine.com/logos/aston-villa.png',              'logo'),
  ('atalanta',                  'https://logos.duplogreenengine.com/logos/atalanta.png',                 'logo'),
  ('athletico paranaense',      'https://logos.duplogreenengine.com/logos/athletico.png',                'logo'),
  ('atlanta united',            'https://logos.duplogreenengine.com/logos/atlanta-united.png',           'logo'),
  ('atletico goianiense',       'https://logos.duplogreenengine.com/logos/atletico-goianiense.png',      'logo'),
  ('atletico mineiro',          'https://logos.duplogreenengine.com/logos/atletico-mineiro.png',         'logo'),
  ('avai',                      'https://logos.duplogreenengine.com/logos/avai.png',                     'logo'),
  ('bahia',                     'https://logos.duplogreenengine.com/logos/bahia.png',                    'logo'),
  ('boca juniors',              'https://logos.duplogreenengine.com/logos/boca-juniors.png',             'logo'),
  ('bolivar',                   'https://logos.duplogreenengine.com/logos/bolivar.png',                  'logo'),
  ('bologna',                   'https://logos.duplogreenengine.com/logos/bologna.png',                  'logo'),
  ('botafogo sp',               'https://logos.duplogreenengine.com/logos/botafogo-sp.png',              'logo'),
  ('botafogo',                  'https://logos.duplogreenengine.com/logos/botafogo.png',                 'logo'),
  ('bournemouth',               'https://logos.duplogreenengine.com/logos/bournemouth.png',              'logo'),
  ('brentford',                 'https://logos.duplogreenengine.com/logos/brentford.png',                'logo'),
  ('brighton',                  'https://logos.duplogreenengine.com/logos/brighton.png',                 'logo'),
  ('cagliari',                  'https://logos.duplogreenengine.com/logos/cagliari.png',                 'logo'),
  ('ceara',                     'https://logos.duplogreenengine.com/logos/ceara.png',                    'logo'),
  ('chelsea',                   'https://logos.duplogreenengine.com/logos/chelsea.png',                  'logo'),
  ('corinthians',               'https://logos.duplogreenengine.com/logos/corinthians.png',              'logo'),
  ('coritiba',                  'https://logos.duplogreenengine.com/logos/coritiba.png',                 'logo'),
  ('crb',                       'https://logos.duplogreenengine.com/logos/crb.png',                      'logo'),
  ('criciuma',                  'https://logos.duplogreenengine.com/logos/criciuma.png',                 'logo'),
  ('cruzeiro',                  'https://logos.duplogreenengine.com/logos/cruzeiro.png',                 'logo'),
  ('crystal palace',            'https://logos.duplogreenengine.com/logos/crystal-palace.png',           'logo'),
  ('cuiaba',                    'https://logos.duplogreenengine.com/logos/cuiaba.png',                   'logo'),
  ('everton',                   'https://logos.duplogreenengine.com/logos/everton.png',                  'logo'),
  ('fiorentina',                'https://logos.duplogreenengine.com/logos/fiorentina.png',               'logo'),
  ('flamengo',                  'https://logos.duplogreenengine.com/logos/flamengo.png',                 'logo'),
  ('fluminense',                'https://logos.duplogreenengine.com/logos/fluminense.png',               'logo'),
  ('fortaleza',                 'https://logos.duplogreenengine.com/logos/fortaleza.png',                'logo'),
  ('fulham',                    'https://logos.duplogreenengine.com/logos/fulham.png',                   'logo'),
  ('goias',                     'https://logos.duplogreenengine.com/logos/goias.png',                    'logo'),
  ('gremio',                    'https://logos.duplogreenengine.com/logos/gremio.png',                   'logo'),
  ('inter milan',               'https://logos.duplogreenengine.com/logos/inter-milan.png',              'logo'),
  ('internacional',             'https://logos.duplogreenengine.com/logos/internacional.png',            'logo'),
  ('juventude',                 'https://logos.duplogreenengine.com/logos/juventude.png',                'logo'),
  ('juventus',                  'https://logos.duplogreenengine.com/logos/juventus.png',                 'logo'),
  ('lazio',                     'https://logos.duplogreenengine.com/logos/lazio.png',                    'logo'),
  ('liverpool',                 'https://logos.duplogreenengine.com/logos/liverpool.png',                'logo'),
  ('manchester city',           'https://logos.duplogreenengine.com/logos/manchester-city.png',          'logo'),
  ('manchester united',         'https://logos.duplogreenengine.com/logos/manchester-united.png',        'logo'),
  ('milan',                     'https://logos.duplogreenengine.com/logos/milan.png',                    'logo'),
  ('mirassol',                  'https://logos.duplogreenengine.com/logos/mirassol.png',                 'logo'),
  ('napoli',                    'https://logos.duplogreenengine.com/logos/napoli.png',                   'logo'),
  ('nautico',                   'https://logos.duplogreenengine.com/logos/nautico.png',                  'logo'),
  ('newcastle united',          'https://logos.duplogreenengine.com/logos/newcastle-united.png',         'logo'),
  ('nottingham forest',         'https://logos.duplogreenengine.com/logos/nottingham-forest.png',        'logo'),
  ('novorizontino',             'https://logos.duplogreenengine.com/logos/novorizontino.png',            'logo'),
  ('palmeiras',                 'https://logos.duplogreenengine.com/logos/palmeiras.png',                'logo'),
  ('red bull bragantino',       'https://logos.duplogreenengine.com/logos/red-bull-bragantino.png',      'logo'),
  ('remo',                      'https://logos.duplogreenengine.com/logos/remo.png',                     'logo'),
  ('roma',                      'https://logos.duplogreenengine.com/logos/roma.png',                     'logo'),
  ('santos',                    'https://logos.duplogreenengine.com/logos/santos.png',                   'logo'),
  ('sao bernardo',              'https://logos.duplogreenengine.com/logos/sao-bernardo.png',             'logo'),
  ('sao paulo',                 'https://logos.duplogreenengine.com/logos/sao-paulo.png',                'logo'),
  ('sport recife',              'https://logos.duplogreenengine.com/logos/sport-recife.png',             'logo'),
  ('tottenham',                 'https://logos.duplogreenengine.com/logos/tottenham.png',                'logo'),
  ('udinese',                   'https://logos.duplogreenengine.com/logos/udinese.png',                  'logo'),
  ('vasco da gama',             'https://logos.duplogreenengine.com/logos/vasco-da-gama.png',            'logo'),
  ('vitoria',                   'https://logos.duplogreenengine.com/logos/vitoria.png',                  'logo'),
  ('vila nova',                 'https://logos.duplogreenengine.com/logos/vila-nova.png',                'logo')
ON CONFLICT (team_name) DO NOTHING;
