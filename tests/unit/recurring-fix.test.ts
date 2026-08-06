import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { db, type Expense } from "@/db/schema";
import {
  copyExpensesFromPreviousMonth,
  createRecurringCopies,
} from "@/lib/recurring";
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

describe("Recurring Expenses – Upfront Creation (Fix Tests)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createRecurringCopies – Core Logic", () => {
    it("1. creates recurring copy with status pending", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const expense = await createExpense({
        budgetId: "budget-2026-07",
        description: "Internet Hogar",
        amount: 120000,
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-07");
      expect(copies).toBe(1);

      const newExpenses = await getMonthExpenses("2026-08");
      expect(newExpenses).toHaveLength(1);
      expect(newExpenses[0]!.description).toBe("Internet Hogar");
      expect(newExpenses[0]!.status).toBe("pending");
    });

    it("2. only copies the specific expense (not all in the month)", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const recurring = await createExpense({
        budgetId: "budget-2026-07",
        description: "Admin",
        isRecurring: true,
        amount: 500000,
      });
      // This one should NOT be copied
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Compra supermercado",
        amount: 250000,
        isRecurring: false,
      });

      const copies = await createRecurringCopies(recurring, "2026-07");
      expect(copies).toBe(1);

      const newExpenses = await getMonthExpenses("2026-08");
      expect(newExpenses).toHaveLength(1);
      expect(newExpenses[0]!.description).toBe("Admin");
    });

    it("3. previousAmount is set to source expense's amount", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const expense = await createExpense({
        budgetId: "budget-2026-07",
        description: "Crédito Carro",
        amount: 2350000,
        previousAmount: 2300000,
        isRecurring: true,
      });

      await createRecurringCopies(expense, "2026-07");

      const newExpenses = await getMonthExpenses("2026-08");
      expect(newExpenses[0]!.previousAmount).toBe(2350000);
      expect(newExpenses[0]!.amount).toBe(2350000);
    });

    it("4. copies start as pending even if source was paid", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const expense = await createExpense({
        budgetId: "budget-2026-07",
        description: "Servicios",
        amount: 300000,
        status: "paid",
        isRecurring: true,
      });

      await createRecurringCopies(expense, "2026-07");

      const newExpenses = await getMonthExpenses("2026-08");
      expect(newExpenses[0]!.status).toBe("pending");
    });

    it("5. isRecurring is true on copies", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const expense = await createExpense({
        budgetId: "budget-2026-07",
        description: "Seguro",
        amount: 180000,
        isRecurring: true,
      });

      await createRecurringCopies(expense, "2026-07");

      const newExpenses = await getMonthExpenses("2026-08");
      expect(newExpenses[0]!.isRecurring).toBe(true);
    });

    it("6. calling twice does not duplicate", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const expense = await createExpense({
        budgetId: "budget-2026-07",
        description: "Gas",
        amount: 90000,
        isRecurring: true,
      });

      const first = await createRecurringCopies(expense, "2026-07");
      expect(first).toBe(1);

      const second = await createRecurringCopies(expense, "2026-07");
      expect(second).toBe(0);

      const newExpenses = await getMonthExpenses("2026-08");
      expect(newExpenses).toHaveLength(1);
    });

    it("7. skips months with matching expense (description + categoryId)", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const expense = await createExpense({
        budgetId: "budget-2026-07",
        description: "Admin",
        amount: 500000,
        categoryId: "cat-1",
        isRecurring: true,
      });

      // August already has this expense
      await createBudget("2026-08");
      await createExpense({
        budgetId: "budget-2026-08",
        description: "Admin",
        amount: 500000,
        categoryId: "cat-1",
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-07");
      expect(copies).toBe(0);

      const expenses = await getMonthExpenses("2026-08");
      expect(expenses).toHaveLength(1);
    });

    it("8. fills forward from past months to current", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-07");

      await createBudget("2026-04");
      const expense = await createExpense({
        budgetId: "budget-2026-04",
        description: "Seguro de vida",
        amount: 250000,
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-04");
      expect(copies).toBe(3); // May, Jun, Jul

      for (const month of ["2026-05", "2026-06", "2026-07"]) {
        const expenses = await getMonthExpenses(month);
        expect(expenses).toHaveLength(1);
        expect(expenses[0]!.description).toBe("Seguro de vida");
        expect(expenses[0]!.previousAmount).toBe(250000);
      }
    });

    it("9. different categories with same description are NOT treated as duplicates", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-07");
      const expense = await createExpense({
        budgetId: "budget-2026-07",
        description: "Netflix",
        categoryId: "cat-entretenimiento",
        amount: 45000,
        isRecurring: true,
      });

      // August has Netflix in a DIFFERENT category
      await createBudget("2026-08");
      await createExpense({
        budgetId: "budget-2026-08",
        description: "Netflix",
        categoryId: "cat-suscripciones",
        amount: 45000,
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-07");
      expect(copies).toBe(1); // Not a duplicate — different category

      const expenses = await getMonthExpenses("2026-08");
      expect(expenses).toHaveLength(2);
    });

    it("10. returns 0 when expense is in current month (nothing to fill forward)", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-08");
      const expense = await createExpense({
        budgetId: "budget-2026-08",
        description: "Internet",
        amount: 120000,
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-08");
      expect(copies).toBe(0);
    });
  });

  describe("copyExpensesFromPreviousMonth – Full Copy", () => {
    it("copies ALL expenses (not just recurring)", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Admin (recurring)",
        amount: 500000,
        isRecurring: true,
      });
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Mercado (one-time)",
        amount: 800000,
        isRecurring: false,
      });

      const result = await copyExpensesFromPreviousMonth("2026-08");
      expect(result.copied).toBe(2);
      expect(result.alreadyHasExpenses).toBe(false);

      const newExpenses = await getMonthExpenses("2026-08");
      expect(newExpenses).toHaveLength(2);
      expect(newExpenses.every((e) => e.status === "pending")).toBe(true);
    });

    it("won't overwrite – returns alreadyHasExpenses when month has data", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Source expense",
        amount: 300000,
        isRecurring: true,
      });

      await createBudget("2026-08");
      await createExpense({
        budgetId: "budget-2026-08",
        description: "Existing expense",
        amount: 100000,
        isRecurring: false,
      });

      const result = await copyExpensesFromPreviousMonth("2026-08");
      expect(result.copied).toBe(0);
      expect(result.alreadyHasExpenses).toBe(true);
    });

    it("returns copied: 0 when previous month has no data", async () => {
      const result = await copyExpensesFromPreviousMonth("2026-08");
      expect(result.copied).toBe(0);
      expect(result.alreadyHasExpenses).toBe(false);
    });
  });
});
