/**
 * Config remota — busca configuração do SureEdge a cada 5 minutos.
 * Permite habilitar/desabilitar plugins e alterar parâmetros sem update da extensão.
 */

const SUREEDGE_ORIGIN  = 'https://www.sureedge.com.br';
const CONFIG_INTERVAL  = 5 * 60 * 1000;
const CONFIG_CACHE_KEY = 'remote_config';

const DEFAULT_CONFIG = {
  plugins: {
    'odds-1x2':      { enabled: true,  priority: 'critical' },
    'odds-pa':       { enabled: true,  priority: 'critical' },
    'opportunities': { enabled: true,  priority: 'high' },
  },
  heartbeat_interval_ms: 60000,
  log_level: 'warn',
  feature_flags: {
    replay_mode:      true,
    schema_detection: true,
    discovery:        true,
  },
  min_extension_version: '1.0.0',
  api_version: 1,
};

let _config     = null;
let _lastFetch  = 0;

export async function getConfig() {
  if (_config && Date.now() - _lastFetch < CONFIG_INTERVAL) return _config;

  // Tenta buscar do storage primeiro (sobrevive a restart do SW)
  if (!_config) {
    const cached = await chrome.storage.local.get(CONFIG_CACHE_KEY);
    if (cached[CONFIG_CACHE_KEY]) _config = cached[CONFIG_CACHE_KEY];
  }

  try {
    const { device_id } = await chrome.storage.local.get('device_id');
    const res = await fetch(
      `${SUREEDGE_ORIGIN}/api/sync/config?device_id=${device_id}&version=${chrome.runtime.getManifest().version}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const remote = await res.json();
      _config    = { ...DEFAULT_CONFIG, ...remote };
      _lastFetch = Date.now();
      await chrome.storage.local.set({ [CONFIG_CACHE_KEY]: _config });
    }
  } catch {
    // usa config em cache ou default
  }

  return _config ?? DEFAULT_CONFIG;
}

export function isPluginEnabled(config, pluginId) {
  return config?.plugins?.[pluginId]?.enabled !== false;
}

export function getPluginPriority(config, pluginId, fallback) {
  return config?.plugins?.[pluginId]?.priority ?? fallback;
}
