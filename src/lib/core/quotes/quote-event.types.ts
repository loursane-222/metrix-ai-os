import type { QuoteEventType, QuoteEventSource, QuoteStatus } from "@prisma/client";

export type { QuoteEventType, QuoteEventSource };

export type QuoteEventSummary = {
  eventType: QuoteEventType;
  fromStatus: QuoteStatus | null;
  toStatus: QuoteStatus | null;
  note: string | null;
  createdAt: Date;
};

export type CreateQuoteEventInput = {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
  eventType: QuoteEventType;
  fromStatus?: QuoteStatus | null;
  toStatus?: QuoteStatus | null;
  note?: string | null;
  source?: QuoteEventSource;
};
