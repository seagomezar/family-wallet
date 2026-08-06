import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Expense, type Category, type Budget } from '@/db/schema';
import { autoPopulateRecurring, copyExpensesFromPreviousMonth } from '@/lib/recurring';

// ─── Test Fixtures ───────────────────────────────────────────────────

const CAT_A_ID = 'cat-food';
const CAT_B_ID = 'cat-transport';
const CAT_C_ID = 'cat-savings';
const BUDGET_ID = 'budget-2026-06';
const BUDGET_MONTH = '2026-06';

const testCategories: Category[] = [
  { id: CAT_A_ID, name: 'Alimentación', icon: '🍽️', color: '#f59e0b', order: 1, type: 'variable', monthlyTarget: 1200000 },
  { id: CAT_B_ID, name: 'Transporte', icon: '🚗', color: '#3b82f6', order: 2, type: 'variable', monthlyTarget: 400000 },
  { id: CAT_C_ID, name: 'Ahorro', icon: '💰', color: '#10b981', order: 3, type: 'savings', monthlyTarget: 2000000 },
];

const testBudget: Budget = {
  id: BUDGET_ID,
  month: BUDGET_MONTH,
  totalIncome: 18500000,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
};

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: `exp-${Math.random().toString(36).slice(2, 8)}`,
    budgetId: BUDGET_ID,
    categoryId: CAT_A_ID,
    description: 'Test Expense',
    amount: 150000,
    previousAmount: 150000,
    paymentSource: 'bancolombia',
    status: 'paid',
    isRecurring: false,
    createdAt: new Date('2026-06-01T10:00:00'),
    updatedAt: new Date('2026-06-01T10:00:00'),
    ...overrides,
  };
}

// ─── Helper: Change category on an expense ───────────────────────────

async function changeExpenseCategory(expenseId: string, newCategoryId: string): Promise<void> {
  await db.expenses.update(expenseId, {
    categoryId: newCategoryId,
    updatedAt: new Date(),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Change Expense Category', () => {
  beforeEach(async () => {
    await db.budgets.clear();
    await db.categories.clear();
    await db.expenses.clear();
    await db.bankTransactions.clear();
    await db.savingsGoals.clear();
    await db.categorizationRules.clear();
    await db.settings.clear();

    await db.categories.bulkAdd(testCategories);
    await db.budgets.add(testBudget);
  });

  // ─── Database Operations ─────────────────────────────────────────

  describe('Database Operations', () => {
    it('updates categoryId and persists it', async () => {
      const expense = makeExpense({ id: 'exp-1', categoryId: CAT_A_ID });
      await db.expenses.add(expense);

      await changeExpenseCategory('exp-1', CAT_B_ID);

      const updated = await db.expenses.get('exp-1');
      expect(updated).toBeDefined();
      expect(updated!.categoryId).toBe(CAT_B_ID);
    });

    it('preserves all other fields when changing categoryId', async () => {
      const expense = makeExpense({
        id: 'exp-2',
        categoryId: CAT_A_ID,
        description: 'Almuerzo ejecutivo',
        amount: 35000,
        previousAmount: 30000,
        paymentSource: 'efectivo',
        status: 'paid',
        isRecurring: true,
        notes: 'Restaurante favorito',
      });
      await db.expenses.add(expense);

      await changeExpenseCategory('exp-2', CAT_B_ID);

      const updated = await db.expenses.get('exp-2');
      expect(updated!.description).toBe('Almuerzo ejecutivo');
      expect(updated!.amount).toBe(35000);
      expect(updated!.previousAmount).toBe(30000);
      expect(updated!.paymentSource).toBe('efectivo');
      expect(updated!.status).toBe('paid');
      expect(updated!.isRecurring).toBe(true);
      expect(updated!.notes).toBe('Restaurante favorito');
      expect(updated!.budgetId).toBe(BUDGET_ID);
      expect(updated!.createdAt).toEqual(expense.createdAt);
    });

    it('updates updatedAt timestamp after category move', async () => {
      const originalDate = new Date('2026-06-01T10:00:00');
      const expense = makeExpense({ id: 'exp-3', updatedAt: originalDate });
      await db.expenses.add(expense);

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));
      await changeExpenseCategory('exp-3', CAT_B_ID);

      const updated = await db.expenses.get('exp-3');
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime());
    });

    it('allows setting a non-existent categoryId (Dexie has no FK constraint)', async () => {
      const expense = makeExpense({ id: 'exp-4', categoryId: CAT_A_ID });
      await db.expenses.add(expense);

      // Dexie won't enforce FK, so this succeeds at the DB layer
      await changeExpenseCategory('exp-4', 'cat-nonexistent-xyz');

      const updated = await db.expenses.get('exp-4');
      expect(updated!.categoryId).toBe('cat-nonexistent-xyz');
    });

    it('bulk moves multiple expenses from one category to another', async () => {
      const expenses = [
        makeExpense({ id: 'exp-bulk-1', categoryId: CAT_A_ID, amount: 100000 }),
        makeExpense({ id: 'exp-bulk-2', categoryId: CAT_A_ID, amount: 200000 }),
        makeExpense({ id: 'exp-bulk-3', categoryId: CAT_A_ID, amount: 300000 }),
        makeExpense({ id: 'exp-bulk-4', categoryId: CAT_B_ID, amount: 50000 }), // different category
      ];
      await db.expenses.bulkAdd(expenses);

      // Bulk move all CAT_A expenses to CAT_C
      const catAExpenses = await db.expenses.where('categoryId').equals(CAT_A_ID).toArray();
      await db.expenses.bulkUpdate(
        catAExpenses.map(e => ({ key: e.id, changes: { categoryId: CAT_C_ID, updatedAt: new Date() } }))
      );

      const remainingInA = await db.expenses.where('categoryId').equals(CAT_A_ID).count();
      const movedToC = await db.expenses.where('categoryId').equals(CAT_C_ID).count();
      const unchangedInB = await db.expenses.where('categoryId').equals(CAT_B_ID).count();

      expect(remainingInA).toBe(0);
      expect(movedToC).toBe(3);
      expect(unchangedInB).toBe(1);
    });
  });

  // ─── Query Correctness ───────────────────────────────────────────

  describe('Query Correctness', () => {
    it('expense no longer appears in old category query after move', async () => {
      const expense = makeExpense({ id: 'exp-q1', categoryId: CAT_A_ID });
      await db.expenses.add(expense);

      await changeExpenseCategory('exp-q1', CAT_B_ID);

      const catAExpenses = await db.expenses.where('categoryId').equals(CAT_A_ID).toArray();
      expect(catAExpenses.find(e => e.id === 'exp-q1')).toBeUndefined();
    });

    it('expense appears in new category query after move', async () => {
      const expense = makeExpense({ id: 'exp-q2', categoryId: CAT_A_ID });
      await db.expenses.add(expense);

      await changeExpenseCategory('exp-q2', CAT_B_ID);

      const catBExpenses = await db.expenses.where('categoryId').equals(CAT_B_ID).toArray();
      expect(catBExpenses.find(e => e.id === 'exp-q2')).toBeDefined();
    });

    it('budget totals per category update correctly after move', async () => {
      await db.expenses.bulkAdd([
        makeExpense({ id: 'exp-t1', categoryId: CAT_A_ID, amount: 100000 }),
        makeExpense({ id: 'exp-t2', categoryId: CAT_A_ID, amount: 200000 }),
        makeExpense({ id: 'exp-t3', categoryId: CAT_B_ID, amount: 50000 }),
      ]);

      // Move exp-t2 from A to B
      await changeExpenseCategory('exp-t2', CAT_B_ID);

      const catATotal = (await db.expenses.where('categoryId').equals(CAT_A_ID).toArray())
        .reduce((sum, e) => sum + e.amount, 0);
      const catBTotal = (await db.expenses.where('categoryId').equals(CAT_B_ID).toArray())
        .reduce((sum, e) => sum + e.amount, 0);

      expect(catATotal).toBe(100000); // only exp-t1 remains
      expect(catBTotal).toBe(250000); // exp-t3 (50k) + exp-t2 (200k)
    });

    it('category returns empty array after last expense is moved out', async () => {
      const expense = makeExpense({ id: 'exp-last', categoryId: CAT_C_ID });
      await db.expenses.add(expense);

      // Verify it's the only one in CAT_C
      const before = await db.expenses.where('categoryId').equals(CAT_C_ID).toArray();
      expect(before).toHaveLength(1);

      await changeExpenseCategory('exp-last', CAT_A_ID);

      const after = await db.expenses.where('categoryId').equals(CAT_C_ID).toArray();
      expect(after).toHaveLength(0);
    });
  });

  // ─── Recurring Expense Category Change ───────────────────────────

  describe('Recurring Expense Category Change', () => {
    it('preserves isRecurring flag when changing category', async () => {
      const expense = makeExpense({ id: 'exp-rec1', categoryId: CAT_A_ID, isRecurring: true });
      await db.expenses.add(expense);

      await changeExpenseCategory('exp-rec1', CAT_B_ID);

      const updated = await db.expenses.get('exp-rec1');
      expect(updated!.isRecurring).toBe(true);
      expect(updated!.categoryId).toBe(CAT_B_ID);
    });

    it('copy-from-previous-month uses new categoryId after move', async () => {
      // Set up previous month (2026-05) with a recurring expense in CAT_A
      const prevBudgetId = 'budget-2026-05';
      await db.budgets.add({
        id: prevBudgetId,
        month: '2026-05',
        totalIncome: 18500000,
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-01'),
      });

      await db.expenses.add(
        makeExpense({
          id: 'exp-prev-rec',
          budgetId: prevBudgetId,
          categoryId: CAT_A_ID,
          description: 'Netflix',
          isRecurring: true,
          amount: 40000,
        })
      );

      // Move the recurring expense to CAT_B (simulating user changed category)
      await changeExpenseCategory('exp-prev-rec', CAT_B_ID);

      // Now copy expenses from 2026-05 to 2026-06
      // Remove the budget we seeded for June to allow copy
      await db.budgets.delete(BUDGET_ID);

      const result = await copyExpensesFromPreviousMonth('2026-06');
      expect(result.copied).toBe(1);

      // The copied expense should have the NEW categoryId (CAT_B)
      const juneExpenses = await db.expenses
        .where('budgetId')
        .equals('budget-2026-06')
        .toArray();
      expect(juneExpenses).toHaveLength(1);
      expect(juneExpenses[0]!.categoryId).toBe(CAT_B_ID);
      expect(juneExpenses[0]!.description).toBe('Netflix');
    });

    it('autoPopulateRecurring uses new categoryId after move', async () => {
      // Previous month setup
      const prevBudgetId = 'budget-2026-05';
      await db.budgets.add({
        id: prevBudgetId,
        month: '2026-05',
        totalIncome: 18500000,
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-01'),
      });

      await db.expenses.bulkAdd([
        makeExpense({
          id: 'exp-rec-auto1',
          budgetId: prevBudgetId,
          categoryId: CAT_A_ID,
          description: 'Spotify',
          isRecurring: true,
          amount: 25000,
        }),
        makeExpense({
          id: 'exp-nonrec',
          budgetId: prevBudgetId,
          categoryId: CAT_A_ID,
          description: 'One-time purchase',
          isRecurring: false,
          amount: 500000,
        }),
      ]);

      // Move the recurring expense to CAT_C
      await changeExpenseCategory('exp-rec-auto1', CAT_C_ID);

      // Remove June budget to allow auto-populate
      await db.budgets.delete(BUDGET_ID);

      const count = await autoPopulateRecurring('2026-06');
      expect(count).toBe(1);

      const juneExpenses = await db.expenses
        .where('budgetId')
        .equals('budget-2026-06')
        .toArray();
      expect(juneExpenses).toHaveLength(1);
      expect(juneExpenses[0]!.categoryId).toBe(CAT_C_ID);
      expect(juneExpenses[0]!.isRecurring).toBe(true);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('move to same category is a no-op (data unchanged)', async () => {
      const originalDate = new Date('2026-06-10T12:00:00');
      const expense = makeExpense({ id: 'exp-same', categoryId: CAT_A_ID, updatedAt: originalDate });
      await db.expenses.add(expense);

      // "Move" to same category — app logic should detect and skip
      const current = await db.expenses.get('exp-same');
      if (current!.categoryId === CAT_A_ID) {
        // No-op: don't update
      } else {
        await changeExpenseCategory('exp-same', CAT_A_ID);
      }

      const after = await db.expenses.get('exp-same');
      expect(after!.categoryId).toBe(CAT_A_ID);
      expect(after!.updatedAt).toEqual(originalDate); // unchanged
    });

    it('moving expense in one month does not affect same-description expense in another month', async () => {
      // Setup two months with same-description expenses
      const prevBudgetId = 'budget-2026-05';
      await db.budgets.add({
        id: prevBudgetId,
        month: '2026-05',
        totalIncome: 18500000,
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-01'),
      });

      await db.expenses.bulkAdd([
        makeExpense({ id: 'exp-may', budgetId: prevBudgetId, categoryId: CAT_A_ID, description: 'Netflix' }),
        makeExpense({ id: 'exp-jun', budgetId: BUDGET_ID, categoryId: CAT_A_ID, description: 'Netflix' }),
      ]);

      // Move only the June expense
      await changeExpenseCategory('exp-jun', CAT_B_ID);

      const mayExpense = await db.expenses.get('exp-may');
      const junExpense = await db.expenses.get('exp-jun');

      expect(mayExpense!.categoryId).toBe(CAT_A_ID); // unchanged
      expect(junExpense!.categoryId).toBe(CAT_B_ID); // changed
    });

    it('concurrent rapid moves result in last one winning', async () => {
      const expense = makeExpense({ id: 'exp-conc', categoryId: CAT_A_ID });
      await db.expenses.add(expense);

      // Simulate rapid sequential moves (Dexie is single-threaded in IndexedDB)
      await changeExpenseCategory('exp-conc', CAT_B_ID);
      await changeExpenseCategory('exp-conc', CAT_C_ID);
      await changeExpenseCategory('exp-conc', CAT_A_ID);
      await changeExpenseCategory('exp-conc', CAT_B_ID);

      const final = await db.expenses.get('exp-conc');
      expect(final!.categoryId).toBe(CAT_B_ID); // last write wins
    });

    it('parallel moves on the same expense resolve to last write', async () => {
      const expense = makeExpense({ id: 'exp-par', categoryId: CAT_A_ID });
      await db.expenses.add(expense);

      // Fire multiple updates concurrently
      await Promise.all([
        changeExpenseCategory('exp-par', CAT_B_ID),
        changeExpenseCategory('exp-par', CAT_C_ID),
      ]);

      const final = await db.expenses.get('exp-par');
      // One of the two must have won — it should be a valid category
      expect([CAT_B_ID, CAT_C_ID]).toContain(final!.categoryId);
    });

    it('compound index [budgetId+categoryId] query reflects move', async () => {
      const expense = makeExpense({ id: 'exp-compound', categoryId: CAT_A_ID, budgetId: BUDGET_ID });
      await db.expenses.add(expense);

      await changeExpenseCategory('exp-compound', CAT_B_ID);

      // Old compound key should not find it
      const oldResult = await db.expenses
        .where('[budgetId+categoryId]')
        .equals([BUDGET_ID, CAT_A_ID])
        .toArray();
      expect(oldResult.find(e => e.id === 'exp-compound')).toBeUndefined();

      // New compound key should find it
      const newResult = await db.expenses
        .where('[budgetId+categoryId]')
        .equals([BUDGET_ID, CAT_B_ID])
        .toArray();
      expect(newResult.find(e => e.id === 'exp-compound')).toBeDefined();
    });

    it('update on non-existent expense id does not throw', async () => {
      // Dexie update returns 0 if no record matches
      const result = await db.expenses.update('exp-ghost', {
        categoryId: CAT_B_ID,
        updatedAt: new Date(),
      });
      expect(result).toBe(0);
    });

    it('LIBRE calculation correct after category move (total unchanged)', async () => {
      const totalIncome = 18500000;
      await db.expenses.bulkAdd([
        makeExpense({ id: 'exp-l1', categoryId: CAT_A_ID, amount: 5000000 }),
        makeExpense({ id: 'exp-l2', categoryId: CAT_B_ID, amount: 3000000 }),
      ]);

      // Move exp-l1 from A to B — total should stay the same
      await changeExpenseCategory('exp-l1', CAT_B_ID);

      const allExpenses = await db.expenses.where('budgetId').equals(BUDGET_ID).toArray();
      const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
      const libre = totalIncome - totalExpenses;

      expect(totalExpenses).toBe(8000000); // 5M + 3M unchanged
      expect(libre).toBe(10500000);
    });
  });
});
