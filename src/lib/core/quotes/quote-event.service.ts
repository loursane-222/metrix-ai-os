import { createQuoteEvent } from "./quote-event.repository";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { QuoteEventSource, QuoteStatus } from "@prisma/client";

export async function logQuoteCreated(
  input: {
    organizationId: string;
    quoteId: string;
    conversationId?: string | null;
    source?: QuoteEventSource;
  },
  tx?: PrismaTransactionClient,
): Promise<void> {
  await createQuoteEvent(
    {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      conversationId: input.conversationId,
      eventType: "QUOTE_CREATED",
      note: "Teklif oluşturuldu.",
      source: input.source ?? "AI_SUGGESTED",
    },
    tx,
  );
}

export async function logQuoteSent(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_SENT",
    note: "Teklif gönderildi.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteViewed(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_VIEWED",
    note: "Müşteri teklifi görüntüledi.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteNegotiationStarted(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_NEGOTIATION_STARTED",
    note: "Müzakere aşamasına geçildi.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteFollowedUp(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_FOLLOWED_UP",
    note: "Teklif takibi yapıldı.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteRevisionRequested(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_REVISION_REQUESTED",
    note: "Müşteri revize talep etti.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteWon(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_WON",
    note: "Teklif kazanıldı.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteLost(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_LOST",
    note: "Teklif kaybedildi.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteCancelled(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "QUOTE_CANCELLED",
    note: "Teklif iptal edildi.",
    source: "AI_SUGGESTED",
  });
}

export async function logQuoteStatusChanged(input: {
  organizationId: string;
  quoteId: string;
  conversationId?: string | null;
  fromStatus: QuoteStatus;
  toStatus: QuoteStatus;
}): Promise<void> {
  await createQuoteEvent({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
    conversationId: input.conversationId,
    eventType: "STATUS_CHANGED",
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    source: "AI_SUGGESTED",
  });
}
