import type { Payment, PaymentMethod } from "@prisma/client";
import type { MaterializedMaturity } from "@/lib/payment-terms";

export type PaymentResult = Payment & { invoice?: { invoiceNumber: string; title: string; totalAmount: unknown; currency: string } | null };

export type CreatePaymentInput = {
  organizationId: string;
  customerId: string;
  personId?: string;
  quoteId?: string;
  invoiceId?: string;
  title: string;
  amount: number;
  currency?: string;
  dueDate?: Date;
  maturityScheduleComponent?: MaterializedMaturity;
  notes?: string;
  idempotencyKey?: string;
};

export type CreatePaymentRepositoryInput = {
  organizationId: string;
  customerId: string;
  personId: string | null;
  quoteId: string | null;
  invoiceId: string | null;
  title: string;
  amount: number;
  currency?: string;
  dueDate?: Date;
  maturityScheduleComponent?: MaterializedMaturity;
  notes?: string;
  idempotencyKey?: string | null;
  requestHash?: string | null;
};

/**
 * created=false, aynı (organizationId, idempotencyKey) ile daha önce
 * oluşturulmuş bir kaydın replay sonucu olarak döndürüldüğünü belirtir —
 * route bu bilgiyi 201 yerine 200 döndürmek için kullanır.
 */
export type CreatePaymentOutcome = {
  created: boolean;
  payment: PaymentResult;
};

export type ApplyPaymentInput = {
  organizationId: string;
  paymentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type ApplyPaymentOutcome = {
  payment: PaymentResult;
  settlementId: string;
  applicationId: string;
  movementId: string;
};
