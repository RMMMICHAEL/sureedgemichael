-- Tabela para oportunidades pré-calculadas pelo DuploGreen (formato opportunities/legs)
-- Importadas via painel admin → "Importar Dados de Free Bet"

CREATE TABLE IF NOT EXISTS dg_opportunities (
  -- ID gerado pelo DuploGreen (ex: "matchId_bookmakerSlug_outcome_pa")
  id               TEXT        PRIMARY KEY,

  -- Jogo
  match_id         TEXT        NOT NULL,
  home_team        TEXT        NOT NULL,
  away_team        TEXT        NOT NULL,
  league           TEXT,
  league_slug      TEXT,
  kickoff          TIMESTAMPTZ,

  -- Score DuploGreen
  max_loss_pct     NUMERIC(8,4),
  dg_profit_pct    NUMERIC(8,4),
  dg_score         INT,
  dg_classification TEXT,        -- 'ALTA' | 'MEDIA' | 'BAIXA'

  -- Pernas da oportunidade (array de {bookmaker, bookmakerSlug, odd, outcome, matchUrl, isPA})
  legs             JSONB        NOT NULL DEFAULT '[]',

  -- Controle
  updated_at       TIMESTAMPTZ,
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_dg_opp_match_id  ON dg_opportunities (match_id);
CREATE INDEX IF NOT EXISTS idx_dg_opp_kickoff   ON dg_opportunities (kickoff);
CREATE INDEX IF NOT EXISTS idx_dg_opp_score     ON dg_opportunities (dg_score DESC);
CREATE INDEX IF NOT EXISTS idx_dg_opp_class     ON dg_opportunities (dg_classification);

-- RLS
ALTER TABLE dg_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem dg_opportunities" ON dg_opportunities;
CREATE POLICY "Autenticados leem dg_opportunities"
  ON dg_opportunities FOR SELECT
  USING (auth.role() = 'authenticated');
