import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Expense, type ExpenseStatus } from "@/db/schema";
import { useUIStore } from "@/stores/ui";
import { formatCOP, formatDelta } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Check, X } from "lucide-react";

export const Route = createFileRoute("/gastos")({
  component: GastosPage,
});

type FilterTab = "all" | "pending" | "paid";

function GastosPage() {
  const selectedMonth = useUIStore((s) => s.selectedMonth);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  const filteredExpenses = (expenses ?? []).filter((e) => {
    if (filter === "pending") return e.status === "pending";
    if (filter === "paid") return e.status === "paid";
    return true;
  });

  // Group by category
  const grouped = (categories ?? [])
    .map((cat) => ({
      category: cat,
      expenses: filteredExpenses.filter((e) => e.categoryId === cat.id),
    }))
    .filter((g) => g.expenses.length > 0);

  async function ensureBudget(): Promise<string> {
    if (budget) return budget.id;
    const id = `budget-${selectedMonth}`;
    await db.budgets.add({
      id,
      month: selectedMonth,
      totalIncome: 18500000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  async function handleAddExpense(data: {
    categoryId: string;
    description: string;
    amount: number;
  }) {
    const budgetId = await ensureBudget();
    const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.expenses.add({
      id,
      budgetId,
      categoryId: data.categoryId,
      description: data.description,
      amount: data.amount,
      previousAmount: 0,
      paymentSource: "bancolombia",
      status: "pending",
      isRecurring: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setShowAddForm(false);
  }

  async function handleDeleteExpense(id: string) {
    await db.expenses.delete(id);
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

  async function handleSaveEdit(id: string) {
    const amount = parseInt(editValue, 10);
    if (!isNaN(amount) && amount >= 0) {
      await db.expenses.update(id, { amount, updatedAt: new Date() });
    }
    setEditingId(null);
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id);
    setEditValue(expense.amount.toString());
  }

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4 pb-20 md:pb-6 md:pl-56" data-tour="expenses">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "pending", "paid"] as const).map((tab) => (
          <Button
            key={tab}
            variant={filter === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(tab)}
          >
            {tab === "all"
              ? "Todos"
              : tab === "pending"
                ? "Pendientes"
                : "Pagados"}
          </Button>
        ))}
        <div className="ml-auto text-sm text-muted-foreground self-center">
          Total: {formatCOP(totalExpenses)}
        </div>
      </div>

      {/* Expense groups */}
      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No hay gastos registrados.</p>
            <Button className="mt-4" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4" /> Agregar primer gasto
            </Button>
          </CardContent>
        </Card>
      ) : (
        grouped.map(({ category, expenses: catExpenses }) => (
          <Card key={category.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span>{category.icon}</span>
                {category.name}
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {formatCOP(catExpenses.reduce((s, e) => s + e.amount, 0))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {catExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center gap-2 rounded-md border p-2"
                >
                  {/* Status toggle */}
                  <button
                    onClick={() => handleToggleStatus(expense)}
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
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
                    {expense.status === "paid" && <Check className="h-3 w-3" />}
                  </button>

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {expense.description}
                    </p>
                    {expense.previousAmount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        ant: {formatCOP(expense.previousAmount)}{" "}
                        <span
                          className={cn(
                            "font-medium",
                            expense.amount - expense.previousAmount > 0
                              ? "text-negative"
                              : expense.amount - expense.previousAmount < 0
                                ? "text-positive"
                                : "",
                          )}
                        >
                          (
                          {formatDelta(expense.amount - expense.previousAmount)}
                          )
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Amount (editable) */}
                  {editingId === expense.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-7 w-28 text-right text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(expense.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleSaveEdit(expense.id)}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(expense)}
                      className="text-sm font-semibold tabular-nums hover:text-primary transition-colors"
                    >
                      {formatCOP(expense.amount)}
                    </button>
                  )}

                  {/* Status badge */}
                  <Badge
                    variant={
                      expense.status === "paid"
                        ? "success"
                        : expense.status === "overdue"
                          ? "destructive"
                          : "warning"
                    }
                    className="hidden sm:inline-flex"
                  >
                    {expense.status === "paid"
                      ? "Pagado"
                      : expense.status === "overdue"
                        ? "Vencido"
                        : "Pendiente"}
                  </Badge>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteExpense(expense.id)}
                    aria-label="Eliminar gasto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add expense form */}
      {showAddForm ? (
        <AddExpenseForm
          categories={categories ?? []}
          onSubmit={handleAddExpense}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <Button className="w-full" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4" /> Agregar gasto
        </Button>
      )}
    </div>
  );
}

function AddExpenseForm({
  categories,
  onSubmit,
  onCancel,
}: {
  categories: { id: string; name: string; icon: string }[];
  onSubmit: (data: {
    categoryId: string;
    description: string;
    amount: number;
  }) => void;
  onCancel: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = parseInt(amount, 10);
    if (
      !categoryId ||
      !description.trim() ||
      isNaN(numAmount) ||
      numAmount <= 0
    )
      return;
    onSubmit({
      categoryId,
      description: description.trim(),
      amount: numAmount,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nuevo Gasto</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium" htmlFor="cat-select">
              Categoría
            </label>
            <select
              id="cat-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="desc-input">
              Descripción
            </label>
            <Input
              id="desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Administración Laureles"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="amount-input">
              Monto (COP)
            </label>
            <Input
              id="amount-input"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500000"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Guardar</Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
