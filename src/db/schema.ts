import Dexie, { type EntityTable } from 'dexie';

// ─── Types ───────────────────────────────────────────────────────────

export type CategoryType = 'fixed' | 'variable' | 'savings' | 'debt';
export type ExpenseStatus = 'pending' | 'paid' | 'overdue';
export type PaymentSource =
  | 'bancolombia'
  | 'tc-vane'
  | 'tc-sebas'
  | 'efectivo'
  | 'debito'
  | 'otro';

export interface Budget {
  id: string;
  month: string; // "2026-06"
  totalIncome: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  type: CategoryType;
  monthlyTarget: number;
}

export interface Expense {
  id: string;
  budgetId: string;
  categoryId: string;
  description: string;
  amount: number;
  previousAmount: number;
  paymentSource: PaymentSource;
  status: ExpenseStatus;
  dueDate?: Date;
  paidDate?: Date;
  notes?: string;
  isRecurring: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankTransaction {
  id: string;
  importBatch: string;
  transactionDate: Date;
  description: string;
  reference: string;
  amount: number;
  office: string;
  categoryId?: string;
  expenseId?: string;
  status: 'pending' | 'accepted' | 'rejected';
  importedAt: Date;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  icon: string;
  color: string;
}

export interface CategorizationRule {
  id: string;
  pattern: string; // substring or regex to match
  categoryId: string; // target category
  source: 'builtin' | 'user';
  isRegex: boolean;
  matchCount: number; // how many times it matched
  createdAt: Date;
}

// ─── Database ────────────────────────────────────────────────────────

export class BilleteraDB extends Dexie {
  budgets!: EntityTable<Budget, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  bankTransactions!: EntityTable<BankTransaction, 'id'>;
  savingsGoals!: EntityTable<SavingsGoal, 'id'>;
  categorizationRules!: EntityTable<CategorizationRule, 'id'>;

  constructor() {
    super('BilleteraDB');
    this.version(1).stores({
      budgets: 'id, month',
      categories: 'id, name, order, type',
      expenses: 'id, budgetId, categoryId, status, [budgetId+categoryId]',
      bankTransactions: 'id, importBatch, transactionDate, categoryId, status',
      savingsGoals: 'id, name',
    });
    this.version(2).stores({
      budgets: 'id, month',
      categories: 'id, name, order, type',
      expenses: 'id, budgetId, categoryId, status, [budgetId+categoryId]',
      bankTransactions: 'id, importBatch, transactionDate, categoryId, status',
      savingsGoals: 'id, name',
      categorizationRules: 'id, pattern, categoryId, source, matchCount',
    });
  }
}

export const db = new BilleteraDB();
