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
- **Currency**: All amounts in COP (Colombian Pesos), formatting via `src/lib/currency.ts`
- **Bank import**: Papa Parse with Bancolombia TSV adapter + rule-based auto-categorization

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — TypeScript check + Vite production build (outputs to `dist/`)
- `npm test` — Vitest unit tests
- `npm run typecheck` — TypeScript strict check

## Key patterns

- 18 pre-seeded budget categories from family Excel (see `src/db/seed.ts`)
- "LIBRE" (free money = income − expenses) is the hero metric
- Month key format: `"YYYY-MM"` (e.g. `"2026-06"`)
- Spanish UI throughout — no i18n layer needed

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
