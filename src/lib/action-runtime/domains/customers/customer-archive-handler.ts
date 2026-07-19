import { archiveCustomerById, getCustomerByIdForOrganization } from "@/lib/core/customers/customer.service";
import type { ActionHandler } from "../../execution";
import { CustomerNotFoundError } from "./customer-update.errors";
import { buildCustomerArchivedDomainEvent } from "./customer-domain-events";

export const customerArchiveHandler: ActionHandler = async (envelope) => {
  const customerId = envelope.input.customerId;
  if (typeof customerId !== "string" || !customerId.trim()) throw new Error("customerId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getCustomerByIdForOrganization(customerId, organizationId);
  if (!existing) throw new CustomerNotFoundError(customerId);
  if (existing.status === "PASSIVE") {
    return { status: "SUCCESS", entityRef: { entityType: "customer", entityId: customerId }, resultOutcome: "NO_CHANGE", metadata: { customerId }, domainEvents: [], sideEffects: [] };
  }
  await archiveCustomerById(customerId, organizationId);
  return {
    status: "SUCCESS", entityRef: { entityType: "customer", entityId: customerId },
    resultSummary: "customer.archive completed.", metadata: { customerId },
    domainEvents: [buildCustomerArchivedDomainEvent(customerId, envelope.executionContext.actorId)], sideEffects: [],
  };
};
