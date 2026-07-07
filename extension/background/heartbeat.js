/**
 * Heartbeat — informa o SureEdge sobre o estado da extensão a cada N segundos.
 * Continua funcionando mesmo quando o DG está fechado.
 */

const SUREEDGE_ORIGIN = 'https://www.sureedge.com.br';

export async function sendHeartbeat(deviceId, queueDepth, lastSyncAt) {
  const tabs = await chrome.tabs.query({ url: ['*://www.duplogreenengine.com/*', '*://duplogreenengine.com/*'] });
  const dgOpen = tabs.length > 0;

  const payload = {
    device_id:             deviceId,
    status:                dgOpen ? 'online' : 'offline',
    dg_tab_open:           dgOpen,
    last_sync_at:          lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    queue_depth:           queueDepth,
    extension_version:     chrome.runtime.getManifest().version,
    ts:                    Date.now(),
  };

  try {
    const res = await fetch(`${SUREEDGE_ORIGIN}/api/sync/heartbeat`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID':  deviceId,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      // Dispositivo revogado → avisa e para de enviar
      if (data.revoked) {
        await chrome.storage.local.set({ revoked: true });
        console.warn('[SureEdge] dispositivo revogado pelo servidor');
      }
      return data;
    }
  } catch {
    // falha silenciosa no heartbeat não é crítica
  }

  return null;
}
