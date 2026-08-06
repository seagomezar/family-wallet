import { create } from 'zustand';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  /** CSS selector for the element to highlight. Null = centered modal (no spotlight). */
  targetSelector: string | null;
  /** Route to navigate to before showing this step */
  route?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenido a Family Wallet 💰',
    description:
      'Tu app de finanzas familiares. Controla ingresos, gastos y presupuesto mes a mes — todo en tu dispositivo, sin internet.',
    targetSelector: null,
    route: '/',
  },
  {
    id: 'libre',
    title: 'Tu número más importante: LIBRE',
    description:
      'Este es cuánto dinero libre te queda este mes después de todos los gastos. Si es verde, vas bien. Si es rojo, revisa tus gastos.',
    targetSelector: '[data-tour="libre"]',
    route: '/',
  },
  {
    id: 'categories',
    title: 'Gastos por Categoría',
    description:
      'Aquí ves cuánto llevas gastado en cada categoría vs tu presupuesto. Las barras te muestran el progreso.',
    targetSelector: '[data-tour="categories"]',
    route: '/',
  },
  {
    id: 'expenses',
    title: 'Tus Gastos Mensuales',
    description:
      'Aquí agregas y controlas tus gastos mes a mes. Toca el círculo para marcar como pagado.',
    targetSelector: '[data-tour="expenses"]',
    route: '/gastos',
  },
  {
    id: 'import',
    title: 'Importar Extracto Bancario',
    description:
      'Sube tu extracto bancario en PDF y la app categoriza tus gastos automáticamente. Compatible con Bancolombia y Davivienda.',
    targetSelector: '[data-tour="import"]',
    route: '/importar',
  },
  {
    id: 'export',
    title: 'Exportar Datos',
    description:
      'Exporta tus datos como respaldo o para usar en otro dispositivo. Siempre ten un respaldo reciente.',
    targetSelector: '[data-tour="export"]',
    route: '/ajustes',
  },
  {
    id: 'final',
    title: '¡Listo! 🎉',
    description:
      '¡Ya puedes empezar a controlar tus finanzas! Puedes repetir este tutorial en cualquier momento desde Ajustes.',
    targetSelector: null,
    route: '/ajustes',
  },
];

interface TourState {
  isActive: boolean;
  currentStep: number;
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  finish: () => void;
  goToStep: (step: number) => void;
}

export const useTourStore = create<TourState>((set) => ({
  isActive: false,
  currentStep: 0,
  start: () => set({ isActive: true, currentStep: 0 }),
  next: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, TOUR_STEPS.length - 1) })),
  prev: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
  skip: () => set({ isActive: false, currentStep: 0 }),
  finish: () => set({ isActive: false, currentStep: 0 }),
  goToStep: (step) => set({ currentStep: step }),
}));
