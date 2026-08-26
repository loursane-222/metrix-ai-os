import { getCustomerByIdForOrganization, unarchiveCustomerById } from "@/lib/core/customers/customer.service";
import type { ActionHandler } from "../../execution";

export const customerUnarchiveHandler: ActionHandler = async (envelope) => {
  const customerId = envelope.input.customerId;
  if (typeof customerId !== "string" || !customerId.trim()) throw new Error("customerId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getCustomerByIdForOrganization(customerId, organizationId);
  if (!existing) throw new Error("Customer not found.");
  if (existing.status === "ACTIVE") {
    return { status: "SUCCESS", entityRef: { entityType: "customer", entityId: customerId }, resultOutcome: "NO_CHANGE", metadata: { customerId }, domainEvents: [], sideEffects: [] };
  }
  await unarchiveCustomerById(customerId, organizationId);
  return {
    status: "SUCCESS", entityRef: { entityType: "customer", entityId: customerId },
    resultSummary: "customer.unarchive completed.", metadata: { customerId },
    domainEvents: [], sideEffects: [],
  };
};
