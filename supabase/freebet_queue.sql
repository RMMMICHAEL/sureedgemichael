-- Tabela de fila para conversão de freebet
-- O daemon local (process-queue.mjs) processa as requisições e salva o resultado

CREATE TABLE IF NOT EXISTS public.freebet_queue (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  bookmaker   TEXT        NOT NULL,
  value       NUMERIC     NOT NULL,
  min_odd     NUMERIC     DEFAULT 1.5,
  max_odd     NUMERIC     DEFAULT 999,
  pa_filter   TEXT        DEFAULT 'all',
  status      TEXT        DEFAULT 'pending', -- pending | processing | done | error
  result      JSONB,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para o daemon buscar pendentes rapidamente
CREATE INDEX IF NOT EXISTS freebet_queue_status_created
  ON public.freebet_queue (status, created_at ASC);

-- Limpeza automática de registros com mais de 24h (evita acúmulo)
CREATE OR REPLACE FUNCTION public.cleanup_freebet_queue()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.freebet_queue
  WHERE created_at < NOW() - INTERVAL '24 hours';
$$;

-- RLS: service role lê/escreve tudo; anon não acessa
ALTER TABLE public.freebet_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON public.freebet_queue
  USING (true) WITH CHECK (true);
