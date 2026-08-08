import { db, type Category } from "./schema";

/**
 * Pre-seed a few generic example categories so new users
 * understand the concept and can add their own.
 * Only seeds if categories table is empty.
 */
export async function seedCategories(): Promise<void> {
  const count = await db.categories.count();
  if (count > 0) return;

  const categories: Category[] = [
    {
      id: "cat-vivienda",
      name: "Vivienda",
      icon: "🏠",
      color: "#dc2626",
      order: 1,
      type: "fixed",
      monthlyTarget: 0,
    },
    {
      id: "cat-mercado",
      name: "Mercado",
      icon: "🛒",
      color: "#059669",
      order: 2,
      type: "variable",
      monthlyTarget: 0,
    },
    {
      id: "cat-transporte",
      name: "Transporte",
      icon: "🚌",
      color: "#0891b2",
      order: 3,
      type: "variable",
      monthlyTarget: 0,
    },
  ];

  await db.categories.bulkAdd(categories);
}
