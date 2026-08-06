import { test, expect } from '@playwright/test';
import { clearIndexedDB, waitForAppReady } from './helpers';

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('mobile layout at 375px width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);

    // Bottom nav (md:hidden) should be visible on mobile
    const bottomNav = page.locator('nav.md\\:hidden');
    await expect(bottomNav).toBeVisible();

    // All 5 mobile nav items should be present
    await expect(bottomNav.locator('a')).toHaveCount(5);

    // Desktop sidebar should be hidden
    const sidebar = page.locator('nav.hidden.md\\:block');
    await expect(sidebar).toBeHidden();

    // Dashboard LIBRE card should still be visible
    await expect(page.locator('text=LIBRE')).toBeVisible();
  });

  test('desktop layout at 1200px width', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);

    // Desktop sidebar should be visible
    const sidebar = page.locator('nav.hidden.md\\:block');
    await expect(sidebar).toBeVisible();

    // Sidebar should have all 5 links
    await expect(sidebar.locator('a')).toHaveCount(5);

    // Bottom nav should be hidden on desktop
    const bottomNav = page.locator('nav.md\\:hidden');
    await expect(bottomNav).toBeHidden();
  });

  test('dashboard correct at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Core content visible
    await expect(page.locator('text=LIBRE')).toBeVisible();
    await expect(page.locator('text=Ingresos')).toBeVisible();
    await expect(page.getByRole('main').getByText('Gastos', { exact: true })).toBeVisible();

    // Stats cards visible
    await expect(page.locator('text=Pendientes')).toBeVisible();
  });

  test('dashboard correct at desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });

    // Core content visible
    await expect(page.locator('text=LIBRE')).toBeVisible();
    await expect(page.locator('text=Ingresos')).toBeVisible();
    await expect(page.getByRole('main').getByText('Gastos', { exact: true })).toBeVisible();

    // Sidebar navigation visible
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Gastos Mensual')).toBeVisible();
    await expect(page.locator('text=Importar Banco')).toBeVisible();
  });
});
