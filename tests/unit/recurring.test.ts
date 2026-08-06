import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/db/schema";
import {
  copyExpensesFromPreviousMonth,
  autoPopulateRecurring,
} from "@/lib/recurring";

describe("Recurring Expenses", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe("copyExpensesFromPreviousMonth", () => {
    it("copies all expenses from previous month to current month", async () => {
      // Setup: previous month has expenses
      await db.budgets.add({
        id: "budget-2026-05",
        month: "2026-05",
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.expenses.bulkAdd([
        {
          id: "exp-1",
          budgetId: "budget-2026-05",
          categoryId: "cat-1",
          description: "Administración",
          amount: 500000,
          previousAmount: 480000,
          paymentSource: "bancolombia",
          status: "paid",
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "exp-2",
          budgetId: "budget-2026-05",
          categoryId: "cat-2",
          description: "Netflix",
          amount: 45000,
          previousAmount: 40000,
          paymentSource: "tc-sebas",
          status: "paid",
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await copyExpensesFromPreviousMonth("2026-06");

      expect(result.copied).toBe(2);
      expect(result.alreadyHasExpenses).toBe(false);

      // Verify the copied expenses
      const newBudget = await db.budgets.where("month").equals("2026-06").first();
      expect(newBudget).toBeDefined();
      expect(newBudget!.totalIncome).toBe(18500000);

      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses).toHaveLength(2);

      // All should be pending
      expect(newExpenses.every((e) => e.status === "pending")).toBe(true);

      // previousAmount should be set from the source amount
      const admin = newExpenses.find((e) => e.description === "Administración");
      expect(admin).toBeDefined();
      expect(admin!.previousAmount).toBe(500000);
      expect(admin!.amount).toBe(500000);
      expect(admin!.isRecurring).toBe(true);
    });

    it("prevents duplicates when current month already has expenses", async () => {
      // Setup: both months have data
      await db.budgets.bulkAdd([
        {
          id: "budget-2026-05",
          month: "2026-05",
          totalIncome: 18500000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "budget-2026-06",
          month: "2026-06",
          totalIncome: 18500000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      await db.expenses.bulkAdd([
        {
          id: "exp-prev",
          budgetId: "budget-2026-05",
          categoryId: "cat-1",
          description: "Admin",
          amount: 500000,
          previousAmount: 0,
          paymentSource: "bancolombia",
          status: "paid",
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "exp-current",
          budgetId: "budget-2026-06",
          categoryId: "cat-1",
          description: "Already here",
          amount: 100000,
          previousAmount: 0,
          paymentSource: "bancolombia",
          status: "pending",
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await copyExpensesFromPreviousMonth("2026-06");

      expect(result.copied).toBe(0);
      expect(result.alreadyHasExpenses).toBe(true);

      // Verify no new expenses were added
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

  describe("autoPopulateRecurring", () => {
    it("auto-populates only recurring expenses from the previous month", async () => {
      await db.budgets.add({
        id: "budget-2026-05",
        month: "2026-05",
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.expenses.bulkAdd([
        {
          id: "exp-1",
          budgetId: "budget-2026-05",
          categoryId: "cat-1",
          description: "Administración",
          amount: 500000,
          previousAmount: 0,
          paymentSource: "bancolombia",
          status: "paid",
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "exp-2",
          budgetId: "budget-2026-05",
          categoryId: "cat-2",
          description: "Compras varias",
          amount: 200000,
          previousAmount: 0,
          paymentSource: "efectivo",
          status: "paid",
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "exp-3",
          budgetId: "budget-2026-05",
          categoryId: "cat-3",
          description: "Crédito carro",
          amount: 2000000,
          previousAmount: 0,
          paymentSource: "bancolombia",
          status: "paid",
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await autoPopulateRecurring("2026-06");

      expect(result.populated).toBe(2); // Only the 2 recurring ones
      expect(result.reason).toBe("populated");

      const newBudget = await db.budgets.where("month").equals("2026-06").first();
      expect(newBudget).toBeDefined();

      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses).toHaveLength(2);
      expect(newExpenses.every((e) => e.isRecurring)).toBe(true);
      expect(newExpenses.every((e) => e.status === "pending")).toBe(true);

      const descriptions = newExpenses.map((e) => e.description).sort();
      expect(descriptions).toEqual(["Administración", "Crédito carro"]);
    });

    it("does not populate if current month already has expenses", async () => {
      await db.budgets.bulkAdd([
        {
          id: "budget-2026-05",
          month: "2026-05",
          totalIncome: 18500000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "budget-2026-06",
          month: "2026-06",
          totalIncome: 18500000,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      await db.expenses.bulkAdd([
        {
          id: "exp-prev",
          budgetId: "budget-2026-05",
          categoryId: "cat-1",
          description: "Admin",
          amount: 500000,
          previousAmount: 0,
          paymentSource: "bancolombia",
          status: "paid",
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "exp-current",
          budgetId: "budget-2026-06",
          categoryId: "cat-1",
          description: "Already here",
          amount: 100000,
          previousAmount: 0,
          paymentSource: "bancolombia",
          status: "pending",
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await autoPopulateRecurring("2026-06");
      expect(result.populated).toBe(0);
      expect(result.reason).toBe("already_has_expenses");
    });

    it("searches up to 12 months back to find data", async () => {
      // Data is 3 months back
      await db.budgets.add({
        id: "budget-2026-03",
        month: "2026-03",
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.expenses.add({
        id: "exp-old",
        budgetId: "budget-2026-03",
        categoryId: "cat-1",
        description: "Servicios",
        amount: 300000,
        previousAmount: 0,
        paymentSource: "bancolombia",
        status: "paid",
        isRecurring: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await autoPopulateRecurring("2026-06");
      expect(result.populated).toBe(1);
      expect(result.reason).toBe("populated");

      const newBudget = await db.budgets.where("month").equals("2026-06").first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      expect(newExpenses[0]!.description).toBe("Servicios");
      expect(newExpenses[0]!.previousAmount).toBe(300000);
    });

    it("returns 0 when no recurring expenses exist", async () => {
      await db.budgets.add({
        id: "budget-2026-05",
        month: "2026-05",
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.expenses.add({
        id: "exp-1",
        budgetId: "budget-2026-05",
        categoryId: "cat-1",
        description: "One-time purchase",
        amount: 50000,
        previousAmount: 0,
        paymentSource: "efectivo",
        status: "paid",
        isRecurring: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await autoPopulateRecurring("2026-06");
      expect(result.populated).toBe(0);
      expect(result.reason).toBe("no_recurring_in_source");
    });

    it("returns no_source_data when no previous month has data", async () => {
      const result = await autoPopulateRecurring("2026-06");
      expect(result.populated).toBe(0);
      expect(result.reason).toBe("no_source_data");
    });

    it("sets previousAmount from source expense amount", async () => {
      await db.budgets.add({
        id: "budget-2026-05",
        month: "2026-05",
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.expenses.add({
        id: "exp-1",
        budgetId: "budget-2026-05",
        categoryId: "cat-1",
        description: "Internet",
        amount: 120000,
        previousAmount: 110000,
        paymentSource: "bancolombia",
        status: "paid",
        isRecurring: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await autoPopulateRecurring("2026-06");

      const newBudget = await db.budgets.where("month").equals("2026-06").first();
      const newExpenses = await db.expenses
        .where("budgetId")
        .equals(newBudget!.id)
        .toArray();
      
      // previousAmount should be the actual amount from last month, not the old previousAmount
      expect(newExpenses[0]!.previousAmount).toBe(120000);
      expect(newExpenses[0]!.amount).toBe(120000);
    });
  });
});
