import type { Quote, QuoteStatus } from "@prisma/client";

export type QuoteResult = Quote;

export type ListQuotesByOrganizationInput = {
  organizationId: string;
  status?: QuoteStatus;
  limit?: number;
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
