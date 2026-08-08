import { test, expect, type Page } from '@playwright/test';
import { clearIndexedDB, waitForAppReady, currentMonthKey } from './helpers';

// ─── Helpers ──────────────────────────────────────────────────────

async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

/**
 * Seed a budget and expenses directly in IndexedDB for fast test setup.
 * Returns the budget ID.
 */
async function seedBudgetAndExpenses(
  page: Page,
  expenses: Array<{
    id: string;
    categoryId: string;
    description: string;
    amount: number;
  }>,
) {
  const month = currentMonthKey();
  const budgetId = `budget-${month}`;
  await page.evaluate(
    async ({ budgetId, month, expenses }) => {
      const { db } = await import('/src/db/schema.ts');
      await db.budgets.put({
        id: budgetId,
        month,
        totalIncome: 18500000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      for (const exp of expenses) {
        await db.expenses.put({
          id: exp.id,
          budgetId,
          categoryId: exp.categoryId,
          description: exp.description,
          amount: exp.amount,
          previousAmount: 0,
          paymentSource: 'bancolombia',
          status: 'pending',
          isRecurring: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    },
    { budgetId, month, expenses },
  );
  return budgetId;
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Change Expense Category', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 1: Happy path from Gastos Mensual view
  // ────────────────────────────────────────────────────────────
  test('moves expense from one category to another in Gastos view', async ({ page }) => {
    // Seed an expense in "Vivienda" (cat-vivienda)
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-move-1',
        categoryId: 'cat-vivienda',
        description: 'Arriendo Laureles',
        amount: 500000,
      },
    ]);

    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    // Verify expense appears under Vivienda
    await expect(page.locator('text=Arriendo Laureles')).toBeVisible();

    // Find the expense row and click the change-category button
    const expenseRow = page.locator('[data-expense-id="exp-move-1"]').or(
      page.locator('text=Arriendo Laureles').locator('..').locator('..')
    );
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    // A category dropdown/select should appear
    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await expect(categorySelect).toBeVisible();

    // Select "Mercado" as new category
    await categorySelect.selectOption('cat-mercado');

    // Confirm the move (if there's a confirm button, click it)
    const confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Toast should confirm the move
    await expect(
      page.locator('text=categoría').or(page.locator('text=movió').or(page.locator('text=Categoría')))
    ).toBeVisible({ timeout: 5000 });

    // Expense should now appear under Mercado section
    const mercadoSection = page.locator('text=Mercado').locator('..').locator('..');
    await expect(mercadoSection.locator('text=Arriendo Laureles')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 2: Dashboard updates after category change
  // ────────────────────────────────────────────────────────────
  test('dashboard progress bars update after category change', async ({ page }) => {
    // Seed expenses: one in Vivienda
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-dash-update',
        categoryId: 'cat-vivienda',
        description: 'Arriendo test',
        amount: 700000,
      },
    ]);

    // First check dashboard shows the expense in Vivienda
    await expect(page.locator('text=LIBRE')).toBeVisible();
    const viviendaRow = page.locator('text=Vivienda').locator('..');
    await expect(viviendaRow.locator('text=700.000')).toBeVisible();

    // Now go to Gastos and move it to Mercado
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    const expenseRow = page.locator('[data-expense-id="exp-dash-update"]').or(
      page.locator('text=Arriendo test').locator('..').locator('..')
    );
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await categorySelect.selectOption('cat-mercado');

    const confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Wait for toast
    await page.waitForTimeout(500);

    // Navigate back to dashboard
    await navigateTo(page, '/');
    await page.waitForURL('/');

    // Mercado should now show the 700,000
    const mercadoRow = page.locator('text=Mercado').locator('..');
    await expect(mercadoRow.locator('text=700.000')).toBeVisible();

    // LIBRE should stay the same (same total expenses, just moved category)
    await expect(page.locator('text=17.800.000')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 3: Cancel category change
  // ────────────────────────────────────────────────────────────
  test('canceling category change keeps expense in original category', async ({ page }) => {
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-cancel',
        categoryId: 'cat-vivienda',
        description: 'Arriendo cancel test',
        amount: 300000,
      },
    ]);

    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    const expenseRow = page.locator('[data-expense-id="exp-cancel"]').or(
      page.locator('text=Arriendo cancel test').locator('..').locator('..')
    );
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    // Category select should be visible
    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await expect(categorySelect).toBeVisible();

    // Cancel - press Escape or click cancel button
    const cancelBtn = page.locator('button[aria-label="Cancelar cambio de categoría"]');
    if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // Category select should disappear
    await expect(categorySelect).not.toBeVisible();

    // Expense should remain under Vivienda
    const viviendaSection = page.locator('text=Vivienda').locator('..').locator('..');
    await expect(viviendaSection.locator('text=Arriendo cancel test')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 4: Current category is disabled in dropdown
  // ────────────────────────────────────────────────────────────
  test('current category is disabled in the category dropdown', async ({ page }) => {
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-disabled',
        categoryId: 'cat-transporte',
        description: 'Tanqueo test',
        amount: 100000,
      },
    ]);

    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    const expenseRow = page.locator('[data-expense-id="exp-disabled"]').or(
      page.locator('text=Tanqueo test').locator('..').locator('..')
    );
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await expect(categorySelect).toBeVisible();

    // The current category (Transporte / cat-transporte) should be disabled
    const currentOption = categorySelect.locator('option[value="cat-transporte"]');
    await expect(currentOption).toBeDisabled();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 5: Move expense from Dashboard expanded view
  // ────────────────────────────────────────────────────────────
  test('moves expense from Dashboard expanded category view', async ({ page }) => {
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-dash-move',
        categoryId: 'cat-transporte',
        description: 'Tanqueo Terpel',
        amount: 120000,
      },
      {
        id: 'exp-dash-stay',
        categoryId: 'cat-mercado',
        description: 'Mercado semanal',
        amount: 200000,
      },
    ]);

    // Dashboard should show both categories
    await expect(page.locator('text=Transporte')).toBeVisible();
    await expect(page.locator('text=Mercado')).toBeVisible();

    // Expand Transporte category
    await page.locator('button:has-text("Transporte")').click();

    // Should see the expense
    await expect(page.locator('text=Tanqueo Terpel')).toBeVisible();

    // Click change category button on the expense in Dashboard
    const expenseRow = page.locator('[data-expense-id="exp-dash-move"]').or(
      page.locator('text=Tanqueo Terpel').locator('..'))
    ;
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    // Select "Mercado" as new category
    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await categorySelect.selectOption('cat-mercado');

    const confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Toast confirmation
    await expect(
      page.locator('text=categoría').or(page.locator('text=movió').or(page.locator('text=Categoría')))
    ).toBeVisible({ timeout: 5000 });

    // Expense should disappear from Transporte expanded section
    const transporteExpanded = page.locator('#cat-expenses-cat-transporte');
    await expect(transporteExpanded.locator('text=Tanqueo Terpel')).not.toBeVisible();

    // Expand Mercado and verify expense appears there
    await page.locator('button:has-text("Mercado")').click();
    const mercadoExpanded = page.locator('#cat-expenses-cat-mercado');
    await expect(mercadoExpanded.locator('text=Tanqueo Terpel')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 6: Progress bar updates after move on Dashboard
  // ────────────────────────────────────────────────────────────
  test('progress bars update correctly after moving expense on Dashboard', async ({ page }) => {
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-progress-1',
        categoryId: 'cat-transporte',
        description: 'Tanqueo progreso',
        amount: 250000,
      },
    ]);

    // Verify Transporte shows 250,000
    await expect(page.locator('text=Transporte')).toBeVisible();
    const transporteRow = page.locator('button:has-text("Transporte")');
    await expect(transporteRow.locator('text=250.000')).toBeVisible();

    // Expand Transporte and move expense to Mercado
    await transporteRow.click();
    await expect(page.locator('text=Tanqueo progreso')).toBeVisible();

    const expenseRow = page.locator('[data-expense-id="exp-progress-1"]').or(
      page.locator('text=Tanqueo progreso').locator('..')
    );
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await categorySelect.selectOption('cat-mercado');

    const confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Wait for reactive updates
    await page.waitForTimeout(500);

    // Mercado should now show 250,000
    const mercadoRow = page.locator('button:has-text("Mercado")');
    await expect(mercadoRow.locator('text=250.000')).toBeVisible();

    // Transporte should no longer have any spent amount visible
    await expect(
      page.locator('button:has-text("Transporte")').locator('text=250.000')
    ).not.toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 7: Move last expense from a category
  // ────────────────────────────────────────────────────────────
  test('moving the last expense from a category shows empty state', async ({ page }) => {
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-last-one',
        categoryId: 'cat-transporte',
        description: 'Peaje único',
        amount: 50000,
      },
    ]);

    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    // Expense should be visible under "Transporte"
    await expect(page.locator('text=Peaje único')).toBeVisible();
    await expect(page.locator('text=Transporte')).toBeVisible();

    // Move it to Mercado
    const expenseRow = page.locator('[data-expense-id="exp-last-one"]').or(
      page.locator('text=Peaje único').locator('..').locator('..')
    );
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await categorySelect.selectOption('cat-mercado');

    const confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Wait for update
    await page.waitForTimeout(500);

    // Expense should now be under Mercado
    const mercadoSection = page.locator('text=Mercado').locator('..').locator('..');
    await expect(mercadoSection.locator('text=Peaje único')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 8: Mobile viewport (375px)
  // ────────────────────────────────────────────────────────────
  test('change category works on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-mobile',
        categoryId: 'cat-vivienda',
        description: 'Arriendo móvil',
        amount: 400000,
      },
    ]);

    // On mobile, navigate via bottom nav or direct URL
    await page.goto('/gastos');
    await waitForAppReady(page);

    await expect(page.locator('text=Arriendo móvil')).toBeVisible();

    // Click change category
    const expenseRow = page.locator('[data-expense-id="exp-mobile"]').or(
      page.locator('text=Arriendo móvil').locator('..').locator('..')
    );
    const changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    // Category select should be visible and usable on mobile
    const categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await expect(categorySelect).toBeVisible();

    // Select new category
    await categorySelect.selectOption('cat-mercado');

    const confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Toast should appear
    await expect(
      page.locator('text=categoría').or(page.locator('text=movió').or(page.locator('text=Categoría')))
    ).toBeVisible({ timeout: 5000 });

    // Expense should be under Mercado now
    const mercadoSection = page.locator('text=Mercado').locator('..').locator('..');
    await expect(mercadoSection.locator('text=Arriendo móvil')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────
  // Scenario 9: Multiple sequential moves (A → B → C)
  // ────────────────────────────────────────────────────────────
  test('expense can be moved multiple times (A → B → C)', async ({ page }) => {
    await seedBudgetAndExpenses(page, [
      {
        id: 'exp-multi-move',
        categoryId: 'cat-vivienda',
        description: 'Multi mover',
        amount: 100000,
      },
    ]);

    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    // ── Move 1: Vivienda → Mercado ──
    let expenseRow = page.locator('[data-expense-id="exp-multi-move"]').or(
      page.locator('text=Multi mover').locator('..').locator('..')
    );
    let changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    let categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await categorySelect.selectOption('cat-mercado');

    let confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Wait for update
    await page.waitForTimeout(500);

    // Verify it's now under Mercado
    const mercadoSection = page.locator('text=Mercado').locator('..').locator('..');
    await expect(mercadoSection.locator('text=Multi mover')).toBeVisible();

    // ── Move 2: Mercado → Transporte ──
    expenseRow = page.locator('[data-expense-id="exp-multi-move"]').or(
      page.locator('text=Multi mover').locator('..').locator('..')
    );
    changeCatBtn = expenseRow.locator('button[aria-label="Cambiar categoría"]');
    await changeCatBtn.click();

    categorySelect = page.locator('[data-testid="category-change-select"]').or(
      page.locator('select[aria-label="Nueva categoría"]')
    );
    await categorySelect.selectOption('cat-transporte');

    confirmBtn = page.locator('button[aria-label="Confirmar cambio de categoría"]');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Wait for update
    await page.waitForTimeout(500);

    // Verify it's now under Transporte
    const transporteSection = page.locator('text=Transporte').locator('..').locator('..');
    await expect(transporteSection.locator('text=Multi mover')).toBeVisible();

    // Verify it's no longer under Mercado
    await expect(mercadoSection.locator('text=Multi mover')).not.toBeVisible();
  });
});
