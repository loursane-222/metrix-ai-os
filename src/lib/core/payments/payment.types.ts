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
};
