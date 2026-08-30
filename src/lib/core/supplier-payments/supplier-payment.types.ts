import type { FinancialAccountMovement, PaymentMethod, PurchaseInvoice, SupplierPayment } from "@prisma/client";

export type ApplySupplierPaymentInput = {
  organizationId: string;
  purchaseInvoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type ApplySupplierPaymentOutcome = {
  purchaseInvoice: PurchaseInvoice;
  settlement: SupplierPayment;
  movement: FinancialAccountMovement;
  replayed: boolean;
};

export type ReverseSupplierPaymentInput = {
  organizationId: string;
  supplierPaymentId: string;
  reason: string;
  actorId: string;
  occurredAt?: Date;
};

export type ReverseSupplierPaymentOutcome = {
  purchaseInvoice: PurchaseInvoice;
  settlement: SupplierPayment;
  movement: FinancialAccountMovement;
};
