import type { FieldVisit, FieldVisitRequestType } from "@prisma/client";

export type { FieldVisitRequestType };
export type FieldVisitResult = FieldVisit;

export type CreateFieldVisitInput = {
  organizationId: string;
  repUserId: string;
  customerId?: string | null;
  customerNameRaw: string;
  contactNameRaw?: string | null;
  startAt: Date;
  endAt?: Date | null;
  notes?: string | null;
  requestTypes?: readonly FieldVisitRequestType[];
  unresolvedIntent?: string | null;
  relatedOrderId?: string | null;
  relatedPaymentId?: string | null;
};

export type ListFieldVisitsInput = {
  organizationId: string;
  repUserId?: string;
  startAt: Date;
  endAt: Date;
};
