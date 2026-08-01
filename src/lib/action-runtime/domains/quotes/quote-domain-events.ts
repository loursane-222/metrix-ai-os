import type { DomainEventDescriptor } from "../../events";

export type BuildQuoteUpdatedEventInput = {
  quoteId: string;
  changedFields: readonly string[];
  previousVersion: string;
  newVersion: string;
  updatedByActorId: string;
};

/** QuoteUpdated payload'ı yalnızca değişen alan adlarını taşır — kalem/fiyat değerlerini değil. */
export function buildQuoteUpdatedDomainEvent(input: BuildQuoteUpdatedEventInput): DomainEventDescriptor {
  return {
    eventType: "QuoteUpdated",
    aggregateType: "quote",
    aggregateId: input.quoteId,
    schemaVersion: "1",
    payload: {
      quoteId: input.quoteId,
      changedFields: [...input.changedFields],
      previousVersion: input.previousVersion,
      newVersion: input.newVersion,
      updatedByActorId: input.updatedByActorId,
    },
  };
}

export function buildQuoteSentDomainEvent(quoteId: string, sentByActorId: string): DomainEventDescriptor {
  return {
    eventType: "QuoteSent",
    aggregateType: "quote",
    aggregateId: quoteId,
    schemaVersion: "1",
    payload: { quoteId, sentByActorId },
  };
}
