/**
 * OddsSource — factory e ponto de entrada único.
 *
 * Troque a fonte de dados alterando apenas SOURCE abaixo (ou via env var).
 * O restante do código não precisa saber de qual adapter vem.
 *
 * Hierarquia:
 *   1. DGApiAdapter  (fonte primária — DuploGreenEngine)
 *   2. LocalAdapter  (fallback automático se DG falhar)
 */

import { DGApiAdapter  } from './dg-adapter';
import { LocalAdapter  } from './local-adapter';
import type { IOddsAdapter, OddsMatch, OddsSourceOptions } from './types';

export type OddsSourceKind = 'dg' | 'local' | 'auto';

const SOURCE: OddsSourceKind =
  (process.env.ODDS_SOURCE as OddsSourceKind | undefined) ?? 'auto';

function makeAdapter(kind: OddsSourceKind): IOddsAdapter {
  if (kind === 'dg')    return new DGApiAdapter();
  if (kind === 'local') return new LocalAdapter();
  return new DGApiAdapter(); // 'auto' começa com DG
}

// Singleton por processo
let _adapter: IOddsAdapter | null = null;

function getAdapter(): IOddsAdapter {
  if (!_adapter) _adapter = makeAdapter(SOURCE);
  return _adapter;
}

/** Busca todos os jogos, com fallback automático para local se DG falhar */
export async function fetchAllOdds(opts?: OddsSourceOptions): Promise<OddsMatch[]> {
  try {
    return await getAdapter().fetchAll(opts);
  } catch (err) {
    if (SOURCE === 'auto') {
      console.warn('[OddsSource] DG falhou, usando fallback local:', err);
      return new LocalAdapter().fetchAll(opts);
    }
    throw err;
  }
}

/** Busca odds de um jogo específico */
export async function fetchMatchOdds(matchId: string): Promise<OddsMatch | null> {
  try {
    return await getAdapter().fetchMatch(matchId);
  } catch (err) {
    if (SOURCE === 'auto') {
      console.warn('[OddsSource] DG fetchMatch falhou, usando fallback local:', err);
      return new LocalAdapter().fetchMatch(matchId);
    }
    throw err;
  }
}

// Re-exports para quem precisar usar diretamente
export { DGApiAdapter, LocalAdapter };
export type { IOddsAdapter, OddsMatch, OddsSourceOptions };
export * from './types';
export * from './cache';
