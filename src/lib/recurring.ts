import { db, type Expense } from "@/db/schema";
import { previousMonthKey } from "@/lib/currency";

/**
 * Copy all expenses from the previous month to the current month.
 * Returns the number of copied expenses, or -1 if current month already has expenses.
 */
export async function copyExpensesFromPreviousMonth(
  currentMonth: string,
): Promise<{ copied: number; alreadyHasExpenses: boolean }> {
  // Check if current month already has a budget with expenses
  const currentBudget = await db.budgets
    .where("month")
    .equals(currentMonth)
    .first();
  if (currentBudget) {
    const existingExpenses = await db.expenses
      .where("budgetId")
      .equals(currentBudget.id)
      .count();
    if (existingExpenses > 0) {
      return { copied: 0, alreadyHasExpenses: true };
    }
  }

  // Find previous month's budget and expenses
  const prevMonth = previousMonthKey(currentMonth);
  const prevBudget = await db.budgets
    .where("month")
    .equals(prevMonth)
    .first();
  if (!prevBudget) {
    return { copied: 0, alreadyHasExpenses: false };
  }

  const prevExpenses = await db.expenses
    .where("budgetId")
    .equals(prevBudget.id)
    .toArray();

  if (prevExpenses.length === 0) {
    return { copied: 0, alreadyHasExpenses: false };
  }

  // Ensure current month has a budget
  const budgetId = currentBudget?.id ?? `budget-${currentMonth}`;
  if (!currentBudget) {
    await db.budgets.add({
      id: budgetId,
      month: currentMonth,
      totalIncome: prevBudget.totalIncome,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Copy expenses
  const now = new Date();
  const newExpenses: Expense[] = prevExpenses.map((exp) => ({
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    budgetId,
    categoryId: exp.categoryId,
    description: exp.description,
    amount: exp.amount,
    previousAmount: exp.amount, // reference from previous month
    paymentSource: exp.paymentSource,
    status: "pending" as const,
    isRecurring: exp.isRecurring,
    createdAt: now,
    updatedAt: now,
  }));

  await db.expenses.bulkAdd(newExpenses);
  return { copied: newExpenses.length, alreadyHasExpenses: false };
}

/**
 * Auto-populate recurring expenses for a month that has no data yet.
 * Only copies expenses marked as isRecurring from the most recent month with data.
 * Returns number of recurring items populated.
 */
export async function autoPopulateRecurring(
  currentMonth: string,
): Promise<number> {
  // Check if current month already has expenses
  const currentBudget = await db.budgets
    .where("month")
    .equals(currentMonth)
    .first();
  if (currentBudget) {
    const existingCount = await db.expenses
      .where("budgetId")
      .equals(currentBudget.id)
      .count();
    if (existingCount > 0) {
      return 0;
    }
  }

  // Find the most recent month that has data (up to 12 months back)
  let searchMonth = previousMonthKey(currentMonth);
  let sourceBudget = null;
  for (let i = 0; i < 12; i++) {
    sourceBudget = await db.budgets
      .where("month")
      .equals(searchMonth)
      .first();
    if (sourceBudget) {
      const count = await db.expenses
        .where("budgetId")
        .equals(sourceBudget.id)
        .count();
      if (count > 0) break;
      sourceBudget = null;
    }
    searchMonth = previousMonthKey(searchMonth);
  }

  if (!sourceBudget) return 0;

  // Get only recurring expenses from the source month
  const recurringExpenses = await db.expenses
    .where("budgetId")
    .equals(sourceBudget.id)
    .filter((e) => e.isRecurring)
    .toArray();

  if (recurringExpenses.length === 0) return 0;

  // Ensure budget exists for current month
  const budgetId = currentBudget?.id ?? `budget-${currentMonth}`;
  if (!currentBudget) {
    await db.budgets.add({
      id: budgetId,
      month: currentMonth,
      totalIncome: sourceBudget.totalIncome,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Copy recurring expenses
  const now = new Date();
  const newExpenses: Expense[] = recurringExpenses.map((exp) => ({
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    budgetId,
    categoryId: exp.categoryId,
    description: exp.description,
    amount: exp.amount,
    previousAmount: exp.amount,
    paymentSource: exp.paymentSource,
    status: "pending" as const,
    isRecurring: true,
    createdAt: now,
    updatedAt: now,
  }));

  await db.expenses.bulkAdd(newExpenses);
  return newExpenses.length;
}
