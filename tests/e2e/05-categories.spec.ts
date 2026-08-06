import { test, expect, type Page } from '@playwright/test';
import { clearIndexedDB, waitForAppReady } from './helpers';

async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

test.describe('Categories', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('view all 18 pre-loaded categories', async ({ page }) => {
    await navigateTo(page, '/categorias');
    await page.waitForURL('/categorias');

    // Check that known categories are visible
    await expect(page.locator('text=Créditos casa-40mm-tc')).toBeVisible();
    await expect(page.locator('text=Administraciones')).toBeVisible();
    await expect(page.locator('text=Para gastar')).toBeVisible();
    await expect(page.locator('text=Lavada de carro')).toBeVisible();

    // Count delete buttons (each category has one) to verify 18 categories
    const deleteButtons = page.locator('button[aria-label="Eliminar"]');
    await expect(deleteButtons).toHaveCount(18);
  });

  test('add a new category', async ({ page }) => {
    await navigateTo(page, '/categorias');
    await page.waitForURL('/categorias');

    // Click "Nueva" button
    await page.click('button:has-text("Nueva")');

    // Fill the form
    await page.fill('#name-input', 'Mascota');
    await page.fill('#icon-input', '🐕');
    await page.fill('#target-input', '150000');

    // Save
    await page.click('button:has-text("Guardar")');

    // New category should appear
    await expect(page.locator('text=Mascota')).toBeVisible();

    // Should now have 19 categories
    const deleteButtons = page.locator('button[aria-label="Eliminar"]');
    await expect(deleteButtons).toHaveCount(19);
  });

  test('edit category name', async ({ page }) => {
    await navigateTo(page, '/categorias');
    await page.waitForURL('/categorias');

    // Click edit on the first category
    const editButtons = page.locator('button[aria-label="Editar"]');
    await editButtons.first().click();

    // Should show edit form
    await expect(page.locator('text=Editar Categoría')).toBeVisible();

    // Change the name
    await page.fill('#name-input', 'Créditos Modificados');
    await page.click('button:has-text("Guardar")');

    // Updated name should appear
    await expect(page.locator('text=Créditos Modificados')).toBeVisible();
  });

  test('delete a category (without expenses)', async ({ page }) => {
    await navigateTo(page, '/categorias');
    await page.waitForURL('/categorias');

    // Count initial categories
    const deleteButtons = page.locator('button[aria-label="Eliminar"]');
    await expect(deleteButtons).toHaveCount(18);

    // Delete the last category (Lavada de carro)
    await deleteButtons.last().click();

    // Should have 17 now
    await expect(deleteButtons).toHaveCount(17);
    await expect(page.locator('text=Lavada de carro')).not.toBeVisible();
  });
});
