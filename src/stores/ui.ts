import { create } from "zustand";
import { currentMonthKey } from "@/lib/currency";

interface UIState {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedMonth: currentMonthKey(),
  setSelectedMonth: (month) => set({ selectedMonth: month }),
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
