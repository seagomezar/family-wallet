/**
 * Format a number as COP currency (Colombian Pesos).
 * Example: 18500000 → "$18,500,000"
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a number with sign for deltas.
 * Example: 117100 → "+$117,100", -50000 → "-$50,000"
 */
export function formatDelta(amount: number): string {
  const sign = amount > 0 ? '+' : '';
  return `${sign}${formatCOP(amount)}`;
}

/**
 * Calculate percent of budget used.
 */
export function percentUsed(spent: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.round((spent / budget) * 100);
}

/**
 * Return a month key string like "2026-06" from a Date.
 */
export function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Parse a month key into a Date (first of month).
 */
export function fromMonthKey(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, m! - 1, 1);
}

/**
 * Format a month key for display: "2026-06" → "Junio 2026"
 */
export function formatMonth(key: string): string {
  const date = fromMonthKey(key);
  return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

/**
 * Get the current month key.
 */
export function currentMonthKey(): string {
  return toMonthKey(new Date());
}

/**
 * Get previous month key.
 */
export function previousMonthKey(key: string): string {
  const date = fromMonthKey(key);
  date.setMonth(date.getMonth() - 1);
  return toMonthKey(date);
}

/**
 * Get next month key.
 */
export function nextMonthKey(key: string): string {
  const date = fromMonthKey(key);
  date.setMonth(date.getMonth() + 1);
  return toMonthKey(date);
}
