import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db, type Expense } from "@/db/schema";
import { autoPopulateRecurring } from "@/lib/recurring";

// Helper to create a budget
async function createBudget(month: string, income = 18500000) {
  await db.budgets.add({
    id: `budget-${month}`,
    month,
    totalIncome: income,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// Helper to create an expense
async function createExpense(
  overrides: Partial<Expense> & { budgetId: string; description: string },
) {
  const id =
    overrides.id ??
    `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expense: Expense = {
    id,
    budgetId: overrides.budgetId,
    categoryId: overrides.categoryId ?? "cat-1",
    description: overrides.description,
    amount: overrides.amount ?? 100000,
    previousAmount: overrides.previousAmount ?? 0,
    paymentSource: overrides.paymentSource ?? "bancolombia",
    status: overrides.status ?? "paid",
    isRecurring: overrides.isRecurring ?? false,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
  await db.expenses.add(expense);
  return expense;
}

// Helper to get expenses for a month
async function getMonthExpenses(month: string): Promise<Expense[]> {
  const budget = await db.budgets.where("month").equals(month).first();
  if (!budget) return [];
  return db.expenses.where("budgetId").equals(budget.id).toArray();
}

describe("Recurring Expenses – Cascade Forward", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("cascades from March to August, filling all intermediate months", async () => {
    // Setup: March has a recurring expense
    await createBudget("2026-03");
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Plan Claro",
      amount: 90000,
      isRecurring: true,
    });
    // Also a non-recurring that should NOT cascade
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Compra única",
      amount: 50000,
      isRecurring: false,
    });

    // Navigate directly to August
    const result = await autoPopulateRecurring("2026-08");

    // Should fill Apr, May, Jun, Jul, Aug = 5 months × 1 expense
    expect(result.populated).toBe(5);
    expect(result.monthsFilled).toBe(5);
    expect(result.reason).toBe("populated");

    // Verify each intermediate month has the recurring expense
    for (const month of [
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(1);
      expect(expenses[0]!.description).toBe("Plan Claro");
      expect(expenses[0]!.amount).toBe(90000);
      expect(expenses[0]!.previousAmount).toBe(90000);
      expect(expenses[0]!.isRecurring).toBe(true);
      expect(expenses[0]!.status).toBe("pending");
    }

    // March's non-recurring should NOT appear anywhere
    for (const month of [
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]) {
      const expenses = await getMonthExpenses(month);
      const nonRecurring = expenses.filter(
        (e) => e.description === "Compra única",
      );
      expect(nonRecurring).toHaveLength(0);
    }
  });

  it("skips intermediate months that already have data but continues cascading", async () => {
    // March has recurring
    await createBudget("2026-03");
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Internet",
      amount: 120000,
      isRecurring: true,
    });

    // June already has data (manually added) including a recurring with different amount
    await createBudget("2026-06");
    await createExpense({
      budgetId: "budget-2026-06",
      description: "Compra manual",
      amount: 200000,
      isRecurring: false,
    });
    await createExpense({
      budgetId: "budget-2026-06",
      description: "Internet",
      amount: 130000, // price went up!
      isRecurring: true,
    });

    // Navigate to August
    const result = await autoPopulateRecurring("2026-08");

    // Source found = June (nearest with recurring data before target Aug)
    // Fills: Jul (from Jun's recurring $130k), Aug (from Jul)
    expect(result.reason).toBe("populated");
    expect(result.monthsFilled).toBe(2);

    // June: untouched (still has original 2 expenses)
    const junExpenses = await getMonthExpenses("2026-06");
    expect(junExpenses).toHaveLength(2);

    // July and August: cascaded from June's recurring ($130k)
    const julExpenses = await getMonthExpenses("2026-07");
    expect(julExpenses).toHaveLength(1);
    expect(julExpenses[0]!.amount).toBe(130000);
    expect(julExpenses[0]!.previousAmount).toBe(130000);

    const augExpenses = await getMonthExpenses("2026-08");
    expect(augExpenses).toHaveLength(1);
    expect(augExpenses[0]!.amount).toBe(130000);
  });

  it("immediate previous month works as before (single copy)", async () => {
    await createBudget("2026-07");
    await createExpense({
      budgetId: "budget-2026-07",
      description: "Netflix",
      amount: 45000,
      isRecurring: true,
    });

    const result = await autoPopulateRecurring("2026-08");

    expect(result.populated).toBe(1);
    expect(result.monthsFilled).toBe(1);
    expect(result.reason).toBe("populated");

    const expenses = await getMonthExpenses("2026-08");
    expect(expenses).toHaveLength(1);
    expect(expenses[0]!.description).toBe("Netflix");
  });

  it("no duplicates if revisiting months after cascade", async () => {
    await createBudget("2026-03");
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Admin",
      amount: 500000,
      isRecurring: true,
    });

    // First call: cascade to August
    await autoPopulateRecurring("2026-08");

    // Second call: try August again
    const result2 = await autoPopulateRecurring("2026-08");
    expect(result2.populated).toBe(0);
    expect(result2.reason).toBe("already_has_expenses");

    // Third call: try June (intermediate, already filled)
    const result3 = await autoPopulateRecurring("2026-06");
    expect(result3.populated).toBe(0);
    expect(result3.reason).toBe("already_has_expenses");

    // Verify no duplicates
    const augExpenses = await getMonthExpenses("2026-08");
    expect(augExpenses).toHaveLength(1);

    const junExpenses = await getMonthExpenses("2026-06");
    expect(junExpenses).toHaveLength(1);
  });

  it("multiple recurring expenses cascade correctly", async () => {
    await createBudget("2026-03");
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Admin",
      amount: 500000,
      isRecurring: true,
    });
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Internet",
      amount: 120000,
      isRecurring: true,
    });
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Netflix",
      amount: 45000,
      isRecurring: true,
    });

    const result = await autoPopulateRecurring("2026-06");

    // 3 months (Apr, May, Jun) × 3 expenses = 9
    expect(result.populated).toBe(9);
    expect(result.monthsFilled).toBe(3);

    // Each month should have all 3
    for (const month of ["2026-04", "2026-05", "2026-06"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(3);
      const descriptions = expenses.map((e) => e.description).sort();
      expect(descriptions).toEqual(["Admin", "Internet", "Netflix"]);
    }
  });

  it("previousAmount chain is correct across cascaded months", async () => {
    await createBudget("2026-03");
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Crédito Carro",
      amount: 2000000,
      previousAmount: 1900000, // this was March's reference to Feb
      isRecurring: true,
    });

    await autoPopulateRecurring("2026-06");

    // April's previousAmount should be March's amount (2000000)
    const aprExpenses = await getMonthExpenses("2026-04");
    expect(aprExpenses[0]!.previousAmount).toBe(2000000);
    expect(aprExpenses[0]!.amount).toBe(2000000);

    // May's previousAmount should be April's amount (2000000)
    const mayExpenses = await getMonthExpenses("2026-05");
    expect(mayExpenses[0]!.previousAmount).toBe(2000000);

    // June's previousAmount should be May's amount (2000000)
    const junExpenses = await getMonthExpenses("2026-06");
    expect(junExpenses[0]!.previousAmount).toBe(2000000);
  });

  it("income is carried forward from source budget", async () => {
    await createBudget("2026-03", 20000000);
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Servicios",
      amount: 300000,
      isRecurring: true,
    });

    await autoPopulateRecurring("2026-05");

    // April and May should inherit income from March
    const aprBudget = await db.budgets
      .where("month")
      .equals("2026-04")
      .first();
    expect(aprBudget!.totalIncome).toBe(20000000);

    const mayBudget = await db.budgets
      .where("month")
      .equals("2026-05")
      .first();
    expect(mayBudget!.totalIncome).toBe(20000000);
  });

  it("returns monthsFilled reflecting actual months filled", async () => {
    await createBudget("2026-03");
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Gas",
      amount: 90000,
      isRecurring: true,
    });

    // May already has data (which is CLOSER to target than March)
    await createBudget("2026-05");
    await createExpense({
      budgetId: "budget-2026-05",
      description: "Something",
      amount: 100000,
      isRecurring: true,
    });

    const result = await autoPopulateRecurring("2026-07");

    // Source found = May (nearest with data before target)
    // Fills: Jun (from May), Jul (from Jun) = 2 months
    // April is before the source, not filled by this call
    expect(result.monthsFilled).toBe(2);
    expect(result.populated).toBe(2);
  });

  it("cascades across many months without artificial cap", async () => {
    // Source 11 months before target (within 24-month search)
    await createBudget("2025-09");
    await createExpense({
      budgetId: "budget-2025-09",
      description: "Old expense",
      amount: 100000,
      isRecurring: true,
    });

    // Target is 11 months later
    const result = await autoPopulateRecurring("2026-08");

    // Should cascade through all 11 intermediate months
    expect(result.reason).toBe("populated");
    expect(result.monthsFilled).toBe(11);
    expect(result.populated).toBe(11);
  });

  it("captain scenario: October 2025 recurring → jump to March 2026", async () => {
    // Create recurring expenses in October 2025
    await createBudget("2025-10");
    await createExpense({
      budgetId: "budget-2025-10",
      description: "Admin Edificio",
      amount: 500000,
      isRecurring: true,
    });
    await createExpense({
      budgetId: "budget-2025-10",
      description: "Internet Hogar",
      amount: 120000,
      isRecurring: true,
    });

    // Jump directly to March 2026 (5 months gap)
    const result = await autoPopulateRecurring("2026-03");

    // Should cascade: Nov, Dec, Jan, Feb, Mar = 5 months × 2 expenses = 10
    expect(result.reason).toBe("populated");
    expect(result.monthsFilled).toBe(5);
    expect(result.populated).toBe(10);

    // Verify target month
    const marchExpenses = await getMonthExpenses("2026-03");
    expect(marchExpenses).toHaveLength(2);
    const descriptions = marchExpenses.map((e) => e.description).sort();
    expect(descriptions).toEqual(["Admin Edificio", "Internet Hogar"]);

    // Verify all intermediate months were filled
    for (const month of ["2025-11", "2025-12", "2026-01", "2026-02"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(2);
    }

    // Second call is idempotent
    const result2 = await autoPopulateRecurring("2026-03");
    expect(result2.reason).toBe("already_has_expenses");
    expect(result2.populated).toBe(0);
  });

  it("source search skips months with only non-recurring data and finds recurring further back", async () => {
    // March has recurring
    await createBudget("2026-03");
    await createExpense({
      budgetId: "budget-2026-03",
      description: "Internet",
      amount: 120000,
      isRecurring: true,
    });

    // June has ONLY non-recurring (no recurring)
    await createBudget("2026-06");
    await createExpense({
      budgetId: "budget-2026-06",
      description: "Compra supermercado",
      amount: 300000,
      isRecurring: false,
    });

    // Navigate to August
    const result = await autoPopulateRecurring("2026-08");

    // Source search: Jul (empty) → Jun (has data but no recurring) → May (empty) →
    // Apr (empty) → Mar (has recurring!) → source = March
    // monthsToFill: Apr, May, Jun, Jul, Aug
    expect(result.reason).toBe("populated");

    // Apr, May filled from March. Jun skipped (has data). Jul, Aug filled from Jun.
    // But Jun has NO recurring, so Jul gets filled from May (the last filled month).
    // Actually: cascade goes Apr (from Mar), May (from Apr), Jun (has data, check recurring: 0,
    // currentSourceExpenses stays as May's), Jul (from May/last source), Aug (from Jul)
    // monthsFilled = 4 (Apr, May, Jul, Aug)

    // Let's verify the target month has the expense
    const augExpenses = await getMonthExpenses("2026-08");
    expect(augExpenses).toHaveLength(1);
    expect(augExpenses[0]!.description).toBe("Internet");
    expect(augExpenses[0]!.amount).toBe(120000);

    // April should also have it
    const aprExpenses = await getMonthExpenses("2026-04");
    expect(aprExpenses).toHaveLength(1);
    expect(aprExpenses[0]!.description).toBe("Internet");
  });
});
