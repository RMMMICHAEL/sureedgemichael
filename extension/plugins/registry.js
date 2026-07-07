/**
 * Registry de plugins — catálogo central de todos os endpoints monitorados.
 * Para adicionar um novo endpoint, basta registrar aqui.
 */

import { oddsPlugin }         from './odds-1x2.js';
import { oddsPaPlugin }       from './odds-pa.js';
import { opportunitiesPlugin } from './opportunities.js';

const PLUGINS = [oddsPlugin, oddsPaPlugin, opportunitiesPlugin];

/** Encontra o plugin que corresponde a uma URL interceptada */
export function matchPlugin(url) {
  return PLUGINS.find(p => {
    if (p.match instanceof RegExp) return p.match.test(url);
    if (Array.isArray(p.match))   return p.match.some(m => url.includes(m));
    return url.includes(p.match);
  }) ?? null;
}

/** Retorna todos os plugins registrados */
export function getAllPlugins() {
  return [...PLUGINS];
}

/** Retorna IDs de todos os plugins */
export function getPluginIds() {
  return PLUGINS.map(p => p.id);
}
