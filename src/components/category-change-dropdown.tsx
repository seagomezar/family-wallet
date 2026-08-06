import { useState } from "react";
import { db, type Category } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryChangeDropdownProps {
  expenseId: string;
  currentCategoryId: string;
  categories: Category[];
  /** Compact mode for dashboard view (smaller buttons) */
  compact?: boolean;
  onChanged?: (newCategoryName: string) => void;
}

export function CategoryChangeDropdown({
  expenseId,
  currentCategoryId,
  categories,
  compact = false,
  onChanged,
}: CategoryChangeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(currentCategoryId);

  async function handleSave() {
    if (selectedCategoryId === currentCategoryId) {
      setIsOpen(false);
      return;
    }
    await db.expenses.update(expenseId, {
      categoryId: selectedCategoryId,
      updatedAt: new Date(),
    });
    const newCat = categories.find((c) => c.id === selectedCategoryId);
    onChanged?.(newCat?.name ?? "");
    setIsOpen(false);
  }

  function handleCancel() {
    setSelectedCategoryId(currentCategoryId);
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "text-muted-foreground hover:text-primary",
          compact ? "h-6 w-6" : "h-7 w-7",
        )}
        onClick={() => setIsOpen(true)}
        aria-label="Cambiar categoría"
        title="Cambiar categoría"
      >
        <ArrowRightLeft className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={selectedCategoryId}
        onChange={(e) => setSelectedCategoryId(e.target.value)}
        className={cn(
          "rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "h-6 w-24 text-xs" : "h-7 w-32",
        )}
        autoFocus
      >
        {categories.map((c) => (
          <option
            key={c.id}
            value={c.id}
            disabled={c.id === currentCategoryId}
          >
            {c.icon} {c.name}
          </option>
        ))}
      </select>
      <Button
        size="icon"
        variant="ghost"
        className={cn(compact ? "h-6 w-6" : "h-7 w-7")}
        onClick={handleSave}
        disabled={selectedCategoryId === currentCategoryId}
        aria-label="Guardar cambio de categoría"
      >
        <Check className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={cn(compact ? "h-6 w-6" : "h-7 w-7")}
        onClick={handleCancel}
        aria-label="Cancelar cambio de categoría"
      >
        <X className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      </Button>
    </div>
  );
}
