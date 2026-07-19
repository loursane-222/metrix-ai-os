import type { DomainEventDescriptor } from "../../events";

export type BuildCustomerUpdatedEventInput = {
  customerId: string;
  changedFields: readonly string[];
  previousVersion: string;
  newVersion: string;
  updatedByActorId: string;
};

/**
 * CustomerUpdated payload'ı yalnızca değişen alan adlarını taşır —
 * değerleri değil. Ham Customer kaydı veya hassas alan değerleri asla bu
 * event'e yazılmaz. organizationId/operationId/executionId/correlationId
 * gibi bağlamsal alanlar Execution Runtime tarafından tamamlanır.
 */
export function buildCustomerUpdatedDomainEvent(input: BuildCustomerUpdatedEventInput): DomainEventDescriptor {
  return {
    eventType: "CustomerUpdated",
    aggregateType: "customer",
    aggregateId: input.customerId,
    schemaVersion: "1",
    payload: {
      customerId: input.customerId,
      changedFields: [...input.changedFields],
      previousVersion: input.previousVersion,
      newVersion: input.newVersion,
      updatedByActorId: input.updatedByActorId,
    },
  };
}

export function buildCustomerCreatedDomainEvent(customerId: string, createdByActorId: string): DomainEventDescriptor {
  return {
    eventType: "CustomerCreated", aggregateType: "customer", aggregateId: customerId, schemaVersion: "1",
    payload: { customerId, createdByActorId },
  };
}

export function buildCustomerArchivedDomainEvent(customerId: string, archivedByActorId: string): DomainEventDescriptor {
  return {
    eventType: "CustomerArchived", aggregateType: "customer", aggregateId: customerId, schemaVersion: "1",
    payload: { customerId, archivedByActorId },
  };
}
