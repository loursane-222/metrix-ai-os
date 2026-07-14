import type { Quote, QuoteStatus } from "@prisma/client";

export type QuoteResult = Quote;

export type ListQuotesByOrganizationInput = {
  organizationId: string;
  status?: QuoteStatus;
  limit?: number;
};

export type CreateQuoteInput = {
  organizationId: string;
  customerId: string;
  personId?: string;
  title: string;
  amount?: number;
  currency?: string;
  notes?: string;
};

export type CreateQuoteRepositoryInput = {
  organizationId: string;
  customerId: string;
  personId: string | null;
  customerName: string;
  title: string;
  amount?: number;
  currency?: string;
  notes?: string;
};

export type UpdateQuoteLifecycleInput = {
  id: string;
  organizationId: string;
  status?: QuoteStatus;
  notes?: string;
  sentAt?: Date;
  viewedAt?: Date;
  wonAt?: Date;
  lostAt?: Date;
};
