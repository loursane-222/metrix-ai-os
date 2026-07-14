import type { Payment } from "@prisma/client";

export type PaymentResult = Payment;

export type CreatePaymentInput = {
  organizationId: string;
  customerId: string;
  personId?: string;
  quoteId?: string;
  title: string;
  amount: number;
  currency?: string;
  dueDate?: Date;
  notes?: string;
  idempotencyKey?: string;
};

export type CreatePaymentRepositoryInput = {
  organizationId: string;
  customerId: string;
  personId: string | null;
  quoteId: string | null;
  title: string;
  amount: number;
  currency?: string;
  dueDate?: Date;
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
