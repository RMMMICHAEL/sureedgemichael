-- Tabela para odds importadas manualmente (formato DuploGreen get-individual-odds)
-- Permite colar o JSON no painel admin e popular automaticamente

CREATE TABLE IF NOT EXISTS bookmaker_odds (
  -- Chave composta: um jogo + bookmaker + tipo de mercado
  match_id        TEXT        NOT NULL,
  bookmaker_slug  TEXT        NOT NULL,
  market_type     TEXT        NOT NULL DEFAULT '1x2',  -- '1x2' | '1x2_pa'

  -- Informações do jogo
  home_team       TEXT        NOT NULL,
  away_team       TEXT        NOT NULL,
  match_date      DATE,
  start_time      TIMESTAMPTZ,
  league_slug     TEXT,
  league_name     TEXT,

  -- Informações da casa
  bookmaker_name  TEXT,
  odd_home        NUMERIC(6,3),
  odd_draw        NUMERIC(6,3),
  odd_away        NUMERIC(6,3),
  match_url       TEXT,
  source_url      TEXT,

  -- Controle
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ,

  PRIMARY KEY (match_id, bookmaker_slug, market_type)
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_bookmaker_odds_date   ON bookmaker_odds (match_date);
CREATE INDEX IF NOT EXISTS idx_bookmaker_odds_slug   ON bookmaker_odds (bookmaker_slug);
CREATE INDEX IF NOT EXISTS idx_bookmaker_odds_market ON bookmaker_odds (market_type);

-- RLS: apenas usuários autenticados leem; apenas service_role escreve via API admin
ALTER TABLE bookmaker_odds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem bookmaker_odds" ON bookmaker_odds;
CREATE POLICY "Autenticados leem bookmaker_odds"
  ON bookmaker_odds FOR SELECT
  USING (auth.role() = 'authenticated');
