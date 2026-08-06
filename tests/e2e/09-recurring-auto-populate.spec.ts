import { test, expect, type Page } from "@playwright/test";
import { clearIndexedDB, waitForAppReady } from "./helpers";

/**
 * E2E tests for recurring expenses auto-populate feature.
 *
 * These tests verify that:
 * - Recurring expenses automatically copy to new months
 * - Non-recurring expenses do NOT copy
 * - Toast notification appears
 * - No duplicates on revisit
 * - Manual "Copiar mes anterior" copies everything
 */

async function navigateTo(page: Page, href: string) {
  await page.locator(`nav.hidden.md\\:block a[href="${href}"]`).click();
}

/**
 * Dismiss the tour overlay if it appears (mark as seen in settings).
 */
async function dismissTour(page: Page) {
  await page.evaluate(async () => {
    const { db } = await import("/src/db/schema.ts");
    await db.settings.put({ key: "hasSeenTour", value: true });
  });
}

/**
 * Seed a budget + expenses directly via page.evaluate for speed.
 * Uses a month relative to today.
 */
async function seedExpenses(
  page: Page,
  monthOffset: number, // -1 = previous month, 0 = current, etc.
  expenses: Array<{
    description: string;
    amount: number;
    isRecurring: boolean;
    categoryId?: string;
    status?: string;
  }>,
) {
  await page.evaluate(
    async ({ monthOffset, expenses }) => {
      const { db } = await import("/src/db/schema.ts");

      // Calculate month key
      const now = new Date();
      now.setMonth(now.getMonth() + monthOffset);
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const month = `${y}-${m}`;
      const budgetId = `budget-${month}`;

      // Create budget
      const existingBudget = await db.budgets.get(budgetId);
      if (!existingBudget) {
        await db.budgets.add({
          id: budgetId,
          month,
          totalIncome: 18500000,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Get first category as default
      const categories = await db.categories.toArray();
      const defaultCatId = categories[0]?.id ?? "cat-1";

      // Add expenses
      for (const exp of expenses) {
        await db.expenses.add({
          id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          budgetId,
          categoryId: exp.categoryId ?? defaultCatId,
          description: exp.description,
          amount: exp.amount,
          previousAmount: 0,
          paymentSource: "bancolombia",
          status: exp.status ?? "paid",
          isRecurring: exp.isRecurring,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    },
    { monthOffset, expenses },
  );
}

/**
 * Navigate to the previous month using the month selector.
 */
async function goToPreviousMonth(page: Page) {
  await page.click('button[aria-label="Mes anterior"]');
}

/**
 * Navigate to the next month using the month selector.
 */
async function goToNextMonth(page: Page) {
  await page.click('button[aria-label="Mes siguiente"]');
}

test.describe("Recurring Expenses Auto-Populate", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearIndexedDB(page);
    await page.reload();
    await waitForAppReady(page);
    // Dismiss the guided tour so it doesn't block interactions
    await dismissTour(page);
  });

  test("1. recurring expense in previous month appears in current month (via Dashboard)", async ({
    page,
  }) => {
    // Seed recurring expense in previous month, then reload
    // We must seed BEFORE reload so auto-populate finds data
    await seedExpenses(page, -1, [
      { description: "Internet Hogar E2E", amount: 120000, isRecurring: true },
    ]);

    // Reload to trigger auto-populate on current month
    await page.reload();
    await waitForAppReady(page);

    // Navigate to Gastos to verify
    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    await expect(page.locator("text=Internet Hogar E2E")).toBeVisible({
      timeout: 5000,
    });
  });

  test("2. recurring expense appears after navigating from Gastos page", async ({
    page,
  }) => {
    // Seed recurring in previous month
    await seedExpenses(page, -1, [
      { description: "Netflix Recurrente", amount: 45000, isRecurring: true },
    ]);

    // Reload to trigger auto-populate
    await page.reload();
    await waitForAppReady(page);

    // Navigate to gastos — recurring should be there
    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    await expect(page.locator("text=Netflix Recurrente")).toBeVisible({
      timeout: 5000,
    });
  });

  test("3. toast notification shows count of copied recurring expenses", async ({
    page,
  }) => {
    // Seed 2 recurring expenses in previous month
    await seedExpenses(page, -1, [
      { description: "Admin Recurrente", amount: 500000, isRecurring: true },
      { description: "Gym Recurrente", amount: 180000, isRecurring: true },
    ]);

    // Reload to trigger auto-populate
    await page.reload();
    await waitForAppReady(page);

    // Check toast appears with correct count
    await expect(
      page.locator("text=Se copiaron 2 gastos recurrentes"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("4. auto-populated expense shows as pending status", async ({
    page,
  }) => {
    // Seed a paid recurring expense
    await seedExpenses(page, -1, [
      {
        description: "Seguro Pendiente",
        amount: 200000,
        isRecurring: true,
        status: "paid",
      },
    ]);

    await page.reload();
    await waitForAppReady(page);

    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    // Wait for the expense to appear
    await expect(page.locator("text=Seguro Pendiente")).toBeVisible({
      timeout: 5000,
    });

    // Should have the "Marcar pagado" button (pending status)
    await expect(
      page.locator('button[aria-label="Marcar pagado"]'),
    ).toBeVisible();
  });

  test("5. non-recurring expense stays behind – only recurring appears in current month", async ({
    page,
  }) => {
    // Seed both types
    await seedExpenses(page, -1, [
      { description: "Recurring: Admin", amount: 500000, isRecurring: true },
      {
        description: "NonRecurring: Uber",
        amount: 30000,
        isRecurring: false,
      },
    ]);

    await page.reload();
    await waitForAppReady(page);

    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    // Recurring should appear
    await expect(page.locator("text=Recurring: Admin")).toBeVisible({
      timeout: 5000,
    });

    // Non-recurring should NOT appear
    await expect(page.locator("text=NonRecurring: Uber")).not.toBeVisible();
  });

  test("6. recurring cascades – present in prev month AND current month", async ({
    page,
  }) => {
    // Seed recurring in previous month
    await seedExpenses(page, -1, [
      { description: "Cascade Test", amount: 100000, isRecurring: true },
    ]);

    // Reload triggers auto-populate for current month
    await page.reload();
    await waitForAppReady(page);

    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    // Verify it appeared in current month
    await expect(page.locator("text=Cascade Test")).toBeVisible({
      timeout: 5000,
    });

    // Navigate to prev month — original should be there too
    await goToPreviousMonth(page);
    await page.waitForTimeout(500);
    await expect(page.locator("text=Cascade Test")).toBeVisible({
      timeout: 5000,
    });

    // Come back to current month — copy still there
    await goToNextMonth(page);
    await page.waitForTimeout(500);
    await expect(page.locator("text=Cascade Test")).toBeVisible({
      timeout: 5000,
    });
  });

  test("7. manual 'Copiar mes anterior' copies ALL expenses (not just recurring)", async ({
    page,
  }) => {
    // Seed ONLY non-recurring expenses in the previous month.
    // Auto-populate only copies recurring, so it will find nothing.
    // Then "Copiar mes anterior" should copy everything (including non-recurring).
    await seedExpenses(page, -1, [
      {
        description: "Manual Copy OneTime",
        amount: 200000,
        isRecurring: false,
      },
      {
        description: "Manual Copy Also OneTime",
        amount: 100000,
        isRecurring: false,
      },
    ]);

    // Reload - auto-populate fires but finds no recurring expenses → copies 0
    await page.reload();
    await waitForAppReady(page);

    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    // Wait for auto-populate to finish (should copy nothing since no recurring)
    await page.waitForTimeout(1000);

    // Neither should be visible yet (auto-populate only copies recurring)
    await expect(page.locator("text=Manual Copy OneTime")).not.toBeVisible();
    await expect(page.locator("text=Manual Copy Also OneTime")).not.toBeVisible();

    // Click "Copiar mes anterior" button — this copies ALL expenses
    await page.click('button:has-text("Copiar mes anterior")');

    // Both non-recurring expenses should now appear
    await expect(page.locator("text=Manual Copy OneTime")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=Manual Copy Also OneTime")).toBeVisible({
      timeout: 5000,
    });
  });

  test("8. no duplicate on revisit – navigate away and back", async ({
    page,
  }) => {
    // Seed recurring
    await seedExpenses(page, -1, [
      { description: "NoDup Test", amount: 150000, isRecurring: true },
    ]);

    await page.reload();
    await waitForAppReady(page);

    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    // Wait for auto-populate
    await expect(page.locator("text=NoDup Test")).toBeVisible({
      timeout: 5000,
    });

    // Count how many times it appears
    const countBefore = await page.locator("text=NoDup Test").count();
    expect(countBefore).toBe(1);

    // Navigate away
    await navigateTo(page, "/");
    await page.waitForURL("/");

    // Come back
    await navigateTo(page, "/gastos");
    await page.waitForURL("/gastos");

    // Still only 1
    await expect(page.locator("text=NoDup Test")).toBeVisible({
      timeout: 5000,
    });
    const countAfter = await page.locator("text=NoDup Test").count();
    expect(countAfter).toBe(1);
  });
});
