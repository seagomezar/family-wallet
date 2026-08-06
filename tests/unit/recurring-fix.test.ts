import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db, type Expense } from "@/db/schema";
import {
  copyExpensesFromPreviousMonth,
  autoPopulateRecurring,
} from "@/lib/recurring";

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

describe("Recurring Expenses – Auto-Populate Fix", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe("autoPopulateRecurring – Core Logic", () => {
    it("1. copies recurring expense from month A to month B with status pending", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Internet Hogar",
        amount: 120000,
        isRecurring: true,
      });

      const count = await autoPopulateRecurring("2026-08");
      expect(count).toBe(1);

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      expect(newBudget).toBeDefined();

      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses).toHaveLength(1);
      expect(newExpenses[0]!.description).toBe("Internet Hogar");
      expect(newExpenses[0]!.status).toBe("pending");
    });

    it("2. does NOT copy non-recurring expenses", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Compra supermercado",
        amount: 250000,
        isRecurring: false,
      });

      const count = await autoPopulateRecurring("2026-08");
      expect(count).toBe(0);

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      // No budget should be created since nothing was copied
      expect(newBudget).toBeUndefined();
    });

    it("3. mixed expenses: only recurring ones get copied", async () => {
      await createBudget("2026-07");
      // 3 recurring
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Admin",
        isRecurring: true,
        amount: 500000,
      });
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Internet",
        isRecurring: true,
        amount: 120000,
      });
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Netflix",
        isRecurring: true,
        amount: 45000,
      });
      // 2 non-recurring
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Mercado",
        isRecurring: false,
        amount: 800000,
      });
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Uber",
        isRecurring: false,
        amount: 30000,
      });

      const count = await autoPopulateRecurring("2026-08");
      expect(count).toBe(3);

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses).toHaveLength(3);

      const descriptions = newExpenses.map((e) => e.description).sort();
      expect(descriptions).toEqual(["Admin", "Internet", "Netflix"]);
    });

    it("4. previousAmount is set to source expense's amount", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Crédito Carro",
        amount: 2350000,
        previousAmount: 2300000, // old previousAmount (from 2 months ago)
        isRecurring: true,
      });

      await autoPopulateRecurring("2026-08");

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();

      // Should use the source's amount, not its previousAmount
      expect(newExpenses[0]!.previousAmount).toBe(2350000);
      expect(newExpenses[0]!.amount).toBe(2350000);
    });

    it("5. copied expenses always start as 'pending' even if source was 'paid'", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Servicios",
        amount: 300000,
        status: "paid",
        isRecurring: true,
      });

      await autoPopulateRecurring("2026-08");

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();

      expect(newExpenses[0]!.status).toBe("pending");
    });

    it("6. isRecurring is preserved as true on copied expenses", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Seguro",
        amount: 180000,
        isRecurring: true,
      });

      await autoPopulateRecurring("2026-08");

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();

      expect(newExpenses[0]!.isRecurring).toBe(true);
    });

    it("7. calling autoPopulate twice for same month does not duplicate", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Gas",
        amount: 90000,
        isRecurring: true,
      });

      const firstCount = await autoPopulateRecurring("2026-08");
      expect(firstCount).toBe(1);

      const secondCount = await autoPopulateRecurring("2026-08");
      expect(secondCount).toBe(0);

      // Verify only 1 expense exists
      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses).toHaveLength(1);
    });

    it("8. skips months that already have expenses", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Admin",
        amount: 500000,
        isRecurring: true,
      });

      // Create month B with an existing expense
      await createBudget("2026-08");
      await createExpense({
        budgetId: "budget-2026-08",
        description: "Already here",
        amount: 100000,
        isRecurring: false,
      });

      const count = await autoPopulateRecurring("2026-08");
      expect(count).toBe(0);

      // Verify no new expenses were added
      const expenses = await db.expenses
        .where("budgetId")
        .equals("budget-2026-08")
        .toArray();
      expect(expenses).toHaveLength(1);
      expect(expenses[0]!.description).toBe("Already here");
    });

    it("9. searches back multiple months to find recurring expenses", async () => {
      // Data is 3 months back (2026-04), nothing in 2026-05 or 2026-06
      await createBudget("2026-04");
      await createExpense({
        budgetId: "budget-2026-04",
        description: "Seguro de vida",
        amount: 250000,
        isRecurring: true,
      });

      const count = await autoPopulateRecurring("2026-07");
      expect(count).toBe(1);

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-07")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses[0]!.description).toBe("Seguro de vida");
      expect(newExpenses[0]!.previousAmount).toBe(250000);
    });

    it("10. recurring expenses from different categories all copy correctly", async () => {
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Admin",
        categoryId: "cat-vivienda",
        amount: 500000,
        isRecurring: true,
      });
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Netflix",
        categoryId: "cat-entretenimiento",
        amount: 45000,
        isRecurring: true,
      });
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Crédito Carro",
        categoryId: "cat-transporte",
        amount: 2000000,
        isRecurring: true,
      });

      const count = await autoPopulateRecurring("2026-08");
      expect(count).toBe(3);

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();

      const catIds = newExpenses.map((e) => e.categoryId).sort();
      expect(catIds).toEqual([
        "cat-entretenimiento",
        "cat-transporte",
        "cat-vivienda",
      ]);

      // Verify amounts match source
      const admin = newExpenses.find((e) => e.description === "Admin");
      expect(admin!.amount).toBe(500000);
      expect(admin!.categoryId).toBe("cat-vivienda");

      const netflix = newExpenses.find((e) => e.description === "Netflix");
      expect(netflix!.amount).toBe(45000);
      expect(netflix!.categoryId).toBe("cat-entretenimiento");
    });
  });

  describe("copyExpensesFromPreviousMonth – Full Copy", () => {
    it("11. copies ALL expenses (not just recurring)", async () => {
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

      const newBudget = await db.budgets
        .where("month")
        .equals("2026-08")
        .first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses).toHaveLength(2);

      const descriptions = newExpenses.map((e) => e.description).sort();
      expect(descriptions).toEqual([
        "Admin (recurring)",
        "Mercado (one-time)",
      ]);

      // All should be pending
      expect(newExpenses.every((e) => e.status === "pending")).toBe(true);
    });

    it("12. won't overwrite – returns alreadyHasExpenses when month has data", async () => {
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

      // Verify nothing was added
      const expenses = await db.expenses
        .where("budgetId")
        .equals("budget-2026-08")
        .toArray();
      expect(expenses).toHaveLength(1);
      expect(expenses[0]!.description).toBe("Existing expense");
    });

    it("13. returns copied: 0 when previous month has no data", async () => {
      // No budget exists for 2026-07
      const result = await copyExpensesFromPreviousMonth("2026-08");
      expect(result.copied).toBe(0);
      expect(result.alreadyHasExpenses).toBe(false);
    });
  });
});
