# Family Wallet

A local-first family finance SPA for tracking monthly budgets, expenses, and bank transactions.

## Tech Stack

- React 19 + TypeScript + Vite 8
- TanStack Router (file-based, type-safe)
- Dexie.js 4 (IndexedDB, reactive with `useLiveQuery`)
- Zustand 5 (UI state)
- Tailwind CSS 4 + shadcn/ui components
- Recharts 3 (charts — wired for Phase 2)
- Papa Parse 5 (CSV/TSV bank import)
- vite-plugin-pwa (offline/installable)
- Vitest (unit tests)

## Getting Started

```bash
npm install
npm run dev       # Start dev server at localhost:5173
npm run build     # Production build to dist/
npm test          # Run unit tests
npm run typecheck # TypeScript strict checking
```

## Features (MVP)

- **Dashboard**: LIBRE hero number (income − expenses), category breakdown with progress bars
- **Monthly Detail**: Expenses grouped by category, inline editing, status toggling, add/delete
- **Categories**: CRUD for 18 pre-seeded categories from the family Excel
- **Bank Import**: Drag & drop CSV/TSV, Bancolombia format adapter, auto-categorization
- **Settings**: Full JSON export/import backup, data stats, clear data

## Project Structure

```
src/
├── routes/         # TanStack Router file-based routes
├── components/ui/  # shadcn-style UI components
├── db/             # Dexie.js schema + seed data
├── lib/            # Utilities (currency, formatting)
├── stores/         # Zustand UI state
tests/
├── unit/           # Vitest unit tests
```

## Currency

All amounts are in Colombian Pesos (COP). The app displays the "LIBRE" metric (disposable income) as the primary KPI.
