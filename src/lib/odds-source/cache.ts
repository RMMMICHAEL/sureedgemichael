/**
 * Cache em memória com TTL para snapshots de odds.
 * Singleton por processo — compartilhado entre requests no mesmo worker.
 */

import type { OddsMatch } from './types';

interface CacheEntry {
  data:      OddsMatch[];
  fetchedAt: number;
}

const TTL_MS = 30_000; // 30s — polling do DG é ~5s, margem para múltiplos clients

let _cache: CacheEntry | null = null;

// Cache por match_id para fetchMatch
const _matchCache = new Map<string, { data: OddsMatch; fetchedAt: number }>();
const MATCH_TTL_MS = 5_000; // mesmo intervalo do DG

export function getCached(): OddsMatch[] | null {
  if (!_cache) return null;
  if (Date.now() - _cache.fetchedAt > TTL_MS) return null;
  return _cache.data;
}

export function setCached(data: OddsMatch[]): void {
  _cache = { data, fetchedAt: Date.now() };
}

export function getCachedMatch(matchId: string): OddsMatch | null {
  const entry = _matchCache.get(matchId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MATCH_TTL_MS) {
    _matchCache.delete(matchId);
    return null;
  }
  return entry.data;
}

export function setCachedMatch(match: OddsMatch): void {
  _matchCache.set(match.match_id, { data: match, fetchedAt: Date.now() });
}

/** Aplica update incremental no cache global sem re-fetch completo */
export function patchCached(updated: OddsMatch): void {
  if (!_cache) return;
  const idx = _cache.data.findIndex(m => m.match_id === updated.match_id);
  if (idx >= 0) {
    _cache.data[idx] = updated;
  } else {
    _cache.data.push(updated);
  }
  setCachedMatch(updated);
}

export function invalidateCache(): void {
  _cache = null;
  _matchCache.clear();
}
