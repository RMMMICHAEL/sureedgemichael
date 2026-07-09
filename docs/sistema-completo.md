# SureEdge + DuploGreen Engine — Documentação Completa do Sistema

> Última atualização: 2026-07-08

---

## O que é o sistema

O **SureEdge** é uma plataforma web para gestão de surebetting e duplo green. O **DuploGreen Engine** (DG) é o site externo de onde as odds são capturadas em tempo real via extensão Chrome. Juntos formam um pipeline:

```
DuploGreen Engine (site externo)
  → Extensão Chrome MV3 (captura passiva)
    → SureEdge API (ingest + broadcast)
      → Supabase (banco de dados)
        → SureEdge UI (exibe as odds ao usuário)
```

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 + React 18 + TailwindCSS |
| Estado global | Zustand (`useStore.ts`) |
| Banco de dados | Supabase (PostgreSQL + Auth + Realtime) |
| Deploy | Vercel (serverless + cron jobs) |
| Pagamentos | Cakto (webhook) |
| E-mail transacional | Resend (SMTP) |
| Extensão | Chrome MV3 (Service Worker + Content Scripts) |

---

## Domínio

- **Principal:** `https://www.sureedge.com.br` (SEMPRE com www)
- `sureedge.com.br` → redireciona 307 para www
- Todas as URLs internas (redirectTo, NEXT_PUBLIC_SITE_URL) devem usar www

---

## Arquitetura da Extensão Chrome (Sync Bridge)

A extensão captura as odds passivamente enquanto o usuário navega no DG. Não exige nenhuma interação manual.

### Fluxo completo

```
DuploGreen (aba aberta pelo usuário)
  │
  ├─ extension/content/interceptor.js  [MAIN world]
  │    Intercepta fetch() em tempo real
  │    Captura headers Authorization de /functions/v1/
  │    Dispara active-fetch ao capturar sessão
  │
  ├─ extension/content/active-fetch.js  [MAIN world]
  │    Faz GET em todos endpoints DG com headers capturados
  │    Reenviado a cada 10min pelo alarm 'refresh_odds'
  │
  └─ extension/content/relay.js  [ISOLATED world]
       Eleição de líder: apenas 1 aba repassa eventos ao SW
       (evita ingestos duplicados em sessões multi-tab)
       Previne Tab Freeze via Web Locks API
         │
         ▼
extension/background/service-worker.js
  ├─ matchPlugin(url)           identifica plugin pelo padrão de URL
  ├─ plugin.parse(body)         normaliza para schema interno
  ├─ computeDiff(snapshot, parsed)  delta: added / modified / removed
  ├─ enqueue(diff)              batches de ≤100 rows no IndexedDB
  └─ processQueue()             envia batches → POST /api/sync/ingest
       │                        (marca in_flight=true antes de enviar)
       ▼                        (markComplete() só após confirmação 2xx)
SureEdge API  →  Supabase  →  Broadcast  →  useOdds.ts
```

### Proteções implementadas

| Problema | Solução |
|---|---|
| Perda de dados em crash do SW | `dequeueNext()` marca `in_flight=true`; `resetStaleFlight()` recupera no boot |
| Dois `processQueue()` simultâneos | Flag `isProcessing` (mutex) |
| Race condition na chave HMAC | `_keyPromise` no nível do módulo |
| Ingestos duplicados (multi-tab) | Eleição de líder via `chrome.storage.session` |
| Aba congelada em background | `navigator.locks.request()` impede Tab Freeze do Chrome |
| Credenciais em logs | `__sureedge_force_fetch` redige `Authorization`/`Cookie` antes de logar |
| Map `unknownEndpoints` crescendo | Cap de 200 entradas |
| IndexedDB crescendo | `cleanupStale()` a cada 6h (fila >24h + replay >6h) |

### Autenticação da extensão → API

```
X-Device-ID:     UUID gerado no primeiro boot (persistido em chrome.storage.local)
X-Signature:     HMAC-SHA256 do payload JSON (chave gerada localmente, salva em JWK)
X-Plugin-ID:     'odds-1x2' | 'odds-pa'
X-Sequence-ID:   número sequencial por plugin (detecção de gaps)
X-Sync-Protocol: '1' (versão do protocolo; servidor loga aviso se diferente)
```

Sem cookie de sessão Supabase. Zero login necessário.

---

## Plugins de captura

| Plugin | URL interceptada | Tabela destino | market_type |
|---|---|---|---|
| `odds-1x2` | `/functions/v1/get-individual-odds` | `bookmaker_odds` | `1x2` |
| `odds-pa` | `/functions/v1/get-individual-odds` (variante PA) | `bookmaker_odds` | `1x2_pa` |

---

## Fila IndexedDB (extension/background/queue.js)

```
DB: sureedge_sync
  ├─ queue      → itens pendentes de envio (priority + in_flight + nextRetryAt)
  ├─ snapshots  → última versão conhecida dos dados por plugin (para diff)
  ├─ replay     → últimas 50 interceptações por plugin (diagnóstico)
  └─ sequences  → último sequenceId enviado por plugin
```

**Prioridades:** `critical=0`, `high=1`, `normal=2`, `low=3`

**Backoff de retry:** 5s → 15s → 60s → 5min → 30min (máx 5 tentativas)

---

## Broadcast Realtime

Ao invés de `postgres_changes` (1 evento por linha inserida = ~4.186 eventos/sync), usa **broadcast REST**:

- Canal: `realtime:odds_updates`
- Evento: `odds_updated`
- Volume: ~36 mensagens por sync completo (99% menos que `postgres_changes`)
- Payload: `{ pluginId, rowsWritten, syncedAt, batchId }`
- 2 tentativas com timeout 1,5s cada; falha silenciosa (fallback poll na UI)

---

## API Routes principais

### `POST /api/sync/ingest`
Recebe diffs da extensão e persiste no banco.

```
Headers obrigatórios: X-Device-ID, X-Signature, X-Plugin-ID, X-Sequence-ID, X-Sync-Protocol
Body: { pluginId, diff: { added, modified, removed }, stats, capturedAt }
Response: { ok, accepted_sequence_id, batch_id }
```

Fluxo interno:
1. Autentica headers
2. `handleOdds()` → upsert em `bookmaker_odds`
3. Loga `db_commit=true` (commit confirmado)
4. `broadcastOddsUpdated()` fire-and-forget
5. Retorna `batch_id`

### `GET /api/dg/odds-db?all=1`
Retorna todas as odds agrupadas por partida.

- **ETag:** baseado em `MAX(updated_at)` — retorna `304 Not Modified` quando nada mudou
- **Cache-Control:** `private, no-cache`
- Reduz bandwidth em ~99% para fetches sem alteração real

### `GET /api/cron/cleanup-odds`
Roda diariamente às 03:00 BRT (06:00 UTC) via Vercel Cron.

Remove:
- Odds com `match_date` anterior a hoje (partidas passadas)
- Odds de partidas futuras com `updated_at` há mais de 3 dias (mercado removido/cancelado)

Protegido por `CRON_SECRET` (Vercel injeta automaticamente).

---

## Banco de dados (Supabase)

### Tabela `bookmaker_odds`

PK: `(match_id, bookmaker_slug, market_type)`

| Campo | Tipo | Descrição |
|---|---|---|
| `match_id` | text | ID da partida no DG |
| `home_team` | text | Time da casa |
| `away_team` | text | Time visitante |
| `match_date` | date | Data da partida |
| `start_time` | text | Hora de início |
| `league_name` | text | Nome da liga |
| `league_slug` | text | Slug da liga |
| `bookmaker_slug` | text | Identificador da casa |
| `bookmaker_name` | text | Nome da casa |
| `market_type` | text | `'1x2'` ou `'1x2_pa'` |
| `odd_home` | numeric | Odd time da casa |
| `odd_draw` | numeric | Odd empate |
| `odd_away` | numeric | Odd visitante |
| `match_url` | text | URL da partida na casa |
| `updated_at` | timestamptz | Última atualização |

### Outras tabelas relevantes

| Tabela | Uso |
|---|---|
| `sync_devices` | Dispositivos registrados (device_id, last_seen, last_plugin) |
| `sync_sequence` | Último sequence_id por device + plugin (detecção de gaps) |
| `dg_opportunities` | Oportunidades DG importadas manualmente |
| `subscriptions` | Planos dos usuários (status, expires_at) |
| `webhook_events` | Log de todos os eventos Cakto (auditoria) |
| `app_config` | Configurações globais (cookie SuperMonitor, cf_clearance) |
| `search_queue` | Fila de busca de odds via extensão SuperMonitor |

---

## Frontend — hook `useOdds.ts`

Gerencia a conexão Realtime e os refetches.

```
Supabase Realtime (broadcast) → handleBroadcast()
  → debounce 2.500ms (trailing)
    → fetchOdds() → GET /api/dg/odds-db?all=1
      → setOdds() → UI atualiza

Fallback poll: a cada 30s se Realtime estiver offline
Reconexão: auto-refetch (catch-up) ao reconectar
```

**Métricas expostas** via `rtMetrics` e `window.__sureedge_rt`:

```ts
eventsReceived  // broadcasts recebidos
refetchCount    // refetches executados
reconnectCount  // reconexões Realtime
lastLatencyMs   // latência ingest → UI
avgLatencyMs    // média das últimas 20
fallbackPolls   // vezes que o fallback disparou
lastMatchCount  // ex: 82 partidas
lastOddsTotal   // ex: 4.186 linhas
lastBooksAvg    // média de casas por partida
```

---

## Métricas do Service Worker

Via console do SW (`chrome://extensions` → SureEdge → Service worker → Inspect):

```js
chrome.storage.local.get(['last_sync_at', 'device_id'], console.log)
```

Estrutura `swMetrics` (disponível internamente):
- `totalBatchesSent` — lotes enviados
- `ingestOk` / `ingestFail` — taxa de sucesso
- `ingestTimes[]` — últimos 20 tempos de ingest
- `broadcastsTotal` / `broadcastsFailed`
- `queueDepthSamples[]`

---

## Regras de negócio

### Detecção de mercado PA
- `market_type = '1x2_pa'` → mercado com Pagamento Antecipado
- `market_type = '1x2'` → mercado regular (odds maiores)
- No painel individual: ambos exibidos separadamente (`comPa` / `semPa`)
- Fallback por slug via `PA_SET` e `isPa(slug)` quando `is_pa` não está no banco

### Melhor odd (`bestBk`)
- Prefere `1x2` (odds maiores) sobre `1x2_pa` do mesmo bookmaker
- Usada na lista principal para exibir a melhor odd disponível por casa

### Operação Duplo Green
- `initialOpType="duplo_green"` em todos os `<SurebetCalc>` na página de busca
- Nunca usar `'surebet'` no painel de busca de odds

---

## Mapa de arquivos principais

### Extensão Chrome

```
extension/
  background/
    service-worker.js   → orquestra tudo (queue, ingest, alarms, métricas)
    queue.js            → IndexedDB (enqueue, dequeueNext, markComplete, resetStaleFlight)
    crypto.js           → HMAC-SHA256, device ID, X-Sync-Protocol header
    config.js           → config por plugin (enabled, priority)
    heartbeat.js        → ping periódico ao servidor
    active-fetch.js     → busca ativa com headers de sessão capturados
  content/
    interceptor.js      → hook em fetch() no MAIN world
    relay.js            → ponte MAIN→ISOLATED + eleição de líder + anti-freeze
  plugins/
    registry.js         → registra plugins (matchPlugin)
  core/
    diff-engine.js      → computeDiff (added / modified / removed / unchanged)
    schema-validator.js → alerta de mudança de schema
```

### SureEdge (Next.js)

```
src/
  hooks/
    useOdds.ts                      → Realtime + debounce + fetchOdds
  app/api/
    sync/ingest/route.ts            → recebe diffs da extensão
    dg/odds-db/route.ts             → serve odds com ETag
    cron/cleanup-odds/route.ts      → limpeza diária automática
    dg/opportunities/route.ts       → oportunidades DG
    dg/freebet-calc/route.ts        → cálculo de freebet
    webhook/cakto/route.ts          → pagamentos (com grace period 15min)
    sure/save-cookie/route.ts       → salva cookie SuperMonitor
  components/
    odds/BuscarOddsPage.tsx         → página principal de odds
    odds/DGOpportunitiesSection.tsx → oportunidades DG
    freebet/FreebetConverterPage.tsx → conversor freebet
    calcalendario/SurebetCalc.tsx   → calculadora compartilhada
    admin/AdminPage.tsx             → painel admin
    layout/AppShell.tsx             → shell + banner de manutenção
  store/
    useStore.ts                     → estado global (Zustand)
```

---

## Variáveis de ambiente (Vercel)

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (nunca expor ao cliente) |
| `NEXT_PUBLIC_SITE_URL` | `https://www.sureedge.com.br` (com www) |
| `CAKTO_WEBHOOK_SECRET` | Secret do webhook Cakto |
| `CRON_SECRET` | Protege `/api/cron/cleanup-odds` (Vercel injeta automaticamente) |

---

## Requisitos operacionais

1. **Aba do DG aberta** — pode estar minimizada (anti-freeze implementado via Web Locks)
2. **Extensão instalada** — modo desenvolvedor no Chrome (`chrome://extensions`)
3. **Uma aba é suficiente** — eleição de líder impede ingestos duplicados em multi-tab
4. **Não requer login** — extensão usa HMAC com device_id, independente de conta

---

## Diagnóstico rápido

### SW parou de sincronizar?
```js
// Console do SW (chrome://extensions → SureEdge → Service worker)
chrome.storage.local.get(['last_sync_at', 'device_id'], console.log)
new Date(last_sync_at).toLocaleString() // quando foi o último sync
```

### Realtime funcionando?
```js
// Console do browser (aba do SureEdge)
window.__sureedge_rt // métricas em tempo real
```

### Logs estruturados esperados por sync
```
[DIAG] odds-1x2 parse: body=Array(420) → parsed=420
[DIAG] odds-1x2 diff: +12 ~8 -0 =400
[DIAG] processQueue: enviando odds-1x2 ...
[DIAG] processQueue: resposta 200 elapsed=280ms
[INGEST:abc123] db_commit=true rows_written=20 elapsed=95ms
[INGEST:abc123] broadcast_sent=true rows_written=20 elapsed=42ms
[SureEdge] broadcast_received batch_id=abc123 plugin=odds-1x2 rows_written=20
[SureEdge] fetch_finished matches=82 total_odds=4186 books_per_match min=18 avg=25 max=31
```

---

## Bandwidth e custos (Vercel)

O maior consumo era o endpoint `GET /api/dg/odds-db?all=1` retornando ~2MB por chamada sem cache.

**Mitigações implementadas:**
- **ETag + 304**: quando dados não mudaram, resposta tem 0 bytes no body
- **Cron de limpeza**: remove partidas passadas e odds stale diariamente às 03:00 BRT
- **Broadcast em vez de postgres_changes**: 36 mensagens/sync em vez de 4.186

**Tabela bookmaker_odds atual** (2026-07-08): ~5.268 linhas de odds futuras (Jul–Ago 2026).
