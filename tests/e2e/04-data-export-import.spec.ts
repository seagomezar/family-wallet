import { test, expect, type Page } from '@playwright/test';
import { clearIndexedDB, waitForAppReady } from './helpers';

async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

test.describe('Data Export/Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('export JSON produces a downloadable file', async ({ page }) => {
    await navigateTo(page, '/ajustes');
    await page.waitForURL('/ajustes');

    // Wait for data to load
    await expect(page.locator('text=Exportar Respaldo')).toBeVisible();

    // Listen for download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Exportar JSON")');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/family-wallet-backup-.*\.json/);
  });

  test('import JSON restores all data', async ({ page }) => {
    await navigateTo(page, '/ajustes');
    await page.waitForURL('/ajustes');

    // Create a test JSON backup with known data
    const testBackup = {
      version: 1,
      exportedAt: '2026-06-15T12:00:00.000Z',
      budgets: [
        {
          id: 'budget-2026-06',
          month: '2026-06',
          totalIncome: 18500000,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      categories: [
        {
          id: 'cat-test',
          name: 'Test Import Category',
          icon: '🧪',
          color: '#ff0000',
          order: 1,
          type: 'variable',
          monthlyTarget: 500000,
        },
      ],
      expenses: [
        {
          id: 'exp-test',
          budgetId: 'budget-2026-06',
          categoryId: 'cat-test',
          description: 'Imported Expense',
          amount: 250000,
          previousAmount: 0,
          paymentSource: 'debito',
          status: 'paid',
          isRecurring: false,
          createdAt: '2026-06-10T00:00:00.000Z',
          updatedAt: '2026-06-10T00:00:00.000Z',
        },
      ],
      bankTransactions: [],
      savingsGoals: [],
    };

    // Upload the backup file
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    const buffer = Buffer.from(JSON.stringify(testBackup));
    await fileInput.setInputFiles({
      name: 'test-backup.json',
      mimeType: 'application/json',
      buffer,
    });

    // Should show success message
    await expect(page.locator('text=Respaldo restaurado exitosamente')).toBeVisible();

    // Verify data was imported - categories count should be 1
    const catSection = page.locator('div:has(> p:text("Categorías"))').first();
    await expect(catSection.locator('p.text-xl')).toHaveText('1');
  });

  test('"Borrar todos los datos" clears everything', async ({ page }) => {
    await navigateTo(page, '/ajustes');
    await page.waitForURL('/ajustes');

    // Wait for categories to be shown (18 pre-seeded)
    const catSection = page.locator('div:has(> p:text("Categorías"))').first();
    await expect(catSection.locator('p.text-xl')).toHaveText('18');

    // Accept the confirm dialog
    page.on('dialog', (dialog) => dialog.accept());

    // Click delete all
    await page.click('button:has-text("Borrar todos los datos")');

    // After clearing, categories should be 0
    await expect(catSection.locator('p.text-xl')).toHaveText('0');
  });
});
