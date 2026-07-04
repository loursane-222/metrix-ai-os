import type { Expense, ExpenseCategory, ExpenseRecurrenceType, ExpenseStatus } from "@prisma/client";

export type ExpenseResult = Expense;

export type CreateExpenseInput = {
  organizationId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency?: string;
  expenseDate: Date;
  recurrenceType?: ExpenseRecurrenceType;
  status?: ExpenseStatus;
  vendorName?: string;
  note?: string;
};

export type UpdateExpenseInput = {
  id: string;
  organizationId: string;
  title?: string;
  category?: ExpenseCategory;
  amount?: number;
  currency?: string;
  expenseDate?: Date;
  recurrenceType?: ExpenseRecurrenceType;
  status?: ExpenseStatus;
  vendorName?: string;
  note?: string;
};

export type ListExpensesInput = {
  organizationId: string;
  status?: ExpenseStatus;
  category?: ExpenseCategory;
  recurrenceType?: ExpenseRecurrenceType;
  limit?: number;
};

export type ListExpensesByDateRangeInput = {
  organizationId: string;
  from: Date;
  to: Date;
  status?: ExpenseStatus;
  category?: ExpenseCategory;
  recurrenceType?: ExpenseRecurrenceType;
};
