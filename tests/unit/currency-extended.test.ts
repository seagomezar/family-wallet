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

describe('formatCOP - extended edge cases', () => {
  it('formats exactly zero', () => {
    expect(formatCOP(0)).toMatch(/\$\s*0/);
  });

  it('formats small amounts (< 1000)', () => {
    const result = formatCOP(500);
    expect(result).toContain('500');
  });

  it('formats millions correctly', () => {
    const result = formatCOP(18500000);
    expect(result).toContain('18');
  });

  it('formats tens of millions', () => {
    const result = formatCOP(95000000);
    expect(result).toContain('95');
    expect(result).toContain('000');
  });

  it('formats hundreds of millions', () => {
    const result = formatCOP(350000000);
    expect(result).toContain('350');
  });

  it('formats negative amounts with sign', () => {
    const result = formatCOP(-85446);
    expect(result).toMatch(/-/);
  });

  it('formats negative millions', () => {
    const result = formatCOP(-5153000);
    expect(result).toContain('5');
    expect(result).toContain('153');
  });

  it('rounds decimals (no fraction digits)', () => {
    const result = formatCOP(1234.56);
    // maximumFractionDigits: 0, should not contain decimal separator
    expect(result).toContain('1');
    expect(result).toContain('235'); // rounded up
  });

  it('rounds down when decimal < 0.5', () => {
    const result = formatCOP(1234.3);
    expect(result).toContain('1');
    expect(result).toContain('234');
  });

  it('handles very large amounts', () => {
    const result = formatCOP(999999999);
    expect(result).toContain('999');
  });

  it('handles amount of 1', () => {
    const result = formatCOP(1);
    expect(result).toContain('1');
  });

  it('formats negative one', () => {
    const result = formatCOP(-1);
    expect(result).toMatch(/-/);
  });
});

describe('formatDelta - extended edge cases', () => {
  it('formats positive delta with + prefix', () => {
    const result = formatDelta(117100);
    expect(result.startsWith('+')).toBe(true);
    expect(result).toContain('117');
  });

  it('formats negative delta with - sign', () => {
    const result = formatDelta(-50000);
    expect(result).toContain('-');
    expect(result).toContain('50');
  });

  it('formats zero delta without + or - sign', () => {
    const result = formatDelta(0);
    // 0 is not > 0, so sign should be empty
    expect(result).not.toMatch(/^\+/);
    expect(result).toContain('0');
  });

  it('formats large positive delta', () => {
    const result = formatDelta(5000000);
    expect(result.startsWith('+')).toBe(true);
  });

  it('formats 1 peso delta', () => {
    const result = formatDelta(1);
    expect(result.startsWith('+')).toBe(true);
  });

  it('formats -1 peso delta', () => {
    const result = formatDelta(-1);
    expect(result).toContain('-');
  });
});

describe('percentUsed - extended', () => {
  it('returns 0 for zero spent', () => {
    expect(percentUsed(0, 1000000)).toBe(0);
  });

  it('returns 100 for exact budget', () => {
    expect(percentUsed(1000000, 1000000)).toBe(100);
  });

  it('handles small fractions (rounds)', () => {
    // 1/3 of budget = 33.333...% → rounds to 33
    expect(percentUsed(333333, 1000000)).toBe(33);
  });

  it('rounds up at .5', () => {
    // 55555/100000 = 55.555% → 56
    expect(percentUsed(55555, 100000)).toBe(56);
  });

  it('returns 0 for negative budget', () => {
    expect(percentUsed(500000, -1000000)).toBe(0);
  });

  it('handles very large overspend', () => {
    expect(percentUsed(10000000, 1000000)).toBe(1000);
  });

  it('returns 0 when both are zero', () => {
    expect(percentUsed(0, 0)).toBe(0);
  });
});

describe('toMonthKey - extended', () => {
  it('handles January', () => {
    expect(toMonthKey(new Date(2026, 0, 15))).toBe('2026-01');
  });

  it('handles December', () => {
    expect(toMonthKey(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('pads single-digit months', () => {
    expect(toMonthKey(new Date(2026, 8, 1))).toBe('2026-09');
  });

  it('handles year boundary', () => {
    expect(toMonthKey(new Date(2025, 11, 31))).toBe('2025-12');
  });

  it('works with first of month', () => {
    expect(toMonthKey(new Date(2026, 5, 1))).toBe('2026-06');
  });

  it('works with last of month', () => {
    expect(toMonthKey(new Date(2026, 5, 30))).toBe('2026-06');
  });
});

describe('fromMonthKey - extended', () => {
  it('creates first of January', () => {
    const date = fromMonthKey('2026-01');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });

  it('creates first of December', () => {
    const date = fromMonthKey('2026-12');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(1);
  });

  it('handles 2025 year', () => {
    const date = fromMonthKey('2025-03');
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(2);
  });
});

describe('formatMonth - extended', () => {
  it('formats January', () => {
    const result = formatMonth('2026-01');
    expect(result.toLowerCase()).toContain('enero');
    expect(result).toContain('2026');
  });

  it('formats December', () => {
    const result = formatMonth('2026-12');
    expect(result.toLowerCase()).toContain('diciembre');
  });

  it('formats March', () => {
    const result = formatMonth('2026-03');
    expect(result.toLowerCase()).toContain('marzo');
  });
});

describe('previousMonthKey - extended', () => {
  it('wraps December to previous year November', () => {
    // previousMonthKey of January = December of prev year
    expect(previousMonthKey('2026-01')).toBe('2025-12');
  });

  it('handles mid-year months', () => {
    expect(previousMonthKey('2026-07')).toBe('2026-06');
    expect(previousMonthKey('2026-03')).toBe('2026-02');
  });

  it('chains correctly', () => {
    let key = '2026-06';
    key = previousMonthKey(key);
    key = previousMonthKey(key);
    key = previousMonthKey(key);
    expect(key).toBe('2026-03');
  });
});

describe('nextMonthKey - extended', () => {
  it('wraps December to next year January', () => {
    expect(nextMonthKey('2025-12')).toBe('2026-01');
  });

  it('handles mid-year months', () => {
    expect(nextMonthKey('2026-01')).toBe('2026-02');
    expect(nextMonthKey('2026-11')).toBe('2026-12');
  });

  it('chains correctly', () => {
    let key = '2026-01';
    key = nextMonthKey(key);
    key = nextMonthKey(key);
    key = nextMonthKey(key);
    expect(key).toBe('2026-04');
  });

  it('next then previous returns original', () => {
    const original = '2026-06';
    const next = nextMonthKey(original);
    expect(previousMonthKey(next)).toBe(original);
  });

  it('previous then next returns original', () => {
    const original = '2026-06';
    const prev = previousMonthKey(original);
    expect(nextMonthKey(prev)).toBe(original);
  });
});

describe('currentMonthKey', () => {
  it('returns a valid month key format', () => {
    const key = currentMonthKey();
    expect(key).toMatch(/^\d{4}-\d{2}$/);
  });

  it('year is reasonable', () => {
    const key = currentMonthKey();
    const year = parseInt(key.split('-')[0]!);
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(year).toBeLessThanOrEqual(2030);
  });

  it('month is 01-12', () => {
    const key = currentMonthKey();
    const month = parseInt(key.split('-')[1]!);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });
});
