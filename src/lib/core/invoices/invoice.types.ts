import type { Invoice } from "@prisma/client";

export type InvoiceResult = Invoice;

export type CreateInvoiceInput = {
  organizationId: string;
  customerId: string;
  quoteId?: string;
  title: string;
  amount: number;
  taxRate?: number;
  currency?: string;
  dueDate?: Date;
  notes?: string;
  idempotencyKey?: string;
};

export type CreateInvoiceRepositoryInput = {
  organizationId: string;
  customerId: string;
  quoteId: string | null;
  invoiceNumber: string;
  title: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency?: string;
  dueDate?: Date;
  notes?: string;
  idempotencyKey?: string | null;
  requestHash?: string | null;
};

/**
 * created=false, aynı (organizationId, idempotencyKey) ile daha önce
 * oluşturulmuş bir kaydın replay sonucu olarak döndürüldüğünü belirtir.
 */
export type CreateInvoiceOutcome = {
  created: boolean;
  invoice: InvoiceResult;
};

export type ListInvoicesInput = {
  organizationId: string;
};
