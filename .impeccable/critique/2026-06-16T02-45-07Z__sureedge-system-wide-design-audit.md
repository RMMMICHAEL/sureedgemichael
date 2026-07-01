---
target: SureEdge system-wide design audit
total_score: 23
p0_count: 0
p1_count: 2
timestamp: 2026-06-16T02-45-07Z
slug: sureedge-system-wide-design-audit
---
## Design Health Score

| # | Heurística | Score | Problema Principal |
|---|-----------|-------|--------------------|
| 1 | Visibilidade do Status | 3 | Live dot e feedback de import ok |
| 2 | Match Sistema / Mundo Real | 3 | Nomenclatura PA/DG Score ok para público-alvo |
| 3 | Controle e Liberdade | 2 | Sem undo nos filtros; bookmaker modal sem preview em tempo real |
| 4 | Consistência e Padrões | 2 | Badges com 4 sistemas de estilo; botões com borderRadius inconsistente |
| 5 | Prevenção de Erros | 2 | Import sem confirmação; campos calculadora sem validação inline |
| 6 | Reconhecimento não Memória | 3 | Labels claros; sort ativo visível |
| 7 | Flexibilidade e Eficiência | 2 | Sem atalhos de teclado; calculadora precisa scroll |
| 8 | Design Estético e Minimalista | 2 | Verde em 9+ contextos simultâneos dilui o sinal |
| 9 | Recuperação de Erros | 2 | "erro desconhecido" no import (fix em andamento) |
| 10 | Ajuda e Documentação | 2 | Tutorial inacessível sem scroll; empty state genérico |
| **Total** | | **23/40** | **Funcional, identidade clara, hierarquia fraca** |

## Anti-Patterns Verdict
Não é AI slop. Paleta e tipografia são escolhas deliberadas. Passa no primeiro teste; no segundo, caminha em direção ao "terminal financeiro neon" sem ultrapassá-lo. Scan determinístico: nenhum anti-pattern detectado.

## Priority Issues
- [P1] Verde em 9+ contextos dilui o sinal de oportunidade premium
- [P1] Sem separação de profundidade real entre as 3 camadas de fundo
- [P2] Badges com 4 sistemas de estilo paralelos
- [P2] Calculadora desconectada do painel de detalhe DG
- [P3] Filtros sem estados hover/active de peso

## Persona Red Flags
- Trader experiente: scan lento por ausência de hierarquia visual ALTA vs MEDIA
- Mobile: tabela DG com 6 colunas inutilizável em 375px
