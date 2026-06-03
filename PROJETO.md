# SureEdge — Guia do Projeto

> Referência rápida para editar páginas, corrigir bugs e entender a estrutura.
> Atualizado: 02/06/2026

---

## O que é o SureEdge

Plataforma web de **gestão de trading esportivo (surebetting)** para traders brasileiros.

- **Stack:** Next.js 14 + Supabase + Zustand + TailwindCSS
- **Deploy:** Vercel automático via push no `main` → `sureedge.com.br`
- **Repositório:** github.com/RMMMICHAEL/sureedgemichael
- **Monetização:** Assinatura via Cakto (PIX/cartão) — Mensal R$97 | Trimestral R$247 | Anual R$797
- **Dados:** Supabase (PostgreSQL) — localStorage para dados do app (operações, bancas)

---

## Mapa de Páginas → Arquivos

| Página no app | Arquivo para editar |
|---|---|
| Landing page (site público) | `src/components/landing/LandingPage.tsx` |
| Landing page rota `/lp` | `src/app/lp/page.tsx` |
| Login / Cadastro / Recuperar senha | `src/app/login/LoginForm.tsx` |
| Pós-compra (bem-vindo) | `src/app/bem-vindo/page.tsx` |
| Ativar acesso manualmente | `src/app/ativar/page.tsx` |
| Planos e preços | `src/components/pricing/PricingPage.tsx` |
| Dashboard principal | `src/components/dashboard/DashboardPage.tsx` |
| Operações | `src/components/operations/OperationsPage.tsx` |
| Buscar Odds | `src/components/odds/BuscarOddsPage.tsx` |
| Converter Freebet | `src/components/freebet/FreebetConverterPage.tsx` |
| Análise / Analytics | `src/components/analise/AnalisePage.tsx` |
| Calculadora de Surebet | `src/components/calculadora/CalculadoraPage.tsx` |
| Calendário de Eventos | `src/components/calcalendario/CalCalendarioPage.tsx` |
| Gestão de Bancas | `src/components/bookmakers/BookmakersPage.tsx` |
| Caixa / Extrato financeiro | `src/components/caixa/CaixaPage.tsx` |
| Gastos | `src/components/gastos/GastosPage.tsx` |
| Contas / Clientes | `src/components/contas/ContasPage.tsx` |
| Operadores | `src/components/operadores/OperadoresPage.tsx` |
| Resumo | `src/components/resumo/ResumoPage.tsx` |
| Metas | `src/components/metas/MetasPage.tsx` |
| Notas | `src/components/notas/NotasPage.tsx` |
| Perfil | `src/components/perfil/PerfilPage.tsx` |
| Admin (cookie, daemon) | `src/components/admin/AdminPage.tsx` |
| Menu lateral (Sidebar) | `src/components/layout/Sidebar.tsx` |
| Shell do app (roteamento de abas) | `src/components/layout/AppShell.tsx` |
| Topbar | `src/components/layout/Topbar.tsx` |
| Onboarding | `src/components/onboarding/OnboardingModal.tsx` |

---

## Mapa de APIs → Arquivos

| Rota API | Arquivo | O que faz |
|---|---|---|
| `POST /api/webhook/cakto` | `src/app/api/webhook/cakto/route.ts` | Recebe pagamentos da Cakto e ativa assinatura |
| `GET /api/subscription` | `src/app/api/subscription/route.ts` | Verifica assinatura do usuário logado |
| `POST /api/ativar` | `src/app/api/ativar/route.ts` | Consulta assinatura por email (pós-compra) |
| `POST /api/sure/freebet` | `src/app/api/sure/freebet/route.ts` | Enfileira busca de freebet |
| `GET /api/sure/freebet` | `src/app/api/sure/freebet/route.ts` | Polling do resultado de freebet |
| `GET /api/sure/scanner` | `src/app/api/sure/scanner/route.ts` | Retorna sinais do scanner |
| `POST /api/sure/save-cookie` | `src/app/api/sure/save-cookie/route.ts` | Salva cookie do SuperMonitor |
| `GET /api/sure/events` | `src/app/api/sure/events/route.ts` | Lista eventos disponíveis |
| `GET /api/sure/search` | `src/app/api/sure/search/route.ts` | Busca eventos por nome |
| `GET /api/sheets-proxy` | `src/app/api/sheets-proxy/route.ts` | Proxy para Google Sheets |

---

## Arquivos Críticos de Configuração

| Arquivo | O que controla |
|---|---|
| `src/middleware.ts` | Autenticação, redirects, rotas públicas |
| `src/app/layout.tsx` | Scripts globais (Utmify, pixels), SEO, JSON-LD |
| `next.config.js` | CSP (Content Security Policy), headers de segurança |
| `src/lib/supabase/subscription.ts` | Lógica de assinatura, ativação por email |
| `src/lib/finance/calculator.ts` | Cálculos de lucro, ROI, stakes |
| `src/lib/finance/reconciler.ts` | Recálculo de bancas, normalização de nomes de casas |
| `src/store/useStore.ts` | Estado global do app (Zustand) |
| `scripts/process-queue.mjs` | **Daemon local** — busca odds e freebet no SuperMonitor |

---

## Daemon Local (`process-queue.mjs`)

Processo Node.js que roda na **máquina do dono** (não no Vercel).

**Para iniciar:**
```bash
cd "C:\Users\rmmic\OneDrive\Documentos\suredge-app"
node scripts/process-queue.mjs
```

**O que faz:**
- Busca odds de eventos na fila (tabela `odds_queue` no Supabase)
- Processa freebets da fila (`freebet_queue`)
- Usa autenticação ECDH/AES com o SuperMonitor
- Cookie do SuperMonitor salvo na tabela `app_config` (chave `supermonitor_cookie`)
- Renovação de cookie: **manual** via painel Admin do SureEdge

**Quando o cookie expira**, aparece no terminal:
```
══════════════════════════════════════════════════════
  COOKIE EXPIRADO — renovação manual necessária
  1. Acesse painel.supermonitor.pro e faça login
  2. Salve o cookie no Supabase (app_config)
  3. Reinicie: node scripts/process-queue.mjs
══════════════════════════════════════════════════════
```

---

## Fluxo de Venda / Acesso

```
Cliente paga no Cakto
  → Cakto dispara webhook POST /api/webhook/cakto
    → Cria/atualiza registro em subscriptions (Supabase)
      → Cakto redireciona para /bem-vindo?plan=monthly&email={customer.email}
        → /bem-vindo dispara evento Purchase no pixel Utmify
          → Redireciona para /login?mode=signup&email=xxx (2.5s)
            → Cliente cria senha → acessa o dashboard
```

**Se o webhook falhar (500):** a Cakto retenta automaticamente.
**Para ativar manualmente:** SQL no Supabase:
```sql
INSERT INTO subscriptions (email, status, plan, expires_at, created_at, updated_at)
VALUES ('email@cliente.com', 'active', 'monthly', NOW() + INTERVAL '30 days', NOW(), NOW())
ON CONFLICT (email) DO UPDATE
  SET status = 'active', expires_at = NOW() + INTERVAL '30 days', updated_at = NOW();
```

---

## Rastreamento / Marketing

| Script | Onde está | O que faz |
|---|---|---|
| Utmify UTMs | `src/app/layout.tsx` | Captura e persiste UTMs da URL |
| Utmify Pixel | `src/app/layout.tsx` | Dispara eventos PageView, IC, Purchase para o Meta |
| Purchase event | `src/app/bem-vindo/page.tsx` | Dispara Purchase quando cliente acessa pós-compra |
| UTMs no checkout | `src/components/landing/LandingPage.tsx` | Repassa UTMs para URL da Cakto |

**UTM no anúncio Meta:**
```
https://sureedge.com.br/lp?utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}
```

---

## Bugs Resolvidos (histórico)

### Operações
- **"Rem. duplicatas" apagava reentradas de Duplo Green** — a chave de detecção `ho+mk` era igual para leg principal e reentrada. Fix: ignorar legs cujo `ev` termina em `(Reentrada)`. → `src/components/operations/OperationsPage.tsx`
- **Lucro caiu incorretamente** — consequência do bug acima. Reentradas com Green eram deletadas ao clicar no botão.

### Assinaturas / Acesso
- **Webhook retornava 200 OK sem salvar assinatura** — `upsertSubscriptionByEmail` não verificava o erro do Supabase. Fix: checar `{ error }` e lançar exception para a Cakto retentar. → `src/lib/supabase/subscription.ts`
- **`listUsers({perPage:1000})` não escalava** — substituído por `getUserByEmail`. Depois simplificado para não buscar `user_id` no webhook (auto-link no primeiro login). → `src/lib/supabase/subscription.ts`
- **Clientes sem acesso após compra** — fluxo pós-compra não redirecionava para criação de conta. Fix: `/bem-vindo` agora redireciona para `/login?mode=signup&email=xxx`. → `src/app/bem-vindo/page.tsx` + `src/app/login/LoginForm.tsx`

### Daemon / SuperMonitor
- **"Unexpected end of JSON input" no freebet** — `JSON.parse` chamado sem try-catch após decrypt AES, e `safeJson` não checava body vazio. Fix: tratamento em ambos os pontos. → `scripts/process-queue.mjs`
- **NONCE_INVALID no handshake freebet** — nonce expirava durante geração de chaves ECDH. Fix: retry automático até 2 vezes. → `scripts/process-queue.mjs`
- **Ban no SuperMonitor** — `renew-cookie.mjs` fazia login automatizado com 2captcha e foi detectado. Fix: automação de login removida, renovação agora é sempre manual. → `scripts/process-queue.mjs`
- **403 com body encriptado ignorado** — servidor retornava HTTP 403 mas com payload ECDH válido. Fix: tenta descriptografar antes de lançar erro. → `scripts/process-queue.mjs`

### Landing Page / Meta Ads
- **Anúncio rejeitado ("página não funcional")** — bot da Meta via `/` via tela em branco (AppShell aguardava Supabase). Fix: criada rota `/lp` que renderiza LandingPage direto. → `src/app/lp/page.tsx`
- **CSP bloqueava scripts da Utmify** — `script-src` não incluía `cdn.utmify.com.br`. Fix: domínios da Utmify e Meta adicionados. → `next.config.js`
- **UTMs perdidos ao clicar em Assinar** — checkout não repassava UTMs da URL. Fix: captura e repassa `utm_*` e `fbclid`. → `src/components/landing/LandingPage.tsx`
- **Pixel não disparava eventos** — script do pixel estava correto mas CSP bloqueava carregamento. Resolvido junto com o fix do CSP.

### Buscar Odds
- **Jogos ao vivo/encerrados apareciam na lista** — lista não filtrava por data. Fix: exibe apenas jogos futuros. → `src/components/odds/BuscarOddsPage.tsx`

---

## Variáveis de Ambiente (Vercel)

| Variável | Onde é usada |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Conexão Supabase (cliente e servidor) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook, ativação de assinatura (servidor) |
| `CAKTO_WEBHOOK_SECRET` | Valida autenticidade dos webhooks da Cakto |
| `NEXT_PUBLIC_CAKTO_URL_MONTHLY` | URL checkout mensal |
| `NEXT_PUBLIC_CAKTO_URL_QUARTERLY` | URL checkout trimestral |
| `NEXT_PUBLIC_CAKTO_URL_ANNUAL` | URL checkout anual |
| `CAKTO_PRODUCT_ID_MONTHLY/QUARTERLY/ANNUAL` | IDs dos produtos na Cakto |

---

## Tabelas Supabase Principais

| Tabela | O que armazena |
|---|---|
| `subscriptions` | Assinaturas dos clientes (email, status, plan, expires_at) |
| `app_config` | Configurações do daemon (cookie SuperMonitor, tokens SSE) |
| `freebet_queue` | Fila de requisições de freebet para o daemon |
| `odds_queue` | Fila de busca de odds para o daemon |
| `sm_odds` | Cache de odds retornadas pelo SuperMonitor |
| `scanner_signals` | Sinais do scanner (surebets detectadas) |
