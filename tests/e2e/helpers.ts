import { type Page } from '@playwright/test';

/**
 * Clear all IndexedDB databases to ensure test isolation.
 * Must be called after page.goto() so we have a page context.
 */
export async function clearIndexedDB(page: Page) {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
}

/**
 * Wait for the app to finish seeding categories (Dexie on('populate') runs on first open).
 */
export async function waitForAppReady(page: Page) {
  // Wait for the main content area to be visible
  await page.waitForSelector('header', { timeout: 10000 });
}

/**
 * Get the current month key in YYYY-MM format.
 */
export function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
