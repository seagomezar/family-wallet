<div align="center">

# Family Wallet 💰

**Tu app de finanzas familiares — local, privada, sin internet**

Controla el presupuesto de tu hogar mes a mes. Todos los datos viven en tu dispositivo: sin servidores, sin cuentas, sin rastreo. Instálala como app nativa y úsala incluso sin conexión.

[![PWA](https://img.shields.io/badge/PWA-Instalable-5A0FC8?logo=pwa&logoColor=white)](https://seagomezar.github.io/family-wallet/)
[![Offline-first](https://img.shields.io/badge/Offline--first-IndexedDB-blue)](https://dexie.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MIT License](https://img.shields.io/badge/Licencia-MIT-green)](LICENSE)

</div>

---

## 🚀 Demo en vivo

👉 **[family-wallet — Abrir app](https://seagomezar.github.io/family-wallet/)**

### Pantallas principales

| Pantalla | Descripción |
|----------|-------------|
| 📊 **Dashboard** | Métrica **LIBRE** al centro (ingresos − gastos), barras de progreso por categoría |
| 💸 **Gastos mensuales** | Listado agrupado por categoría con edición inline, filtros y estados |
| 🏦 **Importación bancaria** | Sube extractos PDF (Davibank) o CSV/TSV y la app categoriza automáticamente |
| 🎨 **Tutorial guiado** | Walkthrough interactivo que te guía en la primera apertura |

<!-- Agrega capturas de pantalla aquí:
![Dashboard](docs/screenshots/dashboard.png)
![Gastos](docs/screenshots/gastos.png)
![Importación](docs/screenshots/importacion.png)
![Tutorial](docs/screenshots/tutorial.png)
-->

---

## ✨ Características Principales

| | Característica | Detalle |
|---|---|---|
| 🏠 | **Local-first** | Todos los datos en tu dispositivo, sin servidor ni cuenta de usuario |
| 📱 | **PWA instalable** | Funciona offline — instálala como app nativa en móvil o escritorio |
| 📊 | **Dashboard inteligente** | Métrica LIBRE al centro, gastos por categoría con progreso visual |
| 🏦 | **Importación bancaria** | Sube extractos PDF (Davibank) o CSV y categorízalos automáticamente |
| 🧠 | **Aprendizaje** | La app recuerda tus categorizaciones para futuras importaciones |
| 🔁 | **Gastos recurrentes** | Marca un gasto como recurrente y se replica automáticamente en meses futuros |
| 💾 | **Export / Import** | Respaldo completo en JSON, portabilidad entre dispositivos |
| 🎮 | **Sección educativa** *(próximamente)* | Juegos para enseñar finanzas a niños |
| 🎨 | **Tutorial guiado** | Walkthrough interactivo en la primera apertura, re-activable desde Ajustes |

---

## 🛠️ Tech Stack

| Tecnología | Uso |
|---|---|
| [React 19](https://react.dev/) | UI declarativa con hooks |
| [Vite 8](https://vite.dev/) | Dev server + bundler ultrarrápido |
| [TypeScript](https://www.typescriptlang.org/) | Tipado estricto en todo el proyecto |
| [Dexie.js 4](https://dexie.org/) | IndexedDB reactiva con `useLiveQuery` |
| [TanStack Router](https://tanstack.com/router) | Enrutamiento file-based con tipado |
| [Tailwind CSS 4](https://tailwindcss.com/) | Estilos utilitarios |
| [shadcn/ui](https://ui.shadcn.com/) | Componentes accesibles y personalizables |
| [Recharts 3](https://recharts.org/) | Gráficos y visualizaciones |
| [Papa Parse](https://www.papaparse.com/) | Parsing de CSV/TSV |
| [pdfjs-dist](https://mozilla.github.io/pdf.js/) | Extracción de texto de PDFs bancarios |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | Service Worker + precaching offline |

---

## 🏁 Getting Started

```bash
git clone https://github.com/seagomezar/family-wallet.git
cd family-wallet
npm install
npm run dev
```

La app estará disponible en `http://localhost:5173`.

---

## 📜 Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Chequeo TypeScript + build de producción (`dist/`) |
| `npm run preview` | Preview del build de producción |
| `npm test` | Tests unitarios con Vitest |
| `npm run test:e2e` | Tests E2E con Playwright (Chromium + Firefox + WebKit) |
| `npm run lint` | Linting con ESLint |
| `npm run format` | Formateo con Prettier |
| `npm run typecheck` | Chequeo de tipos TypeScript (strict) |

---

## 📁 Estructura del Proyecto

```
src/
├── routes/           # Rutas file-based (TanStack Router)
├── components/
│   └── ui/           # Componentes estilo shadcn/ui
├── db/               # Schema Dexie.js + datos semilla
├── lib/              # Utilidades (moneda, parsing, categorización, recurrencia)
├── stores/           # Estado UI con Zustand
tests/
├── unit/             # Tests unitarios (Vitest)
├── e2e/              # Tests E2E (Playwright)
├── fixtures/         # Datos de prueba
```

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas!

1. Haz **fork** del repositorio
2. Crea tu rama: `git checkout -b feature/mi-mejora`
3. Haz commit de tus cambios: `git commit -m "feat: mi mejora"`
4. Sube tu rama: `git push origin feature/mi-mejora`
5. Abre un **Pull Request**

---

## 📄 Licencia

Este proyecto está bajo la licencia [MIT](LICENSE).
