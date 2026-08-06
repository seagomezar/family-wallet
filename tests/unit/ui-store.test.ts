import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@/stores/ui';
import { currentMonthKey } from '@/lib/currency';

describe('UI Store', () => {
  beforeEach(() => {
    // Reset store state
    useUIStore.setState({
      selectedMonth: currentMonthKey(),
      sidebarOpen: false,
    });
  });

  describe('selectedMonth', () => {
    it('defaults to current month', () => {
      const state = useUIStore.getState();
      expect(state.selectedMonth).toBe(currentMonthKey());
    });

    it('setSelectedMonth updates the month', () => {
      useUIStore.getState().setSelectedMonth('2026-01');
      expect(useUIStore.getState().selectedMonth).toBe('2026-01');
    });

    it('can go back and forward in months', () => {
      useUIStore.getState().setSelectedMonth('2026-06');
      expect(useUIStore.getState().selectedMonth).toBe('2026-06');

      useUIStore.getState().setSelectedMonth('2026-05');
      expect(useUIStore.getState().selectedMonth).toBe('2026-05');

      useUIStore.getState().setSelectedMonth('2026-07');
      expect(useUIStore.getState().selectedMonth).toBe('2026-07');
    });

    it('accepts any valid month key string', () => {
      useUIStore.getState().setSelectedMonth('2025-12');
      expect(useUIStore.getState().selectedMonth).toBe('2025-12');
    });
  });

  describe('sidebar', () => {
    it('defaults to closed', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('toggleSidebar opens it', () => {
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('toggleSidebar again closes it', () => {
      useUIStore.getState().toggleSidebar();
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('multiple toggles cycle correctly', () => {
      const store = useUIStore.getState();
      store.toggleSidebar(); // open
      expect(useUIStore.getState().sidebarOpen).toBe(true);
      useUIStore.getState().toggleSidebar(); // close
      expect(useUIStore.getState().sidebarOpen).toBe(false);
      useUIStore.getState().toggleSidebar(); // open
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('state independence', () => {
    it('changing month does not affect sidebar', () => {
      useUIStore.getState().toggleSidebar();
      useUIStore.getState().setSelectedMonth('2025-01');
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('toggling sidebar does not affect month', () => {
      useUIStore.getState().setSelectedMonth('2026-03');
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().selectedMonth).toBe('2026-03');
    });
  });
});
