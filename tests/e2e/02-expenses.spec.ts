import { test, expect, type Page } from '@playwright/test';
import { clearIndexedDB, waitForAppReady } from './helpers';

async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

test.describe('Expense Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('add a new expense (pick category, description, amount)', async ({ page }) => {
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    // Click "Agregar gasto"
    await page.click('button:has-text("Agregar gasto")');

    // Fill form
    await page.selectOption('#cat-select', { index: 0 });
    await page.fill('#desc-input', 'Test Administración');
    await page.fill('#amount-input', '500000');

    // Submit
    await page.click('button:has-text("Guardar")');

    // Expense should appear in list
    await expect(page.locator('text=Test Administración')).toBeVisible();
    // Amount should show formatted ($ 500.000)
    await expect(page.locator('button:has-text("500.000")')).toBeVisible();
  });

  test('mark expense as paid (toggle circle)', async ({ page }) => {
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');
    await page.click('button:has-text("Agregar gasto")');
    await page.selectOption('#cat-select', { index: 0 });
    await page.fill('#desc-input', 'Pago test');
    await page.fill('#amount-input', '100000');
    await page.click('button:has-text("Guardar")');

    await expect(page.locator('text=Pago test')).toBeVisible();

    // Toggle paid status
    await page.click('button[aria-label="Marcar pagado"]');

    // Should now show as paid
    await expect(page.locator('button[aria-label="Marcar pendiente"]')).toBeVisible();
  });

  test('edit expense amount inline', async ({ page }) => {
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');
    await page.click('button:has-text("Agregar gasto")');
    await page.selectOption('#cat-select', { index: 0 });
    await page.fill('#desc-input', 'Gasto editable');
    await page.fill('#amount-input', '200000');
    await page.click('button:has-text("Guardar")');

    await expect(page.locator('text=Gasto editable')).toBeVisible();

    // Click the amount to start editing
    await page.click('button:has-text("200.000")');

    // Fill new amount and confirm
    const amountInput = page.locator('input[type="number"]').last();
    await amountInput.fill('350000');
    await amountInput.press('Enter');

    // New amount should be displayed
    await expect(page.locator('button:has-text("350.000")')).toBeVisible();
  });

  test('delete expense', async ({ page }) => {
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');
    await page.click('button:has-text("Agregar gasto")');
    await page.selectOption('#cat-select', { index: 0 });
    await page.fill('#desc-input', 'Gasto a borrar');
    await page.fill('#amount-input', '150000');
    await page.click('button:has-text("Guardar")');

    await expect(page.locator('text=Gasto a borrar')).toBeVisible();

    // Delete
    await page.click('button[aria-label="Eliminar gasto"]');

    // Should disappear
    await expect(page.locator('text=Gasto a borrar')).not.toBeVisible();
  });

  test('filter tabs work (Todos/Pendientes/Pagados)', async ({ page }) => {
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');

    // Add first expense
    await page.click('button:has-text("Agregar gasto")');
    await page.selectOption('#cat-select', { index: 0 });
    await page.fill('#desc-input', 'Gasto pendiente');
    await page.fill('#amount-input', '100000');
    await page.click('button:has-text("Guardar")');
    await expect(page.locator('text=Gasto pendiente')).toBeVisible();

    // Add second expense
    await page.click('button:has-text("Agregar gasto")');
    await page.selectOption('#cat-select', { index: 0 });
    await page.fill('#desc-input', 'Gasto pagado');
    await page.fill('#amount-input', '200000');
    await page.click('button:has-text("Guardar")');
    await expect(page.locator('text=Gasto pagado')).toBeVisible();

    // Mark second one as paid
    const payButtons = page.locator('button[aria-label="Marcar pagado"]');
    await payButtons.last().click();

    // Filter: Todos - both visible
    await page.click('button:has-text("Todos")');
    await expect(page.locator('text=Gasto pendiente')).toBeVisible();
    await expect(page.locator('text=Gasto pagado')).toBeVisible();

    // Filter: Pendientes
    await page.click('button:has-text("Pendientes")');
    await expect(page.locator('text=Gasto pendiente')).toBeVisible();
    await expect(page.locator('text=Gasto pagado')).not.toBeVisible();

    // Filter: Pagados
    await page.click('button:has-text("Pagados")');
    await expect(page.locator('text=Gasto pagado')).toBeVisible();
    await expect(page.locator('text=Gasto pendiente')).not.toBeVisible();
  });

  test('dashboard LIBRE updates after adding expenses', async ({ page }) => {
    // Dashboard initially shows $0
    await expect(page.locator('text=LIBRE')).toBeVisible();

    // Add expense
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');
    await page.click('button:has-text("Agregar gasto")');
    await page.selectOption('#cat-select', { index: 0 });
    await page.fill('#desc-input', 'Gasto dashboard');
    await page.fill('#amount-input', '1000000');
    await page.click('button:has-text("Guardar")');
    await expect(page.locator('text=Gasto dashboard')).toBeVisible();

    // Go back to dashboard
    await navigateTo(page, '/');
    await page.waitForURL('/');

    // LIBRE should reflect the expense
    // Budget is created with totalIncome = 18,500,000 in ensureBudget()
    // LIBRE = 18,500,000 - 1,000,000 = 17,500,000
    await expect(page.locator('text=17.500.000')).toBeVisible();
  });
});
