import type { CardStatement, Expense, LoanInstallment, ObligationScheduleLine, Payment, PurchaseInvoice } from "@prisma/client";

export type MaterializeReceivableScheduleInput = {
  organizationId: string;
  invoiceId: string;
  actorId: string;
  /**
   * Invoice'ın canonical ekonomik/reference tarihi — INVOICE_DATE olarak
   * kullanılır. Verilmezse "materialize anı" DEĞİL, invoice'ın kendi
   * updatedAt'ı (en son gerçek durum değişikliği — invoice.send çağrısı
   * hemen ardından materialize ederken bu, send transition'ın tam anıdır)
   * kullanılır. Asla new Date() ile "şimdi" uydurulmaz.
   */
  referenceDate?: Date;
};

export type MaterializeReceivableScheduleOutcome = {
  lines: ObligationScheduleLine[];
  payments: Payment[];
  replayed: boolean;
};

export type MaterializePayableScheduleInput = {
  organizationId: string;
  expenseId: string;
  dueDate: Date;
  actorId: string;
};

export type MaterializePayableScheduleOutcome = {
  line: ObligationScheduleLine;
  expense: Expense;
  replayed: boolean;
};

export type MaterializePurchaseInvoicePayableScheduleInput = {
  organizationId: string;
  purchaseInvoiceId: string;
  actorId: string;
};

export type MaterializePurchaseInvoicePayableScheduleOutcome = {
  line: ObligationScheduleLine;
  purchaseInvoice: PurchaseInvoice;
  replayed: boolean;
};

export type MaterializeCardStatementPayableScheduleInput = {
  organizationId: string;
  cardStatementId: string;
  actorId: string;
};

export type MaterializeCardStatementPayableScheduleOutcome = {
  line: ObligationScheduleLine;
  cardStatement: CardStatement;
  replayed: boolean;
};

export type MaterializeLoanInstallmentPayableScheduleInput = {
  organizationId: string;
  loanInstallmentId: string;
  actorId: string;
};

export type MaterializeLoanInstallmentPayableScheduleOutcome = {
  line: ObligationScheduleLine;
  loanInstallment: LoanInstallment;
  replayed: boolean;
};
