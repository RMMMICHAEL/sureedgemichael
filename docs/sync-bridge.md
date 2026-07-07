# SureEdge Sync Bridge — Arquitetura, Métricas e Operação

Extensão Chrome MV3 que intercepta passivamente as odds do DuploGreen e as sincroniza com o banco do SureEdge em tempo real, sem intervenção do usuário.

---

## Fluxo completo (pipeline end-to-end)

```
DuploGreen (browser — página aberta pelo usuário)
  │
  ├─ content/interceptor.js  [MAIN world]
  │    Intercepta fetch/XHR/WS/SSE. Captura headers de Authorization
  │    de chamadas a /functions/v1/. Dispara active-fetch ao capturar sessão.
  │
  ├─ content/active-fetch.js  [MAIN world]
  │    Faz GET em todos endpoints DG com os headers capturados.
  │    Reenviado a cada 10min via alarm 'refresh_odds'.
  │
  └─ content/relay.js  [ISOLATED world]
       Repassa CustomEvents do MAIN world → chrome.runtime.sendMessage
       (ponte necessária porque ISOLATED não tem acesso a window.fetch)
         │
         ▼
background/service-worker.js
  ├─ matchPlugin(url)           identifica plugin pelo padrão de URL
  ├─ plugin.parse(body)         normaliza para schema interno
  ├─ computeDiff(snapshot, parsed)  delta: added / modified / removed
  ├─ enqueue(batchedDiff)       lotes de ≤100 rows no IndexedDB (FIFO + prioridade)
  └─ processQueue()             envia lotes → POST /api/sync/ingest
       │                        (batchId rastreável por request)
       ▼
SureEdge API  /api/sync/ingest
  ├─ Autentica: X-Device-ID + X-Signature (HMAC-SHA256, sem cookie)
  ├─ handleOdds(): mapeia → bookmaker_odds (upsert via Supabase REST)
  ├─ [LOG] db_commit=true       ← broadcast enviado SOMENTE após este log
  ├─ broadcastOddsUpdated()     POST /realtime/v1/api/broadcast (2 tentativas, timeout 1.5s)
  └─ Retorna { ok, batch_id }   ← batch_id confirma que broadcast foi emitido
       │
       ▼  canal: realtime:odds_updates  (Supabase Broadcast)
       │  1 mensagem por batch de 100 rows (não 1 por linha)
       │  Volume típico: ~36 msgs por sync completo vs. ~4.186 com postgres_changes
       ▼
useOdds.ts  (browser — aba SureEdge aberta pelo usuário)
  ├─ broadcast_received         log com batch_id, plugin, rows_written
  ├─ Debounce 2.5s (trailing)   reinicia a cada evento, dispara 1 refetch
  ├─ fetch_started              GET /api/dg/odds-db?all=1
  └─ fetch_finished             log com matches, total_odds, books min/avg/max, latência
```

---

## Decisões de arquitetura

### Por que broadcast global e não por usuário?

Todos os usuários do SureEdge visualizam as **mesmas odds** da mesma fonte (DuploGreen). Não há filtragem por usuário nos dados de bookmaker. Portanto, o canal global `odds_updates` é correto: quando qualquer dispositivo sincroniza, todos os browsers conectados recebem a notificação e obtêm os dados mais recentes.

Se dois dispositivos sincronizarem simultaneamente, dois broadcasts chegam ao browser. O debounce de 2,5s os coalesce em **1 único refetch**. Verificado no stress test: 10.000 eventos instantâneos → 1 refetch.

Se no futuro houver dados por usuário (ex.: apostas pessoais), basta alterar:
- **Servidor**: broadcast para `realtime:odds_{user_id}` (user_id buscado de `sync_devices`)
- **Cliente**: `supabase.channel(`odds_${session.user.id}`)` em vez de `odds_updates`

### Por que broadcast e não postgres_changes?

Com `postgres_changes` em `bookmaker_odds`:
- 4.186 linhas × 1 evento = **4.186 eventos WebSocket** por sync completo
- Supabase cobra por mensagem; custo alto em produção

Com broadcast via REST:
- 36 batches × 1 mensagem = **36 mensagens** por sync completo
- 99% de redução no volume de eventos

### Por que o broadcast é fire-and-forget com retry?

O ingest deve responder ao service worker da extensão o mais rápido possível (evitar retry na fila). O broadcast é uma **notificação de conveniência**: se falhar, o fallback de 30s na UI corrige em até 30 segundos. A resposta `/api/sync/ingest` não depende do broadcast.

O broadcast inclui 2 tentativas com timeout de 1,5s cada. Se ambas falharem, `broadcast_sent=FAILED` é logado e o fallback_poll garante a atualização.

### Garantia de ordenação ingest → broadcast

O código em `route.ts`:
```typescript
const rowsWritten = await handleOdds(payload.diff, pluginId, batchId);
// handleOdds só retorna após sbUpsert completar (transação commitada)
// LOG: [INGEST:batchId] db_commit=true ← aparece antes do broadcast
if (rowsWritten > 0) broadcastOddsUpdated(pluginId, rowsWritten, batchId);
```

Não há condição de corrida: o broadcast é chamado **somente após** `await sbUpsert()` confirmar com status 2xx, o que significa que o Postgres já commitou a transação.

---

## Logs de rastreamento ponta a ponta

Um sync completo gera esta sequência de logs (em ordem cronológica):

```
# Service Worker (extensão — DevTools da extensão)
[DIAG] processQueue: enviando odds-1x2 +100 ~0 | body=12345 bytes
[DIAG] processQueue: resposta 200 para odds-1x2 elapsed=234ms
[DIAG] processQueue: ingest ok batch_id=lzx8a-f2k3 ingest_ms=234

# API (logs do servidor — Vercel/Next.js)
[INGEST:lzx8a-f2k3] recv plugin=odds-1x2 seq=42 added=100 modified=0 removed=0
[INGEST:lzx8a-f2k3] handleOdds plugin=odds-1x2 rows_to_upsert=100
[INGEST:lzx8a-f2k3] db_commit=true rows_written=100 elapsed=142ms
[INGEST:lzx8a-f2k3] broadcast_sent=true rows_written=100 elapsed=38ms

# Browser (console da aba SureEdge)
[SureEdge] broadcast_received batch_id=lzx8a-f2k3 plugin=odds-1x2 rows_written=100 total_pending=3
[SureEdge] fetch_started reason=realtime batch_ids=lzx8a-f2k3,...  events=12
[SureEdge] fetch_finished matches=82 total_odds=4186 books_per_match min=18 avg=25 max=31
           elapsed=312ms latency_ingest_to_ui=492ms avg_latency=487ms
```

**Interpretando `fetch_finished matches=82 total_odds=4186`:**
- `matches=82` → 82 partidas retornadas pela API (jogos distintos)
- `total_odds=4186` → soma de todas as linhas de bookmaker × mercado × partida (o que está no DB)
- `books_per_match avg=25` → em média 25 bookmakers por jogo (1x2 + PA combinados)
- `min=18 / max=31` → variação normal; jogos menores têm menos casas

Se `total_odds` cair abruptamente (ex.: de 4.186 para 800), houve perda de dados. Se `books_per_match avg` cair abaixo de 15, algum bookmaker parou de ser capturado.

---

## Métricas de produção

### Acessar métricas do Service Worker

No console do service worker (`chrome://extensions` → **Inspect views: Service Worker**):

```js
chrome.runtime.sendMessage({ kind: 'get_metrics' }, console.table)
```

Retorna:
| Campo | Descrição |
|-------|-----------|
| `uptimeHuman` | Tempo de vida do SW (ex.: `4h23m`) |
| `totalBatchesSent` | Lotes enviados ao ingest |
| `ingestOk / ingestFail` | Respostas 2xx vs. erros |
| `ingestSuccessRate` | Taxa de sucesso do ingest |
| `avgIngestTimeMs` | Tempo médio de resposta do ingest |
| `broadcastsTotal` | Broadcasts confirmados via batch_id |
| `broadcastsFailed` | Ingest ok mas sem broadcast (falha de rede no broadcast) |
| `broadcastSuccessRate` | Taxa de sucesso do broadcast |
| `currentQueueDepth` | Itens pendentes na fila agora |
| `storageSizeBytes` | Tamanho aproximado do IndexedDB |

### Acessar métricas do Realtime (browser)

Na aba SureEdge, console do browser:

```js
window.__sureedge_rt
// Retorna: { eventsReceived, refetchCount, reconnectCount, lastLatencyMs,
//            avgLatencyMs, fallbackPolls, lastMatchCount, lastOddsTotal,
//            lastBooksAvg, lastBooksMin, lastBooksMax }
```

| Campo | Alerta se... |
|-------|-------------|
| `reconnectCount` | > 5 em 24h (canal instável) |
| `fallbackPolls` | > 0 (Realtime caiu; verifique conectividade) |
| `avgLatencyMs` | > 10.000ms (gargalo no ingest ou na rede) |
| `lastOddsTotal` | < 3.000 (provável perda de dados) |
| `lastBooksAvg` | < 15 (bookmaker parou de ser capturado) |

---

## Recuperação de falhas

### Cenário 1: Supabase Realtime indisponível

| Fase | Comportamento |
|------|---------------|
| Queda detectada | `realtime=CHANNEL_ERROR` logado; `connected=false` na UI |
| Durante a queda | Fallback poll a cada **30s** garante atualização da UI |
| Reconexão | Supabase client reconecta automaticamente (backoff interno) |
| Após reconexão | `realtime=RECONNECTED` logado; refetch automático imediato |
| Dados perdidos? | Não — o polling de 30s cobriu o intervalo; o catch-up refetch confirma |

Não requer intervenção do usuário. O ciclo completo é transparente.

### Cenário 2: Broadcast falha (rede entre servidor e Supabase)

| Fase | Comportamento |
|------|---------------|
| 1ª tentativa falha | `broadcast_sent=false attempt=1` logado |
| Retry após 300ms | 2ª tentativa com novo timeout de 1.5s |
| Ambas falham | `broadcast_sent=FAILED` logado; `broadcastsFailed++` no SW |
| Impacto na UI | A UI não é notificada imediatamente |
| Recuperação | Fallback poll de 30s atualiza a UI em até 30s |
| Impacto nos dados | Nenhum — os dados já estão no DB (db_commit=true antes do broadcast) |

### Cenário 3: Ingest falha (rede da extensão → servidor)

| Tentativas | Backoff |
|-----------|---------|
| 1ª falha | 5s |
| 2ª falha | 15s |
| 3ª falha | 60s |
| 4ª falha | 5min |
| 5ª falha | 30min |
| > 5 falhas | Item descartado (cleanup_stale o remove após 24h) |

O snapshot local NÃO é atualizado até o ingest confirmar 200. Isso garante que no próximo ciclo o diff inclua os dados não confirmados.

### Cenário 4: Service worker reinicia (cold start)

O SW reinicia quando o browser fecha a página ou após ~30s de inatividade. Na reinicialização:
1. `swMetrics` é zerado (estado em memória)
2. `deviceId`, `sessionHeaders`, `activeFetching` são zerados
3. A fila no IndexedDB persiste — os itens pendentes são processados quando o SW acorda
4. Snapshots persistem — o diff continua correto
5. O `heartbeat` alarm reativa o SW a cada 1 minuto

---

## Procedimentos de diagnóstico

### Verificar se a extensão está sincronizando

```js
// Console do DG (duplogreenengine.com):
window.__sureedge_interceptor_loaded   // deve ser true
window.__sureedge_active_fetch_loaded  // deve ser true

// Forçar fetch ativo manualmente (útil se sessão expirou):
window.__sureedge_force_fetch()

// Relatório completo de canais de rede detectados:
window.__sureedge_diag()
```

### Verificar métricas do SW

```js
// Console do Service Worker (chrome://extensions → Inspect):
chrome.runtime.sendMessage({ kind: 'get_metrics' }, console.table)
chrome.runtime.sendMessage({ kind: 'get_status' }, console.log)
```

### Verificar integridade dos dados no SureEdge

```js
// Console do browser na aba SureEdge:
fetch('/api/dg/odds-db?all=1').then(r => r.json()).then(d => {
  const total = d.odds?.reduce((s, m) => s + m.bookmakers.length, 0) ?? 0;
  console.log(`matches=${d.odds?.length} total_odds=${total}`);
});
```

### Verificar tamanho do IndexedDB

```js
// Console do Service Worker:
chrome.runtime.sendMessage({ kind: 'get_metrics' }, r => {
  console.log(`IndexedDB ≈ ${Math.round(r.storageSizeBytes/1024)}KB`);
  console.log(`snapshots=${r.snapshotCount} replay=${r.replayCount}`);
});
```

### Limpar e forçar re-envio completo

```js
// Console do Service Worker:
chrome.runtime.sendMessage({ kind: 'clear_snapshots' }, r => console.log(r))
// Retorna: { ok: true }
// Na próxima interceptação, diff completo será enviado
```

### Executar stress test do debounce

```bash
# Terminal (requer Node.js 18+):
npx tsx src/tests/debounce-stress.ts

# Resultados esperados:
# ✓ 4186 eventos / 42 batches rápidos      refetches=1
# ✓ 2 grupos com gap > debounce            refetches=2
# ✓ 36 eventos intercalados (1x2 + PA)     refetches=1
# ✓ 10.000 eventos instantâneos (pico)     refetches=1
# ✓ Sem eventos — sem refetch espontâneo   refetches=0
```

---

## Checklist de teste de 24 horas

Execute com a extensão ativa no DG e a aba SureEdge aberta. Colete métricas a cada hora.

### Memória e armazenamento

- [ ] `storageSizeBytes` permanece estável (< +10% por hora)
- [ ] `snapshotCount` não cresce (fixo no número de plugins = 3)
- [ ] `replayCount` não ultrapassa `REPLAY_MAX × plugins` = 150

### Fila

- [ ] `currentQueueDepth` não cresce continuamente (eventual estabilidade em 0)
- [ ] `ingestSuccessRate` > 95%
- [ ] Nenhum item com > 5 tentativas acumuladas

### Broadcast e Realtime

- [ ] `broadcastSuccessRate` > 95%
- [ ] `reconnectCount` < 5 em 24h
- [ ] `fallbackPolls` = 0 (Realtime estável)
- [ ] Se `fallbackPolls` > 0: verificar console por `realtime=CHANNEL_ERROR`

### Integridade dos dados

- [ ] `lastOddsTotal` ≈ 4.000–4.500 (variação normal)
- [ ] `lastBooksAvg` ≈ 23–27
- [ ] `lastMatchCount` ≈ 75–90

### Latência ponta a ponta

- [ ] `avgLatencyMs` < 5.000ms
- [ ] `avgIngestTimeMs` < 1.000ms

---

## Banco de dados

Migration: `supabase/migrations/20260706_sync_bridge.sql`

| Tabela | Função |
|--------|--------|
| `bookmaker_odds` | Odds por partida × bookmaker × mercado (1x2, 1x2_pa) |
| `sync_devices` | Dispositivos registrados (device_id, last_seen, last_plugin) |
| `sync_sequence` | Controle de sequência por dispositivo/plugin |
| `sync_alerts` | Alertas de schema mismatch detectados pelo SchemaMonitor |

Função SQL de métricas:
```sql
SELECT sync_bridge_metrics();
-- Retorna: total_odds, total_matches, market_1x2, market_pa, avg_bookmakers, last_updated
```

---

## Arquivos da extensão

| Arquivo | Função |
|---------|--------|
| `extension/manifest.json` | Config MV3: permissões, content scripts, service worker |
| `extension/content/interceptor.js` | Intercepta fetch/XHR/WS/SSE no MAIN world |
| `extension/content/active-fetch.js` | Fetch ativo de todos endpoints DG |
| `extension/content/relay.js` | Ponte MAIN→ISOLATED→service worker |
| `extension/background/service-worker.js` | Coordenador: diff, fila, ingest, métricas |
| `extension/background/queue.js` | IndexedDB: fila, snapshots, replay, cleanup |
| `extension/background/crypto.js` | HMAC-SHA256 + sendToSureEdge |
| `extension/background/config.js` | Config remota (5min) |
| `extension/background/heartbeat.js` | Heartbeat a cada 1min |
| `extension/plugins/registry.js` | Match de plugins por URL |
| `extension/plugins/odds-1x2.js` | GET /get-individual-odds?market=1x2 |
| `extension/plugins/odds-pa.js` | GET /get-individual-odds?market=1x2_pa |
| `extension/plugins/opportunities.js` | GET /get-dg-opportunities* (skipIngest=true) |
| `extension/popup/index.html` | Popup: status, fila, endpoints descobertos |

## Alarms do Service Worker

| Alarm | Intervalo | Função |
|-------|-----------|--------|
| `heartbeat` | 1min | Mantém SW vivo; envia status ao servidor |
| `process_queue` | 30s | Processa lotes pendentes na fila |
| `refresh_config` | 5min | Atualiza config remota |
| `refresh_odds` | 10min | Refaz active-fetch de todos endpoints DG |
| `cleanup_stale` | 6h | Remove itens expirados do IndexedDB |

## API SureEdge para a extensão

| Rota | Método | Auth | Função |
|------|--------|------|--------|
| `/api/sync/ingest` | POST | device_id + HMAC | Persiste diff; emite broadcast |
| `/api/sync/heartbeat` | POST | device_id + HMAC | Atualiza status dispositivo |
| `/api/sync/config` | GET | device_id + HMAC | Config remota |
| `/api/sync/metrics` | GET | Sessão Supabase | Métricas agregadas do banco |
| `/api/sync/schema-alert` | POST | device_id | Schema mismatch |

Todas as rotas `/api/sync/*` estão excluídas do middleware de auth do Next.js (`src/middleware.ts`) — usam autenticação própria.

## Decisões de implementação importantes

- **Sem compressão gzip**: removida para evitar bug de auto-decompress do Next.js com `Content-Encoding: gzip`. Payload vai como JSON puro.
- **Snapshot salvo após ingest**: o snapshot local só é atualizado quando `/api/sync/ingest` confirma 200. Garante que dados não confirmados sejam reenviados.
- **Batching de 100 rows**: evita ultrapassar o limite de 4,5MB do Vercel por request.
- **MAIN world obrigatório**: `active-fetch.js` e `interceptor.js` precisam do MAIN world para ter acesso à sessão do browser (headers de Authorization).
- **`skipIngest: true` em opportunities**: o plugin de oportunidades nunca tem handler de DB; sem `skipIngest`, cada resposta acumulava itens na fila indefinidamente.
- **Broadcast após `db_commit=true`**: o broadcast é enviado somente após `sbUpsert()` confirmar status 2xx. Sem condição de corrida.
- **Debounce trailing de 2,5s**: cada novo broadcast reinicia o timer. Agrupa todas as mensagens de um sync completo (~36 batches, ~350ms total) em 1 refetch.
