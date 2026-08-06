import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  indicatorClassName?: string;
}

export function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
}: ProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const rawPercentage = (value / max) * 100;

  return (
    <div
      className={cn(
        "relative h-3 w-full overflow-hidden rounded-full bg-secondary",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          rawPercentage > 100
            ? "bg-destructive"
            : rawPercentage > 75
              ? "bg-warning"
              : "bg-positive",
          indicatorClassName,
        )}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}
