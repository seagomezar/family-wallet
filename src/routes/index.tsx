import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/schema";
import { useUIStore } from "@/stores/ui";
import { formatCOP, percentUsed } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const selectedMonth = useUIStore((s) => s.selectedMonth);

  const budget = useLiveQuery(
    () => db.budgets.where("month").equals(selectedMonth).first(),
    [selectedMonth],
  );

  const expenses = useLiveQuery(() => {
    if (!budget) return [];
    return db.expenses.where("budgetId").equals(budget.id).toArray();
  }, [budget]);

  const categories = useLiveQuery(() =>
    db.categories.orderBy("order").toArray(),
  );

  const totalIncome = budget?.totalIncome ?? 0;
  const totalExpenses = expenses?.reduce((sum, e) => sum + e.amount, 0) ?? 0;
  const libre = totalIncome - totalExpenses;

  // Group expenses by category
  const categoryBreakdown = (categories ?? [])
    .map((cat) => {
      const catExpenses = (expenses ?? []).filter(
        (e) => e.categoryId === cat.id,
      );
      const spent = catExpenses.reduce((sum, e) => sum + e.amount, 0);
      return {
        ...cat,
        spent,
        percentage: percentUsed(spent, cat.monthlyTarget),
      };
    })
    .filter((c) => c.spent > 0 || c.monthlyTarget > 0);

  return (
    <div className="space-y-6 pb-20 md:pb-6 md:pl-56">
      {/* LIBRE Hero */}
      <Card className="overflow-hidden" data-tour="libre">
        <CardContent className="p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">LIBRE</p>
            <p
              className={cn(
                "text-4xl font-bold tracking-tight md:text-5xl",
                libre >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {formatCOP(libre)}
            </p>
            <div className="mt-4 flex justify-center gap-8 text-sm">
              <div>
                <p className="text-muted-foreground">Ingresos</p>
                <p className="font-semibold text-positive">
                  {formatCOP(totalIncome)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Gastos</p>
                <p className="font-semibold text-negative">
                  {formatCOP(totalExpenses)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Categorías</p>
            <p className="text-xl font-bold">
              {categoryBreakdown.filter((c) => c.spent > 0).length}
            </p>
            <p className="text-xs text-muted-foreground">con gastos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendientes</p>
            <p className="text-xl font-bold text-warning">
              {expenses?.filter((e) => e.status === "pending").length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">por pagar</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card data-tour="categories">
        <CardHeader>
          <CardTitle className="text-lg">Gastos por Categoría</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {categoryBreakdown.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No hay gastos registrados este mes.
              <br />
              <span className="text-xs">
                Ve a &quot;Gastos&quot; para agregar.
              </span>
            </p>
          ) : (
            categoryBreakdown.map((cat) => (
              <div key={cat.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span className="font-medium">{cat.name}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatCOP(cat.spent)}{" "}
                    <span className="text-xs">
                      / {formatCOP(cat.monthlyTarget)}
                    </span>
                  </span>
                </div>
                <Progress value={cat.percentage} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
