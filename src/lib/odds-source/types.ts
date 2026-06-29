/**
 * Tipos compartilhados para a camada de abstração de odds.
 * Compatível com o formato retornado por api.duplogreenengine.com/functions/v1/get-match
 * e com a tabela bookmaker_odds do Supabase local.
 */

export interface OddsBookmaker {
  slug:         string;
  name:         string;
  home:         number;
  draw:         number;
  away:         number;
  url:          string;
  is_pa:        boolean;
  market_type:  string;
}

export interface OddsMatch {
  match_id:    string;
  home_team:   string;
  away_team:   string;
  start_time:  string;
  match_date:  string;
  league_name: string;
  league_slug: string;
  bookmakers:  OddsBookmaker[];
}

/** Evento de update incremental enviado via SSE */
export interface OddsUpdateEvent {
  type:     'snapshot' | 'update' | 'heartbeat' | 'error';
  match_id?: string;
  data?:    OddsMatch | OddsMatch[];
  error?:   string;
  ts:       number;
}

export interface OddsSourceOptions {
  /** Filtrar apenas jogos a partir desta data (ISO). Padrão: hoje */
  fromDate?: string;
  /** Limite máximo de jogos */
  limit?: number;
}

/** Contrato da camada de abstração — qualquer adapter deve implementar */
export interface IOddsAdapter {
  /** Carrega snapshot inicial */
  fetchAll(opts?: OddsSourceOptions): Promise<OddsMatch[]>;
  /** Busca odds de um jogo específico pelo match_id */
  fetchMatch(matchId: string): Promise<OddsMatch | null>;
}
