import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, useRef, useEffect } from "react";
import { db, type Expense, type ExpenseStatus } from "@/db/schema";
import { useUIStore } from "@/stores/ui";
import { formatCOP, percentUsed } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ChevronRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CategoryChangeDropdown } from "@/components/category-change-dropdown";
import type { Category } from "@/db/schema";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const selectedMonth = useUIStore((s) => s.selectedMonth);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [categoryToast, setCategoryToast] = useState<string | null>(null);

  function toggleCategory(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleToggleStatus(expense: Expense) {
    const newStatus: ExpenseStatus =
      expense.status === "paid" ? "pending" : "paid";
    await db.expenses.update(expense.id, {
      status: newStatus,
      paidDate: newStatus === "paid" ? new Date() : undefined,
      updatedAt: new Date(),
    });
  }

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
      {/* Category change toast */}
      {categoryToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-sm font-medium animate-in fade-in slide-in-from-top-2">
          {categoryToast}
        </div>
      )}

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
            categoryBreakdown.map((cat) => {
              const colorClass = cat.monthlyTarget > 0
                ? cat.percentage > 100
                  ? 'text-destructive'
                  : cat.percentage > 75
                    ? 'text-warning'
                    : 'text-positive'
                : 'text-foreground';
              const isExpanded = expandedIds.has(cat.id);
              const catExpenses = (expenses ?? []).filter(
                (e) => e.categoryId === cat.id,
              );
              return (
              <div key={cat.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className="flex w-full items-center justify-between text-sm rounded-md p-2 -m-2 hover:bg-muted/50 transition-colors cursor-pointer min-h-[44px]"
                  aria-expanded={isExpanded}
                  aria-controls={`cat-expenses-${cat.id}`}
                >
                  <span className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span className="font-medium">{cat.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("tabular-nums", colorClass)}>
                      <span className="font-semibold">{formatCOP(cat.spent)}</span>
                      {cat.monthlyTarget > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {" "}/{" "}{formatCOP(cat.monthlyTarget)}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        isExpanded && "rotate-90",
                      )}
                    />
                  </span>
                </button>
                {cat.monthlyTarget > 0 && (
                  <Progress value={cat.percentage} />
                )}
                <CollapsibleExpenses
                  id={`cat-expenses-${cat.id}`}
                  isExpanded={isExpanded}
                  expenses={catExpenses}
                  categories={categories ?? []}
                  onToggleStatus={handleToggleStatus}
                  onCategoryChanged={(name) => {
                    setCategoryToast(`Gasto movido a ${name}`);
                    setTimeout(() => setCategoryToast(null), 3000);
                  }}
                />
              </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Animated collapsible panel showing expenses within a category */
function CollapsibleExpenses({
  id,
  isExpanded,
  expenses,
  categories,
  onToggleStatus,
  onCategoryChanged,
}: {
  id: string;
  isExpanded: boolean;
  expenses: Expense[];
  categories: Category[];
  onToggleStatus: (expense: Expense) => void;
  onCategoryChanged?: (newCategoryName: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!contentRef.current) return;
    if (isExpanded) {
      setHeight(contentRef.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [isExpanded, expenses.length]);

  return (
    <div
      id={id}
      role="region"
      className="overflow-hidden transition-[height] duration-200 ease-in-out"
      style={{ height: height !== undefined ? `${height}px` : isExpanded ? 'auto' : '0px' }}
      aria-hidden={!isExpanded}
    >
      <div ref={contentRef} className="pt-2 pb-1 pl-4 border-l-2 border-muted ml-2">
        {expenses.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Sin gastos este mes
          </p>
        ) : (
          <div className="space-y-1.5">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center gap-2 text-sm min-h-[36px]"
              >
                {/* Status toggle circle */}
                <button
                  onClick={() => onToggleStatus(expense)}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    expense.status === "paid"
                      ? "border-positive bg-positive text-white"
                      : expense.status === "overdue"
                        ? "border-negative"
                        : "border-muted-foreground",
                  )}
                  aria-label={
                    expense.status === "paid"
                      ? "Marcar pendiente"
                      : "Marcar pagado"
                  }
                >
                  {expense.status === "paid" && <Check className="h-2.5 w-2.5" />}
                </button>

                {/* Description */}
                <span className="flex-1 truncate text-foreground/80">
                  {expense.isRecurring && (
                    <span className="mr-1" title="Gasto recurrente">🔁</span>
                  )}
                  {expense.description}
                </span>

                {/* Amount */}
                <span className="tabular-nums font-medium shrink-0">
                  {formatCOP(expense.amount)}
                </span>

                {/* Change category */}
                <CategoryChangeDropdown
                  expenseId={expense.id}
                  currentCategoryId={expense.categoryId}
                  categories={categories}
                  compact
                  onChanged={onCategoryChanged}
                />

                {/* Status badge */}
                <Badge
                  variant={
                    expense.status === "paid"
                      ? "success"
                      : expense.status === "overdue"
                        ? "destructive"
                        : "warning"
                  }
                  className="text-[10px] px-1.5 py-0"
                >
                  {expense.status === "paid"
                    ? "Pagado"
                    : expense.status === "overdue"
                      ? "Vencido"
                      : "Pendiente"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
