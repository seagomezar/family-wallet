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

// Helper to create an expense and return it
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

describe("Recurring Expenses", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe("copyExpensesFromPreviousMonth", () => {
    it("copies all expenses from previous month to current month", async () => {
      await createBudget("2026-05");
      await createExpense({
        budgetId: "budget-2026-05",
        categoryId: "cat-1",
        description: "Administración",
        amount: 500000,
        previousAmount: 480000,
        paymentSource: "bancolombia",
        status: "paid",
        isRecurring: true,
      });
      await createExpense({
        budgetId: "budget-2026-05",
        categoryId: "cat-2",
        description: "Netflix",
        amount: 45000,
        previousAmount: 40000,
        paymentSource: "tc-sebas",
        status: "paid",
        isRecurring: false,
      });

      const result = await copyExpensesFromPreviousMonth("2026-06");

      expect(result.copied).toBe(2);
      expect(result.alreadyHasExpenses).toBe(false);

      const newBudget = await db.budgets.where("month").equals("2026-06").first();
      expect(newBudget).toBeDefined();
      expect(newBudget!.totalIncome).toBe(18500000);

      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses).toHaveLength(2);
      expect(newExpenses.every((e) => e.status === "pending")).toBe(true);

      const admin = newExpenses.find((e) => e.description === "Administración");
      expect(admin).toBeDefined();
      expect(admin!.previousAmount).toBe(500000);
      expect(admin!.amount).toBe(500000);
      expect(admin!.isRecurring).toBe(true);
    });

    it("prevents duplicates when current month already has expenses", async () => {
      await createBudget("2026-05");
      await createBudget("2026-06");
      await createExpense({
        budgetId: "budget-2026-05",
        categoryId: "cat-1",
        description: "Admin",
        amount: 500000,
        isRecurring: true,
      });
      await createExpense({
        budgetId: "budget-2026-06",
        categoryId: "cat-1",
        description: "Already here",
        amount: 100000,
        isRecurring: false,
      });

      const result = await copyExpensesFromPreviousMonth("2026-06");
      expect(result.copied).toBe(0);
      expect(result.alreadyHasExpenses).toBe(true);

      const expenses = await db.expenses
        .where("budgetId")
        .equals("budget-2026-06")
        .toArray();
      expect(expenses).toHaveLength(1);
    });

    it("returns 0 when previous month has no data", async () => {
      const result = await copyExpensesFromPreviousMonth("2026-06");
      expect(result.copied).toBe(0);
      expect(result.alreadyHasExpenses).toBe(false);
    });
  });

  describe("createRecurringCopies", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("creates copies from source month+1 to current month", async () => {
      // Mock current month to 2026-08
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-05");
      const expense = await createExpense({
        budgetId: "budget-2026-05",
        description: "Plan Claro",
        amount: 90000,
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-05");

      // Jun, Jul, Aug = 3 months
      expect(copies).toBe(3);

      for (const month of ["2026-06", "2026-07", "2026-08"]) {
        const expenses = await getMonthExpenses(month);
        expect(expenses).toHaveLength(1);
        expect(expenses[0]!.description).toBe("Plan Claro");
        expect(expenses[0]!.amount).toBe(90000);
        expect(expenses[0]!.previousAmount).toBe(90000);
        expect(expenses[0]!.isRecurring).toBe(true);
        expect(expenses[0]!.status).toBe("pending");
      }
    });

    it("returns 0 when source month is current month", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-06");

      await createBudget("2026-06");
      const expense = await createExpense({
        budgetId: "budget-2026-06",
        description: "Netflix",
        amount: 45000,
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-06");
      expect(copies).toBe(0);
    });

    it("skips months that already have a duplicate (same description + categoryId)", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-05");
      const expense = await createExpense({
        budgetId: "budget-2026-05",
        description: "Internet",
        amount: 120000,
        categoryId: "cat-1",
        isRecurring: true,
      });

      // Pre-create a matching expense in July
      await createBudget("2026-07");
      await createExpense({
        budgetId: "budget-2026-07",
        description: "Internet",
        amount: 130000, // different amount, but same desc+cat
        categoryId: "cat-1",
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-05");

      // Jun (created), Jul (skipped - duplicate), Aug (created) = 2
      expect(copies).toBe(2);

      // July still has original amount
      const julExpenses = await getMonthExpenses("2026-07");
      expect(julExpenses).toHaveLength(1);
      expect(julExpenses[0]!.amount).toBe(130000);
    });

    it("does not skip if different categoryId even with same description", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-07");

      await createBudget("2026-05");
      const expense = await createExpense({
        budgetId: "budget-2026-05",
        description: "Seguro",
        amount: 180000,
        categoryId: "cat-A",
        isRecurring: true,
      });

      // Pre-create expense with same desc but DIFFERENT category in June
      await createBudget("2026-06");
      await createExpense({
        budgetId: "budget-2026-06",
        description: "Seguro",
        amount: 180000,
        categoryId: "cat-B",
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2026-05");

      // Jun (cat-A doesn't match cat-B, so created) + Jul = 2
      expect(copies).toBe(2);

      // June now has both
      const junExpenses = await getMonthExpenses("2026-06");
      expect(junExpenses).toHaveLength(2);
    });

    it("auto-creates budgets for intermediate months with source income", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-05", 20000000);
      const expense = await createExpense({
        budgetId: "budget-2026-05",
        description: "Admin",
        amount: 500000,
        isRecurring: true,
      });

      await createRecurringCopies(expense, "2026-05");

      // All created budgets should have source income
      for (const month of ["2026-06", "2026-07", "2026-08"]) {
        const budget = await db.budgets.where("month").equals(month).first();
        expect(budget).toBeDefined();
        expect(budget!.totalIncome).toBe(20000000);
      }
    });

    it("calling twice does not duplicate (idempotent)", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2026-06");
      const expense = await createExpense({
        budgetId: "budget-2026-06",
        description: "Gas",
        amount: 90000,
        isRecurring: true,
      });

      const first = await createRecurringCopies(expense, "2026-06");
      expect(first).toBe(2); // Jul + Aug

      const second = await createRecurringCopies(expense, "2026-06");
      expect(second).toBe(0); // all skipped

      // Verify no duplicates
      const julExpenses = await getMonthExpenses("2026-07");
      expect(julExpenses).toHaveLength(1);
      const augExpenses = await getMonthExpenses("2026-08");
      expect(augExpenses).toHaveLength(1);
    });

    it("captain scenario: October 2025 recurring → copies to August 2026", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-08");

      await createBudget("2025-10");
      const expense = await createExpense({
        budgetId: "budget-2025-10",
        description: "Admin Edificio",
        amount: 500000,
        isRecurring: true,
      });

      const copies = await createRecurringCopies(expense, "2025-10");

      // Nov 2025 through Aug 2026 = 10 months
      expect(copies).toBe(10);

      // Verify a few specific months
      for (const month of ["2025-11", "2025-12", "2026-01", "2026-05", "2026-08"]) {
        const expenses = await getMonthExpenses(month);
        expect(expenses).toHaveLength(1);
        expect(expenses[0]!.description).toBe("Admin Edificio");
        expect(expenses[0]!.amount).toBe(500000);
        expect(expenses[0]!.status).toBe("pending");
      }
    });

    it("previousAmount is set to the source expense's amount", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-07");

      await createBudget("2026-05");
      const expense = await createExpense({
        budgetId: "budget-2026-05",
        description: "Crédito Carro",
        amount: 2350000,
        previousAmount: 2300000,
        isRecurring: true,
      });

      await createRecurringCopies(expense, "2026-05");

      const junExpenses = await getMonthExpenses("2026-06");
      expect(junExpenses[0]!.previousAmount).toBe(2350000);
      expect(junExpenses[0]!.amount).toBe(2350000);

      const julExpenses = await getMonthExpenses("2026-07");
      expect(julExpenses[0]!.previousAmount).toBe(2350000);
    });

    it("copies preserve paymentSource and categoryId from the source", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-07");

      await createBudget("2026-05");
      const expense = await createExpense({
        budgetId: "budget-2026-05",
        description: "Netflix",
        amount: 45000,
        categoryId: "cat-entretenimiento",
        paymentSource: "tc-sebas",
        isRecurring: true,
      });

      await createRecurringCopies(expense, "2026-05");

      const junExpenses = await getMonthExpenses("2026-06");
      expect(junExpenses[0]!.categoryId).toBe("cat-entretenimiento");
      expect(junExpenses[0]!.paymentSource).toBe("tc-sebas");
    });

    it("works with existing budgets that have other expenses", async () => {
      vi.spyOn(currency, "currentMonthKey").mockReturnValue("2026-07");

      await createBudget("2026-05");
      const expense = await createExpense({
        budgetId: "budget-2026-05",
        description: "Admin",
        amount: 500000,
        categoryId: "cat-vivienda",
        isRecurring: true,
      });

      // June already has a different expense
      await createBudget("2026-06");
      await createExpense({
        budgetId: "budget-2026-06",
        description: "Mercado",
        amount: 800000,
        categoryId: "cat-mercado",
        isRecurring: false,
      });

      const copies = await createRecurringCopies(expense, "2026-05");
      expect(copies).toBe(2); // Jun + Jul

      // June should now have both expenses
      const junExpenses = await getMonthExpenses("2026-06");
      expect(junExpenses).toHaveLength(2);
      const descriptions = junExpenses.map((e) => e.description).sort();
      expect(descriptions).toEqual(["Admin", "Mercado"]);
    });
  });
});
