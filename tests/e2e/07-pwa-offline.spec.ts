import { test, expect, type Page } from '@playwright/test';
import { clearIndexedDB, waitForAppReady } from './helpers';

async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

test.describe('PWA & Offline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test('app loads as a SPA with client-side routing', async ({ page }) => {
    // Verify initial load
    await expect(page.locator('text=LIBRE')).toBeVisible();

    // Navigate via client-side routing (no full page reload)
    await navigateTo(page, '/gastos');
    await expect(page.locator('text=Agregar gasto')).toBeVisible();

    // Back button should work with client routing
    await page.goBack();
    await expect(page.locator('text=LIBRE')).toBeVisible();
  });

  test('app works after blocking external requests (offline simulation)', async ({ page }) => {
    // First load the app normally
    await expect(page.locator('text=LIBRE')).toBeVisible();

    // Block all external requests (simulate offline for external resources)
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return route.continue();
      }
      return route.abort('connectionrefused');
    });

    // Navigate within the SPA (client-side routing should still work)
    await navigateTo(page, '/gastos');
    await expect(page.locator('text=Agregar gasto')).toBeVisible();

    // Navigate to another page
    await navigateTo(page, '/categorias');
    await expect(page.locator('text=Créditos casa-40mm-tc')).toBeVisible();

    // Navigate to dashboard
    await navigateTo(page, '/');
    await expect(page.locator('text=LIBRE')).toBeVisible();
  });
});
