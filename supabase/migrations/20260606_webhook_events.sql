-- Tabela de auditoria de todos os eventos de webhook recebidos.
-- Permite investigar problemas como cancelamento imediato após compra.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider   TEXT NOT NULL DEFAULT 'cakto',
  event      TEXT NOT NULL,
  email      TEXT,
  ref_id     TEXT,
  payload    JSONB,
  processed  BOOLEAN DEFAULT true,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Apenas admins leem (service_role bypassa RLS automaticamente)
CREATE POLICY "Admins only" ON public.webhook_events
  FOR SELECT USING (false);

CREATE INDEX IF NOT EXISTS idx_webhook_events_email     ON public.webhook_events(email);
CREATE INDEX IF NOT EXISTS idx_webhook_events_ref_id    ON public.webhook_events(ref_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created   ON public.webhook_events(created_at DESC);
