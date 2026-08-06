import { useEffect, useRef } from "react";
import { useUIStore } from "@/stores/ui";
import { autoPopulateRecurring } from "@/lib/recurring";

/**
 * Global hook that auto-populates recurring expenses when the user
 * navigates to a new month that has zero expenses.
 *
 * Design decisions:
 * - NO in-memory Set — the database is the source of truth for idempotency
 * - `autoPopulateRecurring` checks `monthHasExpenses(target)` and returns
 *   immediately if the month already has data, so repeated calls are safe
 * - A 500ms debounce prevents duplicate async calls during rapid month-switching
 * - Runs globally from __root.tsx so it works from any page
 * - Returns a toast message when expenses are copied (consumed by root layout)
 */

export function useAutoRecurring(onToast: (msg: string) => void) {
  const selectedMonth = useUIStore((s) => s.selectedMonth);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  useEffect(() => {
    // Clear any pending debounce from a previous month change
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Debounce: wait 500ms after the last month change before processing
    debounceRef.current = setTimeout(() => {
      // Prevent concurrent runs
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      autoPopulateRecurring(selectedMonth)
        .then((result) => {
          if (result.populated > 0) {
            const msg =
              result.monthsFilled > 1
                ? `Se copiaron ${result.populated} gastos recurrentes (${result.monthsFilled} meses)`
                : `Se copiaron ${result.populated} gastos recurrentes del mes anterior`;
            onToastRef.current(msg);
          }
        })
        .catch(() => {
          // If it failed, next navigation will retry (no permanent blocking)
        })
        .finally(() => {
          isRunningRef.current = false;
        });
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [selectedMonth]);
}
