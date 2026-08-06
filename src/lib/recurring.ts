import { db, type Expense } from "@/db/schema";
import { currentMonthKey, nextMonthKey, previousMonthKey } from "@/lib/currency";

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
 * Create recurring copies of an expense in every month from sourceMonth+1
 * to the current calendar month. This is called immediately when a user
 * creates a recurring expense or toggles an existing expense to recurring.
 *
 * Duplicate prevention: skips months that already have an expense with
 * the same description + categoryId.
 *
 * Returns the number of copies created.
 */
export async function createRecurringCopies(
  expense: Expense,
  sourceMonth: string,
): Promise<number> {
  const now = currentMonthKey();

  // If the source month is >= current month, nothing to fill forward
  if (sourceMonth >= now) {
    return 0;
  }

  // Find the source budget to get income for new budgets
  const sourceBudget = await db.budgets
    .where("month")
    .equals(sourceMonth)
    .first();
  const sourceIncome = sourceBudget?.totalIncome ?? 18500000;

  let copiesCreated = 0;
  let month = nextMonthKey(sourceMonth);

  // Hard safety cap at 36 months to prevent infinite loops from bad data
  let iterations = 0;

  while (month <= now && iterations < 36) {
    iterations++;

    // Check for duplicate: same description + same categoryId in target month
    const targetBudget = await db.budgets
      .where("month")
      .equals(month)
      .first();

    let budgetId: string;

    if (targetBudget) {
      budgetId = targetBudget.id;

      // Check if an expense with same description + categoryId already exists
      const existingExpenses = await db.expenses
        .where("budgetId")
        .equals(budgetId)
        .toArray();
      const duplicate = existingExpenses.find(
        (e) =>
          e.description === expense.description &&
          e.categoryId === expense.categoryId,
      );
      if (duplicate) {
        month = nextMonthKey(month);
        continue;
      }
    } else {
      // Create budget for this month
      budgetId = `budget-${month}`;
      await db.budgets.add({
        id: budgetId,
        month,
        totalIncome: sourceIncome,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Create the expense copy
    const newExpense: Expense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      budgetId,
      categoryId: expense.categoryId,
      description: expense.description,
      amount: expense.amount,
      previousAmount: expense.amount,
      paymentSource: expense.paymentSource,
      status: "pending" as const,
      isRecurring: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.expenses.add(newExpense);
    copiesCreated++;

    month = nextMonthKey(month);
  }

  return copiesCreated;
}
