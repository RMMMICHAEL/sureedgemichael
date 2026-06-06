CREATE TABLE IF NOT EXISTS public.search_queue (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | done | error
  result      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.search_queue ENABLE ROW LEVEL SECURITY;

-- Service role bypassa RLS
CREATE POLICY "block_public" ON public.search_queue FOR ALL USING (false);

-- Index para o extension polling
CREATE INDEX idx_search_queue_status ON public.search_queue(status, created_at DESC);

-- Realtime habilitado
ALTER PUBLICATION supabase_realtime ADD TABLE public.search_queue;
