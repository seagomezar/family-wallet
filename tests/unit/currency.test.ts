import { describe, it, expect } from 'vitest';
import {
  formatCOP,
  formatDelta,
  percentUsed,
  toMonthKey,
  fromMonthKey,
  formatMonth,
  currentMonthKey,
  previousMonthKey,
  nextMonthKey,
} from '@/lib/currency';

describe('formatCOP', () => {
  it('formats positive amounts', () => {
    const result = formatCOP(18500000);
    // Colombian locale uses $ and period/comma separators
    expect(result).toContain('18');
    expect(result).toContain('500');
    expect(result).toContain('000');
  });

  it('formats zero', () => {
    const result = formatCOP(0);
    expect(result).toContain('0');
  });

  it('formats negative amounts', () => {
    const result = formatCOP(-85446);
    expect(result).toContain('85');
    expect(result).toContain('446');
  });
});

describe('formatDelta', () => {
  it('adds + for positive deltas', () => {
    const result = formatDelta(117100);
    expect(result.startsWith('+')).toBe(true);
  });

  it('shows negative sign for negative deltas', () => {
    const result = formatDelta(-50000);
    expect(result).toContain('-');
  });
});

describe('percentUsed', () => {
  it('calculates correct percentage', () => {
    expect(percentUsed(500000, 1000000)).toBe(50);
  });

  it('returns 0 for zero budget', () => {
    expect(percentUsed(500000, 0)).toBe(0);
  });

  it('caps at over 100 when overspent', () => {
    expect(percentUsed(1500000, 1000000)).toBe(150);
  });
});

describe('month utilities', () => {
  it('toMonthKey creates correct format', () => {
    const date = new Date(2026, 5, 15); // June 2026
    expect(toMonthKey(date)).toBe('2026-06');
  });

  it('fromMonthKey creates first of month', () => {
    const date = fromMonthKey('2026-06');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5); // 0-indexed
    expect(date.getDate()).toBe(1);
  });

  it('formatMonth displays Spanish month name', () => {
    const result = formatMonth('2026-06');
    expect(result.toLowerCase()).toContain('junio');
    expect(result).toContain('2026');
  });

  it('currentMonthKey returns current month', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(currentMonthKey()).toBe(expected);
  });

  it('previousMonthKey goes back one month', () => {
    expect(previousMonthKey('2026-06')).toBe('2026-05');
    expect(previousMonthKey('2026-01')).toBe('2025-12');
  });

  it('nextMonthKey goes forward one month', () => {
    expect(nextMonthKey('2026-06')).toBe('2026-07');
    expect(nextMonthKey('2025-12')).toBe('2026-01');
  });
});
