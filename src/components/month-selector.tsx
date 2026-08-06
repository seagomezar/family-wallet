import { useUIStore } from '@/stores/ui';
import {
  formatMonth,
  previousMonthKey,
  nextMonthKey,
  currentMonthKey,
} from '@/lib/currency';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MonthSelector() {
  const { selectedMonth, setSelectedMonth } = useUIStore();
  const isCurrentMonth = selectedMonth === currentMonthKey();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setSelectedMonth(previousMonthKey(selectedMonth))}
        aria-label="Mes anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium capitalize">
        {formatMonth(selectedMonth)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setSelectedMonth(nextMonthKey(selectedMonth))}
        disabled={isCurrentMonth}
        aria-label="Mes siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
