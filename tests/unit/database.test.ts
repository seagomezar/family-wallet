import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/schema';
import { seedCategories } from '@/db/seed';

describe('Dexie Database', () => {
  beforeEach(async () => {
    // Clear all tables
    await db.budgets.clear();
    await db.categories.clear();
    await db.expenses.clear();
    await db.bankTransactions.clear();
    await db.savingsGoals.clear();
  });

  describe('seedCategories', () => {
    it('seeds 18 categories on empty database', async () => {
      await seedCategories();
      const count = await db.categories.count();
      expect(count).toBe(18);
    });

    it('does not duplicate on second call', async () => {
      await seedCategories();
      await seedCategories();
      const count = await db.categories.count();
      expect(count).toBe(18);
    });

    it('includes expected categories', async () => {
      await seedCategories();
      const cats = await db.categories.toArray();
      const names = cats.map((c) => c.name);
      expect(names).toContain('Créditos casa-40mm-tc');
      expect(names).toContain('Ahorro Alejandro');
      expect(names).toContain('Para gastar');
    });
  });

  describe('Budget CRUD', () => {
    it('creates and retrieves a budget', async () => {
      await db.budgets.add({
        id: 'budget-2026-06',
        month: '2026-06',
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const budget = await db.budgets.get('budget-2026-06');
      expect(budget).toBeDefined();
      expect(budget!.totalIncome).toBe(18500000);
      expect(budget!.month).toBe('2026-06');
    });
  });

  describe('Expense CRUD', () => {
    it('creates and queries expenses by budget', async () => {
      const budgetId = 'budget-2026-06';
      await db.expenses.bulkAdd([
        {
          id: 'exp-1',
          budgetId,
          categoryId: 'cat-creditos',
          description: 'Crédito Casa',
          amount: 5153000,
          previousAmount: 5153000,
          paymentSource: 'bancolombia',
          status: 'paid',
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'exp-2',
          budgetId,
          categoryId: 'cat-administraciones',
          description: 'Admon Laureles',
          amount: 620000,
          previousAmount: 502900,
          paymentSource: 'bancolombia',
          status: 'pending',
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const expenses = await db.expenses.where('budgetId').equals(budgetId).toArray();
      expect(expenses).toHaveLength(2);
      expect(expenses.reduce((s, e) => s + e.amount, 0)).toBe(5773000);
    });

    it('calculates LIBRE correctly', async () => {
      const totalIncome = 18500000;
      await db.expenses.bulkAdd([
        {
          id: 'exp-a',
          budgetId: 'b1',
          categoryId: 'cat-creditos',
          description: 'Test',
          amount: 9100000,
          previousAmount: 0,
          paymentSource: 'bancolombia',
          status: 'paid',
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'exp-b',
          budgetId: 'b1',
          categoryId: 'cat-para-gastar',
          description: 'Test 2',
          amount: 9485446,
          previousAmount: 0,
          paymentSource: 'bancolombia',
          status: 'paid',
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const expenses = await db.expenses.where('budgetId').equals('b1').toArray();
      const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
      const libre = totalIncome - totalExpenses;
      expect(libre).toBe(-85446);
    });
  });

  describe('Bank Transactions', () => {
    it('imports and queries by status', async () => {
      await db.bankTransactions.bulkAdd([
        {
          id: 'tx-1',
          importBatch: 'batch-1',
          transactionDate: new Date(2026, 5, 15),
          description: 'COMPRA PTO.VTA EXITO',
          reference: 'REF123',
          amount: -327900,
          office: '001',
          categoryId: 'cat-para-gastar',
          status: 'pending',
          importedAt: new Date(),
        },
        {
          id: 'tx-2',
          importBatch: 'batch-1',
          transactionDate: new Date(2026, 5, 14),
          description: 'PAGO PSE NETFLIX',
          reference: 'REF456',
          amount: -40000,
          office: '001',
          categoryId: 'cat-debitos',
          status: 'accepted',
          importedAt: new Date(),
        },
      ]);

      const pending = await db.bankTransactions.where('status').equals('pending').toArray();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.description).toBe('COMPRA PTO.VTA EXITO');
    });
  });
});
