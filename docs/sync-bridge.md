# SureEdge Sync Bridge — Documentação

Extensão Chrome MV3 que captura odds do DuploGreen automaticamente e sincroniza com o SureEdge enquanto o usuário estiver logado no DG.

## Como funciona (fluxo completo)

```
DuploGreen (browser)
  └─ content/interceptor.js   [MAIN world]  intercepta fetch/XHR/WS/SSE
  └─ content/active-fetch.js  [MAIN world]  busca todos endpoints ao capturar sessão
  └─ content/relay.js         [ISOLATED]    repassa CustomEvents → chrome.runtime.sendMessage
       │
       ▼
background/service-worker.js
  └─ matchPlugin(url)          identifica qual plugin trata o endpoint
  └─ plugin.parse(body)        normaliza os dados
  └─ computeDiff(snapshot, parsed)  calcula o que mudou
  └─ enqueue(batchedDiff)     enfileira lotes de 100 rows no IndexedDB
  └─ processQueue()           envia lotes → /api/sync/ingest (JSON puro)
       │
       ▼
SureEdge API (/api/sync/ingest)
  └─ autentica por device_id + HMAC-SHA256 (sem cookie de sessão)
  └─ mapeia campos → bookmaker_odds (Supabase)
  └─ retorna 200 → service worker salva snapshot no IndexedDB
       │
       ▼
/api/dg/odds-db?all=1
  └─ lê bookmaker_odds e devolve OddsSummary[] agrupado por match
```

## Arquivos da extensão

| Arquivo | Função |
|---------|--------|
| `extension/manifest.json` | Configuração MV3: permissões, content scripts, service worker |
| `extension/content/interceptor.js` | Intercepta fetch/XHR/WS/SSE no mundo MAIN. Captura headers de `/functions/v1/` e aciona active fetch |
| `extension/content/active-fetch.js` | Busca ativamente todos endpoints DG com os headers capturados |
| `extension/content/relay.js` | Ponte MAIN→ISOLATED: escuta CustomEvents, repassa via chrome.runtime.sendMessage |
| `extension/background/service-worker.js` | Coordenador principal: recebe mensagens, processa diff, gerencia fila |
| `extension/background/queue.js` | IndexedDB: fila de envio, snapshots, replay buffer |
| `extension/background/crypto.js` | HMAC-SHA256 para assinar payloads + sendToSureEdge (JSON puro) |
| `extension/background/config.js` | Busca config remota a cada 5min |
| `extension/background/heartbeat.js` | Heartbeat a cada 1min para o SureEdge |
| `extension/plugins/registry.js` | Registra e faz match de plugins por URL |
| `extension/plugins/odds-1x2.js` | Plugin para `/get-individual-odds?market=1x2` |
| `extension/plugins/odds-pa.js` | Plugin para `/get-individual-odds?market=1x2_pa` |
| `extension/plugins/opportunities.js` | Plugin para `/get-dg-opportunities*` |
| `extension/popup/index.html` | Popup da extensão: status, fila, endpoints descobertos |

## Endpoints DG capturados

| Endpoint | Plugin | Tabela destino |
|----------|--------|----------------|
| `get-individual-odds?market=1x2` | odds-1x2 | bookmaker_odds |
| `get-individual-odds?market=1x2_pa` | odds-pa | bookmaker_odds |
| `get-dg-opportunities-v2?pa_mode=both` | opportunities | (futuro) |
| `get-dg-opportunities-v2?pa_mode=one` | opportunities | (futuro) |
| `get-dg-opportunities` | opportunities | (futuro) |

## API SureEdge para a extensão

| Rota | Método | Função |
|------|--------|--------|
| `/api/sync/ingest` | POST | Recebe diff de odds, salva em bookmaker_odds |
| `/api/sync/heartbeat` | POST | Atualiza status do dispositivo |
| `/api/sync/config` | GET | Config remota por device_id |
| `/api/sync/schema-alert` | POST | Alerta de schema incompatível |

**Auth das rotas:** `X-Device-ID` + `X-Signature` (HMAC-SHA256). Não usa cookie — excluídas do middleware em `src/middleware.ts`.

## Banco de dados

Migration: `supabase/migrations/20260706_sync_bridge.sql`

Tabelas criadas:
- `sync_devices` — dispositivos registrados
- `sync_sequence` — controle de sequência por dispositivo/plugin
- `sync_alerts` — alertas de schema mismatch

Tabela existente usada:
- `bookmaker_odds` — onde as odds ficam salvas (lida por `/api/dg/odds-db`)

## Instalar/Atualizar extensão

1. Clone o repo ou faça `git pull`
2. Vá em `chrome://extensions` → ative "Modo desenvolvedor"
3. "Carregar sem compactação" → selecione a pasta `extension/`
4. Para atualizar após mudança de código: clique em **Recarregar** na extensão

## Diagnóstico e debugging

### Verificar se está funcionando
No console do DG (`duplogreenengine.com`):
```js
// Confirma que scripts carregaram
window.__sureedge_interceptor_loaded   // deve ser true
window.__sureedge_active_fetch_loaded  // deve ser true

// Forçar fetch ativo manualmente
window.__sureedge_force_fetch()
// Deve aparecer: [SureEdge] ativo: get-individual-odds?market=1x2 → N rows
```

### Limpar snapshots (forçar re-envio completo)
No console do **service worker** (`chrome://extensions` → Service Worker):
```js
chrome.runtime.sendMessage({ kind: 'clear_snapshots' }, r => console.log(r))
// Deve retornar: {ok: true}
```

### Verificar odds no SureEdge
No console do SureEdge:
```js
fetch('/api/dg/odds-db?all=1').then(r=>r.json()).then(d=>console.log('odds:', d.odds?.length))
```

### Status pelo popup
Clique no ícone da extensão para ver: dispositivo, última sync, profundidade da fila, endpoints descobertos.

## Decisões de arquitetura importantes

- **Sem compressão gzip**: removida para evitar bug de auto-decompress do Next.js com `Content-Encoding: gzip`. Payload vai como JSON puro.
- **Snapshot salvo após ingest**: o snapshot local só é atualizado quando o `/api/sync/ingest` confirma 200, evitando "dados perdidos" se a requisição falhar.
- **Batching de 100 rows**: evita ultrapassar o limite de 4.5MB do Vercel por request.
- **MAIN world obrigatório**: `active-fetch.js` e `interceptor.js` rodam no MAIN world para ter acesso à sessão do browser (cookies + headers). O service worker não tem acesso à sessão.
- **Captura só de `/functions/v1/`**: o interceptor só captura headers de chamadas às Edge Functions do DG (que têm `Authorization: Bearer` correto), não de chamadas REST do Supabase.
