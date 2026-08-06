# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Stack & Architecture

- **Local-first SPA**: React 19 + Vite 8 + TypeScript strict, no backend
- **Data**: Dexie.js 4 (IndexedDB) with reactive `useLiveQuery` hooks — schema in `src/db/schema.ts`
- **Routing**: TanStack Router file-based — routes in `src/routes/`, generated tree in `src/routeTree.gen.ts` (gitignored, auto-generated on build)
- **UI**: Tailwind CSS 4 + hand-rolled shadcn-style components in `src/components/ui/`
- **State**: Zustand for UI-only state (`src/stores/`); Dexie is the source of truth for data
- **PWA**: `vite-plugin-pwa` with Workbox precaching — fully offline
- **Deployment**: GitHub Pages via Actions (`.github/workflows/deploy.yml`); Vite `base: '/la-billetera-de-sebastian/'` + TanStack Router `basepath` in `src/main.tsx`; `404.html` copy trick for SPA routing
- **Currency**: All amounts in COP (Colombian Pesos), formatting via `src/lib/currency.ts`
- **Bank import**: Papa Parse with Bancolombia TSV adapter + rule-based auto-categorization
- **Guided tour**: Custom spotlight overlay (`src/components/tour-overlay.tsx`) + Zustand store (`src/stores/tour.ts`); auto-starts on first visit, re-triggerable from Ajustes

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — TypeScript check + Vite production build (outputs to `dist/`)
- `npm test` — Vitest unit tests
- `npm run test:e2e` — Playwright E2E tests (Chromium + Firefox + WebKit)
- `npm run typecheck` — TypeScript strict check

## Key patterns

- 18 pre-seeded budget categories from family Excel (see `src/db/seed.ts`)
- "LIBRE" (free money = income − expenses) is the hero metric
- Month key format: `"YYYY-MM"` (e.g. `"2026-06"`)
- Spanish UI throughout — no i18n layer needed
- PDF import uses `pdfjs-dist` with CDN worker (`src/lib/pdf-parser.ts`)
- Pure parsing utils separated from pdfjs dependency for testability (`src/lib/pdf-parse-utils.ts`)
- Auto-categorization engine with built-in rules + user learning rules (`src/lib/categorization.ts`)
- DB schema is at version 4 (v3 added `settings` table; v4 added `isRecurring` index on expenses)
- Bank: Davibank/Davivienda savings account, Colombian format (period thousands, comma decimals)
- Recurring expenses: see **Architecture Decision: Recurring Expenses** section below for full rationale and anti-patterns
- `copyExpensesFromPreviousMonth` (manual "Copiar mes anterior" button) is a separate feature that copies ALL expenses
- E2E tests in `tests/e2e/` with fixtures in `tests/fixtures/`; config at `playwright.config.ts`
- E2E tests clear IndexedDB per-test for isolation; nav helper targets desktop sidebar (`nav.hidden.md:block`)

## Architecture Decision: Recurring Expenses (ADR)

**Decision**: Recurring expenses use **upfront creation** — all future copies are written to IndexedDB immediately when the user marks an expense as recurring.

**DO NOT** use navigation-based triggers (`useEffect`, route-change hooks, `selectedMonth` watchers, or any "create-on-visit" pattern) to materialise recurring data. This approach was attempted 4 times and failed every time due to:

1. **Race conditions** between async Dexie queries and React rendering / `useLiveQuery` reactivity
2. **In-memory deduplication Sets** blocking legitimate retries after partial failures
3. **Year-boundary and month-gap edge cases** in cascade logic (e.g. December → January)
4. **Implicit dependency** on the user visiting specific pages in a specific order

**The correct pattern**: `createRecurringCopies()` in `src/lib/recurring.ts` is called at expense-creation time and when toggling the `isRecurring` flag ON. It writes copies for every month from `sourceMonth + 1` through the current calendar month in a single pass. Reading a month simply queries what is already in the database — no lazy materialisation.

**Key files**:
- `src/lib/recurring.ts` — `createRecurringCopies()` (upfront creation), `copyExpensesFromPreviousMonth()` (separate manual copy-all button)
- `src/routes/gastos.tsx` — calls `createRecurringCopies` on expense creation and recurring toggle

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
