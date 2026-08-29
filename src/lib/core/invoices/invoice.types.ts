import type { Invoice } from "@prisma/client";
import type { StructuredPaymentTerm } from "@/lib/payment-terms";

export type InvoiceResult = Invoice & { payments?: Array<{ id: string; title: string; amount: unknown; paidAmount: unknown; status: string }> };

export type CreateInvoiceInput = {
  organizationId: string;
  customerId: string;
  quoteId?: string;
  title: string;
  amount: number;
  taxRate?: number;
  currency?: string;
  dueDate?: Date;
  paymentTermSnapshot?: StructuredPaymentTerm;
  notes?: string;
  idempotencyKey?: string;
  // Preserves a historical invoice's original number on import (migrating
  // from another program) instead of assigning a fresh METRIX sequence
  // number — Turkish e-fatura/audit trails depend on the original number.
  // Omit for ordinary new-invoice creation, which keeps auto-numbering.
  invoiceNumber?: string;
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
  paymentTermSnapshot?: StructuredPaymentTerm;
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
