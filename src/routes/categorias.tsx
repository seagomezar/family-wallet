import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Category, type CategoryType } from '@/db/schema';
import { formatCOP } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';

export const Route = createFileRoute('/categorias')({
  component: CategoriasPage,
});

function CategoriasPage() {
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray());
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    const expenseCount = await db.expenses.where('categoryId').equals(id).count();
    if (expenseCount > 0) {
      alert(`No se puede eliminar: hay ${expenseCount} gastos en esta categoría.`);
      return;
    }
    await db.categories.delete(id);
  }

  async function handleAdd(data: Omit<Category, 'id'>) {
    const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.categories.add({ id, ...data });
    setShowAdd(false);
  }

  async function handleUpdate(id: string, data: Partial<Category>) {
    await db.categories.update(id, data);
    setEditingId(null);
  }

  const typeLabels: Record<CategoryType, string> = {
    fixed: 'Fijo',
    variable: 'Variable',
    savings: 'Ahorro',
    debt: 'Deuda',
  };

  const typeColors: Record<CategoryType, 'default' | 'success' | 'warning' | 'destructive'> = {
    fixed: 'default',
    variable: 'warning',
    savings: 'success',
    debt: 'destructive',
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6 md:pl-56">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Categorías</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>

      {showAdd && (
        <CategoryForm
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
          nextOrder={(categories?.length ?? 0) + 1}
        />
      )}

      <div className="space-y-2">
        {(categories ?? []).map((cat) =>
          editingId === cat.id ? (
            <CategoryForm
              key={cat.id}
              initial={cat}
              onSubmit={(data) => handleUpdate(cat.id, data)}
              onCancel={() => setEditingId(null)}
              nextOrder={cat.order}
            />
          ) : (
            <Card key={cat.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="text-2xl">{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{cat.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Meta: {formatCOP(cat.monthlyTarget)}
                  </p>
                </div>
                <Badge variant={typeColors[cat.type]}>{typeLabels[cat.type]}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditingId(cat.id)}
                  aria-label="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(cat.id)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

function CategoryForm({
  initial,
  onSubmit,
  onCancel,
  nextOrder,
}: {
  initial?: Category;
  onSubmit: (data: Omit<Category, 'id'>) => void;
  onCancel: () => void;
  nextOrder: number;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '📁');
  const [type, setType] = useState<CategoryType>(initial?.type ?? 'fixed');
  const [monthlyTarget, setMonthlyTarget] = useState(
    initial?.monthlyTarget?.toString() ?? ''
  );
  const [color, setColor] = useState(initial?.color ?? '#059669');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      icon,
      type,
      monthlyTarget: parseInt(monthlyTarget, 10) || 0,
      color,
      order: initial?.order ?? nextOrder,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {initial ? 'Editar Categoría' : 'Nueva Categoría'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <div>
              <label className="text-xs font-medium" htmlFor="icon-input">Ícono</label>
              <Input
                id="icon-input"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="text-center text-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="name-input">Nombre</label>
              <Input
                id="name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de categoría"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium" htmlFor="type-select">Tipo</label>
              <select
                id="type-select"
                value={type}
                onChange={(e) => setType(e.target.value as CategoryType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="fixed">Fijo</option>
                <option value="variable">Variable</option>
                <option value="savings">Ahorro</option>
                <option value="debt">Deuda</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="target-input">Meta mensual (COP)</label>
              <Input
                id="target-input"
                type="number"
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(e.target.value)}
                placeholder="500000"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              <Check className="h-3.5 w-3.5" /> Guardar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
