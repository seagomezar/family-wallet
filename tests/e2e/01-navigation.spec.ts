import { test, expect, type Page } from '@playwright/test';
import { clearIndexedDB, waitForAppReady } from './helpers';

/**
 * Click a nav link using the desktop sidebar (visible at default 1280px viewport).
 */
async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

test.describe('First Load & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('app loads and shows dashboard with LIBRE $0', async ({ page }) => {
    await expect(page.locator('text=LIBRE')).toBeVisible();
    // formatCOP(0) produces "$ 0" (with non-breaking space)
    const libreValue = page.locator('p.text-4xl');
    await expect(libreValue).toContainText('0');
  });

  test('all 18 categories are pre-seeded', async ({ page }) => {
    await navigateTo(page, '/categorias');
    await page.waitForURL('/categorias');

    // Wait for categories to load
    await expect(page.getByRole('heading', { name: 'Categorías' })).toBeVisible();
    // Check some known categories
    await expect(page.locator('text=Créditos casa-40mm-tc')).toBeVisible();
    await expect(page.locator('text=Administraciones')).toBeVisible();
    await expect(page.locator('text=Para gastar')).toBeVisible();
    await expect(page.locator('text=Lavada de carro')).toBeVisible();
  });

  test('navigation between all 5 pages works', async ({ page }) => {
    // Dashboard (already loaded)
    await expect(page.locator('text=LIBRE')).toBeVisible();

    // Gastos
    await navigateTo(page, '/gastos');
    await page.waitForURL('/gastos');
    await expect(page.locator('text=Agregar gasto')).toBeVisible();

    // Categorías
    await navigateTo(page, '/categorias');
    await page.waitForURL('/categorias');
    await expect(page.locator('h2:has-text("Categorías")')).toBeVisible();

    // Importar
    await navigateTo(page, '/importar');
    await page.waitForURL('/importar');
    await expect(page.locator('text=Importar Extracto Bancario')).toBeVisible();

    // Ajustes
    await navigateTo(page, '/ajustes');
    await page.waitForURL('/ajustes');
    await expect(page.locator('text=Ajustes y Datos')).toBeVisible();
  });

  test('month selector (previous/next) works', async ({ page }) => {
    // Get current month display
    const monthDisplay = page.locator('header span.capitalize');
    const initialMonth = await monthDisplay.textContent();

    // Click previous month
    await page.click('button[aria-label="Mes anterior"]');
    const prevMonth = await monthDisplay.textContent();
    expect(prevMonth).not.toBe(initialMonth);

    // Click next month to go back
    await page.click('button[aria-label="Mes siguiente"]');
    const backToOriginal = await monthDisplay.textContent();
    expect(backToOriginal).toBe(initialMonth);
  });

  test('mobile bottom nav appears at small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);

    // Bottom nav (md:hidden) should be visible on mobile
    const bottomNav = page.locator('nav.md\\:hidden');
    await expect(bottomNav).toBeVisible();

    // Desktop sidebar (hidden md:block) should be hidden on mobile
    const sidebar = page.locator('nav.hidden.md\\:block');
    await expect(sidebar).toBeHidden();
  });
});
