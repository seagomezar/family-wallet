import { test, expect, type Page } from '@playwright/test';
import { clearIndexedDB, waitForAppReady } from './helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

test.describe('Bank Import (CSV/TSV)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('upload a TSV file and see parsed transactions', async ({ page }) => {
    await navigateTo(page, '/importar');
    await page.waitForURL('/importar');

    // Upload the test TSV file
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(__dirname, '../fixtures/test-bancolombia.tsv');
    await fileInput.setInputFiles(fixturePath);

    // Should move to review step with transactions visible
    await expect(page.locator('text=test-bancolombia.tsv')).toBeVisible();
    await expect(page.locator('text=6 transacciones')).toBeVisible();

    // Should display some transaction descriptions
    await expect(page.locator('text=PAGO VIVIENDA CREDITO 123')).toBeVisible();
    await expect(page.locator('text=CONSIGNACION NOMINA EMPRESA')).toBeVisible();
  });

  test('import TSV transactions successfully', async ({ page }) => {
    await navigateTo(page, '/importar');
    await page.waitForURL('/importar');

    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(__dirname, '../fixtures/test-bancolombia.tsv');
    await fileInput.setInputFiles(fixturePath);

    // Wait for review step
    await expect(page.locator('text=6 transacciones')).toBeVisible();

    // Click import button
    await page.click('button:has-text("Importar 6")');

    // Should show confirmation
    await expect(page.locator('text=¡Importación completada!')).toBeVisible();
  });
});

test.describe('Bank Import (PDF - mocked data)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('imported bank data shows in ajustes transaction count', async ({ page }) => {
    // Inject test data simulating a PDF import
    await page.evaluate(async () => {
      const { db } = await import('/src/db/schema');

      await db.bankTransactions.bulkAdd([
        {
          id: 'tx-test-1',
          importBatch: 'import-test',
          transactionDate: new Date('2026-07-05'),
          description: 'PAGO VIVIENDA CREDITO',
          reference: '',
          amount: -5150000,
          office: '0001',
          categoryId: 'cat-vivienda',
          status: 'accepted',
          importedAt: new Date(),
        },
        {
          id: 'tx-test-2',
          importBatch: 'import-test',
          transactionDate: new Date('2026-07-10'),
          description: 'TEXACO LA 80',
          reference: '',
          amount: -180000,
          office: '0500',
          categoryId: 'cat-transporte',
          status: 'accepted',
          importedAt: new Date(),
        },
      ]);
    });

    // Navigate to ajustes and verify transaction count
    await navigateTo(page, '/ajustes');
    await page.waitForURL('/ajustes');

    await expect(page.locator('text=Transacciones importadas')).toBeVisible();
    // The count "2" should appear near "Transacciones importadas"
    const txSection = page.locator('div:has(> p:text("Transacciones importadas"))');
    await expect(txSection.locator('p.text-xl')).toHaveText('2');
  });
});
