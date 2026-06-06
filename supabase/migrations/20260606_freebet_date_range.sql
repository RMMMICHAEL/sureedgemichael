-- Adiciona coluna date_range na freebet_queue
-- Valores: 'all' | '24h' | '48h' | '72h' | '5d'
ALTER TABLE public.freebet_queue
  ADD COLUMN IF NOT EXISTS date_range TEXT NOT NULL DEFAULT 'all';
