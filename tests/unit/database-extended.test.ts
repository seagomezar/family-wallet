import { describe, it, expect, beforeEach } from 'vitest';
import { db, BilleteraDB } from '@/db/schema';
import { seedCategories } from '@/db/seed';

describe('Database Schema & Operations - Extended', () => {
  beforeEach(async () => {
    await db.budgets.clear();
    await db.categories.clear();
    await db.expenses.clear();
    await db.bankTransactions.clear();
    await db.savingsGoals.clear();
    await db.categorizationRules.clear();
  });

  describe('Schema validation', () => {
    it('db is an instance of BilleteraDB', () => {
      expect(db).toBeInstanceOf(BilleteraDB);
    });

    it('has all expected tables', () => {
      expect(db.budgets).toBeDefined();
      expect(db.categories).toBeDefined();
      expect(db.expenses).toBeDefined();
      expect(db.bankTransactions).toBeDefined();
      expect(db.savingsGoals).toBeDefined();
      expect(db.categorizationRules).toBeDefined();
    });

    it('db version is 2', () => {
      expect(db.verno).toBe(2);
    });
  });

  describe('seedCategories - extended', () => {
    it('each category has all required fields', async () => {
      await seedCategories();
      const cats = await db.categories.toArray();

      for (const cat of cats) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
        expect(cat.color).toMatch(/^#[0-9a-f]{6}$/);
        expect(cat.order).toBeGreaterThan(0);
        expect(['fixed', 'variable', 'savings', 'debt']).toContain(cat.type);
        expect(cat.monthlyTarget).toBeGreaterThanOrEqual(0);
      }
    });

    it('categories are in correct order (1-18)', async () => {
      await seedCategories();
      const cats = await db.categories.orderBy('order').toArray();
      for (let i = 0; i < cats.length; i++) {
        expect(cats[i]!.order).toBe(i + 1);
      }
    });

    it('monthly targets sum to known total', async () => {
      await seedCategories();
      const cats = await db.categories.toArray();
      const total = cats.reduce((sum, c) => sum + c.monthlyTarget, 0);
      // Approximate expected total from seed data
      expect(total).toBeGreaterThan(15000000);
      expect(total).toBeLessThan(20000000);
    });

    it('category IDs follow cat-* pattern', async () => {
      await seedCategories();
      const cats = await db.categories.toArray();
      for (const cat of cats) {
        expect(cat.id).toMatch(/^cat-/);
      }
    });

    it('has correct category types distribution', async () => {
      await seedCategories();
      const cats = await db.categories.toArray();
      const types = cats.map((c) => c.type);
      expect(types.filter((t) => t === 'fixed').length).toBeGreaterThan(0);
      expect(types.filter((t) => t === 'variable').length).toBeGreaterThan(0);
      expect(types.filter((t) => t === 'savings').length).toBeGreaterThan(0);
      expect(types.filter((t) => t === 'debt').length).toBeGreaterThan(0);
    });
  });

  describe('Budget CRUD - extended', () => {
    it('updates a budget', async () => {
      await db.budgets.add({
        id: 'b-1',
        month: '2026-06',
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.budgets.update('b-1', { totalIncome: 19000000 });
      const updated = await db.budgets.get('b-1');
      expect(updated!.totalIncome).toBe(19000000);
    });

    it('deletes a budget', async () => {
      await db.budgets.add({
        id: 'b-del',
        month: '2026-05',
        totalIncome: 15000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.budgets.delete('b-del');
      const result = await db.budgets.get('b-del');
      expect(result).toBeUndefined();
    });

    it('queries budget by month index', async () => {
      await db.budgets.bulkAdd([
        { id: 'b-may', month: '2026-05', totalIncome: 18000000, createdAt: new Date(), updatedAt: new Date() },
        { id: 'b-jun', month: '2026-06', totalIncome: 18500000, createdAt: new Date(), updatedAt: new Date() },
        { id: 'b-jul', month: '2026-07', totalIncome: 19000000, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const june = await db.budgets.where('month').equals('2026-06').first();
      expect(june!.id).toBe('b-jun');
      expect(june!.totalIncome).toBe(18500000);
    });

    it('lists all budgets', async () => {
      await db.budgets.bulkAdd([
        { id: 'b-1', month: '2026-05', totalIncome: 18000000, createdAt: new Date(), updatedAt: new Date() },
        { id: 'b-2', month: '2026-06', totalIncome: 18500000, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const all = await db.budgets.toArray();
      expect(all).toHaveLength(2);
    });
  });

  describe('Expense CRUD - extended', () => {
    it('queries expenses by categoryId', async () => {
      await db.expenses.bulkAdd([
        {
          id: 'e-1', budgetId: 'b1', categoryId: 'cat-creditos',
          description: 'Crédito', amount: 5153000, previousAmount: 5153000,
          paymentSource: 'bancolombia', status: 'paid', isRecurring: true,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'e-2', budgetId: 'b1', categoryId: 'cat-servicios',
          description: 'EPM', amount: 200000, previousAmount: 180000,
          paymentSource: 'bancolombia', status: 'paid', isRecurring: true,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'e-3', budgetId: 'b1', categoryId: 'cat-creditos',
          description: 'TC', amount: 500000, previousAmount: 500000,
          paymentSource: 'tc-sebas', status: 'pending', isRecurring: true,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const creditos = await db.expenses.where('categoryId').equals('cat-creditos').toArray();
      expect(creditos).toHaveLength(2);
    });

    it('queries by compound index [budgetId+categoryId]', async () => {
      await db.expenses.bulkAdd([
        {
          id: 'e-1', budgetId: 'b-jun', categoryId: 'cat-creditos',
          description: 'A', amount: 1000, previousAmount: 0,
          paymentSource: 'bancolombia', status: 'paid', isRecurring: false,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'e-2', budgetId: 'b-jun', categoryId: 'cat-servicios',
          description: 'B', amount: 2000, previousAmount: 0,
          paymentSource: 'bancolombia', status: 'paid', isRecurring: false,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'e-3', budgetId: 'b-jul', categoryId: 'cat-creditos',
          description: 'C', amount: 3000, previousAmount: 0,
          paymentSource: 'bancolombia', status: 'paid', isRecurring: false,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const results = await db.expenses
        .where('[budgetId+categoryId]')
        .equals(['b-jun', 'cat-creditos'])
        .toArray();
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('e-1');
    });

    it('filters by status', async () => {
      await db.expenses.bulkAdd([
        {
          id: 'e-paid', budgetId: 'b1', categoryId: 'cat-creditos',
          description: 'Paid', amount: 1000, previousAmount: 0,
          paymentSource: 'bancolombia', status: 'paid', isRecurring: false,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'e-pending', budgetId: 'b1', categoryId: 'cat-creditos',
          description: 'Pending', amount: 2000, previousAmount: 0,
          paymentSource: 'bancolombia', status: 'pending', isRecurring: false,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const pending = await db.expenses.where('status').equals('pending').toArray();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('e-pending');
    });

    it('updates expense amount', async () => {
      await db.expenses.add({
        id: 'e-upd', budgetId: 'b1', categoryId: 'cat-servicios',
        description: 'EPM', amount: 200000, previousAmount: 180000,
        paymentSource: 'bancolombia', status: 'pending', isRecurring: true,
        createdAt: new Date(), updatedAt: new Date(),
      });

      await db.expenses.update('e-upd', { amount: 250000, status: 'paid' });
      const updated = await db.expenses.get('e-upd');
      expect(updated!.amount).toBe(250000);
      expect(updated!.status).toBe('paid');
    });

    it('deletes expense', async () => {
      await db.expenses.add({
        id: 'e-del', budgetId: 'b1', categoryId: 'cat-servicios',
        description: 'Delete me', amount: 100, previousAmount: 0,
        paymentSource: 'efectivo', status: 'paid', isRecurring: false,
        createdAt: new Date(), updatedAt: new Date(),
      });

      await db.expenses.delete('e-del');
      expect(await db.expenses.get('e-del')).toBeUndefined();
    });
  });

  describe('BankTransactions - extended', () => {
    it('queries by importBatch', async () => {
      await db.bankTransactions.bulkAdd([
        {
          id: 'tx-a', importBatch: 'batch-1', transactionDate: new Date(2026, 4, 15),
          description: 'TX A', reference: 'R1', amount: -100000, office: '001',
          status: 'pending', importedAt: new Date(),
        },
        {
          id: 'tx-b', importBatch: 'batch-1', transactionDate: new Date(2026, 4, 16),
          description: 'TX B', reference: 'R2', amount: -200000, office: '001',
          status: 'pending', importedAt: new Date(),
        },
        {
          id: 'tx-c', importBatch: 'batch-2', transactionDate: new Date(2026, 5, 1),
          description: 'TX C', reference: 'R3', amount: -50000, office: '002',
          status: 'pending', importedAt: new Date(),
        },
      ]);

      const batch1 = await db.bankTransactions.where('importBatch').equals('batch-1').toArray();
      expect(batch1).toHaveLength(2);
    });

    it('updates transaction status', async () => {
      await db.bankTransactions.add({
        id: 'tx-upd', importBatch: 'b1', transactionDate: new Date(),
        description: 'TEST', reference: 'R', amount: -5000, office: '001',
        status: 'pending', importedAt: new Date(),
      });

      await db.bankTransactions.update('tx-upd', { status: 'accepted', categoryId: 'cat-para-gastar' });
      const updated = await db.bankTransactions.get('tx-upd');
      expect(updated!.status).toBe('accepted');
      expect(updated!.categoryId).toBe('cat-para-gastar');
    });

    it('rejects transaction', async () => {
      await db.bankTransactions.add({
        id: 'tx-rej', importBatch: 'b1', transactionDate: new Date(),
        description: 'REJECT', reference: 'R', amount: -1000, office: '001',
        status: 'pending', importedAt: new Date(),
      });

      await db.bankTransactions.update('tx-rej', { status: 'rejected' });
      const rejected = await db.bankTransactions.get('tx-rej');
      expect(rejected!.status).toBe('rejected');
    });

    it('queries by categoryId', async () => {
      await db.bankTransactions.bulkAdd([
        {
          id: 'tx-1', importBatch: 'b1', transactionDate: new Date(),
          description: 'A', reference: 'R1', amount: -100, office: '001',
          categoryId: 'cat-para-gastar', status: 'accepted', importedAt: new Date(),
        },
        {
          id: 'tx-2', importBatch: 'b1', transactionDate: new Date(),
          description: 'B', reference: 'R2', amount: -200, office: '001',
          categoryId: 'cat-tanqueadas', status: 'accepted', importedAt: new Date(),
        },
      ]);

      const gastar = await db.bankTransactions.where('categoryId').equals('cat-para-gastar').toArray();
      expect(gastar).toHaveLength(1);
    });
  });

  describe('SavingsGoals', () => {
    it('creates and retrieves a savings goal', async () => {
      await db.savingsGoals.add({
        id: 'sg-1',
        name: 'Fondo de emergencia',
        targetAmount: 20000000,
        currentAmount: 5000000,
        monthlyContribution: 500000,
        icon: '🎯',
        color: '#10b981',
      });

      const goal = await db.savingsGoals.get('sg-1');
      expect(goal).toBeDefined();
      expect(goal!.name).toBe('Fondo de emergencia');
      expect(goal!.targetAmount).toBe(20000000);
    });

    it('updates current amount', async () => {
      await db.savingsGoals.add({
        id: 'sg-2',
        name: 'Viaje',
        targetAmount: 5000000,
        currentAmount: 1000000,
        monthlyContribution: 300000,
        icon: '✈️',
        color: '#0ea5e9',
      });

      await db.savingsGoals.update('sg-2', { currentAmount: 1300000 });
      const updated = await db.savingsGoals.get('sg-2');
      expect(updated!.currentAmount).toBe(1300000);
    });

    it('deletes a savings goal', async () => {
      await db.savingsGoals.add({
        id: 'sg-del',
        name: 'Delete me',
        targetAmount: 1000000,
        currentAmount: 0,
        monthlyContribution: 100000,
        icon: '🗑️',
        color: '#ef4444',
      });

      await db.savingsGoals.delete('sg-del');
      expect(await db.savingsGoals.get('sg-del')).toBeUndefined();
    });
  });

  describe('CategorizationRules table', () => {
    it('stores and retrieves a rule', async () => {
      await db.categorizationRules.add({
        id: 'rule-1',
        pattern: 'EXITO',
        categoryId: 'cat-para-gastar',
        source: 'user',
        isRegex: false,
        matchCount: 0,
        createdAt: new Date(),
      });

      const rule = await db.categorizationRules.get('rule-1');
      expect(rule).toBeDefined();
      expect(rule!.pattern).toBe('EXITO');
    });

    it('queries by source', async () => {
      await db.categorizationRules.bulkAdd([
        { id: 'r-1', pattern: 'A', categoryId: 'cat-1', source: 'user', isRegex: false, matchCount: 0, createdAt: new Date() },
        { id: 'r-2', pattern: 'B', categoryId: 'cat-2', source: 'builtin', isRegex: false, matchCount: 5, createdAt: new Date() },
        { id: 'r-3', pattern: 'C', categoryId: 'cat-1', source: 'user', isRegex: true, matchCount: 2, createdAt: new Date() },
      ]);

      const userRules = await db.categorizationRules.where('source').equals('user').toArray();
      expect(userRules).toHaveLength(2);
    });

    it('updates matchCount', async () => {
      await db.categorizationRules.add({
        id: 'r-count',
        pattern: 'TEST',
        categoryId: 'cat-1',
        source: 'user',
        isRegex: false,
        matchCount: 0,
        createdAt: new Date(),
      });

      await db.categorizationRules.update('r-count', { matchCount: 10 });
      const updated = await db.categorizationRules.get('r-count');
      expect(updated!.matchCount).toBe(10);
    });
  });

  describe('Export/Import round-trip', () => {
    it('exports and re-imports data identically', async () => {
      // Seed some data
      await seedCategories();
      await db.budgets.add({
        id: 'b-export', month: '2026-06', totalIncome: 18500000,
        createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-06-01'),
      });
      await db.expenses.add({
        id: 'e-export', budgetId: 'b-export', categoryId: 'cat-creditos',
        description: 'Test export', amount: 5000000, previousAmount: 5000000,
        paymentSource: 'bancolombia', status: 'paid', isRecurring: true,
        createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-06-01'),
      });

      // Export
      const exportData = {
        categories: await db.categories.toArray(),
        budgets: await db.budgets.toArray(),
        expenses: await db.expenses.toArray(),
        bankTransactions: await db.bankTransactions.toArray(),
        savingsGoals: await db.savingsGoals.toArray(),
        categorizationRules: await db.categorizationRules.toArray(),
      };

      const json = JSON.stringify(exportData);

      // Clear all tables
      await db.budgets.clear();
      await db.categories.clear();
      await db.expenses.clear();
      await db.bankTransactions.clear();
      await db.savingsGoals.clear();
      await db.categorizationRules.clear();

      // Verify empty
      expect(await db.categories.count()).toBe(0);
      expect(await db.budgets.count()).toBe(0);

      // Re-import
      const importData = JSON.parse(json);
      await db.categories.bulkAdd(importData.categories);
      await db.budgets.bulkAdd(importData.budgets);
      await db.expenses.bulkAdd(importData.expenses);
      await db.bankTransactions.bulkAdd(importData.bankTransactions);
      await db.savingsGoals.bulkAdd(importData.savingsGoals);
      await db.categorizationRules.bulkAdd(importData.categorizationRules);

      // Verify
      expect(await db.categories.count()).toBe(18);
      expect(await db.budgets.count()).toBe(1);
      expect(await db.expenses.count()).toBe(1);

      const budget = await db.budgets.get('b-export');
      expect(budget!.totalIncome).toBe(18500000);

      const expense = await db.expenses.get('e-export');
      expect(expense!.amount).toBe(5000000);
    });
  });
});
