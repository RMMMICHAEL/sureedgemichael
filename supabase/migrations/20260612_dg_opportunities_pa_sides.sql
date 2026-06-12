-- Adiciona pa_sides à tabela dg_opportunities
-- 2 = ambos lados (home + away) têm PA
-- 1 = apenas um lado tem PA
-- 0 = nenhum lado tem PA (dados antigos sem info)

ALTER TABLE dg_opportunities
  ADD COLUMN IF NOT EXISTS pa_sides INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dg_opportunities_pa_sides ON dg_opportunities (pa_sides);
