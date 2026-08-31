import type { Expense, ExpenseCategory, ExpenseRecurrenceType } from "@prisma/client";

export type ExpenseResult = Expense;

export type CreateExpenseInput = {
  organizationId: string;
  title: string;
  description?: string;
  category: ExpenseCategory;
  subcategory?: string;
  amount: number;
  netAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  currency?: string;
  expenseDate: Date;
  recurrenceType?: ExpenseRecurrenceType;
  vendorName?: string;
  supplierId?: string;
  customerId?: string;
  employeeMemberId?: string;
  createdByUserId?: string;
  note?: string;
  /** Phase 11 — bu harcama bir corporate card ile yapıldıysa. */
  corporateCardId?: string;
};

/**
 * status kasıtlı olarak burada yok: PENDING/PARTIALLY_PAID/PAID
 * ExpenseSettlement authority'sinden türeyen bir projeksiyondur, doğrudan
 * set edilemez. CANCELLED için cancelExpense() kullanılır.
 */
export type UpdateExpenseInput = {
  id: string;
  organizationId: string;
  title?: string;
  description?: string;
  category?: ExpenseCategory;
  subcategory?: string;
  amount?: number;
  netAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  currency?: string;
  expenseDate?: Date;
  recurrenceType?: ExpenseRecurrenceType;
  vendorName?: string;
  supplierId?: string | null;
  customerId?: string | null;
  employeeMemberId?: string | null;
  note?: string;
};

export type ListExpensesInput = {
  organizationId: string;
  status?: Expense["status"];
  category?: ExpenseCategory;
  recurrenceType?: ExpenseRecurrenceType;
  limit?: number;
};

export type ListExpensesByDateRangeInput = {
  organizationId: string;
  from: Date;
  to: Date;
  status?: Expense["status"];
  category?: ExpenseCategory;
  recurrenceType?: ExpenseRecurrenceType;
};
