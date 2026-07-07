function tab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  event.target.classList.add('active');
}

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 5000)  return 'agora mesmo';
  if (diff < 60000) return `há ${Math.floor(diff / 1000)}s`;
  if (diff < 3600000) return `há ${Math.floor(diff / 60000)}min`;
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function refresh() {
  let status;
  try {
    status = await chrome.runtime.sendMessage({ kind: 'get_status' });
  } catch {
    document.getElementById('status-dot').className = 'dot error';
    return;
  }

  // Status dot
  const dot = document.getElementById('status-dot');
  dot.className = 'dot ' + (status.revoked ? 'error' : status.dgOpen ? 'online' : 'offline');

  // Status panel
  document.getElementById('dg-open').textContent   = status.dgOpen ? 'Sim' : 'Não';
  document.getElementById('dg-open').className     = 'value ' + (status.dgOpen ? 'green' : 'amber');
  document.getElementById('last-sync').textContent = relativeTime(status.lastSyncAt);
  document.getElementById('device-id').textContent = (status.deviceId ?? '—').slice(0, 18) + '…';
  document.getElementById('revoked').textContent   = status.revoked ? 'Sim' : 'Não';
  document.getElementById('revoked').className     = 'value ' + (status.revoked ? 'red' : 'green');
  document.getElementById('version').textContent   = 'v' + status.extensionVersion;
  document.getElementById('footer-device').textContent = 'Device: ' + (status.deviceId ?? '—').slice(0, 24);

  // Queue panel
  const q = status.queueDepth ?? {};
  document.getElementById('q-critical').textContent = (q.critical ?? 0) + ' críticos';
  document.getElementById('q-high').textContent     = (q.high     ?? 0) + ' high';
  document.getElementById('q-normal').textContent   = (q.normal   ?? 0) + ' normal';
  document.getElementById('q-low').textContent      = (q.low      ?? 0) + ' low';
  document.getElementById('q-total').textContent    = (q.total    ?? 0);

  // Discovery panel
  let unknowns;
  try {
    const res = await chrome.runtime.sendMessage({ kind: 'get_unknown_endpoints' });
    unknowns = res.endpoints ?? [];
  } catch { unknowns = []; }

  const list = document.getElementById('unknown-list');
  if (unknowns.length === 0) {
    list.innerHTML = '<span style="color:#3a4a5a;font-size:11px;">Nenhum detectado ainda.</span>';
  } else {
    list.innerHTML = unknowns.slice(0, 10).map(e => `
      <div class="unknown-item">
        <div class="url">${e.name}</div>
        <div class="meta">Visto ${e.count}x · ${e.shape?.slice(0,5).join(', ')}</div>
      </div>
    `).join('');
  }
}

document.getElementById('btn-sync').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ kind: 'force_sync' });
  setTimeout(refresh, 800);
});

// Atualiza ao abrir e a cada 3s
refresh();
setInterval(refresh, 3000);
