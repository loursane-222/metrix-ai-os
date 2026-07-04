import type { QuoteStatus } from "@prisma/client";

export type QuoteWorkflowSignalType =
  | "QUOTE_SENT"
  | "QUOTE_VIEWED"
  | "QUOTE_NEGOTIATING"
  | "QUOTE_WON"
  | "QUOTE_LOST"
  | "QUOTE_CANCELLED"
  | "QUOTE_FOLLOWED_UP"
  | "QUOTE_REVISION_REQUESTED";

export type QuoteWorkflowSignal = {
  quoteId: string;
  signalType: QuoteWorkflowSignalType;
  confidence: number;
  matchedCustomerName: string;
  currentStatus: QuoteStatus;
  // true ise DB statüsü değişmez; Timeline V1'de event log'a bağlanacak
  isEventOnly: boolean;
  proposedStatus: QuoteStatus | null;
  proposedNote: string | null;
  proposedSentAt: Date | null;
  proposedViewedAt: Date | null;
  proposedWonAt: Date | null;
  proposedLostAt: Date | null;
};

export type QuoteWorkflowApplyResult = {
  updated: number;
  skipped: number;
};
