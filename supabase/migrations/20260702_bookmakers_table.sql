-- Tabela centralizada de casas de apostas
-- Alimentada pelo sync automático do DG e por adições manuais

CREATE TABLE IF NOT EXISTS bookmakers (
  slug        TEXT        PRIMARY KEY,                   -- ex: "betgo", "bet365"
  name        TEXT        NOT NULL,                      -- ex: "Betgo", "Bet365"
  domain      TEXT,                                      -- ex: "betgo.bet.br"
  color       TEXT        DEFAULT '#6B7280',             -- cor hex para UI
  source      TEXT        NOT NULL DEFAULT 'dg_auto',    -- 'manual' | 'dg_auto'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookmakers_source ON bookmakers (source);

ALTER TABLE bookmakers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem bookmakers" ON bookmakers;
CREATE POLICY "Autenticados leem bookmakers"
  ON bookmakers FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role escreve bookmakers" ON bookmakers;
CREATE POLICY "Service role escreve bookmakers"
  ON bookmakers FOR ALL
  USING (auth.role() = 'service_role');
