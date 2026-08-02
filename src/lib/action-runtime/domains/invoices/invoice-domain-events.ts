import type { DomainEventDescriptor } from "../../events";

export function buildInvoiceCreatedDomainEvent(invoiceId: string, createdByActorId: string): DomainEventDescriptor {
  return {
    eventType: "InvoiceCreated", aggregateType: "invoice", aggregateId: invoiceId, schemaVersion: "1",
    payload: { invoiceId, createdByActorId },
  };
}
