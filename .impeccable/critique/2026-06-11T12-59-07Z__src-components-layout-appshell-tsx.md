---
target: SureEdge app (sistema completo)
total_score: 21
p0_count: 2
p1_count: 2
timestamp: 2026-06-11T12-59-07Z
slug: src-components-layout-appshell-tsx
---
# Critique — SureEdge App Shell (sistema completo)

## Design Health Score

| # | Heurística | Score | Problema-chave |
|---|-----------|-------|-----------|
| 1 | Visibilidade de status | 3 | Bom (live-dot, toasts, banner manutenção), mas tela em branco durante checagem de sessão |
| 2 | Sistema ↔ mundo real | 3 | Linguagem do domínio excelente (PA/SO, Casa/Empate/Fora, Duplo Green) |
| 3 | Controle e liberdade | 2 | Sync de planilha sem undo; ações destrutivas sem confirmação consistente |
| 4 | Consistência e padrões | 1 | **3 sistemas de cor paralelos**; 5 famílias de fonte; hover via JS inline vs classes CSS |
| 5 | Prevenção de erros | 2 | Grace period e dedup existem; validação de inputs mínima |
| 6 | Reconhecimento > memorização | 3 | Nav com ícones+labels, grupos nomeados |
| 7 | Flexibilidade e eficiência | 2 | Zero atalhos de teclado, sem command palette para um público power-user |
| 8 | Estética e minimalismo | 2 | Glow neon em tudo; cada elemento decorado (gradiente + borda + sombra + glow) |
| 9 | Recuperação de erros | 2 | Sync em background falha silenciosamente; toasts de erro genéricos |
| 10 | Ajuda e documentação | 1 | Onboarding modal existe; zero ajuda contextual depois |
| **Total** | | **21/40** | **Funcional, mas inconsistente — abaixo do que o produto exige** |

## Veredito Anti-Patterns

**LLM**: O app NÃO parece template genérico de IA — tem identidade e domínio fortes. Mas cai no cliché que o próprio PRODUCT.md proíbe: *"Crypto dark mode clichés (neon on black, aggressive glow)"*. O globals.css se autodenomina "Premium dark neon". Logo com glow triplo, `text-glow`, `glow-pulse`, `alta-glow`, `best-odd-glow`, nav ativa com barra brilhante + gradiente + ícone com glow. KPI cards seguem o template hero-metric (número grande + label minúsculo + accent gradiente no topo).

**Scan determinístico** (8 achados): side-tab border 3px em `DGOpportunitiesSection.tsx:368` (+ linhas 473, 1048 que o scan não pegou — mesmas 3px borderLeft); animação de propriedades de layout (`transition: width`) em AnalisePage (2×), ContasPage, Charts.tsx, LandingPage, globals.css; Space Grotesk (fonte saturada) importada — e aparentemente nem usada.

**Visualização browser**: pulada — app autenticado atrás de login Supabase; preview não tem sessão. Sinal de fallback: análise por código-fonte.

## Impressão Geral

A arquitetura de informação é boa e a linguagem do domínio é excelente. O maior problema é que existem **três design systems competindo**: o oficial (`--g: #3FFF21`), o do BuscarOdds (`#00e676` + superfícies próprias `#10141a`/`#080b0f`), e o do tailwind.config (`#00FF8A` nos glows). A maior oportunidade: unificar tokens e remover 70% do glow — o produto ficaria instantaneamente mais "Bloomberg terminal" e menos "site de aposta".

## O que funciona

1. **Linguagem do domínio como first-class**: PA vs SO com cor própria, classificação ALTA/MEDIA, Casa→Empate→Fora sempre na mesma ordem. Isso é raro e valioso.
2. **Tokens CSS de verdade** (`--g`, `--bg2`, `--t3`): a fundação existe, só não é respeitada por todas as páginas.
3. **prefers-reduced-motion tratado** consistentemente no globals.css.

## Priority Issues

**[P0] Três paletas paralelas** — globals.css usa `#3FFF21`, BuscarOddsPage define paleta local `C` com `#00e676` e superfícies diferentes, tailwind.config usa `#00FF8A`. O usuário navega entre Dashboard e Buscar Odds e o "verde da marca" muda. Fix: um único token de verde (e violeta DG) consumido em todo lugar; deletar a const `C` local.

**[P0] Neon glow contradiz o anti-reference declarado** — PRODUCT.md proíbe "aggressive glow", mas há 15+ utilitários/keyframes de glow ativos. Para trader escaneando odds à noite, animações pulsantes (alta-glow 4s, best-odd-glow 3s, glow-pulse 2.5s, live-dot 2s) competem com os dados. Fix: glow só em UMA coisa (a melhor oportunidade), estático nos demais.

**[P1] Micro-tipografia + contraste** — 227 ocorrências de texto 8–10px; labels 8px peso 800 uppercase tracking .16em; `--t3 #6A7E8E` em texto pequeno ≈ 4.2:1 (borderline AA), `rgba(255,255,255,.28)` ≈ 2.4:1 (reprova). O hack `html { font-size: 112.5% }` compensa globalmente o que os px minúsculos quebram localmente. Fix: piso de 11px, escala 1.125–1.2, remover o hack.

**[P1] Side-stripe 3px banido + hero-metric KPI** — DGOpportunitiesSection.tsx:368/473/1048; KPI cards com accent gradiente no topo. Fix: borda completa tintada ou fundo tintado para seleção; KPI com hierarquia tipográfica em vez de decoração.

**[P2] Hover via onMouseEnter/onMouseLeave inline** — dezenas de botões estilizam hover em JS. Teclado não dispara mouseenter: estados de foco ficam sem paridade visual. Fix: classes CSS com :hover/:focus-visible.

**[P2] 5 famílias de fonte via @import bloqueante** — Space Grotesk (não usada), Inter (declarada no tailwind mas body usa Figtree), Manrope, Figtree, JetBrains Mono. Fix: 2 famílias (1 sans + JetBrains Mono) via next/font.

## Persona Red Flags

**Alex (Power User / trader profissional)**: zero atalhos de teclado num app usado horas por dia; sem command palette; filtros não persistem entre sessões em todas as páginas. Para quem "precisa agir rápido", tudo é mouse.

**Trader noturno (persona do projeto)**: escaneando odds às 23h em sala escura, 4 animações de glow pulsando em loop infinito na visão periférica enquanto tenta comparar números. O olho é atraído pelo brilho, não pela melhor odd.

**Morgan (baixa visão)**: labels de 8px com contraste 2.4:1 são ilegíveis; scrollbar de 4px difícil de mirar.

## Observações menores

- Emojis como ícones (📊 empty state, 🔧 coming soon, ⚠ sidebar) destoam do set lucide.
- Tela em branco durante checagem de assinatura: um skeleton do shell evitaria o "flash preto".
- Empty states não ensinam ("Nenhuma operação liquidada ainda" — e agora?).
- OperationsPage com 114KB num arquivo único: dificulta consistência visual.
- `transition: width` em barras de progresso (Analise, Contas, Charts): usar transform scaleX.

## Perguntas provocativas

- Se o glow sumisse de tudo exceto da melhor oportunidade da lista, o produto não ficaria mais rápido de escanear E mais premium?
- O que aconteceria se Buscar Odds, DG e Freebet usassem exatamente os mesmos tokens do Dashboard?
- Um trader que opera 6h/dia não merece `/` para buscar, `g+o` para ir a Operações?
