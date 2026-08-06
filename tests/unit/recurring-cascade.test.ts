import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { db, type Expense } from "@/db/schema";
import { createRecurringCopies } from "@/lib/recurring";
import * as currency from "@/lib/currency";

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
): Promise<Expense> {
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

describe("Recurring Expenses – Upfront Creation", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates copies from March to August, filling all intermediate months", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

    await createBudget("2026-03");
    const expense = await createExpense({
      budgetId: "budget-2026-03",
      description: "Plan Claro",
      amount: 90000,
      isRecurring: true,
    });

    const copies = await createRecurringCopies(expense, "2026-03");

    // Apr, May, Jun, Jul, Aug = 5 months
    expect(copies).toBe(5);

    for (const month of ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(1);
      expect(expenses[0]!.description).toBe("Plan Claro");
      expect(expenses[0]!.amount).toBe(90000);
      expect(expenses[0]!.previousAmount).toBe(90000);
      expect(expenses[0]!.isRecurring).toBe(true);
      expect(expenses[0]!.status).toBe("pending");
    }
  });

  it("skips months that already have a matching expense", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

    await createBudget("2026-03");
    const expense = await createExpense({
      budgetId: "budget-2026-03",
      description: "Internet",
      amount: 120000,
      categoryId: "cat-1",
      isRecurring: true,
    });

    // June already has the same expense (manually entered, different amount)
    await createBudget("2026-06");
    await createExpense({
      budgetId: "budget-2026-06",
      description: "Internet",
      amount: 130000,
      categoryId: "cat-1",
      isRecurring: true,
    });

    const copies = await createRecurringCopies(expense, "2026-03");

    // Apr, May (created), Jun (skipped), Jul, Aug (created) = 4
    expect(copies).toBe(4);

    // June still has only original expense with original amount
    const junExpenses = await getMonthExpenses("2026-06");
    expect(junExpenses).toHaveLength(1);
    expect(junExpenses[0]!.amount).toBe(130000);
  });

  it("immediate next month works (single copy)", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

    await createBudget("2026-07");
    const expense = await createExpense({
      budgetId: "budget-2026-07",
      description: "Netflix",
      amount: 45000,
      isRecurring: true,
    });

    const copies = await createRecurringCopies(expense, "2026-07");
    expect(copies).toBe(1);

    const expenses = await getMonthExpenses("2026-08");
    expect(expenses).toHaveLength(1);
    expect(expenses[0]!.description).toBe("Netflix");
  });

  it("no duplicates if called twice", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

    await createBudget("2026-03");
    const expense = await createExpense({
      budgetId: "budget-2026-03",
      description: "Admin",
      amount: 500000,
      isRecurring: true,
    });

    // First call
    await createRecurringCopies(expense, "2026-03");

    // Second call
    const result2 = await createRecurringCopies(expense, "2026-03");
    expect(result2).toBe(0);

    // Verify no duplicates
    for (const month of ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(1);
    }
  });

  it("multiple recurring expenses can be created independently", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-06");

    await createBudget("2026-03");
    const exp1 = await createExpense({
      budgetId: "budget-2026-03",
      description: "Admin",
      amount: 500000,
      categoryId: "cat-1",
      isRecurring: true,
    });
    const exp2 = await createExpense({
      budgetId: "budget-2026-03",
      description: "Internet",
      amount: 120000,
      categoryId: "cat-2",
      isRecurring: true,
    });
    const exp3 = await createExpense({
      budgetId: "budget-2026-03",
      description: "Netflix",
      amount: 45000,
      categoryId: "cat-3",
      isRecurring: true,
    });

    await createRecurringCopies(exp1, "2026-03");
    await createRecurringCopies(exp2, "2026-03");
    await createRecurringCopies(exp3, "2026-03");

    // Each month should have all 3
    for (const month of ["2026-04", "2026-05", "2026-06"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(3);
      const descriptions = expenses.map((e) => e.description).sort();
      expect(descriptions).toEqual(["Admin", "Internet", "Netflix"]);
    }
  });

  it("previousAmount is the source expense amount", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-06");

    await createBudget("2026-03");
    const expense = await createExpense({
      budgetId: "budget-2026-03",
      description: "Crédito Carro",
      amount: 2000000,
      previousAmount: 1900000,
      isRecurring: true,
    });

    await createRecurringCopies(expense, "2026-03");

    // All copies should have previousAmount = source's amount
    for (const month of ["2026-04", "2026-05", "2026-06"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses[0]!.previousAmount).toBe(2000000);
      expect(expenses[0]!.amount).toBe(2000000);
    }
  });

  it("income is carried forward from source budget", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-05");

    await createBudget("2026-03", 20000000);
    const expense = await createExpense({
      budgetId: "budget-2026-03",
      description: "Servicios",
      amount: 300000,
      isRecurring: true,
    });

    await createRecurringCopies(expense, "2026-03");

    const aprBudget = await db.budgets.where("month").equals("2026-04").first();
    expect(aprBudget!.totalIncome).toBe(20000000);

    const mayBudget = await db.budgets.where("month").equals("2026-05").first();
    expect(mayBudget!.totalIncome).toBe(20000000);
  });

  it("cascades across many months", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

    await createBudget("2025-09");
    const expense = await createExpense({
      budgetId: "budget-2025-09",
      description: "Old expense",
      amount: 100000,
      isRecurring: true,
    });

    const copies = await createRecurringCopies(expense, "2025-09");

    // Oct 2025 through Aug 2026 = 11 months
    expect(copies).toBe(11);
  });

  it("captain scenario: October 2025 recurring → all months through March 2026", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-03");

    await createBudget("2025-10");
    const exp1 = await createExpense({
      budgetId: "budget-2025-10",
      description: "Admin Edificio",
      amount: 500000,
      isRecurring: true,
    });
    const exp2 = await createExpense({
      budgetId: "budget-2025-10",
      description: "Internet Hogar",
      amount: 120000,
      isRecurring: true,
    });

    const copies1 = await createRecurringCopies(exp1, "2025-10");
    const copies2 = await createRecurringCopies(exp2, "2025-10");

    // Nov 2025, Dec 2025, Jan 2026, Feb 2026, Mar 2026 = 5 months each
    expect(copies1).toBe(5);
    expect(copies2).toBe(5);

    // Verify target month
    const marchExpenses = await getMonthExpenses("2026-03");
    expect(marchExpenses).toHaveLength(2);
    const descriptions = marchExpenses.map((e) => e.description).sort();
    expect(descriptions).toEqual(["Admin Edificio", "Internet Hogar"]);

    // Verify all intermediate months
    for (const month of ["2025-11", "2025-12", "2026-01", "2026-02"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(2);
    }

    // Second call is idempotent
    const copies3 = await createRecurringCopies(exp1, "2025-10");
    expect(copies3).toBe(0);
  });

  it("does not create past the current calendar month", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-06");

    await createBudget("2026-04");
    const expense = await createExpense({
      budgetId: "budget-2026-04",
      description: "Plan Celular",
      amount: 60000,
      isRecurring: true,
    });

    const copies = await createRecurringCopies(expense, "2026-04");

    // May + Jun = 2 (not Jul or beyond)
    expect(copies).toBe(2);

    const julExpenses = await getMonthExpenses("2026-07");
    expect(julExpenses).toHaveLength(0);
  });

  it("works when toggling recurring ON for an existing expense", async () => {
    vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

    await createBudget("2026-05");
    // Expense starts as non-recurring, then user toggles it ON
    const expense = await createExpense({
      budgetId: "budget-2026-05",
      description: "Gym",
      amount: 80000,
      isRecurring: false, // was false, now toggled to true by the UI
    });

    // Simulate the toggle by calling createRecurringCopies with the updated state
    const updatedExpense = { ...expense, isRecurring: true };
    const copies = await createRecurringCopies(updatedExpense, "2026-05");

    // Jun, Jul, Aug = 3
    expect(copies).toBe(3);

    for (const month of ["2026-06", "2026-07", "2026-08"]) {
      const expenses = await getMonthExpenses(month);
      expect(expenses).toHaveLength(1);
      expect(expenses[0]!.description).toBe("Gym");
      expect(expenses[0]!.isRecurring).toBe(true);
    }
  });
});
