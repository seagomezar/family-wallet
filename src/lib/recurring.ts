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
 * Result of auto-populating recurring expenses.
 */
export interface AutoPopulateResult {
  populated: number; // total number of expenses created across all months
  monthsFilled: number; // number of months that were filled
  reason:
    | "populated" // success: expenses were created
    | "already_has_expenses" // month has data, don't retry
    | "no_source_data" // no prior month found with data, allow retry
    | "no_recurring_in_source"; // source found but no recurring items, don't retry
}

/**
 * Check if a month has any expenses in the database.
 */
async function monthHasExpenses(month: string): Promise<boolean> {
  const budget = await db.budgets.where("month").equals(month).first();
  if (!budget) return false;
  const count = await db.expenses.where("budgetId").equals(budget.id).count();
  return count > 0;
}

/**
 * Get recurring expenses for a given month.
 */
async function getRecurringExpenses(month: string): Promise<Expense[]> {
  const budget = await db.budgets.where("month").equals(month).first();
  if (!budget) return [];
  return db.expenses
    .where("budgetId")
    .equals(budget.id)
    .filter((e) => e.isRecurring)
    .toArray();
}

/**
 * Auto-populate recurring expenses for a month, cascading forward from the
 * most recent month with recurring data. Fills all intermediate empty months
 * so that previousAmount references remain consistent.
 *
 * Cascade logic:
 * 1. If target month already has expenses → skip
 * 2. Search up to 12 months back to find the nearest month with recurring data
 * 3. Build a list of months from source+1 to target
 * 4. For each month in the list (capped at current calendar month):
 *    - If it already has expenses, use its recurring data as the new "source" for subsequent months
 *    - If empty, copy recurring from the current source, then treat it as the new source
 * 5. Return total populated count and months filled
 */
export async function autoPopulateRecurring(
  targetMonth: string,
): Promise<AutoPopulateResult> {
  // 1. If target month already has expenses, skip
  if (await monthHasExpenses(targetMonth)) {
    return { populated: 0, monthsFilled: 0, reason: "already_has_expenses" };
  }

  // 2. Find the most recent month with recurring data (up to 12 months back)
  let searchMonth = previousMonthKey(targetMonth);
  let sourceMonth: string | null = null;
  let sourceRecurring: Expense[] = [];
  let foundMonthWithData = false;
  for (let i = 0; i < 12; i++) {
    const budget = await db.budgets
      .where("month")
      .equals(searchMonth)
      .first();
    if (budget) {
      const count = await db.expenses
        .where("budgetId")
        .equals(budget.id)
        .count();
      if (count > 0) {
        foundMonthWithData = true;
        // Check if this month has recurring expenses specifically
        const recurring = await db.expenses
          .where("budgetId")
          .equals(budget.id)
          .filter((e) => e.isRecurring)
          .toArray();
        if (recurring.length > 0) {
          sourceMonth = searchMonth;
          sourceRecurring = recurring;
          break;
        }
      }
    }
    searchMonth = previousMonthKey(searchMonth);
  }

  if (!sourceMonth) {
    // Distinguish: found data but no recurring vs no data at all
    if (foundMonthWithData) {
      return { populated: 0, monthsFilled: 0, reason: "no_recurring_in_source" };
    }
    return { populated: 0, monthsFilled: 0, reason: "no_source_data" };
  }

  // 3. Build list of months from source+1 to target (inclusive)
  const monthsToFill: string[] = [];
  const now = currentMonthKey();
  let m = nextMonthKey(sourceMonth);
  for (let i = 0; i < 12; i++) {
    monthsToFill.push(m);
    if (m === targetMonth) break;
    // Don't fill months beyond the current calendar month
    if (m > now) break;
    m = nextMonthKey(m);
  }

  // 4. Cascade forward through each month
  let totalPopulated = 0;
  let monthsFilled = 0;
  let currentSourceExpenses = sourceRecurring;
  let currentSourceMonth = sourceMonth;

  for (const month of monthsToFill) {
    // If this month already has expenses, update the source reference and continue
    if (await monthHasExpenses(month)) {
      const existing = await getRecurringExpenses(month);
      if (existing.length > 0) {
        currentSourceExpenses = existing;
        currentSourceMonth = month;
      }
      continue;
    }

    // Get the source budget's income for the new budget
    const sourceBudget = await db.budgets
      .where("month")
      .equals(currentSourceMonth)
      .first();
    const income = sourceBudget?.totalIncome ?? 0;

    // Ensure budget exists for this month
    const budgetId = `budget-${month}`;
    const existingBudget = await db.budgets
      .where("month")
      .equals(month)
      .first();
    if (!existingBudget) {
      await db.budgets.add({
        id: budgetId,
        month,
        totalIncome: income,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const actualBudgetId = existingBudget?.id ?? budgetId;

    // Copy recurring expenses with previousAmount from the source
    const timestamp = new Date();
    const newExpenses: Expense[] = currentSourceExpenses.map((exp) => ({
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      budgetId: actualBudgetId,
      categoryId: exp.categoryId,
      description: exp.description,
      amount: exp.amount,
      previousAmount: exp.amount,
      paymentSource: exp.paymentSource,
      status: "pending" as const,
      isRecurring: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    await db.expenses.bulkAdd(newExpenses);
    totalPopulated += newExpenses.length;
    monthsFilled++;

    // Use the just-created expenses as the source for the next month
    currentSourceExpenses = newExpenses;
    currentSourceMonth = month;
  }

  if (totalPopulated === 0) {
    return { populated: 0, monthsFilled: 0, reason: "no_recurring_in_source" };
  }

  return { populated: totalPopulated, monthsFilled, reason: "populated" };
}
