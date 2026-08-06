import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/schema";
import { useUIStore } from "@/stores/ui";
import { autoPopulateRecurring } from "@/lib/recurring";

/**
 * Global hook that auto-populates recurring expenses when the user
 * navigates to a new month that has zero expenses.
 *
 * Design decisions:
 * - Uses useLiveQuery to reactively detect expense count (no race condition)
 * - Tracks populated months in a session-level Set (not persisted) to avoid
 *   re-populating if user manually deletes all expenses
 * - Runs globally from __root.tsx so it works from any page
 * - Returns a toast message when expenses are copied (consumed by root layout)
 */

// Session-level set to track months we've already auto-populated
const populatedMonths = new Set<string>();

export function useAutoRecurring(onToast: (msg: string) => void) {
  const selectedMonth = useUIStore((s) => s.selectedMonth);
  const isRunningRef = useRef(false);

  // Reactively get the expense count for the selected month's budget
  const expenseCount = useLiveQuery(async () => {
    const budget = await db.budgets
      .where("month")
      .equals(selectedMonth)
      .first();
    if (!budget) return 0;
    return db.expenses.where("budgetId").equals(budget.id).count();
  }, [selectedMonth]);

  useEffect(() => {
    // Wait for useLiveQuery to resolve (undefined means loading)
    if (expenseCount === undefined) return;

    // Don't populate if month already has expenses
    if (expenseCount > 0) return;

    // Don't re-populate if we already did this month this session
    if (populatedMonths.has(selectedMonth)) return;

    // Prevent concurrent runs
    if (isRunningRef.current) return;

    isRunningRef.current = true;
    populatedMonths.add(selectedMonth);

    autoPopulateRecurring(selectedMonth)
      .then((count) => {
        if (count > 0) {
          onToast(`Se copiaron ${count} gastos recurrentes del mes anterior`);
        }
      })
      .catch(() => {
        // If it failed, allow retry next time
        populatedMonths.delete(selectedMonth);
      })
      .finally(() => {
        isRunningRef.current = false;
      });
  }, [selectedMonth, expenseCount, onToast]);
}
