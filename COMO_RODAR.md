# SureEdge App — Como rodar localmente

## Pré-requisitos
- Node.js 18+ (https://nodejs.org)
- npm ou yarn

## Instalação

```bash
cd suredge-app
npm install
npm run dev
```

Acesse: http://localhost:3000

## Estrutura do projeto

```
src/
├── app/                    → Next.js App Router (layout, página raiz)
├── types/index.ts          → Todos os tipos TypeScript do domínio
├── lib/
│   ├── parsers/
│   │   ├── percentParser.ts  ← FIX PRINCIPAL do bug 479%
│   │   ├── numberParser.ts
│   │   ├── dateParser.ts
│   │   └── resultMapper.ts
│   ├── finance/
│   │   ├── calculator.ts     ← calcLegProfit, KPIs, gráficos
│   │   └── reconciler.ts     ← recalcBookmakers (saldo = inicial + ops)
│   ├── validation/
│   │   └── anomalyDetector.ts ← detecção contextual, não simplista
│   ├── import/
│   │   └── importEngine.ts   ← pipeline completo + filtro de mês
│   └── storage/
│       └── db.ts             ← localStorage tipado
├── store/
│   └── useStore.ts           ← Zustand (estado global)
└── components/
    ├── layout/               → AppShell, Sidebar, Topbar
    ├── ui/                   → Modal, Toast, Badge, Button
    ├── onboarding/           → Fluxo 2 passos (casas → importar/manual)
    ├── dashboard/            → KPIGrid, WeekChart, MonthChart, etc.
    ├── import/               → ImportPreview
    ├── operations/           → OperationsPage
    ├── bookmakers/           → BookmakersPage
    ├── caixa/                → CaixaPage
    ├── analise/              → AnalisePage
    └── admin/                → AdminPage (log + reset)
```
