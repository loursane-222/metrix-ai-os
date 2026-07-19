import { createNewCustomer } from "@/lib/core/customers/customer.service";
import type { ActionHandler } from "../../execution";
import { buildCustomerCreatedDomainEvent } from "./customer-domain-events";

const OPTIONAL_FIELDS = ["legalName", "phone", "email", "metrixNote"] as const;

export const customerCreateHandler: ActionHandler = async (envelope) => {
  const displayName = envelope.input.displayName;
  if (typeof displayName !== "string" || !displayName.trim()) throw new Error("displayName is required.");
  const values: Record<string, string | undefined> = {};
  for (const field of OPTIONAL_FIELDS) {
    const value = envelope.input[field];
    if (value !== undefined && typeof value !== "string") throw new Error(`${field} must be a string.`);
    values[field] = typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  const customer = await createNewCustomer({
    organizationId: envelope.executionContext.organizationId,
    createdByUserId: envelope.executionContext.actorId,
    displayName: displayName.trim(),
    ...values,
  });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "customer", entityId: customer.id },
    resultSummary: "customer.create completed.",
    metadata: { customerId: customer.id },
    domainEvents: [buildCustomerCreatedDomainEvent(customer.id, envelope.executionContext.actorId)],
    sideEffects: [],
  };
};
